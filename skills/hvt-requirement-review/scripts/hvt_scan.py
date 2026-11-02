#!/usr/bin/env python3
"""hvt_scan.py — 癌种工作台 HVT 场景命中扫描（启发式初值，不是判定）

只做一件事：把内置（或自定义）HVT 场景的关键词，按文档层统计命中分布，
给出五层覆盖的**候选初值**和"疑似假覆盖"警告。最终 C 值必须人工复核。

用法：
  python3 hvt_scan.py --profile ovarian --project /path/to/workbench
  python3 hvt_scan.py --project . --terms my-terms.json --out review-scan.md
  python3 hvt_scan.py --profile list
  python3 hvt_scan.py --profile lung --project . --json /tmp/scan.json --strict

退出码：0 正常；2 参数/路径错误。
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------- 术语包
# 每题术语：同一场景内多个近义词，命中即计一次；total 为所有 term 命中数之和。
PROFILES = {
    "breast": {
        "label": "乳腺癌",
        "scenes": [
            ("BR-01", "腋窝处理后的上肢淋巴水肿", "术后手臂发沉/袖套变紧 → 四点位臂围差与报告问题",
             ["淋巴水肿", "臂围", "腋窝", "患侧上肢"]),
            ("BR-02", "内分泌治疗的关节痛与骨丢失", "服药后晨僵/潮热 → 记录与复查问题",
             ["内分泌治疗", "来曲唑", "他莫昔芬", "关节痛", "骨密度", "T值"]),
            ("BR-03", "抗 HER2 治疗与心脏监测", "看到 LVEF 报告 → 理解监测节奏",
             ["HER2", "LVEF", "心脏毒性", "曲妥珠"]),
            ("BR-04", "乳腺手术方式与身体形象", "面临切除/重建选择 → 沟通清单",
             ["乳房切除", "保乳", "重建", "义乳", "身体形象"]),
            ("BR-05", "放疗皮肤反应与纤维化", "放疗中出现皮肤改变 → 记录与联系条件",
             ["放疗", "皮肤反应", "放射性", "纤维化"]),
            ("BR-06", "生育与卵巢功能保护", "治疗前被问是否生育 → 转介与问题清单",
             ["生育", "卵巢功能", "AMH", "GnRH", "保护生育"]),
            ("BR-07", "骨转移与骨健康", "骨痛或骨密度报告 → 记录与问题",
             ["骨转移", "骨痛", "双膦酸盐", "地舒单抗", "骨事件"]),
            ("BR-08", "术后引流与伤口", "带管出院 → 引流量记录与异常识别",
             ["引流", "引流量", "伤口", "皮下积液"]),
            ("BR-09", "标志物与复发担忧", "CA15-3 升高 → 看懂趋势而不下结论",
             ["CA15-3", "CA153", "复发", "标志物"]),
        ],
    },
    "ovarian": {
        "label": "卵巢癌",
        "scenes": [
            ("OV-01", "减灭术与残余病灶", "医生提到 R0/R1 → 看懂手术记录与残余病灶",
             ["减灭", "残余病灶", "R0", "R1", "肿瘤细胞减灭术"]),
            ("OV-02", "腹水与腹胀", "腹胀加重 → 记录与联系条件",
             ["腹水", "腹胀", "腹腔积液"]),
            ("OV-03", "肠梗阻与排便", "停止排气排便 → 识别急症边界",
             ["肠梗阻", "排气", "排便", "梗阻"]),
            ("OV-04", "CA125/HE4 趋势", "标志物升高 → 看趋势但不下复发结论",
             ["CA125", "CA-125", "HE4", "标志物"]),
            ("OV-05", "BRCA/HRD 与维持治疗", "拿到基因报告 → 理解维持治疗前提",
             ["BRCA", "HRD", "维持治疗", "PARP", "奥拉帕利", "尼拉帕利"]),
            ("OV-06", "含铂化疗与神经毒性", "手脚麻木 → 记录与沟通",
             ["铂", "紫杉", "神经毒性", "周围神经"]),
            ("OV-07", "复发与治疗史重建", "医生提到铂敏感/耐药 → 重建既往治疗",
             ["铂敏感", "铂耐药", "复发", "治疗线"]),
            ("OV-08", "放疗的特定情境", "被提到放疗 → 理解目的与要核实的问题",
             ["放疗", "姑息放疗"]),
            ("OV-09", "造口与盆底肠功能", "术后排便改变/造口 → 照护记录",
             ["造口", "盆底", "肠功能"]),
            ("OV-10", "遗传咨询与家系", "检出胚系突变 → 家属风险沟通",
             ["遗传", "家系", "胚系", "germline"]),
        ],
    },
    "lung": {
        "label": "肺癌",
        "scenes": [
            ("LU-01", "穿刺/EBUS 与标本流转", "被建议活检 → 取材/标本/病理/分子关系",
             ["穿刺", "EBUS", "支气管镜", "标本", "取材"]),
            ("LU-02", "NSCLC 与 SCLC 分叉", "病理写着小细胞/非小细胞 → 两条路径不互套",
             ["NSCLC", "SCLC", "小细胞", "非小细胞", "局限期", "广泛期"]),
            ("LU-03", "分子分型与靶向", "看到 EGFR/ALK 结果 → 变异到用药的链条",
             ["EGFR", "ALK", "ROS1", "KRAS", "靶向"]),
            ("LU-04", "PD-L1 与免疫治疗", "PD-L1 百分比 → 理解它不是靶点",
             ["PD-L1", "免疫治疗", "免疫相关"]),
            ("LU-05", "术后肺功能与活动耐量", "肺叶切除后气促 → 功能记录与康复边界",
             ["肺功能", "肺叶切除", "活动耐量", "气促"]),
            ("LU-06", "放疗与放射性肺炎", "放疗中咳嗽发热 → 记录与联系条件",
             ["放疗", "PCI", "放射性肺炎", "预防性颅脑"]),
            ("LU-07", "脑转移", "新发头痛/抽搐 → 部位事件与 MDT 问题",
             ["脑转移", "颅内", "头痛", "癫痫"]),
            ("LU-08", "恶性胸腔积液", "胸水反复 → 引流记录与局部治疗问题",
             ["胸腔积液", "胸水", "引流"]),
            ("LU-09", "咯血与急症边界", "咯血 → 何时立刻就医",
             ["咯血", "上腔静脉", "急症"]),
            ("LU-10", "吸烟相关污名与戒烟", "被问吸烟史 → 不评判的记录与支持",
             ["吸烟", "戒烟", "污名"]),
        ],
    },
    "pancreatic": {
        "label": "胰腺癌",
        "scenes": [
            ("PA-01", "CA19-9 与黄疸", "皮肤发黄/指标升高 → 看懂与联系条件",
             ["CA19-9", "CA199", "黄疸", "胆道"]),
            ("PA-02", "胰十二指肠切除与消化", "Whipple 术后 → 胰酶与进食记录",
             ["胰十二指肠", "Whipple", "胰酶", "消化"]),
            ("PA-03", "体重与营养", "体重下降 → 记录与营养支持问题",
             ["体重", "恶病质", "营养", "胰酶"]),
            ("PA-04", "疼痛与镇痛", "腰背痛加重 → 记录与沟通",
             ["疼痛", "神经丛", "镇痛", "阿片"]),
            ("PA-05", "胆道支架与梗阻", "支架堵塞发热 → 急症边界",
             ["支架", "梗阻", "胆管"]),
            ("PA-06", "腹水与腹膜转移", "腹胀腹水 → 记录与局部处理问题",
             ["腹水", "腹膜"]),
            ("PA-07", "新辅助/转化治疗", "医生提到先化疗再手术 → 理解顺序",
             ["新辅助", "转化治疗", "可切除"]),
        ],
    },
    "colorectal": {
        "label": "结直肠癌",
        "scenes": [
            ("CR-01", "造口照护", "术后带造口 → 照护与回纳问题",
             ["造口", "造口袋", "回纳"]),
            ("CR-02", "MSI/dMMR 与免疫", "看到错配修复结果 → 理解免疫前提",
             ["MSI", "dMMR", "错配修复", "免疫"]),
            ("CR-03", "肝转移与局部治疗", "发现肝转移 → 局部与全身治疗并行",
             ["肝转移", "射频", "消融", "切除"]),
            ("CR-04", "术后排便功能", "排便次数增多/失禁 → 功能记录",
             ["排便", "LARS", "里急后重", "肛门"]),
            ("CR-05", "奥沙利铂神经毒性", "手足麻木怕冷 → 记录与沟通",
             ["奥沙利铂", "神经毒性", "手足麻木"]),
            ("CR-06", "CEA 与随访", "CEA 升高 → 趋势与复查问题",
             ["CEA", "癌胚抗原", "随访"]),
            ("CR-07", "遗传与家系", "Lynch 筛查 → 家属沟通",
             ["Lynch", "遗传", "家系"]),
        ],
    },
}

LAYERS = {
    "S": ("场景", ("scenario", "patient-journey", "spec", "brief", "journey")),
    "M": ("模块", ("core-module", "ui-design", "spec", "module")),
    "F": ("字段", ("schema", "data", "api-contract", "model")),
    "I": ("交互", ("ui-design", "core-module", "interactive", "prototype-review")),
    "A": ("验收", ("acceptance", "parity", "validation")),
}

STATE_WORDS = ("空态", "单条", "窄屏", "减少动效", "翻转", "aria", "失败", "断线", "不可比", "恢复")

SKIP_DIRS = {"_archived", "reference", "node_modules", ".git", "prototype", "assets", "dist"}
# 本技能的产出物会把关键词再写一遍；不排除会自指命中，让复审分数虚高。
SKIP_FILES = {"hvt-review.md", "hvt-scenes.csv"}


def load_docs(root: Path):
    """只扫 docs/ 与根目录的一级 md；不碰 _archived、reference、prototype、记忆目录。"""
    docs_dir = root / "docs"
    candidates = list(docs_dir.rglob("*")) if docs_dir.is_dir() else list(root.rglob("*"))
    candidates += [p for p in root.glob("*.md") if p.is_file()]
    docs = []
    for path in sorted(set(candidates)):
        if not path.is_file() or path.suffix.lower() not in {".md", ".csv", ".txt"}:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.name.lower() in SKIP_FILES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        docs.append((path.relative_to(root).as_posix().lower(), text))
    return docs


def layer_of(name: str):
    for key, (_, needles) in LAYERS.items():
        if any(n in name for n in needles):
            return key
    return None


def scan_scene(terms, docs):
    per_doc = {}
    for name, text in docs:
        counts = {t: text.count(t) for t in terms}
        total = sum(counts.values())
        if total:
            per_doc[name] = {"total": total, "terms": {k: v for k, v in counts.items() if v}}
    total = sum(v["total"] for v in per_doc.values())
    layers = {k: 0 for k in LAYERS}
    for name, info in per_doc.items():
        lk = layer_of(name)
        if not lk:
            continue
        if lk == "I":
            text = next(t for n, t in docs if n == name)
            if info["total"] >= 2 and any(w in text for w in STATE_WORDS):
                layers["I"] = 1
        elif info["total"] >= 2:
            layers[lk] = 1
    # S 层额外要求：场景文档里至少有 2 次命中，避免单个名词混过去
    scene_doc_hits = sum(v["total"] for n, v in per_doc.items() if layer_of(n) in {"S", "M"})
    if layers["S"] and scene_doc_hits < 2:
        layers["S"] = 0
    c = sum(layers.values())
    warnings = []
    if total <= 2:
        warnings.append("命中过少（≤2 次），疑似只在名词列表出现")
    if len(per_doc) == 1:
        warnings.append(f"仅单一文档命中：{next(iter(per_doc))}")
    if layers["S"] == 0 and (layers["M"] or layers["F"]):
        warnings.append("有模块/字段但无场景条目：模块可能凭空长出")
    return total, per_doc, layers, c, warnings


def main():
    ap = argparse.ArgumentParser(description="HVT 场景命中扫描（启发式初值）")
    ap.add_argument("--project", default=".", help="工作台项目根目录")
    ap.add_argument("--profile", default=None, help="内置癌种：breast/ovarian/lung/pancreatic/colorectal 或 list")
    ap.add_argument("--terms", default=None, help="自定义 JSON：{label, scenes:[{id,name,trigger,terms:[...]}]}")
    ap.add_argument("--out", default=None, help="Markdown 输出路径")
    ap.add_argument("--json", default=None, help="JSON 输出路径")
    ap.add_argument("--strict", action="store_true", help="存在 B 级候选时以 1 退出")
    args = ap.parse_args()

    if args.profile == "list":
        for key, val in PROFILES.items():
            print(f"{key}\t{val['label']}\t{len(val['scenes'])} 场景")
        return 0

    root = Path(args.project).expanduser().resolve()
    if not root.is_dir():
        print(f"项目目录不存在：{root}", file=sys.stderr)
        return 2

    if args.terms:
        payload = json.loads(Path(args.terms).expanduser().read_text(encoding="utf-8"))
        label = payload.get("label", "custom")
        scenes = [(s["id"], s["name"], s.get("trigger", ""), s["terms"]) for s in payload["scenes"]]
    elif args.profile in PROFILES:
        label = PROFILES[args.profile]["label"]
        scenes = PROFILES[args.profile]["scenes"]
    else:
        print("需要 --profile 或 --terms；用 --profile list 查看内置", file=sys.stderr)
        return 2

    docs = load_docs(root)
    if not docs:
        print(f"{root} 下没有可扫描的 md/csv", file=sys.stderr)
        return 2

    rows = []
    for sid, name, trigger, terms in scenes:
        total, per_doc, layers, c, warnings = scan_scene(terms, docs)
        rows.append({
            "id": sid, "scene": name, "trigger": trigger,
            "terms": terms, "hits": total, "docs": per_doc,
            "layers": layers, "c": c, "warnings": warnings,
        })

    rows.sort(key=lambda r: (-r["c"], r["id"]))
    blocking = [r for r in rows if r["c"] <= 2 and r["hits"] > 0]
    silent = [r for r in rows if r["hits"] == 0]

    out = []
    out.append(f"# HVT 命中扫描 · {label}\n")
    out.append(f"项目：`{root}`　扫描文档：{len(docs)} 份（排除 _archived / reference / prototype）\n")
    out.append("> 这是**启发式初值**：只统计术语命中并按文档层归类。C 值必须人工读上下文复核；\n"
               "> 命中不等于覆盖，未命中也不等于一定没有（可能用了别的词）。\n")
    out.append("| ID | 场景 | 命中 | S | M | F | I | A | C | 警告 |")
    out.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        l = r["layers"]
        out.append(f"| {r['id']} | {r['scene']} | {r['hits']} | {l['S']} | {l['M']} | {l['F']} | {l['I']} | {l['A']} | "
                   f"{r['c']} | {'；'.join(r['warnings']) or '—'} |")

    out.append("\n## 命中明细\n")
    for r in rows:
        if not r["docs"]:
            out.append(f"- **{r['id']} {r['scene']}**：0 命中（检查是否换了说法）")
            continue
        tops = sorted(r["docs"].items(), key=lambda kv: -kv[1]["total"])[:4]
        detail = "；".join(f"`{n}` {v['total']}" for n, v in tops)
        out.append(f"- **{r['id']} {r['scene']}**：{detail}")

    out.append("\n## 汇总\n")
    out.append(f"- 有命中但 C≤2（疑似有场景无落地）：{len(blocking)} 个"
               + ("：" + "、".join(r["id"] for r in blocking) if blocking else ""))
    out.append(f"- 零命中（文档完全没提）：{len(silent)} 个"
               + ("：" + "、".join(r["id"] for r in silent) if silent else ""))
    out.append(f"- 五层齐全（C=5，仍须人工确认不是形式覆盖）：{sum(1 for r in rows if r['c'] == 5)} 个")

    text = "\n".join(out) + "\n"
    if args.out:
        Path(args.out).expanduser().write_text(text, encoding="utf-8")
        print(f"已写入 {args.out}")
    else:
        print(text)

    if args.json:
        Path(args.json).expanduser().write_text(
            json.dumps({"profile": label, "root": str(root), "rows": rows}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"已写入 {args.json}")

    if args.strict and blocking:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
