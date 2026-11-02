#!/usr/bin/env python3
"""发布可见性检查（P 层）定位脚本。

只做三件事：找版本来源、找 HTML 里的版本字面量、核对是否一致。
不做判定 —— 是否"首屏可见"必须人打开页面或看截图确认。

用法：
  python3 publish_check.py --project . 
  python3 publish_check.py --project . --json /tmp/publish.json
"""
import argparse
import json
import re
import sys
from pathlib import Path

VERSION_RE = re.compile(r"(?<![\w.])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.]*)?)(?![\w.])")
SKIP_DIRS = {"node_modules", ".git", "dist", "build", "review", "_archived", "reference"}
MAX_HTML_BYTES = 2_000_000


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def find_version_file(root: Path):
    for name in ("VERSION", "version", "VERSION.txt"):
        p = root / name
        if p.is_file():
            text = read_text(p).strip()
            m = VERSION_RE.search(text)
            if m:
                return {"path": str(p.relative_to(root)), "value": m.group(1)}
    return None


def find_package_versions(root: Path):
    out = []
    for p in [root / "package.json"] + sorted(root.glob("packages/*/package.json")):
        if not p.is_file():
            continue
        try:
            data = json.loads(read_text(p))
        except json.JSONDecodeError:
            out.append({"path": str(p.relative_to(root)), "value": None, "error": "invalid JSON"})
            continue
        if isinstance(data, dict) and isinstance(data.get("version"), str):
            out.append({"path": str(p.relative_to(root)), "value": data["version"]})
    return out


def find_prototypes(root: Path):
    """找原型入口。

    原型目录命名在各项目间并不统一（prototypes/v0.3/index.html、
    docs/prototype/lung-workbench-v1.html、根 index.html 都出现过），
    只认 prototypes/ 会漏掉整类项目，从而把"有入口但没版本号"误判成"没有入口"。
    """
    found = []
    for rel in ("prototypes", "prototype", "docs/prototype", "docs/prototypes"):
        d = root / rel
        if not d.is_dir():
            continue
        for entry in sorted(d.iterdir(), key=lambda p: natural_key(p.name)):
            if entry.is_dir():
                if (entry / "index.html").is_file():
                    found.append(entry / "index.html")
            elif entry.suffix.lower() in (".html", ".htm"):
                found.append(entry)
    for name in ("index.html", "demo.html", "prototype.html"):
        p = root / name
        if p.is_file():
            found.append(p)
    # 去重并保持顺序
    seen, out = set(), []
    for p in found:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def natural_key(name: str):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]


def human_size(n: int) -> str:
    return f"{n // 1024} KB" if n >= 1024 else f"{n} B"


def zone_of(text: str, pos: int) -> str:
    """粗略判断版本号落在哪个区域。仅用于提示，不作为判定。"""
    before = text[:pos].lower()
    # 找最近的区块起点
    candidates = [
        ("footer", before.rfind("<footer")),
        ("topbar", max(before.rfind("topbar"), before.rfind("top-actions"), before.rfind("<header"))),
        ("about/dialog", max(before.rfind("about"), before.rfind("dialog"), before.rfind("关于"))),
        ("script", before.rfind("<script")),
        ("comment", before.rfind("<!--")),
    ]
    closed = [
        ("footer", before.rfind("</footer>")),
        ("topbar", max(before.rfind("</header>"), before.rfind("</nav>"))),
        ("about/dialog", before.rfind("</dialog>")),
        ("script", before.rfind("</script>")),
    ]
    best = None
    for name, idx in candidates:
        if idx < 0:
            continue
        end = next((e for n, e in closed if n == name), -1)
        inside = end < idx
        if inside and (best is None or idx > best[1]):
            best = (name, idx)
    return best[0] if best else "unknown"


def scan_html(path: Path, root: Path):
    raw = path.read_bytes()[:MAX_HTML_BYTES]
    text = raw.decode("utf-8", errors="replace")
    hits = []
    for m in VERSION_RE.finditer(text):
        start = max(0, m.start() - 90)
        end = min(len(text), m.end() + 90)
        context = re.sub(r"\s+", " ", text[start:end]).strip()
        hits.append({
            "value": m.group(1),
            "zone": zone_of(text, m.start()),
            "context": context[:180],
        })
    # 是否引用了版本常量（构建注入 / 单一来源的迹象）
    refers_constant = bool(re.search(
        r"APP_INFO|appVersion|APP_VERSION|__VERSION__|version\s*[:=]\s*['\"]?\$|data-version"
        r"|id=[\"']app-version|ver-chip|app-build", text))
    has_version_meta = bool(re.search(r'<meta[^>]+name=["\'](?:app-)?version["\']', text, re.I))
    return {
        "file": str(path.relative_to(root)),
        "bytes": len(raw),
        "size": human_size(len(raw)),
        "hits": hits,
        "distinct": sorted({h["value"] for h in hits}),
        "refers_constant": refers_constant,
        "has_version_meta": has_version_meta,
    }


