#!/usr/bin/env python3
"""Browser test for the crystal viewer lookup feature. Requires the test
server on 127.0.0.1:8765 and playwright + chromium."""
import sys
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765'
failures = []


def check(name, cond, extra=''):
    status = 'ok' if cond else 'FAIL'
    print(f'  {status}: {name} {extra}')
    if not cond:
        failures.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/snap/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page()
    console_errors = []
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: console_errors.append(str(e)))

    print('load page')
    page.goto(BASE + '/index.html', wait_until='networkidle')
    check('page loads', page.locator('#titlebar').inner_text() != '')
    check('built-in structure renders', 'Sodium' in page.locator('#titlebar').inner_text())

    print('search sapphire')
    page.fill('#search', 'sapphire')
    page.wait_for_selector('#results .hit', timeout=15000)
    hits = page.locator('#results .hit')
    check('search returns results', hits.count() > 0)
    check('sapphire hint shown', 'ruby are both corundum' in page.locator('#results').inner_text())
    first = hits.first.inner_text()
    check('corundum ranked first', 'Corundum' in first, f'({first})')
    hits.first.click()
    page.wait_for_function("document.body.dataset.shown && document.body.dataset.shown.startsWith('cod-')", timeout=20000)
    title = page.locator('#titlebar').inner_text()
    check('corundum loads', 'Al₂ O₃' in title, f'({title})')
    facts = page.locator('#facts').inner_text()
    check('citation shown', 'Crystallography Open Database' in facts)
    check('space group shown', 'R -3 c' in facts)
    check('ruby/sapphire fact shown', 'Ruby and sapphire' in page.locator('#desc').inner_text())
    check('custom button added', page.locator('#list .xtal', has_text='Al2 O3').count() >= 1)

    print('paste molecular CIF (urea)')
    page.click('#paste-toggle')
    page.fill('#ciftext', open('testdata/urea.cif').read())
    page.click('#load-cif')
    page.wait_for_selector('#msg:not([hidden])', timeout=10000)
    msg = page.locator('#msg').inner_text()
    check('friendly molecular rejection', 'molecular crystal' in msg, f'({msg[:60]}...)')

    print('paste atomic CIF (corundum)')
    page.fill('#ciftext', open('testdata/corundum.cif').read())
    page.click('#load-cif')
    page.wait_for_function("document.body.dataset.shown && document.body.dataset.shown.startsWith('cif-')", timeout=20000)
    title = page.locator('#titlebar').inner_text()
    check('pasted corundum loads', 'Al₂ O₃' in title, f'({title})')

    print('search quartz')
    page.fill('#search', 'quartz')
    page.wait_for_selector('#results .hit', timeout=15000)
    hits = page.locator('#results .hit')
    check('quartz returns results', hits.count() > 0, f'({hits.first.inner_text()[:40]})')

    print('search opal')
    page.fill('#search', 'opal')
    page.wait_for_function("document.querySelector('#results').innerText.includes('amorphous')", timeout=15000)
    check('opal hint shown', 'amorphous silica' in page.locator('#results').inner_text())
    first = page.locator('#results .hit').first.inner_text()
    check('opal shows SiO2 relatives', 'O₂ Si' in first, f'({first[:40]})')

    print('wheel zoom stays clamped')
    page.mouse.move(700, 450)
    d0 = page.evaluate('window.__camera.position.length()')
    # a true burst: 30 wheel events in one task, as a smooth-scrolling mouse
    # sends per notch. The rate limit must collapse them into ~1-2 zoom steps.
    page.evaluate('''() => {
      const el = document.querySelector('#viewport canvas');
      for (let i = 0; i < 30; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    }''')
    page.wait_for_timeout(400)
    d1 = page.evaluate('window.__camera.position.length()')
    ratio = d1 / d0
    check('burst zoomed at most ~5%', ratio < 1.06, f'(x{ratio:.3f})')
    # one big-delta notch must also be a single small step
    page.mouse.wheel(0, 1000)
    page.wait_for_timeout(400)
    d2 = page.evaluate('window.__camera.position.length()')
    ratio2 = d2 / d1
    check('big-delta notch zooms ~2%', ratio2 < 1.05, f'(x{ratio2:.3f})')
    shot = page.screenshot()
    import collections, io
    from PIL import Image
    colors = collections.Counter(Image.open(io.BytesIO(shot)).convert('RGB').getdata())
    check('scene still renders after zoom', len(colors) > 50, f'({len(colors)} distinct colors)')

    check('no console errors', not console_errors, f'({console_errors[:3]})')
    browser.close()

print(f'\n{len(failures)} failures' if failures else '\nall checks passed')
sys.exit(1 if failures else 0)
