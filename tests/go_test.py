#!/usr/bin/env python3
"""Browser-level Go flows. Uses isolated contexts and never touches production storage.

GO_BASE=http://127.0.0.1:8041 python3 tests/go_test.py
"""
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("GO_BASE", "http://127.0.0.1:8041")
OUT = Path("/tmp/go-verification")
OUT.mkdir(exist_ok=True)
KEY = "homepage:e1:go:main"
DEFAULT_SETTINGS = {
    "mode": "ai",
    "size": 9,
    "level": "normal",
    "color": "black",
    "confirm": "auto",
    "numbers": False,
}
results, errors = [], []


def fixture(moves=None, mode="local", size=9, phase="play", human=1, dead=None,
            confirmations=None, result=None, settled=False, level="normal"):
    settings = dict(DEFAULT_SETTINGS, mode=mode, size=size, level=level,
                    color="black" if human == 1 else "white")
    return {
        "best": {"streak": 0},
        "stats": {"buckets": {}},
        "settings": settings,
        "session": {
            "id": "fixture",
            "settings": settings.copy(),
            "human": human,
            "moves": moves or [],
            "phase": phase,
            "dead": dead or [],
            "confirmations": confirmations or {"black": False, "white": False},
            "result": result,
            "settled": settled,
        },
    }


def setup(browser, data=None, raw=None, width=1280, height=900, mobile=False, init=None):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        has_touch=mobile,
        is_mobile=mobile,
        reduced_motion="reduce",
    )
    if init:
        context.add_init_script(init)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.goto(BASE + "/")
    if raw is not None or data is not None:
        value = raw if raw is not None else json.dumps({"v": 1, "t": 1, "d": data})
        page.evaluate("([key,value]) => localStorage.setItem(key,value)", [KEY, value])
    page.goto(BASE + "/game/go")
    expect(page.locator("#go-board")).to_be_visible()
    return context, page


def saved(page):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key)).d", KEY)


def stone_count(page):
    return page.locator(".go-cell.black, .go-cell.white").count()


def close_settings(page):
    if page.locator("#go-settings-dialog").evaluate("element => element.open"):
        page.locator("#go-close-settings").click()


def play_point(page, point):
    close_settings(page)
    page.locator(f"#go-cell-{point}").click()
    if page.locator("#go-confirm").is_visible():
        page.locator("#go-confirm").click()


