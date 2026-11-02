# HVT 需求审核：癌种特有场景是否真的落地

适用：单癌种患者/照护者工作台。解决一个反复出现的问题——**需求文档看起来什么都有，做出来却是泛肿瘤看板**。

## 为什么单列一道审核

通用能力（记录症状、准备复诊、导出、情绪支持）任何癌种都成立，写起来容易，评审时也容易"有东西可看"。真正决定这个工作台有没有用的，是那些**只有这个癌种才特别**的场景：乳腺癌的腋窝处理后上肢淋巴水肿、卵巢癌的减灭术残余病灶与肠梗阻、肺癌的穿刺标本流转与 SCLC/NSCLC 分叉。

这些场景的共同点：在需求文档里常常只以名词出现一次，在原型里常常只剩一个二级页标题。**提到不等于覆盖**，所以需要一个能落层判定、能出补丁的审核方法，而不是再写一份"差距分析"。

## 方法：HVT-5

完整方法在技能包内，按需读取，不必先全读：

| 文件 | 内容 |
| --- | --- |
| [SKILL.md](../skills/hvt-requirement-review/SKILL.md) | 五步法、分级、硬约束、输出物 |
| [hvt-derivation.md](../skills/hvt-requirement-review/references/hvt-derivation.md) | 十条疾病轴与新癌种推导流程 |
| [scoring-rubric.md](../skills/hvt-requirement-review/references/scoring-rubric.md) | V/S/F 锚点、HVT 门槛、优先级公式 |
| [five-layer-check.md](../skills/hvt-requirement-review/references/five-layer-check.md) | 五层判据与假覆盖识别 |
| [publish-readiness.md](../skills/hvt-requirement-review/references/publish-readiness.md) | 发布可见性 P1–P5：版本号在 HTML 首页与应用首页是否真的看得见 |
| [interaction-path-consistency.md](../skills/hvt-requirement-review/references/interaction-path-consistency.md) | 交互路径一致性 X1–X4：开发页面与已签认交互路径文档（[28 号](28-INTERACTION-PATH-DESIGN.md)）是否同一张图——无孤儿页 / 逐字走通 / 通道一致 / 无头断言出数字 |
| [report-template.md](../skills/hvt-requirement-review/references/report-template.md) | 报告与 CSV 结构 |
| [hvt_scan.py](../skills/hvt-requirement-review/scripts/hvt_scan.py) | 命中统计脚本（启发式，不做判定） |
| [publish_check.py](../skills/hvt-requirement-review/scripts/publish_check.py) | 版本来源与 HTML 字面量定位（不做判定） |

五步一句话版：

1. **建轴**：沿十条疾病轴问"本癌种有什么不一样"，填不出就写无显著差异，不硬造。
2. **抽场景**：写成"触发 → 想完成的事 → 产物"，不写功能名。
3. **打分**：V 患者价值 / S 癌种特有性 / F 频次，取 V≥2 且 S≥2 为 HVT。
4. **五层检查**：场景 S、模块 M、字段 F、交互 I、验收 A，每层 0 或 1。
5. **出评价与补丁**：B 阻塞 / G 缺口 / W 薄弱 / U 待核验，补丁写成能粘进 SPEC 的条款。

五层之外还有一道**发布可见性 P**（P1 HTML 首页 / P2 应用首页 / P3 单一来源 / P4 可追溯 / P5 状态如实）。它不并入五层覆盖分 C，因为版本号不是某个场景的属性，而是整个工作台的发布属性；但 P1 不过，G2 不算可签认的产物，P2 不过，装机验证不能写通过。判据见技能内 `references/publish-readiness.md`。

P 之外还有一道**交互路径一致性 X**（X1 页面覆盖无孤儿页 / X2 路径逐字走通 / X3 CRUD 通道一致 / X4 无头断言出数字）。它问的是"开发出来的页面，和已签认的[交互路径文档](28-INTERACTION-PATH-DESIGN.md)（HTML 开工的前置输入）是同一张图吗"；同样不并入 C（工作台级属性，不卡场景分），但 X1–X4 任一为 0，G2 不签认、Phase3 parity 一致性不写达标；项目没有已签认交互路径文档时 X 整体记 0，且按 IP1 不得开工 HTML。判据见技能内 `references/interaction-path-consistency.md`。

## 与三道闸口

| 闸口 | 本审核的作用 |
| --- | --- |
| G1 业务流程与功能 | 主战场。B 级未清零不签字，不写业务代码 |
| G2 HTML demo | 用同一份场景清单逐条对照原型，缺哪个场景就是 PARITY 缺口；P1（首屏可见版本号）必须通过；X1–X4（交互路径一致性）必须通过 |
| G3 数据模型与数据流 | 复用 F 层结论，检查关键字段是否真的建表、可比性是否进约束 |
| 装机 / 发布 | P2–P5：装机后工作台界面看得见版本号，且与清单/tag/市场一致；未接入时写"未验证" |

## 用法

```bash
# 1) 扫描候选（内置 breast / ovarian / lung / pancreatic / colorectal）
python3 skills/hvt-requirement-review/scripts/hvt_scan.py \
  --project . --profile ovarian --out /tmp/hvt-scan.md

# 2) 新癌种：按 hvt-derivation 推导后写自定义术语包
python3 skills/hvt-requirement-review/scripts/hvt_scan.py \
  --project . --terms my-terms.json --json /tmp/hvt-scan.json

# 3) 查看内置癌种
python3 skills/hvt-requirement-review/scripts/hvt_scan.py --profile list

# 4) 发布可见性定位：版本来源、HTML 里的版本字面量
python3 skills/hvt-requirement-review/scripts/publish_check.py --project .
```

**脚本只做命中统计。** 它给的是 C 的候选初值；报告里每个 C 都要人读上下文复核，并在证据列写明定位。把脚本结果直接当结论，等于换一种方式造假。

## 产出

- `docs/HVT-REVIEW.md`（主报告，init 会把 `templates/HVT-REVIEW.md` 复制为项目内待填写模板）
- `docs/HVT-SCENES.csv`（机器可读，便于跨项目比较与回归）
- SPEC 补丁并入对应章节，并在改动追踪记一行

## 三条容易走偏的地方

1. **把参考项目当需求来源。** 参考项目只提供交互与信息结构参照；业务规则必须由本癌种自己的指南/文献/用户材料支撑，且标来源层级。
2. **把"文档已写"当"已确认"。** 用户确认、临床审核、原型确认是三件事，各自要有记录人/日期/范围，缺记录就标 U。
3. **用分数替代判断。** C=5 也可能是形式覆盖（每层都写了一句）。报告必须能回答"照这个文档做，页面长什么样、第一步点什么"。

## 维护

- 术语包在 `scripts/hvt_scan.py` 的 `PROFILES` 里，新增癌种优先加术语包，不改判定逻辑。
- 新增判定规则前先问：这条规则会不会把"提到一次"判成覆盖？会，就不要加。
- 技能同时在用户级技能目录与本仓库 `skills/` 下维护；两处内容应一致，改完对比一次 `diff -r`。
