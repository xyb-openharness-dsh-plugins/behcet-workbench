# 白塞病临床研究登记来源初查

查询时间：2026-11-03 21:09–21:20 UTC。此文仅记录来源可达性与探索性检索，不是完整检索、临床研究快照或入组判断。未抓取并核验全部记录、去重后入库，未做患者匹配。

| 来源 | 初查结果 | 限制 |
| --- | --- | --- |
| [ClinicalTrials.gov API](https://clinicaltrials.gov/api/v2/version) | HTTP 200；API 2.0.5；数据时间 2026-11-03T10:00:05 | 查询时间与数据时间不同；需完整分页、核验、记录查询并按 NCT ID 去重 |
| [中国临床试验注册中心](https://www.chictr.org.cn/) | 首页 HTTP 200；检索直接路径 HTTP 405 | 以 `.html/` 路径访问获得 HTML 200；非官方文档化接口，浏览器未验证；尚无完整快照 |
| [药物临床试验登记与信息公示平台](https://www.chinadrugtrials.org.cn/) | 首页 HTTP 200；自动检索 FAILED | 搜索返回 HTTP 202 和 JavaScript 挑战；不能记为零条 |
| [WHO ICTRP](https://trialsearch.who.int/) | 首页 HTTP 200 | 本轮未执行检索；未查，不计覆盖 |

探索性 CTG 检索 `query.cond=Behcet`、首登记日期 2026-02-03 至 2026-11-03，返回总计 10 个命中；查询 `pageSize=1`，返回下一页令牌，未读取全部记录。2026-11-03 本会话独立复核同一[官方 API 查询](https://clinicaltrials.gov/api/v2/studies?query.cond=Behcet&filter.advanced=AREA%5BStudyFirstPostDate%5DRANGE%5B2026-02-03%2C2026-11-03%5D&pageSize=1&countTotal=true&fields=NCTId)获得 HTTP 200、`totalCount=10` 和 `nextPageToken`；仅核实第一页及分页信号。同义词查询计数不同，不可把单词命中当完整覆盖。研究登记状态不等于当前有效，也不等于患者可入组。

ChiCTR 探索性检索的中文、英文及不同字段返回不同数量；多词合并发现新旧两种注册号格式。日期范围、详情、分页和去重结果尚未逐条核验。访问控制失败应如实记录，不把非正式路径视为稳定接口。

后续快照须记录每个通道的查询语句、起止日期、时间、分页、失败及去重口径，保留来源清单，核验 manifest、JSONL 和 SQLite 一致性及完整性；FAILED 和未查均不得填零。本次尚无这些交付物，M4 未完成。