def done(name):
    results.append(name)
    print("PASS", name, flush=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])

    context, page = setup(browser)
    assert page.locator(".go-cell").count() == 81
    assert saved(page)["settings"] == DEFAULT_SETTINGS
    assert page.locator('.go-cell[tabindex="0"]').count() == 1
    page.locator("#go-cell-40").focus()
    page.keyboard.press("ArrowRight")
    page.keyboard.press("Enter")
    page.wait_for_function("document.querySelectorAll('.go-cell.black,.go-cell.white').length === 2", timeout=8000)
    assert saved(page)["session"]["moves"][0] == 41
    page.reload()
    assert stone_count(page) == 2
    page.locator("#go-undo").click()
    assert stone_count(page) == 0 and saved(page)["session"]["moves"] == []
    done("defaults, keyboard move, real Worker reply, reload and full-turn undo")

    page.locator("#go-open-settings").click()
    expect(page.locator("#go-settings-dialog")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("#go-open-settings")).to_be_focused()
    play_point(page, 40)
    page.locator("#go-open-settings").click();expect(page.locator("#go-settings-dialog")).to_be_visible()
    page.locator("#go-new").click()
    expect(page.locator("#go-new-dialog")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("#go-new")).to_be_focused()
    done("settings and new-game dialogs restore focus")
    context.close()

    context, page = setup(browser)
    page.locator("#go-color").select_option("white")
    page.locator("#go-size").select_option("13")
    page.locator("#go-level").select_option("easy")
    page.locator("#go-new").click()
    page.wait_for_function("document.querySelectorAll('.go-cell.black').length === 1", timeout=8000)
    assert page.locator(".go-cell").count() == 169
    assert saved(page)["session"]["human"] == 2
    assert saved(page)["session"]["settings"]["level"] == "easy"
    assert page.locator("#go-undo").is_disabled()
    done("13-line AI game and white opening")
    context.close()

    context, page = setup(browser, fixture([0, 1, 9, 10]))
    page.locator("#go-pass").click()
    page.locator("#go-pass").click()
    expect(page.locator("#go-scoring")).to_be_visible()
    page.locator("#go-cell-1").click()
    assert page.locator(".go-cell.dead").count() == 2
    page.locator("#go-accept-score").click()
    assert saved(page)["session"]["confirmations"]["black"]
    page.locator("#go-cell-1").click()
    assert saved(page)["session"]["confirmations"] == {"black": False, "white": False}
    page.locator("#go-cell-1").click()
    page.locator("#go-accept-score").click()
    page.locator("#go-accept-score").click()
    expect(page.locator("#go-status")).to_contain_text("黑棋胜")
    stored = saved(page)
    assert stored["session"]["phase"] == "ended" and stored["session"]["settled"]
    assert stored["stats"]["buckets"]["local:9"]["wins"] == 1
    ended_moves = stored["session"]["moves"]
    page.locator("#go-cell-2").click()
    assert saved(page)["session"]["moves"] == ended_moves
    page.reload()
    assert saved(page)["stats"]["buckets"]["local:9"]["wins"] == 1
    page.locator("#go-review").click()
    page.locator('[data-review="first"]').click()
    assert stone_count(page) == 0
    page.locator('[data-review="last"]').click()
    assert stone_count(page) == 4
    page.locator('[data-review="exit"]').click()
    done("dead-group scoring, two-player confirmation and idempotent review")
    context.close()

    context, page = setup(browser, fixture([0, 1]))
    page.locator("#go-pass").click()
    page.locator("#go-pass").click()
    page.locator("#go-undo").click()
    assert saved(page)["session"]["phase"] == "play"
    assert saved(page)["session"]["moves"] == [0, 1, -1]
    page.locator("#go-pass").click()
    page.locator("#go-continue").click()
    assert saved(page)["session"]["phase"] == "play"
    play_point(page, 2)
    assert saved(page)["session"]["moves"][-1] == 2
    page.locator("#go-resign").click()
    expect(page.locator("#go-resign-dialog")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("#go-resign")).to_be_focused()
    page.locator("#go-resign").click()
    page.locator("#go-accept-resign").click()
    assert saved(page)["session"]["result"]["reason"] == "resign"
    done("continue after scoring and explicit resignation")
    context.close()

    delayed_worker = """window.Worker = class {
      constructor(){ window.goWorkers = window.goWorkers || []; window.goWorkers.push(this); }
      postMessage(request){ this.request = request; }
      terminate(){ this.terminated = true; }
    };"""
    context, page = setup(browser, init=delayed_worker)
    play_point(page, 40)
    expect(page.locator("#go-status")).to_contain_text("思考")
    page.locator("#go-undo").click()
    page.evaluate("""() => {
      const worker = window.goWorkers[0];
      worker.onmessage({data:{game:worker.request.game, request:worker.request.request, move:22}});
    }""")
    assert stone_count(page) == 0
    play_point(page, 40)
    page.locator("#go-new").click()
    page.locator("#go-accept-new").click()
    page.evaluate("""() => {
      const worker = window.goWorkers[1];
      worker.onmessage({data:{game:worker.request.game, request:worker.request.request, move:22}});
    }""")
    assert stone_count(page) == 0
    done("late Worker results are ignored after undo and restart")
    context.close()

    context, page = setup(browser, fixture())
    second = context.new_page()
    second.goto(BASE + "/game/go")
    play_point(page, 40)
    expect(second.locator("#go-reload")).to_be_visible()
    assert stone_count(second) == 0
    second.locator("#go-reload").click()
    assert stone_count(second) == 1
    play_point(second, 41)
    expect(page.locator("#go-reload")).to_be_visible()
    assert saved(page)["session"]["moves"] == [40, 41]
    done("cross-tab conflict freezes writes and reload resumes shared state")
    context.close()

    for bad in [
        "{bad-json",
        json.dumps({"v": 99, "t": 1, "d": fixture()}),
        json.dumps({"v": 1, "t": 1, "d": fixture([0, 0])}),
    ]:
        context, page = setup(browser, raw=bad)
        expect(page.locator("#go-export")).to_be_visible()
        with page.expect_download() as download:
            page.locator("#go-export").click()
        assert Path(download.value.path()).read_text() == bad
        assert page.evaluate("key => localStorage.getItem(key)", KEY) == bad
        context.close()
    done("corrupt, future and illegal saves remain intact and exportable")

    no_worker = "window.Worker = class { constructor(){ throw new Error('unavailable'); } };"
    context, page = setup(browser, init=no_worker)
    play_point(page, 40)
    page.wait_for_function("document.querySelectorAll('.go-cell.black,.go-cell.white').length === 2", timeout=8000)
    expect(page.locator("#go-notice")).to_contain_text("快速搜索")
    done("Worker construction failure uses non-blocking fallback")
    context.close()

    context, page = setup(browser, fixture())
    page.evaluate("() => { Storage.prototype.setItem = function(){ throw new DOMException('full','QuotaExceededError'); }; }")
    play_point(page, 40)
    assert stone_count(page) == 1
    expect(page.locator("#go-notice")).to_contain_text("无法保存")
    done("quota failure preserves the live game")
    context.close()

    storage_disabled = "Storage.prototype.setItem = function(){ throw new DOMException('denied','SecurityError'); };"
    context, page = setup(browser, init=storage_disabled)
    expect(page.locator("#go-notice")).to_contain_text("未开放本地存储")
    play_point(page, 40)
    page.wait_for_function("document.querySelectorAll('.go-cell.black,.go-cell.white').length === 2", timeout=8000)
    done("disabled storage keeps an in-memory game playable")
    context.close()

    context, page = setup(browser, fixture(), width=375, height=812, mobile=True)
    cdp = context.new_cdp_session(page)
    box = page.locator("#go-cell-0").bounding_box()
    x, y = box["x"] + box["width"] * .8, box["y"] + box["height"] * .8
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_function("document.querySelectorAll('.go-cell.black,.go-cell.white').length === 1")
    assert saved(page)["session"]["moves"] == [0]
    page.locator("#go-undo").click()
    assert saved(page)["session"]["moves"] == []
    done("touch uses the actual tapped grid cell and local undo removes one move")
    context.close()

    for width, height in [(320, 568), (375, 812), (768, 1024), (844, 390)]:
        context, page = setup(browser, width=width, height=height, mobile=True)
        page.locator("#go-size").select_option("19")
        page.locator("#go-new").click()
        if width == 375:
            cdp = context.new_cdp_session(page)
            box = page.locator("#go-cell-140").bounding_box()
            x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y - 70}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            assert stone_count(page) == 0 and page.locator(".go-cell.preview").count() == 0
        page.locator("#go-cell-180").click()
        expect(page.locator("#go-precision")).to_be_visible()
        expect(page.locator("#go-confirm")).to_be_visible()
        assert stone_count(page) == 0
        page.locator("#go-confirm").click()
        assert stone_count(page) == 1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.locator("#theme-toggle").click()
        expect(page.locator("html")).to_have_attribute("data-theme", "dark")
        if width in (320, 375):
            page.screenshot(path=str(OUT / f"mobile-{width}-19-dark.png"), full_page=True)
        context.close()
    done("19-line precision picker, responsive layout and both themes")

    context, page = setup(browser, fixture(), width=1440, height=900)
    page.screenshot(path=str(OUT / "desktop-light.png"), full_page=True)
    page.locator("#theme-toggle").click()
    page.screenshot(path=str(OUT / "desktop-dark.png"), full_page=True)
    assert not errors, errors
    done("desktop visual states have no browser errors")
    context.close()
    browser.close()

print(f"{len(results)} browser groups passed")
