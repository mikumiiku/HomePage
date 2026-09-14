"""Worker and storage failure recovery in isolated browsers."""
import os
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('CHESS_BASE','http://127.0.0.1:8045')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for failure in ['worker','storage']:
  c=b.new_context();page=c.new_page()
  if failure=='worker':c.add_init_script("window.Worker=function(){throw new Error('test worker unavailable')}")
  else:c.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError')}")
  page.goto(BASE+'/game/chess');page.locator('[data-square=e2]').click();page.locator('[data-square=e4]').click()
  page.wait_for_function('document.querySelectorAll("#chess-history button").length===2')
  expect(page.locator('#chess-notice')).to_contain_text('快速走法' if failure=='worker' else '刷新后进度会丢失')
  c.close()
 b.close()
print('PASS: worker failure fallback produces legal reply; blocked localStorage allows play and reports temporary progress')
