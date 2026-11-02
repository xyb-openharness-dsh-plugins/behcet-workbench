# 38 · 指南原件怎么找、怎么验（NCCN / CACA / ESMO / CSCO / AJCC）

> 来源：小萌宝 AnalPal（肛管癌）2026-10-27 —— 36 号 v2 第一版把四行全写成「未取得原件，据二次来源」，
> 各挂一个学会栏目页，`check-primer-links.mjs` 17/17 全绿地放过去了。用户当场否掉：
> 「**未取得链接不对，不能交付，你搜索下完全能找到 nccn 链接的**」。
> 这份文档把那一轮的搜索路径固化下来，别再重走。

## 0. 一句话

**栏目页不是原件。** `guidelines-detail?id=xxx`、`esmo.org/.../anal-cancer`、`facs.org/quality-programs/...`
这类页面上有指南的名字，但没有指南的正文；点进去还要再点三次、注册、或干脆打不开。
原件 = 可以直接看到正文的东西：PDF 直链、期刊全文页、PMC、DOI、登记库检索页。

## 1. 原件类型词表（`kind`，36 号 §2.5 必填）

| kind | 含义 | 能配 `original: true` | 判据 |
| --- | --- | --- | --- |
| `pdf` | 官方 PDF 直链 | ✅ | 路径带 `.pdf`；实测 `content-type: application/pdf` |
| `fulltext` | 期刊全文页 / DOI / PMC | ✅ | 打开即正文（HTML 可接受） |
| `registry` | 登记库检索入口 | ✅ | ClinicalTrials.gov / ChiCTR / ChinaDrugTrials |
| `dataset` | 自采快照（随仓或无外链） | ✅ | 与指南原件分开计 |
| `hub` | 学会/机构栏目页、指南详情页、商品页 | ❌ | 只是「有这个名字」，没有正文 |

## 2. NCCN：唯一能免费拿到 PDF 的是**患者版**

NCCN 两条产品线，URL 形态完全不同，别混：

| 产品线 | URL 形态 | 实测结果 |
| --- | --- | --- |
| **NCCN Guidelines for Patients**（患者版，免费） | `https://www.nccn.org/patients/guidelines/content/PDF/<slug>-patient.pdf` | **真 PDF**。肛管癌：43 页 / 1,266,276 B / PDF 1.7 |
| **NCCN Guidelines**（临床版，需注册订阅） | `https://www.nccn.org/professionals/physician_gls/pdf/<slug>.pdf` | **不是 PDF**：200 但 79,475 B 的 `text/html` 登录页 |
| 临床版指南详情页 | `https://www.nccn.org/guidelines/guidelines-detail?category=1&id=<id>` | HTML 栏目页 → `kind: 'hub'` |

- `<slug>` 就是病种英文小写：`anal` / `rectal` / `colon` / `breast` / `gastric` / `esophageal` / `hcc`。
- 患者版 `<slug>-patient.pdf` 的命名在肛管癌上成立；**不是所有病种都有患者版**，命中 404 就换一条路。
- **患者版 PDF 内页写着它依据的临床版版本号**，例如：
  「This patient guide is based on the NCCN Clinical Practice Guidelines in Oncology (NCCN Guidelines®)
  for Anal Carcinoma, **Version 2.2026**」。
  → 这是**免费拿到「临床版当前是第几版」最可靠的渠道**，写「发展趋势」段时用它，比二手引述稳。
- 表述必须写清是哪一版产品：「患者版（据 V2.2026 改编）」≠「临床版全文」。**不许把患者版说成临床版**。
- 常见假直链（都别再试）：
  - `.../anal-cancer-patient.pdf` → 20 B 的纯文本错误页
  - `.../anal-cancer-patient-chinese.pdf` → 同上
  - `.../physician_gls/pdf/anal.pdf` → 79 KB HTML 登录页（**用 `curl -sI` 看 content-type 一眼识破**）

## 3. 中国指南：CACA 有独立肛管癌，CSCO 没有

| 机构 | 事实 | 链接形态 |
| --- | --- | --- |
| **CACA**（中国抗癌协会） | 有《中国肿瘤整合诊治指南·肛管癌》独立分册，V1.0_2022（2022-03-31，大肠癌专业委员会） | 专区 `pdflist?guide_id=1047`；分册详情 `pdflist/detail?id=37`，**在线逐页可读**（`image.cacakp.com/cancer_guide_pdf/37/pdf_photo/N.jpg`），下载需登录 |
| **CSCO** | **没有独立肛管癌指南**。2025 版合订本目录 31 分册里只有《结直肠癌诊疗指南》，肛管癌条目散见其内 | 无官方免费全文 → `nolink: true` + note，**不许编 URL** |
| 卫健委 | 《中国结直肠癌诊疗规范（2025 版）》新增肛管癌外科治疗章节 | 未见官方免费全文 |

