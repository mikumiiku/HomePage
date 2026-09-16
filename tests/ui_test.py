#!/usr/bin/env python3
"""UI 自测：截图 + 模拟游玩 + localStorage 存档校验 + 控制台错误收集"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("HOME_BASE", "http://127.0.0.1:8888")
OUT = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(OUT, exist_ok=True)

errors = []


def watch(page, tag):
    page.on("console", lambda m: errors.append(f"[{tag}] console.{m.type}: {m.text}")
            if m.type in ("error",) else None)
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))


def ls_dump(page, prefix="homepage:"):
    return page.evaluate(
        "(p) => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith(p)))",
        prefix,
    )


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])

    # ---------- 桌面端 ----------
    ctx = browser.new_context(viewport={"width": 1280, "height": 860})
    page = ctx.new_page()
    watch(page, "home-desktop")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/01-nav-desktop.png", full_page=True)
    nav_items = page.locator(".placard").count()
    print("nav items:", nav_items)
    assert nav_items == 2, "导航页应有 2 个入口"

    # 亮暗模式：切换 + 持久化
    page.click("#theme-toggle")
    theme = page.evaluate("() => document.documentElement.dataset.theme")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(300)
    theme_after = page.evaluate("() => document.documentElement.dataset.theme")
    print("theme:", theme, "-> after reload:", theme_after)
    assert theme == "dark" and theme_after == "dark", "暗色模式未持久化"
    page.click("#theme-toggle")  # 回到亮色

    # 换背景：上传 → 框选 → 保存 → 恢复默认
    png = page.evaluate("() => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#8fb5d5'; x.fillRect(0, 0, 900, 600); x.fillStyle = '#d98aa9'; x.beginPath(); x.arc(450, 300, 160, 0, 7); x.fill(); x.fillStyle = '#9cbfa8'; x.fillRect(60, 420, 240, 90); return c.toDataURL('image/png'); }")
    import base64
    fixture = f"{OUT}/fixture.png"
    open(fixture, "wb").write(base64.b64decode(png.split(",", 1)[1]))
    with page.expect_file_chooser() as fc_info:
        page.click("#bg-upload")
    fc_info.value.set_files(fixture)
    page.wait_for_selector(".crop-modal", timeout=5000)
    page.wait_for_timeout(700)
    page.click('.crop-actions [data-act="save"]')
    page.wait_for_timeout(400)
    hero_bg = page.evaluate("() => document.getElementById('hero').style.backgroundImage")
    saved = page.evaluate("() => JSON.parse(localStorage['homepage:e1:app:appearance']).d.heroImage || ''")
    print("hero bg applied:", hero_bg[:34], "| saved bytes:", len(saved))
    assert hero_bg.startswith('url("data:image') and saved.startswith("data:image/jpeg"), "背景未生效!"
    with page.expect_file_chooser() as fc_info2:
        page.click("#bg-upload")
    fc_info2.value.set_files(fixture)
    page.wait_for_selector(".crop-modal", timeout=5000)
    page.click('[data-act="reset"]')
    page.wait_for_timeout(300)
    assert page.evaluate("() => document.getElementById('hero').style.backgroundImage") == "", "恢复默认失败"
    print("upload flow ok")

    page.goto(f"{BASE}/games/", wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    cards = page.locator(".placard").count()
    print("desktop cards:", cards)

    # 2048：开局、按键、存档、续玩
    page.goto(f"{BASE}/game/2048", wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/02-2048-start.png")
    page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(150)
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(150)
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/03-2048-play.png")
    save = ls_dump(page)
    print("2048 save:", json.dumps(save, ensure_ascii=False)[:300])
    assert any("2048:main" in k for k in save), "2048 没有写存档!"
    # 刷新应恢复棋局
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    toast = page.locator(".toast").count()
    print("2048 resume toast present:", toast > 0)
    # 预置一个确定的 2048 存档，验证首页「本地最佳」展示逻辑
    page.evaluate("() => localStorage.setItem('homepage:e1:2048:main', JSON.stringify({v:1,t:Date.now(),d:{best:{score:1234,maxTile:128},stats:{games:0,totalMoves:0},settings:{},session:null}}))")
    page.goto(f"{BASE}/games/", wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    best_line = page.locator('.placard[data-game-id="2048"] [data-best]').inner_text()
    print("2048 card best line:", best_line)
    assert best_line == "本地最佳 1234 分", "首页本地最佳未生效!"

    # 俄罗斯方块页（桌面可见）
    page.goto(f"{BASE}/game/tetris", wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/04-tetris-start.png")

    # 桌面访问手机游戏 → 提示不匹配
    page.goto(f"{BASE}/game/swipe", wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    mismatch = page.locator(".notice").count()
    print("swipe mismatch notice on desktop:", mismatch == 1)
    page.screenshot(path=f"{OUT}/05-swipe-on-desktop.png")
    ctx.close()

    # ---------- 手机端 ----------
    iphone = p.devices["iPhone 13"]
    mctx = browser.new_context(**iphone)
    mpage = mctx.new_page()
    watch(mpage, "home-mobile")
    mpage.goto(BASE, wait_until="domcontentloaded")
    mpage.wait_for_timeout(400)
    mpage.screenshot(path=f"{OUT}/06-nav-mobile.png", full_page=True)
    mpage.goto(f"{BASE}/games/", wait_until="domcontentloaded")
    mpage.wait_for_timeout(400)
    mcards = mpage.locator(".placard").count()
    print("mobile cards:", mcards)

    # 指尖旋律：手机版开始画面
    mpage.goto(f"{BASE}/game/swipe", wait_until="domcontentloaded")
    mpage.wait_for_timeout(400)
    mpage.screenshot(path=f"{OUT}/07-swipe-mobile-start.png")

    # 记忆翻牌：选择难度、翻两张牌
    mpage.goto(f"{BASE}/game/memory", wait_until="domcontentloaded")
    mpage.wait_for_timeout(400)
    mpage.get_by_role("button", name="简单 4×4").click()
    mpage.wait_for_timeout(300)
    mpage.locator(".mem-card").nth(0).click()
    mpage.wait_for_timeout(120)
    mpage.locator(".mem-card").nth(1).click()
    mpage.wait_for_timeout(250)
    mpage.screenshot(path=f"{OUT}/08-memory-play.png")
    steps = mpage.locator("#hud-score").inner_text()
    print("memory moves hud:", steps)
    msave = ls_dump(mpage)
    print("memory keys:", list(msave.keys()))
    # 首页最近在玩 + 最佳
    mpage.goto(f"{BASE}/games/", wait_until="domcontentloaded")
    mpage.wait_for_timeout(400)
    recent = mpage.locator(".recent-item").count()
    print("recent items:", recent)
    mpage.screenshot(path=f"{OUT}/09-home-mobile-recent.png", full_page=True)

    # 扫雷：开一局、翻一格
    mpage.goto(f"{BASE}/game/minesweeper", wait_until="domcontentloaded")
    mpage.wait_for_timeout(400)
    mpage.get_by_role("button", name="简单 9×9").click()
    mpage.wait_for_timeout(300)
    mpage.locator(".mine-cell").nth(40).click()
    mpage.wait_for_timeout(300)
    mpage.screenshot(path=f"{OUT}/10-minesweeper.png")

    # 贪吃蛇页面可用性
    mpage.goto(f"{BASE}/game/snake", wait_until="domcontentloaded")
    mpage.wait_for_timeout(400)
    mpage.screenshot(path=f"{OUT}/11-snake-mobile.png")

    browser.close()

print("\n==== console/page errors ====")
if errors:
    for e in errors:
        print(e)
    sys.exit(1)
print("(none)")