def find_release_records(root: Path):
    names = ["CHANGELOG.md", "docs/RELEASE.md", "docs/VERSIONING.md"]
    return [n for n in names if (root / n).is_file()]


def main() -> int:
    ap = argparse.ArgumentParser(description="发布可见性检查（只定位，不判定）")
    ap.add_argument("--project", required=True, help="工作台仓库根目录")
    ap.add_argument("--json", help="把结果写成 JSON")
    args = ap.parse_args()

    root = Path(args.project).expanduser().resolve()
    if not root.is_dir():
        print(f"不是目录：{root}", file=sys.stderr)
        return 2

    version_file = find_version_file(root)
    packages = find_package_versions(root)
    htmls = [scan_html(p, root) for p in find_prototypes(root)]
    primary = htmls[-1] if htmls else None
    legacy = htmls[:-1]
    records = find_release_records(root)

    values = {}
    if version_file:
        values.setdefault(version_file["value"], []).append(version_file["path"])
    for pkg in packages:
        if pkg.get("value"):
            values.setdefault(pkg["value"], []).append(pkg["path"])
    if primary:
        for v in primary["distinct"]:
            values.setdefault(v, []).append(primary["file"])

    report = {
        "project": str(root),
        "version_file": version_file,
        "package_versions": packages,
        "html": htmls,
        "primary_html": primary["file"] if primary else None,
        "legacy_html": [h["file"] for h in legacy],
        "distinct_versions": sorted(values),
        "conflicts": {k: v for k, v in values.items() if len(v) > 1} if len(values) > 1 else {},
        "release_records": records,
        "notes": [],
    }

    if not version_file:
        report["notes"].append("未找到 VERSION 单一来源文件；版本可能手写在多处。")
    if not packages:
        report["notes"].append("未找到 package.json；若尚未接入 DSH，P2 记为未验证而不是通过。")
    if primary:
        zones = {h["zone"] for h in primary["hits"]}
        if not primary["hits"]:
            report["notes"].append(f"{primary['file']} 文本中未出现版本号；若版本由构建注入，需看运行时 DOM。")
        else:
            if zones <= {"script", "comment"}:
                report["notes"].append(f"{primary['file']} 版本号只出现在 script/注释里，用户看不到。")
            if not ({"footer", "topbar", "about/dialog"} & zones):
                report["notes"].append(f"{primary['file']} 版本号未落在 footer/topbar/关于区，需人工确认是否首屏可见。")
        if not primary["refers_constant"] and not primary["has_version_meta"]:
            report["notes"].append(f"{primary['file']} 未发现版本常量或 meta 版本标记，疑似手写字面量。")
    if legacy:
        report["notes"].append("以下历史原型未纳入本次核对（旧版本，不应作为发布产物）：" + "、".join(h["file"] for h in legacy))
    if len(values) > 1:
        report["notes"].append("存在多个不同版本值：" + "、".join(sorted(values)) + "；逐条核对后再判 P3。")
    report["notes"].append("脚本不判断首屏可见性、不判断市场版本一致性；这两项需打开页面与市场条目核对。")

    print("== 发布可见性定位 ==")
    print(f"项目根：{root}")
    print(f"VERSION：{version_file['value'] if version_file else '未找到'}"
          + (f"（{version_file['path']}）" if version_file else ""))
    if packages:
        for pkg in packages:
            print(f"package：{pkg['path']} → {pkg.get('value') or pkg.get('error')}")
    else:
        print("package：未找到")
    if primary:
        print(f"\nHTML（最新）：{primary['file']}（{primary['size']}）")
        if not primary["hits"]:
            print("  未出现版本号")
        else:
            for h in primary["hits"][:12]:
                print(f"  - {h['value']}  zone={h['zone']}  …{h['context']}…")
            if len(primary["hits"]) > 12:
                print(f"  … 另有 {len(primary['hits']) - 12} 处")
            print(f"  常量引用：{'是' if primary['refers_constant'] else '未发现'}"
                  f" / meta 版本标记：{'有' if primary['has_version_meta'] else '无'}")
    else:
        print("\nHTML：未找到原型入口（prototypes/*/index.html）")
    if legacy:
        print("历史原型（未核对）：" + "、".join(h["file"] for h in legacy))

    print("\n-- 提示（需人工判定）--")
    for note in report["notes"]:
        print("  · " + note)
    print("\n-- 记录格式 --")
    print("P1 HTML 首页 ?  P2 应用首页 ?  P3 单一来源 ?  P4 可追溯 ?  P5 状态如实 ?")

    if args.json:
        out = Path(args.json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nJSON 已写入：{out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
