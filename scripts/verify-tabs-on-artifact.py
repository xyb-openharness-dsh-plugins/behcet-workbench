#!/usr/bin/env python3
"""在**装机产物**上把 10 个一级 / 34 个二级页签逐个点开，证明「装进去的那份能干活」。

为什么不用 verify-live.py：那个验的是 dev-server（源码树）。装机出问题恰恰是
「源码树好好的、装进去少文件/少路由」，所以必须对产物本体点。

判据（缺一条不算通过）：
  1. 0 个未捕获异常、0 条 console error、0 个失败请求（4xx/5xx）
  2. 演示横幅在，且写明「虚构示例」
  3. 一级导航 10 个、二级页签合计 34 个，全部点开过
  4. 每个页签都渲染出内容，且没有落到「本页签尚未实现」空态
  5. 390 宽不横向溢出

用法：
  node scripts/serve-artifact.mjs --port 5188 --db /tmp/hn-artifact.db &
  python3 scripts/verify-tabs-on-artifact.py --port 5188
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

EMPTY_MARKS = ("本页签尚未实现", "尚未实现", "Not implemented")

# 映射漏字段的典型症状。它们出现在界面上就说明「渲染成功但内容是错的」，
# 比整页崩溃更危险——崩溃至少会被发现，垃圾值会被当成真数据读走。
GARBAGE_MARKS = ("undefined", "NaN", "[object Object]", "null")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5188)
    ap.add_argument("--width", type=int, default=1440)
    args = ap.parse_args()

    url = f"http://127.0.0.1:{args.port}/api/head-neck-workbench/ui/"

    console_errors = []
    failed_requests = []
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": args.width, "height": 900})
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("requestfailed", lambda r: failed_requests.append(f"{r.method} {r.url}"))
        page.on(
            "response",
            lambda r: failed_requests.append(f"{r.status} {r.url}") if r.status >= 400 else None,
        )

        page.goto(url, wait_until="networkidle")
        page.wait_for_selector("#liveBanner", timeout=15000)

        banner = page.inner_text("#liveBanner")
        print(f"演示横幅：{banner}")
        assert "虚构" in banner, "横幅必须写明是虚构示例"

        navs = page.eval_on_selector_all(
            "nav a[data-page], .sidenav a[data-page]", "els => els.map(e => e.dataset.page)"
        )
        # 去重保序
        seen = set()
        navs = [n for n in navs if not (n in seen or seen.add(n))]
        print(f"一级导航：{len(navs)} 个 → {navs}")

        total_tabs = 0
        empty_tabs = []
        garbage_tabs = []
        visited = []
        for nav in navs:
            page.click(f'a[data-page="{nav}"]')
            page.wait_for_timeout(120)
            tabs = page.eval_on_selector_all(
                "button[role=tab]", "els => els.map(e => e.dataset.tab)"
            )
            for tab in tabs:
                page.click(f'button[role=tab][data-tab="{tab}"]')
                page.wait_for_timeout(60)
                body = page.inner_text("body")
                visited.append(f"{nav}/{tab}")
                total_tabs += 1
                if any(m in body for m in EMPTY_MARKS) or len(body.strip()) < 30:
                    empty_tabs.append(f"{nav}/{tab}（{len(body.strip())} 字）")
                hits = [g for g in GARBAGE_MARKS if g in body]
                if hits:
                    garbage_tabs.append(f"{nav}/{tab} → {hits}")

        print(f"二级页签：{total_tabs} 个（访问 {len(visited)} 次）")
        if empty_tabs:
            print("落到空态/内容过短的页签：")
            for t in empty_tabs:
                print(f"  ✗ {t}")
        if garbage_tabs:
            print("渲染出垃圾值（undefined/NaN/null/[object Object]）的页签：")
            for t in garbage_tabs:
                print(f"  ✗ {t}")

        # 窄屏不横向溢出
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(300)
        overflow = page.evaluate(
            "() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth })"
        )

        browser.close()

    print()
    ok = True

    def chk(cond, label, extra=""):
        nonlocal ok
        print(f"  {'✓' if cond else '✗'} {label}{('  ' + extra) if extra else ''}")
        if not cond:
            ok = False

    chk(not page_errors, "0 个未捕获异常", f"{page_errors[:2]}" if page_errors else "")
    chk(not console_errors, "0 条 console error", f"{console_errors[:2]}" if console_errors else "")
    chk(not failed_requests, "0 个失败请求", f"{failed_requests[:2]}" if failed_requests else "")
    chk(len(navs) == 10, f"一级导航 10 个（实测 {len(navs)}）")
    chk(total_tabs == 34, f"二级页签 34 个（实测 {total_tabs}）")
    chk(not empty_tabs, f"无空态页签（{len(empty_tabs)} 个）")
    chk(not garbage_tabs, f"无垃圾值页签（{len(garbage_tabs)} 个）")
    chk(overflow["doc"] <= overflow["win"], "390 宽不横向溢出", f"{overflow}")

    print()
    print("PASS —— 装机产物上 10 一级 / 34 二级全部可打开" if ok else "FAIL —— 见上面 ✗ 项")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
