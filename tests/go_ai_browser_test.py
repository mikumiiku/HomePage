#!/usr/bin/env python3
"""Real WASM Worker transport, local-only inference, loading/retry and cancellation."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('GO_BASE', 'http://127.0.0.1:8041')
OUT = Path('/tmp/go-ai-verification')
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    requests, errors = [], []
    page.on('request', lambda r: requests.append((r.method, r.url)))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/game/go')
    # Ordinary HTTP, no GPU or SharedArrayBuffer prerequisites.
    results = page.evaluate('''async () => {
      const source = [...document.scripts].find(s => /games\\/go.js/.test(s.src));
      const worker = new Worker(new URL('go-worker.js' + new URL(source.src).search, source.src));
      const results = [];
      try {
        for (const size of [9,13,19]) for (const level of ['easy','normal','hard']) {
          const result = await new Promise((resolve,reject) => {
            const timer = setTimeout(() => reject(Error('Worker timeout')),45000);
            worker.onerror = e => {clearTimeout(timer);reject(Error(e.message));};
            worker.onmessage = e => {
              if (e.data.status === 'ready') return;
              clearTimeout(timer);
              if(e.data.error) reject(Error(e.data.error)); else resolve(e.data);
            };
            worker.postMessage({game:'test',request:results.length,size,level,moves:[Math.floor(size*size/2)],seed:73});
          });
          if (result.engine !== 'GNU Go 3.8' || result.move < 0 || !GoEngine.play(GoEngine.replay(size,[Math.floor(size*size/2)]),result.move).ok) throw Error('invalid engine move');
          results.push({size,level,elapsed:result.elapsed});
        }
      } finally {worker.terminate();}
      return results;
    }''')
    print('PASS real browser WASM searches:', results)
    # The page's own worker should survive a normal turn and work without network.
    page.locator('#go-cell-40').tap()
    page.wait_for_function("document.querySelector('#go-count').textContent === '2 手'")
    context.set_offline(True)
    page.locator('.go-cell:not(.black):not(.white)').nth(20).tap()
    page.wait_for_function("document.querySelector('#go-count').textContent === '4 手'")
    context.set_offline(False)
    assert all(method == 'GET' and url.startswith(BASE + '/') for method,url in requests)
    assert any('/vendor/gnugo/gnugo.wasm?v=' in url for _,url in requests)
    print('PASS moves compute offline in a reused Worker; same-origin GET assets only, no AI API')
    page.locator('#go-open-settings').tap()
    expect(page.locator('#go-level option[value=hard]')).to_have_text('高 · 挑战')
    page.locator('#go-level').focus()
    page.keyboard.press('ArrowDown')
    page.screenshot(path=str(OUT/'mobile-settings.png'), full_page=True)
    page.locator('#go-close-settings').tap()
    page.locator('#theme-toggle').tap()
    page.screenshot(path=str(OUT/'mobile-dark.png'), full_page=True)
    assert not errors, errors
    context.close()

    context = browser.new_context(viewport={'width': 375, 'height': 812})
    page = context.new_page()
    # Fail only engine assets; a fresh Worker on retry can recover.
    page.route('**/vendor/gnugo/gnugo.js*', lambda route: route.abort())
    page.goto(BASE + '/game/go')
    page.locator('#go-cell-40').click()
    expect(page.locator('#go-retry-ai')).to_be_visible()
    expect(page.locator('#go-count')).to_have_text('1 手')
    page.screenshot(path=str(OUT/'load-error.png'), full_page=True)
    page.unroute('**/vendor/gnugo/gnugo.js*')
    page.locator('#go-retry-ai').click()
    page.wait_for_function("document.querySelector('#go-count').textContent === '2 手'")
    expect(page.locator('#go-retry-ai')).to_be_hidden()
    print('PASS failed engine load preserves the move and retry recovers the requested engine')
    context.close()

    context = browser.new_context()
    page = context.new_page()
    # Accelerate only the load watchdog, with an unresponsive fake worker.
    page.add_init_script('''const timeout = window.setTimeout;
      window.setTimeout = (f,ms,...args) => timeout(f,ms===60000?50:ms,...args);
      window.Worker = class { postMessage(){} terminate(){} };''')
    page.goto(BASE + '/game/go')
    page.locator('#go-cell-40').click()
    expect(page.locator('#go-status')).to_contain_text('加载超时')
    expect(page.locator('#go-retry-ai')).to_be_visible()
    expect(page.locator('#go-count')).to_have_text('1 手')
    print('PASS watchdog stops hung loading without changing the game or difficulty')
    context.close()
    browser.close()