- CACA 详情页的 HTML 里**不暴露 `.pdf` 直链**，只给逐页图片；别花时间找直链，`kind` 记 `fulltext`（正文可读），note 写「下载需登录」。
- CSCO 常被写成「CSCO 肛管癌 / 结直肠癌诊疗指南」——**这个书名不存在**。要么写「结直肠癌诊疗指南（肛管癌未单独成册）」，要么删行。

## 4. ESMO：官方页能开，全文页对脚本 403

- 指南页：`https://www.esmo.org/guidelines/esmo-clinical-practice-guideline-<slug>` → `kind: 'hub'`，**不能配 original:true**。
- 真正的全文在 Annals of Oncology：
  `https://www.annalsofoncology.org/article/S0923-7534(21)02064-0/fulltext` → 对 curl/脚本返回 **403**（Cloudflare），
  浏览器可正常打开；`kind: 'fulltext'`，note 写「剧本 403，浏览器可开」。
- 版本要写实际年份，别跟着「2026 更新」写：ESMO 肛管癌 CPG 现行是 **2021**（Ann Oncol 2021;32:1087-1100）。
- `s3-eu-west-1.amazonaws.com/.../ESMOPG2023_LGI_...pdf` 是真 PDF，但是 2023 年 **Lower GI 口袋指南汇编**
  （100 页，含结直肠+肛管），**不是**肛管癌 CPG 本体——可作补充，不能当那一行。

## 5. AJCC：手册付费，官方只免费第 1 章

- 8th Edition 是付费书；肛管章节 DOI `10.1007/978-3-319-40618-3_18` 打开是 **"Deleted"** 页。
- 官方免费能给的：`https://www.facs.org/media/2zvlrdmi/ajcc_staging_rules_8th_ed.pdf`
  （第 1 章分期总则，真 PDF）→ 只能作 `secondaryUrl`，note 写「肛管章节在付费手册内」。
- `facs.org/media/*anal*ajcc*.pdf`、`*ajcc-8th-edition-staging.pdf` 各种命名均 **404**，别再猜哈希。

## 6. 验证：三步，一步都不能省

```bash
# ① 状态码 + 内容类型（最关键：识破「HTML 冒充 PDF」）
curl -sI -L --max-time 25 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" "$URL" \
  | grep -iE "^(HTTP/|content-type|content-length)"

# ② 真下载一次，看是不是真文件
curl -sL -o /tmp/x.pdf "$URL" && file /tmp/x.pdf     # 期望：PDF document, version 1.x, N pages

# ③ 入库前后跑闸门
node scripts/check-primer-links.mjs --http          # pdf 拿到 text/html 会直接 FAIL
node scripts/check-primer-links.mjs --self-test     # 反向对照，确认闸门本身还能报红
```

判定表：

| 实测结果 | 结论 |
| --- | --- |
| 200 + `application/pdf` + `file` 认 PDF | 真原件，`kind: 'pdf'` |
| 200 + `text/html` 但 `kind: 'pdf'` | **假直链**（登录页/反爬页）→ 换路 |
| 200 + `text/html` + 打开即正文 | 全文页，`kind: 'fulltext'` |
| 403 / 429 | 反爬：浏览器可开也算可达，但必须写进 note，`--http` 报 WARN |
| 404 / 410 | 死链，`--http` 直接 FAIL |
| 页面标题含 `Deleted` / `Login` | 作废 |

## 7. 搜索路径（按命中率排序）

1. **内置 `WebSearch`**：查「`<机构> <指南全名> <版本> PDF`」。搜索引擎已索引 PDF 正文，
   能直接看到 NCCN 患者版里那句「Version 2.2026」——比开 PDF 还快。
2. **按形态直接猜 URL**（NCCN 患者版、CACA 详情页编号）比泛搜更快。
3. `curl` 逐条探测状态码——**这是唯一能证明「拿到了」的动作**，别用「搜索结果里有」代替。
4. 腾讯元宝搜索 skill 需 `TENCENTCLOUD_WSA_APIKEY`，未配置时直接报 `api-key are not set`；
   DuckDuckGo / Bing 直连对脚本有反爬，返回空结果集。两条路都不通时不要卡在那里，走 1→3。

## 8. 红线

- **不许编 URL。** 搜不到就 `nolink: true` + `note` 写清为什么，这比假链接安全。
- **不许把栏目页说成原件。** `kind: 'hub'` 就是 hub。
- **不许把患者版说成临床版。** 两者内容深度差一个量级。
- 版本号写实测到的那个；没核实就写「未核验」，并把它列进「仍未核验」清单。