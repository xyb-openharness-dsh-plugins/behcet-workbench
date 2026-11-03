# 数据模型与迁移合同（草案）

> 文档：`docs/DATA-MODEL-DRAFT.md`  
> 版本：`v0.1.0-draft.8`
> 日期：2026-11-03  
> 状态：**只读分析后的原创草案；未冻结；待 G3 签认**；0 患者访谈、0 临床审核；G2 只确认原型范围，不能继承为 G3。本版只做合同文本修订，**未建库、未跑迁移、未做宿主验证、未写业务代码**。  
> 依据：2026-11-03 用户 G2 确认、`docs/SPEC.md`、`docs/SCENARIOS.md`、`docs/UI-DESIGN.md`、`docs/INTERACTION-DESIGN.md`、`docs/04-DATA.md`、`docs/14-HTML-AND-DATA-CONTRACT.md`、2026-11-03 独立审查 R-01～R-14（见 §0.1）、draft.3 复核 S-01～S-10（见 §0.2）、T-01～T-12（见 §0.3）、本轮安全审查 U-01～U-10（见 §0.4）、本轮五问复核 W-01～W-05（见 §0.5）、draft.8 六项复核 X-01～X-06（见 §0.6），以及 `prototypes/v0.2/` 的实际实现。
> 边界：本文件**不创建生产数据库、不建表、不写迁移脚本、不修改其他文件**。G3 签认前不得据此建库；G3 之后也只能先建测试库并跑完本文件第 11 节的可验证约束。**本版最优先的修订是向 `docs/SPEC.md` 对齐**：原件不复制、不缓存，登记只是出处关联；移除/撤回不静默删手工来源；代记者看不到私密元数据；AI 本版禁止接收私密或隐私未知内容，未来例外仍属未决。与 SPEC 冲突时以 SPEC 为准，本文件回改，不用“数据模型更完整”覆盖已确认规格。  
> 前几轮已写入的复核要点（draft.6/7，保留）：① Q-27/Q-28/Q-29/Q-30/Q-31 **全部明确标为 G3 阻塞**；② 清除 §10.4 残留的 `UPDATE import_candidate` 伪 SQL，改为逐条 INSERT `import_run`/`import_candidate` 的伪代码，并明确“任何人不得从旧版本复制执行”；③ `record.correct` **完全不得改变隐私**，隐私只能走 `record.setPrivacy`；④ 统一 `privacy_epoch`（进入 `private` 才 +1）并新增 `privacy_state_seq`（任何隐私状态变化 +1），用后者使 `unknown` 往返后的旧 release 自动失效；⑤ 非本人连受保护历史的元数据、修订号、计数和空位都不可见；⑥ 明确 `unknown` 原件的唯一解锁路径；⑦ `command_receipt` 主键 `(subject_id, actor_id, request_id)`；⑧ 迁移 `unknown` 不预置 ever/epoch；⑨ 传播写入原件新状态且**不降级**已有的 `private`；⑩ 删除不可复现的批量断言结果表，只保留可重跑骨架；V-33 改为未验证。**本轮新增：出站（导出/AI/产物）必须同时校验“选中的那一版修订”与“当前记录”，不能只看其一；恢复历史只能本人且不得洗白；跨 subject 引用全部校验并把 Q-30 列为 G3 阻塞；缺失候选来源失败关闭；代理采纳候选强制 `unknown` 并校验全部写入的身份/授权范围；缓存键必须含 `subject_id`；迁移伪代码不含可执行 SQL。**本轮五问复核（W-01～W-05）：来源链悬空/跨主体/不一致一律失败关闭；`import_run`/`import_candidate` 统一 `subject_id`/`document_id` 与复合引用；迁移无法判定采纳关系时默认 `unknown`（候选不可采纳），可显式选择整批拒绝，并列为 Q-31/G3 阻塞；`record.restoreRevision` 在事务内重读并前置版本校验；新挂受保护来源必须写入保护状态；`data_version` 与 artifact 隔离在同一事务一致。新增 V-43～V-48，全部未执行。所有未执行项一律标“未验证”。**

> **draft.8 本轮复核要点（X-01～X-06）**：① 历史编号固定为“老→新 1..N、当前 N+1”，迁移与读取都要自检当前内容，不允许把当前内容再当历史、也不允许把最新版标成第 1 版；② `link_state` 只有 `unverified/verified/missing/removed` 四态，`active` 不存在，四态对“可新挂/保护”的语义分开写清；③ 来源解析固定为 `no_file/resolved/unresolved` 三态，悬空/跨主体/不一致一律 `unresolved → unknown`，手工无来源不得混同为悬空；④ 云解析 run 无 consent 失败关闭（运行时不建 run、不上传、不建候选；迁移整批拒绝），不伪造 consent 或成功状态；⑤ 作者无法确定时 `author_state='unknown'`、两列作者字段为 NULL，不默认记成本人；⑥ V-33 按上述五类重写，新增 V-49～V-53，全部**未执行/未验证**。

---

## 0. 给 G3 的结论摘要

本草案把“患者记录”拆成四层，避免页面、原型数组和导出文件各自成为事实源：

1. **主体与授权层**：`subject`（患者）、`actor`（本人/代记者）、`access_grant`（代记授权）、`consent_event`（云解析/导出/AI 等出站同意）。没有授权就没有代记写入；私密永远高于授权。
2. **事实与修订层**：`record` 只保存稳定身份，`record_revision` 保存不可变的完整版本；更正、隐私变更都追加修订，不原地改内容。
3. **来源与候选层**：`source_document` 只保存原件登记（不复制内容），`import_run`/`import_candidate` 保存解析过程与候选；候选不是事实，逐条采纳才生成 `record`。
4. **读模型与产物层**：看板、时间线、一图秀、治疗阶段、复诊预览都从同一组 `record_revision` 派生；导出是冻结的 `artifact`，不是当前事实的副本。

据此形成的 31 条核心决定：

| 编号 | 决定 | 理由 |
|---|---|---|
| D-01 | 单一事实源是 `record` + `record_revision`，不是 `BEIPAL_DEMO_RECORDS`、`BEIPAL_METRICS`、`BEIPAL_EVENTS` 三个平行数组 | 原型三个数组会在时间线、指标、事件之间产生重复与漂移；生产必须能回放同一事实 |
| D-02 | `record` 身份不可变；内容只追加 `record_revision` | 更正历史、隐私历史、导出快照都需要按版本回看 |
| D-03 | 日期用“值 + 精度 + 原始文本”三件套；未知不补、月份不展开成日 | 患者常只记得月份或完全未知；补日期会制造假事实 |
| D-04 | 隐私是 `private / not_private / unknown` 三态，不是布尔 | 旧数据可能没有隐私标记；未知必须按受保护处理 |
| D-05 | 隐私变更本身也产生修订，并进入审计 | 只改布尔值会丢失“何时因何变为私密”的历史 |
| D-06 | 代记授权按“记录类别 + 时间范围 + 可读条目”授权；撤回后不改写作者 | 不能因为撤权就把代记内容伪装成本人亲笔 |
| D-07 | 导入候选独立成表，未采纳前不进入任何事实读模型 | “抽取成功/用户看见”不等于“患者确认” |
| D-08 | 原件只登记元数据，**不复制原件内容、不缓存原件内容**；记录通过 `source_document_id` 记出处，且该指针**只是出处/审计关联，不是可取回的文件引用**；重开原件需用户在会话中重新选择并提供会话文件句柄 | 对齐 `docs/SPEC.md` “资料目录与模拟抽取”；复制一份“原件副本”会制造第二份事实源，也超出用户选择目录的授权；把出处关联当文件引用会制造“登记过就能重开”的假能力 |
| D-09 | 数据根目录由用户显式选择；只有工作台**自己生成/管理**的文件存相对路径；原件留在用户原位置，库内不存其绝对路径、不存可持久化的文件句柄 | 不推断目录、不静默创建、不把业务数据装进安装目录；不把“登记”偷换成“接管文件” |
| D-10 | 导出产物冻结“记录 ID + 修订号 + 选择集 + 隐私策略版本” | 事实变化后旧导出不能被悄悄改写，只能标“需重新生成” |
| D-11 | 读模型带 `data_version` 与 `read_model_version`；页面不保存整页 state 作为真相 | 跨页一致性与缓存失效需要同一版本号 |
| D-12 | 当前原型没有账号/登录/服务端授权；生产授权必须在服务端执行，未实现前不得声称“已隔离” | 页面上的“本人演示页”不是访问控制 |
| D-13 | **默认保护**：隐私缺失、未知、无法判定、读取异常，一律按受保护处理；任何出口默认拒绝，不默认放行 | 隐私系统的错误方向必须偏向“少给”，不能靠调用方记得传 `not_private` |
| D-14 | **AI 出口本版硬禁止**：本版（draft.4）私密或隐私未知的内容永不进入发往 Agent 的 prompt、草稿、附件或日志；本版不实现“本人逐条授权”的例外开关。**“未来是否允许本人逐条授权”仍是未决政策问题（Q-10）**，须先修改 SPEC 并重走评审，不能由本模型或 G3 单项打开 | 本版必须失败关闭；把“未来可能例外”写成实现开关，等于在当下留了一条可被配置打开的红线 |
| D-15 | 代记者**看不到私密记录的存在性与元数据**，也**不能把私密/未知降为非私密** | 只屏蔽正文而泄露“有一条 2024 年的私密记录”，仍是泄露；降隐私 = 越权解密 |
| D-16 | 更新采用**乐观并发 + 字段级合并**：只有双方改到同一字段才冲突；未改字段不阻塞保存 | 让用户为别人改的另一字段反复重填，会诱发“覆盖式保存”，最终丢数据 |
| D-17 | 所有写命令带 `request_id`，回执与副作用同事务提交；同 ID 重放返回原结果，不重复写 | 本机也会重试/崩溃重启；没有幂等键，重试会生成重复修订或重复产物 |
| D-18 | 原件隐私变化对关联记录/候选的传播是**单事务**；撤回解析只清候选正文与会话临时产物，不动已采纳记录及其来源 | 半个传播会留下“原件私密、记录公开”的窗口；撤回解析不等于撤回事实 |
| D-19 | SQLite **每个连接显式 `PRAGMA foreign_keys=ON`**，迁移/恢复后跑 `foreign_key_check`；不得依赖默认值 | SQLite 外键默认关闭，声明了 FK 不等于执行了 FK |
| D-20 | 版本恢复分两类：**库版本恢复**（备份 → 新目录 → 校验/迁移）与**记录版本恢复**（追加新修订，不删除历史）；旧应用不得静默打开更高 `schema_version` 的库 | “恢复”若原地覆盖或清空 ledger，会把可审计历史伪装成从未发生 |
| D-21 | **sticky 有逐条解除路径**：`privacy_ever_private` 仍锁定来源链，但本人可按 `(record, document, 当前 privacy_epoch, 当前 privacy_state_seq)` 逐条解除；解除只清该条的粘性锁，不改记录隐私、不批量、不回溯隐藏公开历史；解除后仍需单独 `record.setPrivacy(not_private)`；`unknown` 往返使旧 release 失效。实现/UI/迁移/测试未完成前，整套解除流程是 **G3 阻塞**，不是已完成 | 没有解除路径会把“曾私密”变成永久污点，和 SPEC 的逐条确认冲突；有路径但不实现，同样不能把冲突写成“已解决” |
| D-22 | **出站选择同时校验两个 scope**：导出、AI、artifact 的每一条都必须同时满足“选中的那一版修订自身不受保护”与“当前记录（含来源链）不受保护”；历史显示仍只按 `revision` scope。AI 只允许当前修订且不得有受保护项；导出/artifact 含受保护项时只能由本人逐条 `private_export`，artifact 下载重新判定并可隔离 | 只看 current record 会漏掉“当前公开、选中旧版私密”的正文；只看选中修订会漏掉“选中旧版公开、当前记录已私密”的来源链。两者都是真实出站泄露路径 |
| D-23 | **恢复历史只能本人且不得洗白**：`record.restoreRevision` 仅 self；恢复不改变记录隐私，新修订隐私取当前记录；目标修订的保护等级高于当前记录（如目标 `private` 而当前 `not_private`/`unknown`）时 `privacy_locked`；来源指针必须随内容保留；代理一律 `not_authorized`，且不泄露目标修订是否存在 | 允许代理或允许把更受保护的旧版“恢复”进保护更弱的记录，等于绕过 `setPrivacy` 和 `private_export` 做内容洗白；允许 restore 抬高隐私又会让“只有 setPrivacy 能改隐私”失效 |
| D-24 | **跨 subject 引用全部校验**：记录/修订/候选/原件/授权/回执/产物/审计之间的每一条跨表引用都必须满足 subject 一致；SQLite FK 不表达 subject，写入时必须显式校验，迁移后必须跑不变量查询。实现与查询未落地前，Q-30 是 **G3 阻塞** | 仅靠 FK 可把 A 的候选挂到 B 的记录、把 B 的原件挂到 A 的修订，形成跨人泄露/污染，且单条 FK 检查看不出来 |
| D-25 | **新挂受保护来源必须写入保护状态**：`record.create`、`record.attachSource`、`candidate.adopt` 在写入带 `source_document_id` 的新修订前先解析来源；来源为 `private` → 修订 `private`；`unknown`/不可解析/跨 subject/`privacy_ever_private=1` 且无有效 release → 修订 `unknown`，`privacy_origin='inherited_document'`、`validation_state='needs_review'`；请求写 `not_private` 一律 `privacy_locked`，不得先写公开再靠读时过滤 | INV-06 要求“关联受保护原件时记录不得为 `not_private`”，只靠 `source_chain` 派生会让存储状态与不变量矛盾；新挂时写入保护，链判定只作防御/历史兜底 |
| D-26 | **版本与产物隔离同事务**：每批事实/隐私/来源/授权/产物状态变化只递增一次 `subject.data_version`，并在同一事务把所有受影响 artifact 置 `quarantined`/`stale` 且写 `status_data_version=新 data_version`；`artifact.build` 的 `source_data_version` 是构建前快照、`status_data_version` 是提交后版本；下载每次重判，不能只看 `status` 或文件路径 | 只递增版本不隔离产物会让旧产物继续可下载；只隔离产物不递增版本会让读模型/缓存继续显示旧状态；两者必须同事务一致 |
| D-27 | **历史编号固定为“老→新 1..N，当前 N+1”**：`record_revision.revision_no` 从 1 连续递增；历史列表只含 1..N（老→新），当前内容 = `N+1 = MAX(revision_no)`，不得把当前内容再复制成一条历史；非本人视图只按可见集重排显示序号，不得暗示存在隐藏修订 | 原型 `history[]` 按 push 顺序保存“上一版”，当前内容在记录自身；旧迁移把当前写成 1、历史写成 2..N+1，会把“最新”标成“第 1 版”。读取时自检当前字段必须等于 N+1 修订，失配按 `needs_review` 失败关闭，不能用历史最后一项冒充当前 |
| D-28 | **`link_state` 只有 `unverified/verified/missing/removed`，没有 `active`**；它只表示“最近一次会话核对结果”，不是隐私状态，也不改变 `privacy_state`/`privacy_epoch`/`privacy_state_seq`。新挂只允许 `unverified/verified`；`missing`/`removed` 不可新挂（`document_missing`/`document_removed`），已有关联保留并按隐私状态判定保护 | 把不存在的 `active` 写成挂接前提会让迁移/新挂路径直接失败；把 `verified` 当“可打开”、把 `removed` 当“隐私归零”都会制造假能力/假公开。`missing/removed` 且隐私已知 `not_private`、`ever=0` 时不因链接状态本身变成受保护；隐私未知或曾私密未 release 时仍按 `unknown` 保护 |
| D-29 | **来源解析只返回 `no_file` / `resolved` / `unresolved` 三态**：该记录当前与历史修订都无 document/candidate 指针**且 `source_kind='manual'`**（新写入须显式声明；迁移中该记录所有修订的 `fileId` 键不存在或为 null 且 `original`/来源无原件痕迹）→ `no_file`；指针存在且可解析同 subject → `resolved`；指针存在但行缺失/跨 subject/候选-run-doc 不一致/互指不成立，或无指针但保留“曾有原件”痕迹（`source_kind='document'`）→ `unresolved` → 必须按 `unknown` 保护 | “没有指针”和“指针悬空”是两件事：前者是手工无来源，不能强制 unknown 或标 needs_review；后者是丢失/污染，必须 unknown + `source_locked`。只把 NULL 当“无来源”会让删指针洗白悬空链；把悬空当手工会让受保护正文变公开，而原型手工记录与“移除原件”都写 `fileId:null`，必须靠 `original`/来源文本区分 |
| D-30 | **云解析无 consent 失败关闭**：`import.start` 在创建 run、上传字节、创建候选之前校验 `cloud_parse` consent（self、未撤回、document/subject 匹配）；缺失返回 `consent_required`，不建 run。迁移中 `method='cloud'` 且无法证明 consent 的 run 整批 `ROLLBACK`/`consent_unresolved`，不得伪造 consent 行或状态 | “先建 run 再补同意”会留下已发送/已解析的无同意记录；“迁移时补一个 consent”等于伪造患者同意。失败关闭比事后删除更可审计 |
| D-31 | **作者无法确定不得伪造**：`record.author_state ∈ {known, unknown}`；`unknown` 时 `author_actor_id`/`on_behalf_grant_id` 均为 NULL，界面显示“作者未知”，不得默认记为本人、`system` 或任何具体 actor；只有 payload 明确作者或代理+有效 grant 才写 `known` | 旧数据没有作者字段；迁移把所有记录写成 `ctx.subject_actor_id` 等于把代记/他人内容冒充本人亲笔，也会误导 `own_entries` 读取范围。`system` 只是迁移执行者，不是作者 |

### 0.1 本次独立审查的处理（R-01～R-14）

下表逐条对应审查意见，记录“改成什么、落在哪、还有什么没定”。未处理或只部分处理的，一律进 §12 G3 未决，不在正文里假装已解决。

| 编号 | 审查意见 | 本版处理 | 落点 |
|---|---|---|---|
| R-01 | 对齐 SPEC：原件不复制 | 删除“登记时复制到 `input/`”；`source_document` 只存名称、大小、时间、私密标记等元数据，不存原件内容、不缓存、不持久化外部绝对路径；再次打开靠用户重新选择文件并核对 | §3.3、§6.1、§8.1、§8.2、D-08/D-09、V-10/V-26 |
| R-02 | 不默默删手工来源 | 移除原件只清“关联投影”，不改修订、不清 `source_text`；手工来源始终保留并标“原件已移除”；文档名不再从历史里抹掉 | §6.1、§10.4、V-14/V-26 |
| R-03 | 代记不能见私密元数据 | 代记者读模型排除受保护记录的存在性、计数、ID、类型、日期、隐私标记；拒绝码统一，不区分“私密”与“不存在” | §3.2、§4.3、§7.3、V-24 |
| R-04 | 代记不能降隐私 | 隐私状态只能由 self actor 变更；代记者新建条目默认 `unknown`（受保护），不得写 `not_private`；原件隐私也只能本人改 | §3.2、§4.5、§9.4、V-22/V-24 |
| R-05 | **本版** AI 永不接收私密/未知（未来例外仍是 Q-10 未决） | 删除“本版可开例外”的措辞；`ai_context` 只记录“非私密已确认内容已发送”，任何 consent 都不能授权受保护内容；过滤在序列化层失败关闭 | §3.4、D-14、V-07/V-25 |
| R-06 | 撤回解析不删除已采纳来源 | 撤回只清候选正文与会话 `tmp/` 中间产物，`manifests` 只留元数据；已采纳记录、`source_document_id`、手工来源全部保留 | §6.2、V-14/V-26 |
| R-07 | 默认保护 | 新增失败关闭矩阵；`privacy_state` 无数据库默认值，写入必须显式给出，缺失/未知/异常一律 protected | §4.1、§4.5、§9.3、V-02 |
| R-08 | 更新须乐观并发且合并未改字段 | `record.correct` 改为“基修订 + 字段级三方合并”；仅同字段双改才 `revision_conflict`；隐私不参与合并，且 correct 无权改隐私（只走 `record.setPrivacy`） | §5.1、§9.4、V-21 |
| R-09 | 私密传播事务 | 原件转私密时，关联记录/候选/导出选择的传播在单事务内完成，`data_version` 只增一次；失败整体回滚 | §4.6、§9.4、V-23 |
| R-10 | SQLite 外键 | 每个连接显式开启并自检；迁移/恢复后 `foreign_key_check`；重建表时按 SQLite 规则在事务外关外键 | §8.3、§9.3、§10.1、V-19 |
| R-11 | 幂等 | 新增 `command_receipt`；`(subject_id, actor_id, request_id)` + `request_hash` 唯一，回执与副作用同事务；重放返回原结果，载荷不一致返回 `idempotency_conflict`；读取按三列匹配 | §9.5、V-20 |
| R-12 | 版本恢复与迁移约束 | 明确应用支持的 schema 区间、恢复流程、记录版本恢复命令、迁移事务/外键/ledger/校验和/失败处理 | §10、§9.4、V-27 |
| R-13 | 示意 DDL 不得冒充完整合同 | DDL 降级为**非规范、不完整**示例；列出缺项；规范约束改由 §9.2/§9.4/§9.5 的清单承担，正式合同只能由迁移文件 + schema 测试构成 | §9.3、§15 |
| R-14 | 不确定事项列 G3 未决 | 未决项扩充至 Q-17～Q-29；Q-10 保留未决（本版禁止发送且无开关）；Q-03 按 SPEC 定为按条历史、P-04 仅备选；Q-15 改写 | §12 |

### 0.2 draft.3 复核修订（draft.4 引入，draft.5 复核）

下表逐条对应本轮指出的矛盾，记录“改成什么、落在哪、还有什么没定”。与 §0.1 一样，未完成的一律进 §12，不在正文假装已解决。

| 编号 | 矛盾/缺口 | 本版处理 | 落点 |
|---|---|---|---|
| S-01 | Q-10 与“AI 永久禁止”混写，G3 清单又把未来例外当成可勾选项 | 明确“**本版禁止 + 未来例外未决**”：实现无开关；Q-10 是政策未决项，不是本版放行项；G3 只确认本版行为 | §3.4、D-14、Q-10、§13、V-25 |
| S-02 | Q-03 曾把 P-04 写成默认，与 SPEC“公开历史仍可直接查看”的按条历史冲突 | 按 SPEC 采用**按条历史**；P-04 降为备选，切换须先改 SPEC，不是 G3 的默认二选一 | §4.1、§4.3、§4.4、V-08、Q-03、§13 |
| S-03 | 受保护判定分散，未覆盖历史来源链与候选派生；传播只追当前修订 | 统一 `protected()` 单一实现，但拆成 `record` / `revision` 两个**显式 scope**：历史显示只用 `revision`（修订自身状态），当前记录/导出/AI/代理/回执用 `record`（含来源链）；无“按页面自选口径” | §4.1、§4.3、§4.6、§7.3、§9.5、V-07/V-08/V-09/V-23/V-29 |
| S-04 | 原件被当成可取回文件；`import.start` 用 `present`；`parsed/` 被当持久目录 | 原件仅出处关联；重开需会话文件句柄；删除 `present`；整份解析全文默认只在会话内存/`tmp/`，不另存、不进备份 | §6.1、§6.2、§8.1、§8.2、§9.4、Q-17/Q-23 |
| S-05 | G3 冻结未区分阻塞与未来事项 | 冻结拆为“G3 阻塞项”与“未来事项”；未来事项不阻塞 v1，但不得悄悄实现 | §10.5、§13 |
| S-06 | 回执可能存私密正文/跨 actor 重放；迁移“单事务”与重建表冲突；日期未定字节长度 | 回执只存最小 ID/状态并按 `(actor, subject)` 作用域；迁移单事务为默认、重建表为例外；日期/时间 CHECK 增长度与 ASCII 约束 | §9.3、§9.4、§9.5、§9.6、§10.1–10.2、V-03/V-20/V-31 |
| S-07 | sticky `privacy_ever_private` 没有解除路径，与 SPEC“逐条确认”冲突；若把来源链当历史例外，又会回溯隐藏公开历史 | 历史显示只看修订自身状态；新增 `source_document.privacy_epoch`/`privacy_state_seq`、`source_link_release.document_state_seq` 与 `record.releaseSourceLink`，按 `(record, document, 当前 privacy_epoch, 当前 privacy_state_seq)` 逐条解除 sticky；解除不改记录隐私、不批量、`unknown` 往返后旧 release 失效；**实现/UI/迁移/测试未完成，整套解除流程进 G3 阻塞** | §4.1、§4.3、§4.6、§9.2、§9.4、§10.5、Q-27、V-08/V-09/V-34/V-42 |
| S-08 | `created_at` CHECK 只比较 `strftime(...)=created_at`，NULL 被当成通过；重建表把 `foreign_key_check` 放在 COMMIT 之后，且外键开关描述可能落进事务 | CHECK 增加 `strftime(...) IS NOT NULL` 与小时 `00–23`；重建改为“事务外关外键 → 事务内重建 → **COMMIT 前** `foreign_key_check` → 失败 ROLLBACK → 提交 → 事务外重开外键并复核”；区分 `2026-02-30`（归一化后拒绝）与 `2026-13-01`（NULL 漏洞） | §9.3、§10.1、§10.2、§11.1、V-03/V-19/V-31 |
| S-09 | 候选隐私只说“继承原件”，未定义缺失/曾私密/采纳洗白；迁移没有隐私初始化示例 | 候选在创建时按“当前状态 + `privacy_ever_private` + 可判定性”派生三态并记 `privacy_origin`；曾私密或不可判定→`unknown`；采纳不得降低；迁移给出 true/false/缺失/非布尔、`history[]`、`files[]`、缺失 `fileId`、`created_at` 的显式规则（draft.4 的 SQL 示例已删除，draft.5 改为逐行伪代码） | §6.2、§9.2、§10.4、V-13/V-29/V-33 |
| S-10 | 回执 PK 只有 `request_id`，读作用域只按 `request_id+actor_id`，代理可能读本人回执或跨 subject 重放 | 回执 PK 改为 `(subject_id, actor_id, request_id)`；同 subject+actor 同 ID 不同载荷才冲突；读取必须三者同时匹配；self 可含自己的记录 ID，proxy 只返回状态/计数/不透明 `operation_ref`。**draft.4 实际只做到 `(actor_id, request_id)` 双列，subject 仍未进主键；draft.5 按 T-07 补全为三列并声明旧双列回执失效** | §9.2、§9.5、V-20 |

### 0.3 本轮独立审查的处理（T-01～T-12）

本轮审查确认 draft.4 仍有阻塞级问题：Q-27/Q-28/Q-29 被同时写成“阻塞”和“未来事项”，迁移 SQL 不可执行且含跨行隐私泄露，`record.correct` 仍暗示可改隐私，`unknown` 原件没有明确解锁路径，回执未按 subject 隔离。下表是逐条处置；**没有完成的项不写成已完成**。

| 编号 | 审查意见 | 本版处理 | 落点 |
|---|---|---|---|
| T-01 | Q-27/Q-28/Q-29 必须明确阻塞，不能列入“未来事项（不阻塞 v1）” | 三项全部移入 G3 阻塞清单；Q 表、§10.5、§13 统一措辞；Q-27 的实现/UI/迁移/审计/端到端，Q-28 的回执失效策略，Q-29 的重建崩溃恢复，均未完成 | §10.5、§12 Q-27/Q-28/Q-29、§13 |
| T-02 | 迁移 SQL 存在列名、必填列、多行 ID 与跨行 UPDATE 泄露，不能作为可执行示例 | **整段 SQL 删除**，标“不可执行、不得复制”；改为逐行伪代码：每行生成独立 ID、显式写必填列；draft.6 进一步把候选从“按主键逐条 UPDATE”改为逐条 INSERT `import_run`/`import_candidate`（v1 中候选行尚不存在），并禁止 `UPDATE ... FROM` 自连接 | §10.4、V-33、§15 |
| T-03 | `record.correct` 仍可能改变隐私 | `record.correct` 只接受内容字段；携带或企图改变 `privacy_state`/`privacy_origin` 一律 `privacy_changed`，即使 `source_locked=false` 也不放行；隐私唯一入口是 `record.setPrivacy` | §4.1、§4.2、§5.1、§9.4、V-21 |
| T-04 | `privacy_epoch` 口径不统一 | 统一定义：初值 0；每次**进入** `private`（含注册即私密、迁移即私密）严格 +1；已是 `private` 不重复；改回 `not_private/unknown` 不回退；迁移 `unknown` 不得置 1 | §4.1、§4.6、§9.2、§9.4、§10.4、V-23/V-34 |
| T-05 | 非本人仍可能看到受保护历史的元数据/修订号/计数 | 非本人历史响应只含可见修订，且按可见集重排显示序号；不返回受保护修订的 ID、修订号、时间、类型、隐私状态、计数、空位或占位；不能从断号推断 | §4.3、§4.4、§4.5、V-08 |
| T-06 | `unknown` 原件没有明确解锁路径 | 唯一路径：本人显式 `document.setPrivacy(not_private)`；从未私密（ever=0）时不需要 release，曾私密（ever=1）时仍需按当前 epoch 逐条 release；不存在“移除即解锁”或“改记录隐私绕过” | §4.1、§4.6、§9.4、Q-27 |
| T-07 | 回执主键未含 subject，可能跨 subject 重放/读到他 subject 回执 | `command_receipt` PK 改为 `(subject_id, actor_id, request_id)`；重放、读取、清理都必须带三者；旧单列/双列回执迁移时失效 | §9.2、§9.5、§11.1、V-20 |
| T-08 | 迁移把缺失/非布尔的 `files[]` 预置 `ever=1`，把“未知”写成“曾私密事实” | 改为 `privacy_ever_private=0`、`privacy_epoch=0`；未知仅由当前 `privacy_state='unknown'` 提供保护，不伪造粘性历史 | §10.4、V-33 |
| T-09 | 传播没有写清“新状态”，可能把 `unknown` 也写成 `private` | 传播新修订的 `privacy_state` 必须等于 document 的新状态：`private→private`、`unknown→unknown`；`validation_state` 在未知时为 `needs_review`；已受保护记录不重复追加 | §4.6、V-23 |
| T-10 | §11.1 曾声称批量断言全部通过，但脚本未留存、不可复现 | 删除该声明与结果表；只保留可直接复制运行的骨架及其覆盖范围；其余断言不计为证据 | §11.1、§15 |
| T-11 | V-33 被标“部分已验证”，但迁移 SQL 并未执行 | V-33 改为**未验证**；§10.4 的 SQL 已删除，没有可执行迁移证据；真实旧库 fixture 仍未取得 | §11 V-33、§15 |
| T-12 | 全文仍有交叉矛盾（correct 改隐私、unknown 解锁、非本人历史元数据、epoch 初值、receipt 作用域） | 已按 T-03～T-09 全文回改；§14 记录变更；§15 如实列出未做事项，不再声称 SQL/批量断言验证 | §4、§5.1、§9.4–9.5、§10、§14–15 |

### 0.4 本轮安全审查的处理（U-01～U-10）

本轮只改合同文本，目标是关闭“读到/带出/写错人”的路径，不是增加功能。每条都给出落点和未执行验收；**没有一条已经实现**。

| 编号 | 问题 | 本版处理 | 落点 |
|---|---|---|---|
| U-01 | 出站只看 current record，选中旧版私密修订仍可被导出/AI/artifact 带出；反之当前记录已私密、选中旧版公开也会漏来源链 | 新增 `output_protected(record_id, revision_no)`：选中修订 scope **或** 当前记录 scope 任一受保护即受保护；AI 只发当前修订且必须两 scope 干净；导出/artifact 构建逐条按双 scope 记 `included_private`；artifact 下载重新判定，构建后源变受保护则 `quarantined` 不可下载；历史显示仍只 `revision` scope | §3.4、§4.1、§4.2、§4.5、§7.3、§9.2、§9.4、V-35/V-36 |
| U-02 | `record.restoreRevision` 未限制本人，也未防从受保护旧版恢复内容到公开记录（洗白） | 改为 self-only；恢复不改隐私，新修订隐私取当前记录；目标保护等级高于当前 → `privacy_locked`；复制目标 `source_document_id` 并新增 `restored_from_revision_id`；代理 `not_authorized` 且不泄露目标存在 | §5.1、§9.2、§9.4、V-37 |
| U-03 | 仅靠 FK，跨 subject 引用没有校验；G3 清单没有对应阻塞项 | 新增 §9.7 全量引用清单与写入校验/迁移后不变量查询；Q-30 列为 G3 阻塞；新增 V-38 | §9.2、§9.7、§10.5、§12 Q-30、§13、V-38 |
| U-04 | 候选的原件/导入行缺失或不一致时仍可能被采纳，静默生成无源事实 | 候选来源缺失、`import_run` 与 `document` 不一致、跨 subject → `unknown`+`needs_review`，采纳失败关闭 `source_unresolved`；仅本人可显式转为 `source_kind='manual'` 的手工记录 | §6.2、§9.4、V-39 |
| U-05 | 代理可采纳 `not_private` 候选并写成 `not_private`；写命令身份可能取自请求体，授权范围未逐命令校验 | 代理采纳一律强制 `unknown`+`needs_review`+`privacy_origin='proxy_default'`，并要求有效 grant 覆盖 kind+日期；新增 §3.5：actor 只从会话/宿主身份解析，请求体 `actor_id` 不可信；`demo_unverified` 不得写生产 subject；consent 只能 self；§9.4 表加“允许调用者”列 | §3.2、§3.3、§3.5、§9.4、V-39/V-40 |
| U-06 | 读模型缓存键没有 `subject_id`，同 actor/多 subject 或授权变化后可能串缓存 | 缓存键改为 `subject_id + viewer_actor_id + data_version + read_model_version`（另加授权 scope 版本）；授权/隐私变化递增 `data_version`；代理与 self 缓存不得互用 | §4.5、§7.3、V-41 |
| U-07 | 传播把 pending 候选“置同一新状态”，会把已 `private` 候选降为 `unknown`；V-23 写“更新全部受影响修订” | 只对当前 `not_private` 记录追加新修订，新状态=document 新状态；已受保护不降级；候选取“原状态与新状态的较强者”；`data_version` 整批 +1；V-23 改为“仅追加当前未受保护记录” | §4.6、V-23、V-42 |
| U-08 | `unknown` 往返后旧 release 仍有效（private→not_private→release→unknown→not_private） | 新增 `source_document.privacy_state_seq`（任何实际状态变化 +1）、`source_link_release.document_state_seq`；release 仅在 `r.document_state_seq=d.privacy_state_seq` 时有效，`unknown` 往返即失效；UNIQUE 改四列 | §4.1、§4.6、§9.2、§9.4、§10.4、V-34/V-42、Q-27 |
| U-09 | §10.4 伪代码仍含 `UPDATE import_candidate ...` 类可执行 SQL，且从未插入 `import_run`/`import_candidate`，迁移必失败 | 删除该 UPDATE 伪 SQL；改为逐条 INSERT `import_run`（先）与 `import_candidate`（后），生成独立 ID、显式必填列；明确“伪代码未实现、未验证、不得复制成 SQL” | §10.4、V-33、§15 |
| U-10 | 上述路径没有未执行验收项，容易被下一轮误读为已实现 | 新增 V-35～V-42；更新 V-23/V-27/V-33/V-34；§14 记录 draft.6；§15 列未做事项；全文不声称实现 | §11、§14、§15 |

### 0.5 本轮五问复核的处理（W-01～W-05）

本轮只修订合同文本，五组问题逐条处置；新增 V-43～V-48 **全部未执行**，新增 Q-31 为 G3 阻塞，未声称任何实现、迁移或验收已完成。

| 编号 | 问题 | 本版处理 | 落点 |
|---|---|---|---|
| W-01 | 来源链悬空候选/跨主体/不一致；`import_run`/`import_candidate` 的 subject/document 字段与引用不统一 | ① 统一两表 `subject_id`、`document_id` 与复合引用：候选通过 `(import_id, subject_id)` → `import_run`、`(document_id, subject_id)` → `source_document`，并强制 `candidate.document_id = run.document_id`；② 任一链接缺失、跨 subject、run/document 不一致、`adopted_record_id`/`origin_candidate_id` 不互指，一律按 `source_locked=true` 受保护，候选不可采纳、记录不可 release；写入返回 `source_unresolved`/`cross_subject_reference`；③ 迁移无法满足非空/一致时整批拒绝，不伪造 run/document | §4.1、§4.5、§4.7、§6.2、§9.1–9.2、§9.7、§10.4、V-43/V-44 |
| W-02 | 迁移无法确定 candidate↔record 采纳关系时假装完整 | 明确“不推定”：只有双向显式一致且同 subject 的 link 才写 `record.origin_candidate_id`/`candidate.adopted_record_id`；默认 `unknown` 模式（记录 `origin_candidate_id=NULL`、候选 `pending`+`adoption_state='unknown'`+两列 NULL、报告逐条原因，人工映射前不可采纳）；或显式选 `strict_reject` 整批拒绝（`ROLLBACK`、不写 ledger、报告 `adoption_unresolved`）。两种模式都不能声称迁移完整；新增 Q-31 为 G3 阻塞 | §10.4、§10.5、Q-31、V-48 |
| W-03 | `record.restoreRevision` 未在事务内重读、未把版本检查前置 | 请求必须带 `expected_data_version` 与 `expected_current_revision_no`；`BEGIN IMMEDIATE` 后先锁 subject/record，再在事务内重读 current/target；先做 `stale_data_version`/`stale_revision` 检查，再做目标存在性与保护等级判定；`new_revision_no=MAX+1` 也在事务内计算；失败不写修订、审计、产物或回执 | §5.1、§9.4、V-45 |
| W-04 | 新挂受保护来源时只靠读时 `source_chain` 过滤，与 INV-06“记录不得为 not_private”矛盾 | 新增 §4.7：create/attach/adopt 写入带来源的新修订前先解析；来源 private→private、unknown/悬空/跨 subject/ever-private 未 release→unknown；请求 not_private→`privacy_locked`；`record.correct` 若换来源会抬高保护则拒绝，改走 self-only `record.attachSource`；attachSource 只升不降，降低仍只能 `setPrivacy` | §2 INV-06、§4.5、§4.7、§5.1、§9.4、V-46 |
| W-05 | `data_version` 与产物隔离不一致 | 每批变化只递增一次 `subject.data_version`，同一事务把受影响 artifact 置 `quarantined`/`stale` 并写 `status_data_version=新版本`；`artifact.build` 写 `source_data_version`（构建前）/`status_data_version`（提交后）；下载仍逐条双 scope 重判，不能只看 `status`/路径；任一步失败整体回滚 | §4.6、§7.3、§9.2、§9.4、§10.3、V-47 |

### 0.6 本轮六项复核的处理（X-01～X-06）

本轮只修订合同文本，六项逐条处置；新增 D-27～D-31、INV-30～INV-33、V-49～V-53，**全部未执行/未验证**，不声称任何实现、迁移或验收已完成。

| 编号 | 问题 | 本版处理 | 落点 |
|---|---|---|---|
| X-01 | 历史编号方向写反：迁移把当前内容写成 `revision_no=1`、历史写成 2..N+1，与“老→新 1..N、当前 N+1”冲突 | 统一编号口径：`history[]` 按数组顺序（老→新）映射 1..N，当前内容映射 `N+1`；新增写入/读取/迁移三处自检（当前字段 = N+1 修订、编号连续无重复、当前不重复进历史）；非本人可见集只重排显示序号，不用规范编号 | D-27、INV-30、§5.1、§10.4、V-33/V-49 |
| X-02 | `link_state` 枚举没有 `active`，但 §4.7/§9.4 把 `link_state='active'` 当挂接前提；四态对挂接与保护的语义分散 | 删除所有 `active`；明确 `unverified/verified` 可新挂、`missing/removed` 不可新挂（`document_missing`/`document_removed`）；`link_state` 只表示最近会话核对结果，绝不改隐私、不因 `removed` 自动公开已知 `not_private+ever=0` 的记录，隐私未知/曾私密未 release 仍按 `unknown` | D-28、INV-31、§4.1、§4.5、§4.7、§6.1、§9.2、§9.4、V-50 |
| X-03 | 来源解析只有“可解析/失败”两种失败码，没有 `no_file/resolved/unresolved` 三态；悬空可被当成“无来源”，手工无来源又可能被强制 unknown | 新增唯一分类 `resolve_source()`：无任何指针且 `source_kind='manual'` → `no_file`（迁移 `fileId` 缺失/null 且 `original`/来源无原件痕迹；新写入须显式声明）；无指针但保留“曾有原件”痕迹 → `unresolved`；指针存在且同 subject 可解析 → `resolved`；悬空/跨主体/候选-run-doc 不一致/互指不成立 → `unresolved`，必须 `unknown` + `source_locked`；`source_document_id IS NULL` 本身不等于手工 | D-29、INV-28、§4.1、§4.5、§4.7、§10.4、V-33/V-51 |
| X-04 | 云解析 consent 只写“必须有”，没有失败关闭顺序；迁移对旧 run 的 consent 没有规则 | `import.start` 在建 run/上传/建候选前校验 consent，缺失 `consent_required` 且零副作用；`method='cloud'` 时 `import_run.consent_id` NOT NULL（CHECK）；迁移无法证明 consent 的 cloud run 整批 `ROLLBACK`/`consent_unresolved`，不伪造 consent 或成功状态 | D-30、INV-32、§6.2、§9.2、§9.4、§10.4、V-52 |
| X-05 | 迁移把每条旧记录的作者都写成 `ctx.subject_actor_id`，等于伪造本人亲笔 | 新增 `record.author_state`；`unknown` 时 `author_actor_id`/`on_behalf_grant_id` 均为 NULL、UI 显示“作者未知”；只有 payload 明确作者或 proxy+有效 grant 才 `known`；`system` 只作迁移执行者，不作作者 | D-31、INV-08/INV-33、§3.2、§6.2、§9.2、§9.4、§10.4、V-53 |
| X-06 | V-33 只覆盖隐私初始化，未覆盖编号、三态、作者、consent；正文仍残留 `active` 与反向编号 | 重写 V-33 为五类断言；新增 V-49～V-53；§13 验收范围改 V-01～V-53；§14/§15 如实记录未执行 | §11、§13、§14、§15 |

**当前状态：不存在生产数据库、不存在真实数据目录、未执行任何迁移。** 本文件是合同草案，不是实现证据。

---

## 1. 术语与范围

| 术语 | 含义 | 不是什么 |
|---|---|---|
| 主体 subject | 数据所属的患者 | 不是登录账号，也不是代记者 |
| 操作者 actor | 实际写入/查看的人：本人或代记者 | 不是“当前浏览器” |
| 代记 access_grant | 患者给代记者的有限授权 | 不是共享账号，不是永久权限 |
| 同意 consent_event | 患者对某次出站动作的显式同意（云解析、私密导出、AI 发送） | 不是一次勾选后永久有效 |
| 记录 record | 一条患者确认的事实身份 | 不是页面卡片，不是 Tab |
| 修订 record_revision | 某条记录在某一时点的完整内容与隐私状态 | 不是审计日志的替代品 |
| 原件 source_document | 用户登记的真实文件 | 不是解析文本，不是记录正文 |
| 候选 import_candidate | 解析/抽取得到、尚未确认的候选 | 不是事实，不是诊断 |
| 读模型 read model | 为页面/图表/导出计算的投影 | 不是新的事实表 |
| 产物 artifact | 已冻结的导出文件及其选择集 | 不是当前数据的实时视图 |

范围：成年患者自述记录、授权代记、检验指标、治疗记录、复诊准备、资料整理、用药前检查抄录。明确不进入本模型：诊断/分型/活动度评分、用药推荐、预后/生存期、因果推断、临床试验匹配、肿瘤分期。疾病概要与参考数据属于随包分发的只读资料，不写入患者事实库；其版本单独记录。

现有 `docs/SCHEMA.md` 与 `docs/API-CONTRACT.md` 仍是模板占位，**不是已冻结合同**。本草案不替代它们；G3 签认后再把本文件收敛进 `SCHEMA.md`/`API-CONTRACT.md`，并以本文件第 11 节作为验收参照。

---

## 2. 核心不变量

以下不变量优先于任何页面需求。若页面需要违反，先改合同，不在代码里绕过。

- **INV-01 单一源**：同一事实只能有一条 `record`；看板、时间线、指标、治疗阶段、复诊预览不得各存一份。
- **INV-02 确认才成事实**：`import_candidate` 在 `pending` 状态不得出现在事实读模型；只有 `adopted` 才生成 `record`。
- **INV-03 追加修订**：`record_revision` 只能 INSERT；更正/隐私变更只能追加新版本，不能 UPDATE/DELETE 旧版本。
- **INV-04 未知不补**：日期未知时 `occurred_date IS NULL`；不得用今天、文件修改时间、推测时长或“月份加 -01”写成事实日。
- **INV-05 私密优先**：私密或隐私未知的记录，默认不进入导出、摘要、AI 上下文；任何授权都不能让私密对非本人可见，也不能让代记者看到其存在性。
- **INV-06 私密原件锁定**：记录**新挂**或传播时关联私密/隐私未知/不可解析的原件，当前修订必须写入至少同等保护（`private`/`unknown`），不得以 `not_private` 落库；写入规则见 §4.7，`source_chain` 只作历史/防御兜底。原件转私密必须传播到记录（单事务）；取消原件私密**不自动公开记录**：当前状态锁虽解除，`privacy_ever_private` 粘性锁仍在，必须由本人按 `(record, document, 当前 privacy_epoch, 当前 privacy_state_seq)` 逐条解除后再单独改记录隐私；原件状态每次实际变化都递增 `privacy_state_seq`，`unknown` 往返使按旧 seq 签发的 release 失效。
- **INV-07 主体不混**：`record.subject_id` 创建后不可改；代记者不是另一个患者，不能用“切换视角”改写主体。
- **INV-08 作者不伪造**：代记记录保留 `author_actor_id` 与 `on_behalf_grant_id`；撤回授权后只停止新读写，不回写成“本人亲笔”。作者无法从数据中确定时，`record.author_state='unknown'`、`author_actor_id=NULL`、`on_behalf_grant_id=NULL`，界面显示“作者未知”；不得默认填本人、`system` 或任何具体 actor，`system` 只是迁移执行者，不能成为作者（细则见 INV-33）。
- **INV-09 原件不复制**：登记原件只存元数据，不复制、不缓存原件内容；`source_document_id` 只是出处关联，不是可取回的文件引用，重开需会话文件句柄；记录正文是用户抄录/确认的文本；记录不内嵌第二份“original”，数据根内也不出现原件副本或持久解析全文。
- **INV-10 路径不越界**：工作台管理的文件路径必须是相对路径，解析后的真实路径必须位于用户选定根目录内；拒绝 `..`、绝对路径、盘符和越界符号链接。原件不在根内，因此不存其路径，不做“外部绝对路径”例外。
- **INV-11 导出不回头**：`artifact` 一旦生成即冻结；源记录修订后，旧产物只标记“需重新生成”，不更新其内容。
- **INV-12 页面状态不是事实**：`selected`、`timelineSelected`、`expandedHistory`、`flipped`、`zoom` 等是视图状态；除用户偏好外不落事实库。
- **INV-13 默认保护**：隐私状态缺失、未知、枚举无法识别、查询/序列化异常、缓存缺少 viewer 键，一律按受保护处理；系统不得用“默认非私密”兜底。
- **INV-14 AI 本版硬禁止**：本版任何私密或隐私未知内容永不进入发送给 Agent 的 prompt、草稿、附件、工具参数或日志；没有 override、consent 或配置开关。未来是否允许本人逐条授权仍属未决（Q-10），不得在本版以任何形式实现。
- **INV-15 代记不可见受保护元数据**：代记者查询受保护记录时，不返回存在性、计数、ID、类型、日期、隐私标记；拒绝码不区分“私密”与“不存在”。代记者不得把 `private/unknown` 降为 `not_private`。
- **INV-16 不静默删手工来源**：移除原件、撤回解析、丢弃候选，都不得删除用户手工填写的 `source_text`，也不得改写历史修订中的出处文本。
- **INV-17 更新合并**：内容更新必须带基修订，服务端按字段三方合并；只有同一字段被双方改动才冲突，隐私变化不参与自动合并。
- **INV-18 传播原子**：原件隐私变化、关联记录锁定、候选继承、导出选择移除、`data_version` 递增必须在同一事务提交；任一步失败整体回滚。
- **INV-19 幂等**：相同 `request_id` 与相同载荷的重放必须返回首次结果，不得产生第二个修订、第二个产物或第二次出站；幂等回执与副作用同事务。
- **INV-20 外键执行**：SQLite 连接必须显式开启外键并自检；任何迁移/恢复完成后 `PRAGMA foreign_key_check` 必须为空，否则拒绝启动。重建表的检查必须在**同一事务 COMMIT 之前**执行；`PRAGMA foreign_keys=OFF/ON` 必须在事务外切换，提交后再复核一次。
- **INV-21 保护判定唯一（双 scope）**：读模型、导出、摘要、AI、打印、代记查询、审计/回执可见性必须调用同一个 §4.1 实现，但只能传两个显式 scope：`revision`（历史显示，只看修订自身 `effective_state`）或 `record`（当前记录/选择/改公开/代理可见性，另加来源链与 sticky）。不得各自写“只看当前 `privacy_state`”的简化版，不得用配置切换回溯口径，也不得让调用方临时选择“宽松”scope。
- **INV-22 来源链继承**：记录的保护状态沿 `source_document → import_run → import_candidate → record` 以及历史修订的 `source_document_id` 继承；链上任一环当前为 `private/unknown`、缺失/悬空/跨 subject/不一致、不可判定，或 `privacy_ever_private=1` 且该 `(record, document, 当前 privacy_epoch, 当前 privacy_state_seq)` 没有有效 `source_link_release`，记录即受保护。删掉当前修订的来源指针**不能**解除链上保护；历史显示不走这条链，只看修订自身状态。
- **INV-23 出站双 scope**：导出、AI、artifact 的每个选中条目都必须同时通过 `protected(selected_revision,'revision')` 与 `protected(record_current,'record')`；任一受保护即不得进入 AI，导出/artifact 只能由本人逐条 `private_export` 并计入 `included_private`。历史显示仍只走 `revision` scope，不能把出站门槛反向用于回溯隐藏公开历史。
- **INV-24 恢复不洗白**：`record.restoreRevision` 只能本人调用；恢复只写内容，**不改变记录隐私**，新修订隐私取当前记录；目标修订的保护等级高于当前记录时返回 `privacy_locked`；必须保留目标来源指针；代理调用一律 `not_authorized`，不得泄露目标是否存在。
- **INV-25 跨 subject 一致**：§9.7 列出的每一条跨表引用在写入时必须满足 subject 一致；FK 通过不等于 subject 通过；迁移后不变量查询必须为 0 行。该校验未实现前，Q-30 是 G3 阻塞。
- **INV-26 身份来自会话**：所有写命令的 `actor_id` 必须从已认证会话/宿主上下文解析，请求体中的 `actor_id`/`subject_id` 只作对照；`demo_unverified` 不得写入生产 subject，`local_profile` 不得代理，proxy 必须 `host_authenticated` 且有覆盖该命令 kind+日期的有效 grant。
- **INV-27 缓存按 subject 隔离**：任何读模型/预览缓存键必须含 `subject_id`、`viewer_actor_id`、`data_version`、`read_model_version`（及授权 scope 版本）；缺任一键不得复用；授权/隐私变化必须递增 `data_version`。
- **INV-28 来源链可解析**：`source_document → import_run → import_candidate → record` 的每一环都必须可解析、同 subject，且 `candidate.document_id = import_run.document_id`、`record.origin_candidate_id` 与 `candidate.adopted_record_id` 互指；任一缺失/悬空/跨 subject/不一致，按 `source_locked=true` 受保护，候选不可采纳、记录不可 `releaseSourceLink` 或降为 `not_private`；写入返回 `source_unresolved`/`cross_subject_reference`，不得把悬空当“无来源”或回退到 `not_private`。来源解析必须落到 `no_file/resolved/unresolved` 三态：只有完全没有 document/candidate 指针且 `source_kind='manual'`（新写入显式声明；迁移只在该记录所有修订（含历史）的 `fileId` 键缺失或为 null 且 `original`/来源无原件痕迹时映射 manual）才是 `no_file`；任何指针存在但行缺失、跨 subject、候选/run/document 不一致或互指不成立都是 `unresolved`，必须按 `unknown` 保护并 `needs_review`；无指针但 `original` 非空或来源含“原件：/原件已移除”的同样按 `unresolved` 保护（`source_kind='document'`），不得洗成手工；`source_document_id IS NULL` 本身不证明手工无来源。
- **INV-29 版本与产物一致**：每批事实/隐私/来源/授权/产物状态变化只在同一事务递增一次 `subject.data_version`；受影响 artifact 同时置 `quarantined`/`stale` 并写 `status_data_version=新版本`；不允许版本已变而 artifact 仍 `ready`，也不允许只隔离产物不递增版本；下载每次重判，旧 `status` 与路径不构成放行证据。
- **INV-30 历史编号与当前自检**：`revision_no` 从 1 连续递增、不跳号不重复；历史视图只含 1..N（老→新），当前内容恒为 `N+1 = MAX(revision_no)` 且不再重复成一条历史；任何写入、读取、迁移都必须自检“渲染的当前字段 = 第 N+1 版修订”，失配按 `needs_review` 失败关闭，不得回退到历史最后一项；非本人视图只对可见集重排显示序号，不得暗示隐藏修订。
- **INV-31 `link_state` 不是隐私**：`link_state` 只能是 `unverified/verified/missing/removed`，没有 `active`；它只表示最近一次会话核对结果，不得改变 `privacy_state`/`privacy_epoch`/`privacy_state_seq`。新挂只允许 `unverified/verified`；`missing`/`removed` 不可新挂且不得自动复活；`verified` 不等于可跨会话打开，`removed` 不等于隐私归零。
- **INV-32 云解析无 consent 无 run**：`method='cloud'` 的 `import.start` 必须在创建 run、上传字节、创建候选之前通过 `cloud_parse` consent 校验（self、未撤回、document/subject 匹配）；缺失即 `consent_required` 且零副作用（无 run、无上传、无候选、无 `tmp/` 正文）。迁移无法证明 consent 的 cloud run 整批 `ROLLBACK`/`consent_unresolved`，不得补造 consent 行或改写状态。
- **INV-33 作者未知不伪造**：`record.author_state` 只有 `known/unknown`；`known` 时 `author_actor_id` 必须指向同 subject 的有效 actor，proxy 作者必须同时有覆盖该记录的 `on_behalf_grant_id`；`unknown` 时两列必须为 NULL。迁移/导入没有作者证据时写 `unknown`，不得默认 `subject_actor_id`、不得用 `system` 冒充作者；`unknown` 不得被当成“本人亲笔”，也不得被代记者当作可读自己条目的依据。

---

## 3. 主体、身份与授权

### 3.1 主体与操作者

- `subject` 是患者；`subject.self_actor_id` 指向代表本人的 `actor`。一个本地库可以有多个 subject（例如家庭内不同患者），但每个 subject 的数据、授权、导出严格分区。
- `actor.actor_kind`：`self`、`proxy` 或 `system`（`system` 仅用于迁移/导入，不代表人，不得作为授权人或代记者）。`actor.identity_state`：`demo_unverified`（当前原型）、`local_profile`（本机无登录）、`host_authenticated`（未来接入宿主身份）、`system`（迁移/导入）。
- 当前原型没有账号、登录、角色或权限服务。`demo_unverified` 只能用于演示；**不得**把 `actor` 当作已认证身份，也不得用页面上的“本人演示页”做访问控制。
- 生产接入身份前，本机只能声明“单用户本地使用”；代记功能必须等宿主身份与服务端校验可用后再启用。这个顺序不能被“先做 UI、后补权限”绕过。

### 3.2 代记授权

`access_grant` 是患者本人对某个 `proxy` 的授权，不是代记者自封的权限。

- 授权人必须是 `subject.self_actor_id`；代记者不能转授权、不能给自己扩权。
- 写范围由 `grant_scope` 逐条给出：`record_kind` + `period_from` + `period_to`。没有覆盖该类别或该日期的 scope，写入一律拒绝。
- 读范围由 `read_mode` 决定：`own_entries`（默认，只读自己写的条目）或 `explicit`（患者逐条勾选的 `grant_read_entry`）。私密或隐私未知条目即使被勾选也不可见。
- **受保护记录的元数据同样不可见**：代记者查询时，不得返回该记录的存在性、计数、ID、类型、发生日期、修订数、隐私标记或“最近有一条私密记录”之类提示。列表不留“被隐藏”占位；看板计数按代记者可见集计算，不能用空位反推总数。
- 拒绝语义统一：对代记者，受保护记录与不存在记录返回同一个 `not_available`，不得用 `forbidden` / `private` 区分，避免存在性泄露。授权页只显示授权范围与条目数中**可读**的部分；患者本人可在自己的界面看到完整计数。
- **代记者不能降低隐私**：`privacy_state` 的变更权只属于 `subject.self_actor_id`；代记者新建条目默认 `unknown`（受保护），不得选择或写入 `not_private`；代记者也不能修改 `source_document.privacy_state`。患者本人把条目改为非私密，才解除保护。
- **代理采纳候选视同新建条目**：`candidate.adopt` 即使候选当前为 `not_private`，只要调用者是代理，初始修订也必须强制 `unknown`、`validation_state='needs_review'`、`privacy_origin='proxy_default'`；不得沿用候选状态写成 `not_private`。候选本身受保护时只有本人能采纳；候选来源缺失/不一致按 §6.2 失败关闭。
- **代理写入必须逐命令校验授权范围**：除有效 `access_grant` 外，还必须覆盖该命令的 `record_kind` 与发生日期；日期未知时需 `allow_unknown_date=true`。没有覆盖即 `not_authorized`，不能用“候选已存在”或“记录已存在”绕过。
- 授权变更不原地改旧授权：新建一条 `access_grant` 并 `supersedes_grant_id` 指向旧授权，同时把旧授权置 `revoked`；这样能回看“当时授权了什么”。
- 撤回后：新写入/读取立即拒绝；历史记录保留 `author_actor_id` 与原 `on_behalf_grant_id`；展示为“代记（授权已撤回）”，不回写成本人亲笔。`subject` 仍是数据主体，记录归属不因撤权改变。
- 未知日期的代记写入：`grant_scope.allow_unknown_date` 默认 `false`。scope 有界时，日期未知的记录无法证明落在授权期内，必须拒绝；scope 不限时间也不能推定放行，仍需显式打开 `allow_unknown_date` 并记录理由。这个边界必须在 UI 上说清楚。
- 每条代记记录必须能回指授权；`on_behalf_grant_id` 为空却 `author.kind='proxy'` 是非法状态。
- **作者状态（`author_state`）**：`record` 必须记录作者是否可判定。self 本人录入 → `known` + `author_actor_id=subject.self_actor_id`；proxy 代记 → `known` + `author_actor_id=proxy` + 覆盖该记录的 `on_behalf_grant_id`；迁移/旧数据没有可证明的作者证据 → `unknown`，`author_actor_id`/`on_behalf_grant_id` 均为 NULL，界面显示“作者未知”，**不得默认写成本人**。`author_state='unknown'` 的记录仍属于该 subject，但不计入“本人亲笔”；代理的 `own_entries` 可见性也不能据此把未知作者当作自己写的条目。

### 3.3 出站同意

`consent_event` 记录患者对某次出站动作的授权，至少覆盖：

| 类型 | 触发 | 记录内容 | 撤回/失效 |
|---|---|---|---|
| `cloud_parse` | 每次把原件发给云解析服务 | 服务方、原件 ID、用途、时间、告知文案版本 | 撤回后停止新发送；清本地候选与会话 `tmp/` 中间产物；**已采纳记录与其原件来源保留**；服务方侧删除未核实，不得声称已删 |
| `private_export` | 把某条受保护记录（`private`/`unknown`，或经 §4.1 来源链判定为受保护）纳入导出/摘要；或下载 `contains_private=1` 的 artifact | 记录 ID、**选中的那一版修订号**、双 scope 判定依据（选中修订/当前记录/来源链）、目标产物、时间 | 只对本次产物/本次下载有效；下次导出或再次下载重新逐条确认；`unknown` 与 `private` 同门槛；来源链受保护也需逐条确认 |
| `ai_context` | 把**非私密且已确认**的当前修订上下文发给原生 Agent | 选择的记录/当前修订、双 scope 过滤结果、发送时间 | 只证明“这些非私密内容被发送”；**不能**授权私密或未知内容，也不存在覆盖开关 |

`consent_event` 不是“一次同意，永久有效”。云解析按 run 记录；私密导出按条目记录；AI 按发送动作记录。没有对应 consent 的出站动作必须失败并留下拒绝审计。

**同意只能由本人给出。** `consent_event.subject_id` 必须是 `subject.self_actor_id` 对应的主体；代理、`system`、`demo_unverified` 不得代患者同意 `cloud_parse`、`private_export` 或 `ai_context`。代理发起需要同意的出站动作时一律拒绝，不得用“授权范围覆盖”代替同意。

`ai_context` 只记录**实际通过过滤并发送**的记录/修订；不得把被剔除的受保护项 ID、标题或计数写进 consent、审计或客户端提示（提示只说“有内容未发送”）。

### 3.4 AI 出口硬禁止（不可由 consent 或配置打开）

- 可进入 Agent 上下文的集合被限定为：**只发当前修订**，且该修订 `privacy_state='not_private'`、§4.1 `output_protected(record_id, revision_no)` 返回 `false`（即选中修订 scope 与当前记录 scope 都干净，含来源链、候选派生与 `privacy_ever_private` 粘性锁定），并由本人显式选中。四者缺一即排除；**不得发送历史修订**，即使该历史修订当前自身为 `not_private`，只要它不是当前修订就排除。
- AI payload 只带记录正文与必要的时间/类型，不携带 `source_document_id`、原件显示名、候选 ID、修订号列表或任何受保护来源的元数据；不得用这些字段反推“有一条未发送的私密来源”。
- 在本版，私密、隐私未知、无法判定、来源原件受保护的内容**永不**写入 prompt、系统消息、附件、工具参数、草稿、重试队列、客户端日志或崩溃报告。也不得由 Agent 生成后回填为记录。
- 过滤必须在**序列化/组装 payload 的服务端函数**执行，不能只靠页面隐藏；过滤函数异常时失败关闭：整次发送取消，提示用户，不“先发出去再说”。
- 发送前若选中项在别处被改为私密，重新校验并剔除；若**当前修订已经变化**，旧选择视为失效，不得回退到历史修订继续发送。界面明确提示“有内容因隐私变更未发送”，但不回显其标题/日期。
- 本版不存在 `allow_private_ai`、`override`、`force` 一类参数，也不实现“本人逐条授权”的开关。**“未来是否允许本人逐条授权私密内容进入 AI”仍是未决政策问题（Q-10），不是本版的实现缺口**：在 `docs/SPEC.md` 被修改并重走需求/伦理/安全评审前，任何版本都必须保持禁止发送；不得把 Q-10 当成 G3 可勾选的放行项，也不得在代码里预留“配置后打开”的旁路。

### 3.5 身份与授权的前置校验（所有写命令）

本节是 §9.4 每一行的共同前置条件；不满足即拒绝，且拒绝码不得区分“无权限”与“不存在”。

- **actor 只来自已认证会话/宿主上下文**：`actor_id`、`subject_id`、`identity_state` 由宿主或本机会话解析；请求体、URL、表单里的同名字段只用于对照，不得作为身份来源。请求体身份与解析结果不一致时 `not_authorized`，并记拒绝审计。
- **主体归属**：`actor` 必须属于当前 `subject`；self 必须是 `subject.self_actor_id`；proxy 必须有该 subject 的 `access_grant`；`system` 只用于迁移/数据修复的内部路径，**不得调用任何面向用户或代理的写命令（含 `import.*`、`candidate.*`、`record.*`、`artifact.*`）**。`demo_unverified` 只能操作 `demo` 标记的 subject，**不得写入生产 subject**；生产写入要求 `host_authenticated`。`local_profile` 只允许单用户 self，不得代理。
- **写授权**：proxy 的每条写命令都必须检查 `grant.status='active'`、`revoked_at IS NULL`、`period_from <= 发生日期 <= period_to`（或 `allow_unknown_date=true`），且 `grant_scope.record_kind` 覆盖该命令的 kind。仅“有授权”不够，范围不覆盖即拒绝。
- **读授权**：proxy 读记录/修订/来源/候选/产物时，必须同时通过 `read_mode='own_entries'` 或 `grant_read_entry` 的逐条授权，再叠加 §4.1 保护过滤；不得先返回再前端隐藏。
- **同意权**：`consent_event` 只能由 self 写；proxy 不能代替患者同意云解析、私密导出或 AI 发送。需要同意的命令由 proxy 发起时直接 `not_authorized`。
- **隐私变更权**：`record.setPrivacy`、`document.setPrivacy`、`record.releaseSourceLink` 只能 self；proxy 即使有写 scope 也不得调用。`record.attachSource` 也只能 self，且只能按 §4.7 提高或保持保护、不得降低；`record.create`/`candidate.adopt` 可由 proxy 调用，但只能写入更高保护（代理新建强制 `unknown`），不得写 `not_private`；`record.correct` 不得通过更换来源绕过 §4.7。
- 以上校验与副作用必须在同一事务内完成；回执只记录解析后的 actor/subject，不记录请求体身份字段。

---

## 4. 隐私与历史

### 4.1 三态隐私

`record_revision.privacy_state`：

- `private`：私密。本人可见；代记者不可见；默认不进导出/摘要/AI。
- `not_private`：非私密。仍受主体/授权约束，但可作为默认导出/AI 候选。
- `unknown`：隐私状态未知（主要来自旧数据或缺失标记）。**按受保护处理**，效果等同 `private`，直到本人逐条确认。

`privacy_origin`：`user_marked`、`inherited_document`、`legacy_unknown`、`migration_default`、`proxy_default`。它回答“为什么是私密”，不替代 `privacy_state`。`proxy_default` 只用于代理新建/采纳时被强制落 `unknown` 的情形。

**默认保护（fail-closed）**：

- `privacy_state` 没有数据库默认值；每条修订写入时必须显式给出，缺失视为非法写入，不得由服务端补 `not_private`。
- 旧库、导入、迁移、缓存、日志、外部回填等任何“缺标记”路径一律落 `unknown`（`privacy_origin='legacy_unknown'` 或 `migration_default`），并立即按受保护处理。
- 读取时遇到无法识别的枚举值，不猜测、不映射成 `not_private`；按受保护返回，并记 `needs_review`。
- 隐私状态只由 `subject.self_actor_id` 变更；代记者既不能写入 `not_private`，也不能降低既有状态。

唯一保护判定（读模型、导出、摘要、AI、打印、代记查询、审计/回执必须使用同一实现，但**必须显式传两个 scope 之一**）：

```text
effective_state(x) = x.privacy_state ∈ {'private','not_private','unknown'}
                     ? x.privacy_state : 'unknown'

candidate_source_ok(record_id) =
  record.origin_candidate_id IS NULL
  OR (
    ∃ c = import_candidate(record.origin_candidate_id):
      c.subject_id = record.subject_id
      AND c.adopted_record_id = record.record_id
      AND c.state = 'adopted'
      AND c.adoption_state = 'resolved'
      AND ∃ run = import_run(c.import_id):
            run.subject_id = record.subject_id
            AND c.document_id = run.document_id
      AND ∃ d = source_document(c.document_id):
            d.subject_id = record.subject_id
  )

# 来源三态：唯一分类。no_file 表示“从未指向任何原件/候选，且本人明确声明手工”；
# “所有来源指针”指当前与历史修订的 source_document_id、record.origin_candidate_id
# 及其候选的 import_id/document_id；只看当前修订会漏掉历史链。
# 新写入走 no_file 必须显式 source_kind='manual'；迁移只在“无任何指针且无原件痕迹”时用；
# 无指针但保留“曾有原件”痕迹的（original 非空，或 source 以“原件：/原件已移除”开头）
# 必须落 unresolved + source_kind='document'，不得因 fileId 为 null/键缺失就洗成手工来源。
resolve_source(record_id) =
  IF 所有来源指针均为 NULL/缺失
     AND 当前修订 source_kind='manual'
     AND 没有任何修订（含历史）source_kind='document'        -> 'no_file'
  IF 所有来源指针均为 NULL/缺失（不满足上一分支）           -> 'unresolved'
  IF ∃ 指针无法解析：document 行缺失、subject 不同、
     候选行缺失、import_run 缺失、candidate.document_id != run.document_id、
     任一修订 source_kind='document' 却无 document 指针、
     record.origin_candidate_id 与 candidate.adopted_record_id 不互指
                                                          -> 'unresolved'
  -> 'resolved'

source_floor(record_id, d) =
  resolve_source(record_id) = 'no_file'                   -> 'not_private'
  resolve_source(record_id) = 'unresolved'                -> 'unknown'
  d IS NULL 且 resolve_source <> 'no_file'（调用方漏传 document）-> 'unknown'
  d 引用了不可解析的 document_id / 跨 subject              -> 'unknown'
  d.privacy_state='private'                               -> 'private'
  d.privacy_state='unknown'                               -> 'unknown'
  d.privacy_ever_private=1 AND NOT release_active(record_id,d) -> 'unknown'
  d.privacy_state='not_private'                           -> 'not_private'
# link_state 不进入本函数：missing/removed 只限制“可新挂”，不把已知 not_private+ever=0 改成受保护

source_chain(record_id) =
  { 当前修订的 source_document_id（若有） }
  ∪ { 该 record 所有历史修订的 source_document_id（若有） }
  ∪ { record.origin_candidate_id 对应候选的 document_id（若有） }
  ∪ { 该候选所属 import_run.document_id（若有） }

release_active(record_id, d) =
  d.privacy_state = 'not_private'
  AND d.privacy_ever_private = 1
  AND d.privacy_epoch >= 1
  AND d.subject_id = record.subject_id
  AND ∃ r ∈ source_link_release:
        r.record_id = record_id
        AND r.document_id = d.document_id
        AND r.privacy_epoch = d.privacy_epoch
        AND r.document_state_seq = d.privacy_state_seq
        AND r.released_by_actor_id = subject.self_actor_id

source_locked(record_id) =
  resolve_source(record_id) = 'unresolved'
  OR NOT candidate_source_ok(record_id)
  OR ∃ d ∈ source_chain(record_id):
    d 不存在（链上引用了不可解析的 document_id）
    OR d.subject_id != record.subject_id
    OR effective_state(d) != 'not_private'
    OR (d.privacy_ever_private = 1 AND NOT release_active(record_id, d))

protected_revision(rev) =
  effective_state(rev) != 'not_private'

protected_record(record_id, current_rev) =
  effective_state(current_rev) != 'not_private'
  OR source_locked(record_id)

protected(x, scope) =
  scope = 'revision' ? protected_revision(x)
                     : protected_record(x.record_id, x)

# 出站专用：selected revision 与 current record 两个 scope 必须同时检查
output_protected(record_id, revision_no) =
  revision(record_id, revision_no) 不存在
  OR protected_revision(revision(record_id, revision_no))
  OR protected_record(record_id, current_rev(record_id))

output_allowed(purpose, record_id, revision_no, viewer) =
  purpose = 'ai' ? (
    viewer = subject.self_actor_id
    AND revision_no = current_rev(record_id).revision_no
    AND NOT output_protected(record_id, revision_no)
  ) : purpose = 'export' ? (
    NOT output_protected(record_id, revision_no)
    OR (viewer = subject.self_actor_id
        AND consent_private_export(record_id, revision_no, destination))
  ) : purpose = 'artifact.download' ? (
    artifact.status ∉ {'quarantined','failed'}
    AND (artifact.contains_private = 0
         OR (viewer = subject.self_actor_id
             AND consent_private_export(record_id, revision_no, artifact.artifact_id)))
  ) : false
```

判定说明：

- **按条历史（SPEC 已定）**：历史显示只走 `protected_revision(rev)`，即**只看该修订自身的 `effective_state`**。当前记录后来变为私密、来源原件变为私密、或 sticky 未解除，都**不得**回溯隐藏一条自身为 `not_private` 的历史修订。`source_chain` 与 sticky 只进入 `protected_record`，用于当前记录/选择/改公开/代理可见性；这是本版对 SPEC 的明确对齐，不是“来源链例外”。
- **当前记录 scope**：`protected_record` 用于看板、时间线、一页秀、当前记录详情、代记查询、审计/回执可见性。它包含当前修订自身状态与整条来源链；链上任一原件当前 `private/unknown`、缺失/悬空、跨 subject、候选/run/document 不一致、或曾为 `private` 且该 `(record, document, epoch, state_seq)` 无有效 release，记录即受保护。删掉当前修订的 `source_document_id` **不能**解除链。
- **出站必须两个 scope 同时干净**：导出、AI、artifact 的选中项不能只调用 `protected_record(record_id, current_rev)`。必须调用 `output_protected(record_id, revision_no)`：**选中修订自身的 `revision` scope** 与**当前记录的 `record` scope** 任一受保护即为受保护。典型漏洞是“当前记录公开、用户选中的旧版修订私密”或反过来“旧版公开、当前记录已因来源链受保护”；只看任何一边都会把正文/来源带出。历史显示仍只走 `revision` scope（按条历史），`output_protected` 只用于出站选择，不能反向用于回溯隐藏公开历史。
- **AI 只发当前修订**：`purpose='ai'` 额外要求 `revision_no = current_rev.revision_no`，且两个 scope 都干净；历史修订即使自身公开也不得发送。`purpose='export'` 才允许选历史修订，但受保护项只能由本人逐条 `private_export`；`artifact.download` 每次都重新判定，不能只信构建时的快照；`artifact.status_data_version` 只记录最后一次状态判定，不能替代逐条 `output_protected`。
- **artifact 同意按条且每次重判**：`output_allowed('artifact.download', ...)` 对每个 `included_private=1` 条目分别求值，`private_export` 必须匹配该条 `(record_id, revision_no)`；一条同意不得覆盖产物中的多个受保护条目，也不得跨下载复用。构建时同理：缺任一条同意即整批失败。
- **改公开的判定**：`record.setPrivacy(not_private)` 只看 `source_locked(record_id)`，不看当前修订自身状态（因为当前状态正是要改的对象）。当前链干净时，`private → not_private` 允许；链上有当前私密/未知原件或未解除 sticky，返回 `privacy_locked`。**`record.correct` 完全不得变更隐私**：它不读、不写 `privacy_state`/`privacy_origin`，也不因 `source_locked=false` 获得改隐私的能力；请求若携带隐私字段，或合并结果与当前隐私不同，一律返回 `privacy_changed`，要求改用 `record.setPrivacy`。若更正同时更换 `source_document_id` 且新来源会按 §4.7 抬高保护，`record.correct` 必须返回 `privacy_locked`，改由本人 `record.attachSource` 处理，不得借内容更正把公开记录挂到受保护来源。`record.restoreRevision` 同理只恢复内容、不改变当前隐私；目标保护等级高于当前时按 §5.1 的“不洗白”规则返回 `privacy_locked`。
- **候选派生**：候选在创建时按 §6.2 派生三态，不从记录“继承”一个可能被改过的当前值；`record` 从候选继承，采纳不得降低。候选没有“逐条 release”路径，因为 release 是 record 级；曾私密原件产生的候选只能是 `unknown`，采纳后再按 record 级解除。候选/run/document 任一悬空、跨 subject 或 document 不一致时，按 `candidate_source_ok=false` 处理，候选 `unknown`+`needs_review` 且不可采纳。
- **来源三态（`no_file/resolved/unresolved`）**：`resolve_source()` 是写入、读模型与迁移共用的唯一分类。`no_file` 只在完全没有 document/candidate 指针**且当前修订显式 `source_kind='manual'`** 时成立（迁移中表现为该记录所有修订的 `fileId` 键缺失或显式 null 且无原件痕迹），它是“手工录入/无原件”，**不强制 `unknown`、不标 `needs_review`**，`source_floor='not_private'`，记录自身隐私与代理下限仍照常生效；`source_text` 必须保留。`resolved` 表示指针完整且同 subject，但仍需看原件隐私与 `link_state`（见下条）。`unresolved` 表示指针存在却解析不完整（行缺失、跨 subject、候选/run/document 不一致、互指不成立），或**指针已丢但仍有原件痕迹**（`source_kind='document'` 且无指针），一律按 `unknown` 保护、`source_locked=true`、`needs_review`，禁止采纳、release、改公开，返回 `source_unresolved`/`cross_subject_reference`。**不得只凭 `source_document_id IS NULL` 判 `no_file`**：删指针不能把悬空链洗成手工来源；反之，从未登记文件的手工记录也不能被当成 `unresolved`。
- **`link_state` 四态（`unverified/verified/missing/removed`）**：只表示最近一次会话核对结果，不是隐私状态、不是“现在可达”的承诺，**没有 `active`**。新挂来源只允许 `unverified/verified`；`missing` 返回 `document_missing`、`removed` 返回 `document_removed`，不得自动复活或复用已移除登记。`link_state` 不改变 `privacy_state`/`epoch`/`seq`：`missing/removed` 且隐私已知 `not_private`、`ever=0` 时不因链接状态本身变成受保护（`removed` 只把对外投影置 NULL）；隐私未知或曾私密未 release 时仍按 `unknown`。`verified` 也不能解除任何保护。
- **原件锁定**：`source_document` 当前为 `private/unknown`，或来源解析 `unresolved`，或 `link_state='removed'` 且当前状态不可判定时，链上记录按受保护；已知 `not_private` 且 `ever=0` 的原件移除只清关联投影，不改变记录自身隐私。`removed` 不是“隐私归零”。
- **取消私密不自动公开（sticky）**：`privacy_ever_private` 只在原件进入 `private` 时置 1（含首次登记/迁移即 `private`），之后即使改回 `not_private` 也不清零；`privacy_epoch` 的初值是 0，**每次进入 `private`（含首次注册/迁移即私密）严格 +1**；已是 `private` 时重复提交不递增；改回 `not_private`/`unknown` 不回退。链上记录仍按受保护，直到本人对该 `(record, document, 当前 epoch, 当前 state_seq)` 显式 `record.releaseSourceLink`。`unknown → not_private` 不算“取消私密”，`privacy_ever_private` 不变；若从未 private（ever=0），只需当前状态锁解除即可，不需要 release；若曾 private（ever=1），仍需按当前 epoch 与 seq 逐条 release。release 只清该条的 sticky 锁，不改记录隐私、不批量、不回溯隐藏历史；释放后用户仍需单独把记录改为 `not_private`。
- **`privacy_state_seq` 使 `unknown` 往返失效**：`source_document.privacy_state_seq` 初值 0，**任何一次实际 `privacy_state` 变化都 +1**（`not_private→unknown`、`unknown→not_private`、`private→unknown` 等；同值重复提交不增）。`source_link_release` 必须记录签发时的 `document_state_seq`，`release_active` 要求它与当前值相等。这样 `private(epoch=1) → not_private → release(seq=2) → unknown(seq=3) → not_private(seq=4)` 后，旧 release（seq=2）自动失效，必须重新逐条 release；不会出现“经过一次 unknown 就恢复旧授权”的旁路。`privacy_epoch` 仍只表示“第几次进入 private”，不承担状态序列职责；迁移时 `private → seq=1`、`not_private/unknown → seq=0`，不预置 ever/epoch。
- **`unknown` 原件的解锁路径**：唯一合法路径是本人显式调用 `document.setPrivacy(document_id, 'not_private')`，并在 UI 确认“已核对原件确非私密”；该操作只改 `source_document.privacy_state` 并递增 `privacy_state_seq`，不清 `privacy_ever_private`、不回退 `privacy_epoch`，也不自动改任何记录/候选的隐私。`ever=0` 时当前 `unknown` 锁定随该操作解除；`ever=1` 时还需按当前 epoch 与 seq 逐条 `record.releaseSourceLink`，再逐条 `record.setPrivacy(not_private)`。缺失的 document 行不能靠“移除”或改记录隐私绕过；必须先恢复登记（同一 subject）或保持受保护。
- **epoch/seq 失效**：原件再次进入 `private` 时 `privacy_epoch += 1`；任何状态变化都使 `privacy_state_seq += 1`，旧 release 对旧 `(epoch, seq)` 仍留在审计历史中，但对当前值 **不再生效**；再次改回 `not_private` 后需要新的逐条 release。这样“曾经私密”不会被一次 release 永久洗白，也不会被 `unknown` 往返洗白。
- **失败关闭**：缺字段、未知枚举、链解析不完整（document 行缺失）、查询异常，一律返回 `protected`；不得用 `false` 兜底。链上引用了不存在的 `document_id`、候选/run 缺失、`candidate.document_id != run.document_id`、或 `record.origin_candidate_id` 与 `candidate.adopted_record_id` 不互指时，`resolve_source='unresolved'`，按 `unknown` 处理，且不能通过 release 绕过（release 要求 document 行存在、当前 `not_private`，且 `document_state_seq` 匹配）。候选/run/document 任一跨 subject 时按受保护处理，写入返回 `cross_subject_reference`。
- **`protected()` 是派生判定，不是隐私状态本身**：它可以让一条 `privacy_state='not_private'` 的当前记录仍按受保护处理（例如来源链上原件私密，或候选链悬空）。读模型/导出/AI 按 `protected(..., 'record')` 过滤；记录自己的隐私标签仍由本人 `record.setPrivacy` 决定。但**新挂来源时不得只依赖派生**：`record.create`/`record.attachSource`/`candidate.adopt` 必须按 §4.7 把保护写进新修订，`protected()` 只作历史/损坏/并发兜底，不得为了“让过滤一致”而偷偷改写记录隐私或历史修订。
- 该函数是**合同级伪代码**，尚未实现、未测试；链解析（含候选/run/document 三层复合引用）的查询计划、索引与性能**尚未设计**。V-43/V-44 未执行前不能声称“来源链已隔离”。

### 4.2 隐私变更也是修订

改变隐私状态时：

1. 追加一条 `record_revision`，`change_kind='privacy'`，内容字段与上一版相同，只改 `privacy_state`/`privacy_origin`；**降低隐私或由用户选择隐私只能由 `record.setPrivacy` 产生；§4.7 `record.attachSource` 仅在新挂来源触发保护提升时产生同类修订，且只能升不能降**。`record.correct`/`record.restoreRevision` 只改内容，不产生隐私修订，也不得借内容更正改写隐私；
2. 写 `audit_event`（旧状态、新状态、操作者、时间），审计不存正文；
3. 若变为私密：从当前导出选择、时间线选择、AI 草稿中移除；清空页内草稿与复制状态；不自动把公开记录加回选择；**已生成的 artifact 若包含该记录/修订，立即置 `quarantined` 并写 `status_data_version=本事务新 data_version`，不得继续下载**（文件保留但访问受控，删除按保留策略单独确认）；
4. 若变为公开：不自动加入导出/AI；必须逐条重新勾选；`source_locked(record_id)` 为真时禁止直接改公开——不仅看来源链当前状态，也看 `privacy_ever_private` 粘性锁定与历史修订指针/采纳候选所属原件。要改公开，先按 §9.4 `record.releaseSourceLink` 逐条解除当前 epoch/seq 的 sticky，再单独改记录隐私；**若锁定源当前仍为 `private/unknown`，或候选/run/document 链悬空、跨 subject、不一致，release 会被 `privacy_locked` 拒绝：必须由本人先把该 document 显式改为 `not_private`（`unknown` 走 §4.1 解锁路径）并修复链，再逐条 release**；没有“改回公开即放行”的旁路。
5. 隐私变更不得通过 `record.restoreRevision` 完成：恢复只写内容，新修订的 `privacy_state` 取当前记录隐私，**不得由恢复改变**；目标修订的保护等级高于当前记录时（如目标 `private`、当前 `not_private`/`unknown`）直接 `privacy_locked`，不得“先恢复内容、再补隐私”，也不得借恢复抬高隐私。恢复的事务内重读与版本前置见 §5.1。

这样“隐私历史”不是一条布尔值，而是可回放的版本序列。

### 4.3 历史正文的默认不可见

- `record_revision` 中 `privacy_state != 'not_private'` 的正文，默认查询只返回元数据（时间、类型、隐私状态、修订号），不返回 `text`、`details_json`、药名/剂量/数值等正文。**这里的“返回元数据”只适用于本人视图**；非本人视图连这些元数据也不返回，见下条。
- **按条判断，不回溯覆盖**：每个历史修订按它自己的隐私状态决定是否显示；`not_private` 的历史修订可直接查看；当前记录后来变为私密，不把旧的公开修订重新隐藏。这是 `docs/SPEC.md` 已定口径，不是本模型遗漏（见 §4.4）。历史显示**只用** `protected(rev, 'revision')`，不再把来源链当前状态或 sticky 叠加到历史修订上；来源链保护只限制当前记录/选择/改公开/代理可见性。若一条公开历史修订的正文曾抄自后来变为私密的原件，该修订仍按 SPEC 可读——这是“按条历史”的已知取舍，不是本版新增回溯过滤；若 G3 认为不可接受，必须先改 SPEC，不能在历史查询里偷偷加链过滤。
- 本人视图（原型中为本人演示页）可以逐条“展开”；展开是**会话内临时视图状态**，不持久化、不进入导出、不进入打印 DOM；切换导航、保存更正、改变隐私状态时重置。
- **非本人视图（代记者、未来的他人）**：永不返回受保护历史正文；也**不返回受保护修订的元数据**——包括修订 ID、修订号、发生时间、类型、隐私状态、来源、计数、空位或占位。响应只包含该主体有权看到的 `not_private` 修订，显示序号按可见集重排，不能从断号推断存在隐藏修订；响应与“本来就没有这些修订”不可区分。即使有读授权，也不放行受保护历史。
- 打印/PDF 不是安全边界：打印前不得把未展开的受保护正文或元数据放进 DOM；仅靠 CSS `display:none` 不合格。
- 生产环境必须在查询/序列化层执行过滤；当前原型只在页面层执行，不能声称“服务端已隔离”。

### 4.4 历史回溯口径（本版按 SPEC，P-04 仅备选）

`docs/SPEC.md` 已定：**按条历史**——每个历史修订按它自己的隐私状态判断；`private`/`unknown` 的历史修订初始不渲染正文，`not_private` 的历史修订可直接查看；当前记录后来变为私密，不回溯隐藏旧的公开修订；非本人视图不显示受保护历史（正文与元数据都不显示，且不留空位/断号），打印不输出受保护历史。

本版数据模型遵守该口径：§4.1 的 `protected(rev, 'revision')` **不含**“当前修订私密则全部历史受保护”这一项，也**不含**来源链当前状态或 sticky；`protected(..., 'record')` 才含来源链。原型 `protectedHistoryEntries` 的按条判断与 SPEC 一致，因此本版不是“迁就原型”，而是对齐已确认规格。

**P-04（更保守的回溯）仅列为备选，不是本版默认，也不是 G3 的默认二选一。** 若未来认为需要 P-04，必须先修改 `docs/SPEC.md` 的已定口径，再改 §4.1 判定函数与 V-08，并在变更记录中写明取舍：P-04 避免“先公开、后私密”留下可读旧文，但本人回看旧版本需要逐条展开。未改 SPEC 前，实现不得按 P-04 写，也不得在两个口径间用配置切换。

**已知风险（如实记录，不掩盖）**：按条历史意味着“先公开、后改为私密”的旧修订仍可能被本人或已获授权的查看者读到；这是 SPEC 的既定取舍，不是本模型新增的漏洞。若患者/临床在 G3 认为不可接受，走上述 SPEC 变更，不在实现里偷偷加回溯过滤。

### 4.5 失败关闭矩阵（默认保护的可执行口径）

| 情形 | 系统行为 |
|---|---|
| 修订缺 `privacy_state` 或为 NULL | 拒绝写入；读取时按 `unknown` → 受保护 |
| `privacy_state` 值不在枚举内（旧库/损坏） | 不猜；按受保护，标 `needs_review`，写审计 |
| 记录来源链上任一环为 private/unknown、缺失/悬空、跨 subject、候选/run/document 不一致、曾为 private 且该 `(record, document, 当前 epoch, 当前 state_seq)` 无有效 release，或已移除且状态不可判定 | 按受保护锁定；不得显示为公开。已知 `not_private` 的原件移除只清关联投影，不改变记录自身隐私。要改公开，先逐条 `releaseSourceLink`，再单独改记录隐私；链 unresolved 时 release 一律 `privacy_locked` |
| 来源解析为 `no_file`（该记录当前与历史修订都无 document/candidate 指针**且 `source_kind='manual'`**；迁移仅该记录所有修订的 `fileId` 键缺失或为 null 且 `original`/来源无原件痕迹时映射 manual，新写入须显式声明） | 不是 `unresolved`：不因“没有文件”标 `needs_review` 或强制 `unknown`；`source_floor='not_private'`，记录自身隐私/代理下限仍生效；保留 `source_text`，显示“手工录入/无原件”。`source_document_id IS NULL` 本身不证明手工 |
| 来源解析为 `unresolved`（指针存在但行缺失/跨 subject/候选-run-doc 不一致/互指不成立，或指针已丢但 `original`/来源显示曾有原件） | 按 `unknown` 受保护、`source_locked=true`、`needs_review`；禁止采纳/`releaseSourceLink`/`setPrivacy(not_private)`；返回 `source_unresolved`/`cross_subject_reference`；不得写成“无来源”或 `not_private` |
| `link_state='missing'` 或 `'removed'` | 只表示核对失败/已移除，不是隐私状态；不可新挂（`document_missing`/`document_removed`）、不得自动复活；隐私已知 `not_private` 且 `ever=0` 时不因链接状态本身变成受保护，隐私未知/曾私密未 release 仍按 `unknown`；`removed` 只把对外投影置 NULL，不删行/不改历史 |
| 历史修订自身 `not_private`，但当前记录或来源链受保护 | 历史正文按 `protected(rev,'revision')` 显示；不因当前记录/来源链回溯隐藏。只有该历史修订自身 `private/unknown` 才默认只回元数据（仅本人） |
| 导出/AI/artifact 选中项的修订自身公开，但当前记录或来源链受保护，或反之 | 按 `output_protected(record_id, revision_no)` 视为受保护：AI 一律排除；导出/artifact 只允许本人逐条 `private_export`，并记 `included_private=1`；不得只用 current record 或只用 selected revision 单边判定 |
| artifact 构建后其条目对应的修订/记录/来源变为受保护 | 同一事务置 `quarantined` 且 `status_data_version=新 data_version`；所有下载返回 `artifact_quarantined`；文件保留但不再可访问，删除按保留策略单独确认。不得因“构建时已同意”继续下载；不得只改版本号不隔离产物 |
| 非本人查询历史 | 只返回可见的 `not_private` 修订；受保护修订的正文、元数据、ID、修订号、时间、类型、隐私状态、计数、空位与占位全部不返回；显示序号按可见集重排，响应与“不存在隐藏修订”不可区分 |
| 查询或序列化过程中抛错 | 返回空集 + 错误码；不得降级为“返回全部” |
| 授权/身份查询超时或失败 | 拒绝访问；不缓存“允许”结果 |
| 读模型缓存缺少 `subject_id`、`viewer_actor_id`、`data_version`、`read_model_version` 或授权 scope 版本 | 丢弃并重建，不复用他人/他 subject 视图；不得只凭 `viewer_actor_id` 命中 |
| 打印/导出时正文未加载 | 输出空段落并提示；不得先渲染全文再隐藏 |
| AI 过滤函数异常 | 取消发送，保留草稿在本地，不上传 |
| 迁移时隐私字段无法映射 | 落 `unknown` 并 `needs_review`；不得默认 `not_private` |
| 候选的 `import_id`/`document_id` 缺失、`import_run` 缺失或与候选 document/subject 不一致、候选/run/document 跨 subject，或 `adopted_record_id`/`origin_candidate_id` 不互指 | 候选置 `unknown`+`needs_review`；**禁止采纳**并返回 `source_unresolved`/`cross_subject_reference`；已有记录链上出现同类悬空时按 `source_locked=true` 受保护，不得 release；不得因文本完整生成无源事实；仅本人可显式转 `source_kind='manual'`（`source_document_id=NULL`） |
| 代理采纳候选（即使候选为 `not_private`） | 初始修订以 `unknown` 为下限，按 §4.7 `attach_state` 取候选来源与候选状态的较强者（候选 `private` 仍为 `private`），`privacy_origin='proxy_default'`；必须有覆盖 kind/日期的有效 grant；来源不可解析时直接 `source_unresolved`；不得沿用候选状态写 `not_private` |
| 已有记录的 `origin_candidate_id` 悬空，或候选/run/document 任一不可解析/跨 subject/不一致 | 记录按 `protected_record` 受保护、`validation_state='needs_review'`；不返回正文/元数据给非本人；禁止 `releaseSourceLink` 与 `setPrivacy(not_private)`；需数据修复或本人显式转 manual（仅当不再依赖该候选） |
| 新挂/新建议题关联 `private`/`unknown`/`ever_private=1` 未 release 来源 | 新修订必须按 §4.7 写 `private`/`unknown`；请求写 `not_private` → `privacy_locked`；不得先写公开再依赖读时过滤；`record.correct` 换到此类来源同样拒绝 |
| 事实/隐私/来源/授权变化已递增 `data_version`，但受影响 artifact 未标 `quarantined`/`stale` 或 `status_data_version` 未同步 | 事务失败回滚；不得提交“版本已变、产物仍 ready”；下载仍按逐条双 scope 重判并拒绝 |
| `artifact.status_data_version` 落后，或 `artifact.contains_private`/item 快照与当前判定不一致 | 不看旧 `status` 放行；下载逐条重判并同步隔离状态；若状态更新与 `data_version` 不在同一事务，按 V-47 失败 |
这些行为是合同，不是“建议的防御性编程”。任何一条在实现里变成“宽松兜底”，都要按隐私缺陷处理。

### 4.6 私密传播事务（原件 → 候选 → 记录 → 选择集）

原件隐私状态变化（仅本人可发起）必须在**一个事务**内完成，顺序固定：

1. `BEGIN IMMEDIATE`，取 subject 写锁；
2. 更新 `source_document.privacy_state`（`private`/`not_private`/`unknown`）；`privacy_epoch` 初值为 0，**每次进入 `private` 严格 +1**：若新状态是 `private`，同时把 `privacy_ever_private` 置 1，且原状态不是 `private` 时 `privacy_epoch += 1`（首次注册/迁移即私密从 0 → 1；每次重新进入私密都开新 epoch）；原状态已是 `private` 时不得重复递增；改回 `not_private`/`unknown` **不得清零** `privacy_ever_private`，也不回退 `privacy_epoch`；`unknown → not_private` 不改变 ever/epoch；**只要 `privacy_state` 实际发生变化，`privacy_state_seq += 1`（同值重复提交不增）**，使旧 release 立即失效；
3. **转私密/未知时**：先解析并锁定来源链（当前修订、历史修订、`origin_candidate_id` → 候选 → `import_run` → `source_document`）；任一候选/run/document 缺失、跨 subject、`candidate.document_id != run.document_id` 或 `candidate.adopted_record_id` 与 `record.origin_candidate_id` 不互指，按 unresolved 受保护，不得当作“无来源”跳过。对**来源链包含该原件**（当前修订、任一历史修订、或采纳候选所属 run）且当前隐私为 `not_private` 的所有 `record` 各追加一条 `change_kind='privacy'`、`privacy_origin='inherited_document'` 的新修订（内容字段不变，**新修订的 `privacy_state` 必须等于 document 的新状态**：`document→private` 写 `private`，`document→unknown` 写 `unknown`；`validation_state` 在 `unknown` 时为 `needs_review`，不得把未知写成 `private` 或 `not_private`）；链上已受保护的记录不重复追加，其可见性仍由来源链覆盖，但不得改写其自身状态，**尤其不得把已 `private` 的记录降为 `unknown`**；该原件下所有 `pending` 候选按“原状态与新状态的较强者”更新（`private` > `unknown` > `not_private`）：原 `private` 保持 `private`，原 `unknown` 遇到 `private` 升为 `private`，原 `not_private` 才写新状态；`privacy_origin='inherited_document'`，未知时 `needs_review`；已 `adopted` 候选的记录由来源链覆盖，不改候选状态；
4. 从当前导出选择、时间线选择、AI 草稿、打印准备集中移除受影响记录；**同一事务内**把包含受影响记录/修订的 artifact 置 `quarantined`，并写 `status_data_version = subject.data_version + 1`（即步骤 5 将提交的新版本）与 `quarantine_reason`；写 `audit_event`（`batch_id` 关联同批，逐条记旧/新状态，不存正文）；
5. `subject.data_version = new_version`（`new_version = 原值 + 1`，整批只增一次），提交；artifact 状态与 `data_version` 必须同事务，任一条更新失败即整体回滚；
6. 任一步失败 → `ROLLBACK`；原件、记录、候选、选择集、版本号、artifact 状态全部保持原状，返回 `propagation_failed`，不得留下“原件已私密、记录仍公开”或“版本已递增、artifact 仍 ready”的中间态。

**传播矩阵（唯一口径）**：

| 原件状态变化 | `pending` 候选 | 已采纳记录（来源链上） | 导出/摘要/AI 选择 | `data_version` |
|---|---|---|---|---|
| → `private` | 取原状态与 `private` 的较强者，`privacy_origin='inherited_document'` | 若当前 `not_private`，追加 `privacy` 修订且新状态为 `private`；已受保护不变，不改写其自身状态，不降级 | 移除受影响记录；产物标 `stale`；含该记录的 artifact 置 `quarantined` | +1（整批一次） |
| → `unknown` | 取原状态与 `unknown` 的较强者：原 `private` 保持 `private`，不得降为 `unknown`；原 `not_private` 置 `unknown`，`privacy_origin='inherited_document'`，`needs_review` | 若当前 `not_private`，追加 `privacy` 修订且新状态为 `unknown`、`validation_state='needs_review'`；已受保护不变，不降级 | 移除受影响记录；产物标 `stale`；含该记录的 artifact 置 `quarantined` | +1（整批一次） |
| → `not_private` | **不自动解除**；保持原状态，采纳前需本人确认 | `ever=1`：**仍受保护**，需本人逐条 `record.releaseSourceLink` 解除当前 `(epoch, state_seq)` 的 sticky，再单独 `record.setPrivacy(not_private)`；`ever=0` 的 `unknown→not_private`：当前 `unknown` 锁定解除，不需要 release，但记录自身 `private/unknown` 不变 | 不自动加回 | +1 |

所有 artifact 状态更新都写 `status_data_version = 新 data_version`，并与 `data_version +1` 同事务；受影响条目按历史修订与当前记录双 scope 判定，不能只看当前记录。

“解除保护”只能由本人逐条确认并留审计。**本版有 `record.releaseSourceLink` 的合同**（§9.4），但实现/UI/迁移/测试未完成，因此整套解除流程仍是 G3 阻塞；“按原件批量放开、一键公开”仍然**未设计、不提供**。取消原件私密**不清除 `privacy_ever_private`**，也不回退 `privacy_epoch`；曾经受该原件私密影响的记录仍按 §4.1 受保护，必须逐条 release。从未 `private` 过的 `unknown → not_private` 只解除当前 `unknown` 锁定，不需要 release；若 `ever=1`，即使当前是 `unknown`，也必须先显式改 `not_private`，再按当前 `(epoch, state_seq)` 逐条 release。记录/候选自己的 `privacy_state` 均不变。**任何一次状态变化都会使 `privacy_state_seq` 增加，因此 `unknown` 往返后旧 release 失效，必须重新逐条确认；不得把“曾经 release 过”当成永久通行证。**

**并发**：传播事务与内容更正互斥。更正命令在 `BEGIN IMMEDIATE` 内重新读取当前修订与 §4.1 来源链判定；若传播已把它变私密，更正返回 `privacy_changed`（版本也已变化时按 `stale_data_version` 先失败），不得用基修订合并绕过。传播进行中到达的写入等待锁或重试，不读半状态。`data_version` 与 artifact 状态必须一起提交；并发行为**尚未实测**。

**回执边界**：传播事务写 `command_receipt` 时只存 `subject_id`、`batch_id`、受影响计数与状态，不存受影响记录 ID 列表、标题、日期或正文；回执按 `(subject_id, actor_id)` 作用域（§9.5），代理不能从回执反推“有一条私密记录被传播”。

**已采纳来源的独立性**：撤回解析 run、移除原件登记都不属于“传播事务”的删除动作——已采纳记录及其 `source_document_id`（历史）保留，仅关联投影与缓存变化，见 §6.1/§6.2。

### 4.7 新挂来源时的保护写入（消除 INV-06 的存储态矛盾）

**触发**：`record.create`、`record.attachSource`、`candidate.adopt` 以及任何在新修订中写入/更换 `source_document_id` 的迁移修复，都必须先解析来源，再把保护写进新修订。`record.correct` 只能挂不会抬高保护的来源；`record.restoreRevision` 只复制目标来源，不另挂来源。

**来源解析（三态，唯一分类，X-03）**：调用 §4.1 `resolve_source()`，本节不另定义第二套判定。

- `no_file`：完全没有 document/candidate 指针。运行时要走这条路径，必须显式 `source_kind='manual'`、`source_document_id=NULL`，保留用户填写的 `source_text`；迁移中只有该记录**所有修订（含历史）**的 `fileId` 键不存在**或为 null**、且 `original` 为空、`source` 不含“原件：/原件已移除”时才能落此态，并写 `source_kind='manual'`；任一历史修订保留原件痕迹的必须落 `unresolved`。`no_file` **不是** `unresolved`：不强制 `unknown`、不标 `needs_review`，`source_floor='not_private'`；记录自身 `unknown/private` 与代理下限仍生效。`source_document_id IS NULL` 单独不足以证明手工。
- `resolved`：document 行存在、同 subject，且若有候选链则候选/run/document 全部存在、同 subject、`candidate.document_id = run.document_id`、`adopted_record_id` 与 `origin_candidate_id` 互指。`resolved` 只证明引用完整；能否新挂还看 `link_state`，保护下限还看原件隐私与 sticky。
- `unresolved`：任何指针存在却解析不完整——document 行缺失（悬空）、跨 subject、候选/run 缺失、run 与候选 document 不一致、互指只写一侧；**或指针已丢但保留原件痕迹**（`fileId` null/键缺失而 `original` 非空或 `source` 含“原件：/原件已移除”，`source_kind='document'`）。新建议题返回 `source_unresolved`/`cross_subject_reference`，不得落库；候选置 `unknown`+`needs_review`、不可采纳；已有记录 `source_locked=true` 按 `unknown` 受保护，不得 release 或降为 `not_private`。**不得把悬空/跨 subject 当成“没有来源”改走 manual，也不得用 NULL 指针洗白；反之也不得把原本手工、从未有原件的记录标成 unresolved。**

**`source_kind` 的最小语义**：至少区分 `manual`（本人明确声明无原件）与 `document`（来自/曾关联原件）。`manual` 不得携带 `source_document_id`（DB CHECK），`document` 而无指针一律按 `unresolved` 读取；两者都不是隐私状态，不能用来绕过 `source_locked` 或 `link_state` 限制。迁移按 `original`/`source` 的原件痕迹写入，不得把痕迹当结构外键，也不得丢弃 `source_text`。

**挂接资格与保护（`link_state` 四态，X-02）**：

| `link_state` | 含义 | 可新挂 | 保护下限 |
|---|---|---|---|
| `unverified` | 已登记、本次会话尚未重新核对（默认） | 允许 | 按 `privacy_state`/`privacy_ever_private`，不看链接态 |
| `verified` | 最近一次会话核对成功，已更新 `last_verified_at` | 允许 | 同上；`verified` 不解除任何锁定、不代表跨会话可打开 |
| `missing` | 最近一次核对失败（找不到/大小或哈希不符），登记行保留 | 拒绝：`document_missing` | 隐私可判定则按当前状态；不可判定→`unknown` |
| `removed` | 用户显式移除登记，`removed_at/by` 有值，原文件不删 | 拒绝：`document_removed`；不得自动复活 | 已知 `not_private` 且 `ever=0` 不因移除本身受保护（只把对外投影置 NULL）；`unknown` 或 `ever=1` 未 release → `unknown` |

`link_state` 不改变 `privacy_state`/`privacy_epoch`/`privacy_state_seq`，也不进入 `source_floor`；任何 `active` 值都是非法枚举，按失败关闭处理，不得猜成 `verified`。

**来源下限与目标状态**：`source_floor(record_id, d)` 与 `attach_state(current, d)` 的唯一实现见 §4.1；本节只约束调用方式：

```text
attach_state(current, d) = strongest(current, source_floor(record_id, d))
# strongest: private > unknown > not_private；只升不降
```

`unknown` 或链不可解析时 `validation_state='needs_review'`；`private`/`not_private` 不因本规则自动标待核。新记录（`record.create`）尚无 `record_id` 时，`resolve_source` 按请求传入的来源指针判定，`release_active` 一律 false（新记录没有历史 release），其余按 document 自身状态计算。

**写入规则**：

- `record.create`：初始修订按 `attach_state('not_private', d)` 写入；若请求显式写 `not_private` 而目标是 `private`/`unknown`，返回 `privacy_locked`，不得先写公开再靠读时过滤。无 document 指针且无候选指针时，必须显式 `source_kind='manual'` 才可走 `no_file`；否则 `source_kind_required`，不得把“没填来源”默认成手工。
- `candidate.adopt`：初始修订按 `attach_state(candidate.privacy_state, d)`；代理再以 `unknown` 为下限（候选 `private` 仍为 `private`），`privacy_origin='proxy_default'`；同时写 `record.origin_candidate_id=candidate_id` 与 `candidate.adopted_record_id=record_id`，两项互指。
- `record.attachSource`：**仅 self**；document 必须存在、同 subject、`link_state ∈ {unverified,verified}`（`missing`→`document_missing`、`removed`→`document_removed`）；新修订保留正文/日期/类型，只更新 `source_document_id`/`source_text` 与按上式计算出的保护；提高保护时 `change_kind='privacy'`，否则 `change_kind='correction'`；`privacy_origin='inherited_document'`；只能提高或保持，不能降低；请求携带 `privacy_state`/`not_private` 选择 → `privacy_changed`；必须带 `expected_data_version`/`expected_current_revision_no` 并在事务内重读。
- `record.correct`：若新来源使 `attach_state(current, d)` 高于当前，返回 `privacy_locked`，要求先由本人 `record.attachSource`；来源干净且不抬高时可随内容更正写入，但仍不得改隐私。
- `record.restoreRevision`：复制目标来源；若目标来源按 `attach_state` 会抬高保护，返回 `privacy_locked`；不得借恢复挂新来源。
- `document.setPrivacy` 传播导致的保护提升按 §4.6；它是对已有链的传播，不是“新挂”。

**为什么不是只靠 `source_chain`**：链派生能挡住读，但存储里仍是 `not_private`，会与 INV-06 冲突，并让后续 release/setPrivacy/导出选择在“看起来公开”的状态上做判断。新挂写入保护后，`source_chain` 只处理历史遗留、损坏、并发窗口和未重新写入的旧修订，不是正常写入路径的唯一防线。

**未实现**：`record.attachSource` 命令、`attach_state`/`source_floor`/`resolve_source` 函数、`link_state` 校验、迁移修复与 V-46/V-50/V-51 均未实现；本版只定义合同，不声称 UI 或服务端已按此工作。

## 5. 事实、修订与日期

### 5.1 记录身份与修订

`record` 只放稳定身份：

- `record_id`：随机稳定 ID（UUIDv7/ULID），创建后不复用；
- `subject_id`、`kind`、`author_state`、`author_actor_id`、`on_behalf_grant_id`、`origin_candidate_id`、`legacy_ref`、`created_at`、`lifecycle_state`。

`record_revision` 放完整版本：

- `revision_no` 从 1 递增，`(record_id, revision_no)` 唯一；
- 内容字段是**全量快照**，不是 diff；患者记录体量小，全量快照更易回放和校验；
- `base_revision_no`：本次编辑基于哪一版（用户打开编辑时的版本）；首版为 NULL；
- `merged_from_revision_no`：若保存时当前版本已前进，但双方未改同一字段，记录合并所基于的当前版本号；无合并时为 NULL；
- `changed_fields_json` 只用于展示“这次改了什么”（记录**实际应用**的字段），不作为回放依据；
- `change_kind`：`initial`、`correction`、`privacy`、`import_adopt`、`migration`、`legacy_import`、`restore`；
- 当前版本 = `MAX(revision_no)`；不另设可变的 `current_revision_no` 缓存，避免指针与历史不一致。

**历史编号与当前自检（X-01）**

- **规范编号**：`revision_no` 从 1 连续递增；历史 = **1..N（老→新）**，当前内容 = **N+1 = `MAX(revision_no)`**，全记录恰好 N+1 条，不跳号、不重复。`current_revision_no` 不缓存。无历史时 N=0、当前即第 1 版。
- **历史列表**：本人视图的“变更历史”只列 1..N，按编号升序（老在上或新在上由 UI 决定，但编号方向不变）；当前内容单独显示为“当前版本（第 N+1 版）”，**不得把当前内容再追加成一条历史**。原型 `history[]` 的 push 顺序就是老→新；不得按日期重排，除非 payload 明确声明顺序不同。
- **写入自检**：追加后必须在同一事务断言 `new.revision_no = 当前 MAX + 1`、总数 = 上一总数 + 1、无重复，且新修订的内容字段与规范化后的提交逐字段相等；失配返回 `revision_self_check_failed` 并回滚，不留下“内容已存、编号错位”的修订。
- **读取自检**：渲染当前内容前，必须确认它来自 `revision_no = MAX` 的那一版，且该版字段与记录当前展示字段一致；失配不显示为正常当前值，按 `needs_review` 失败关闭并提示“当前版本校验失败”，**不得回退去显示历史最后一项**。
- **迁移自检**：`history[i]`（i 从 0 起，老→新）→ `revision_no=i+1`；当前内容 → `revision_no=len(history)+1`；不得把当前写成 1、历史写成 2..N+1。迁移后断言编号连续、当前 = MAX、当前字段等于 payload 当前字段。
- **非本人视图**：规范编号不返回；只对可见的 `not_private` 修订按可见集重排显示序号 1..M，响应与“本来只有 M 条”不可区分；不得用规范 `revision_no` 暴露空洞（T-05）。

更正规则：

- 任何内容字段变化都追加新修订；不允许 UPDATE 旧修订。
- **乐观并发 + 字段级合并**：保存必须带 `base_revision_no`，不得只带“最新值覆盖”。服务端把提交字段与基修订、当前修订做三方比较；只有同一字段在“基→当前”和提交里都变了才冲突，未改字段不阻塞保存（算法见 §9.4 `record.correct`）。合并只作用于内容字段，**隐私字段不参与**。
- 合并后结果与当前版本完全一致时返回 `no_change`，不产生空修订。
- **隐私变化不参与合并，且 `record.correct` 无写隐私能力**：请求不得携带 `privacy_state`/`privacy_origin`；携带或企图改变，直接 `privacy_changed`；当前修订的隐私与基修订不同，也返回 `privacy_changed`，要求用户重新查看当前隐私状态。即使 `source_locked=false`，也不得借更正写成 `not_private` 或任何其他隐私状态；**降低/选择隐私的唯一入口是 `record.setPrivacy`；§4.7 `record.attachSource` 只能在挂入更受保护来源时强制提高**。`record.restoreRevision` 同样只恢复内容，不恢复目标修订的隐私。
- **来源链不随新修订消失**：新修订更换 `source_document_id` 必须按 §4.7 解析并写入保护；清空当前指针只影响投影，该 record 的所有历史修订仍参与 §4.1 `source_chain()`；删当前指针不是“解除保护”（解除流程见 Q-27）。因此“当前修订来源干净”不等于整条记录可公开。
- 旧版本正文的可见性按第 4 节；公开历史默认可见，私密/未知历史默认只给元数据。
- 记录不做物理删除；`lifecycle_state='deleted'` 是软删除，读模型排除，导出/审计仍能解释“曾存在”。硬清除是单独的、需明确同意的流程，见 Q-04。

**版本恢复（`record.restoreRevision`）不得洗白**：

- 只能由 `subject.self_actor_id` 调用；代理、`system`、`demo_unverified` 一律 `not_authorized`，且拒绝响应不得暴露目标修订是否存在。
- 目标修订必须属于同一 `record` 且在同一 subject；跨 subject/跨记录一律 `revision_not_found`。
- 只恢复内容字段，**不恢复目标修订的 `privacy_state`/`privacy_origin`，也不改变当前记录隐私**；新修订的 `privacy_state` 取当前记录修订的 `privacy_state`，恢复命令不接受隐私参数。
- 若目标修订按 `protected(rev,'revision')` 的保护等级**高于**当前记录（`private` > `unknown` > `not_private`；例如目标 `private` 而当前 `not_private`/`unknown`，或目标 `unknown` 而当前 `not_private`），返回 `privacy_locked`：不得把更受保护的旧文恢复进保护更弱的记录，也不得借恢复抬高隐私。只有目标等级不高于当前时才允许恢复；新修订仍取当前隐私，因此既不会洗白，也不会绕过 `record.setPrivacy` 改隐私。
- 新修订必须保留目标的来源指针：`source_document_id`、`source_text` 随内容复制；新增 `restored_from_revision_id` 指向目标修订，供审计追溯。不得在恢复时清空来源，否则等于把私密来源的正文洗成无源内容。
- 恢复产生 `change_kind='restore'` 的新修订，不删除、不改写目标或任何历史修订；`restored_from_revision_id` 本身也进入来源链审计（来源链仍按 §4.1 的历史修订指针计算）。

**恢复的事务与版本前置（W-03）**：

1. `BEGIN IMMEDIATE` 后**重新读取** `record`、当前修订、目标修订和 `subject.data_version`；不得使用命令开始前缓存的“当前版本/目标隐私”做判断。命令必须带 `expected_data_version` 与 `expected_current_revision_no`；任一与事务内重读不一致，分别返回 `stale_data_version`/`stale_revision`，不得自动重试或按旧值继续。
2. 在锁内重验身份（仅 self）、目标仍属于同一 `record`/subject，并重新计算 `protected(target,'revision')` 与当前记录隐私。目标保护等级高于当前 → `privacy_locked`；目标修订在等待锁期间被删除/改写（本模型不允许改写，但损坏库可能）→ `revision_not_found`。
3. 按 §4.7 重算恢复后来源的 `attach_state(current, target_source)`；若会抬高保护 → `privacy_locked`。不得因为命令开始时目标来源是公开的就跳过这一步。
4. 追加新修订（内容取目标，隐私取事务内当前记录），写 `restored_from_revision_id`；同一事务 `subject.data_version += 1`。若恢复后内容与当前修订完全一致且来源不变，返回 `no_change`，不产生空修订、不递增版本。
5. 若内容变化影响已生成 artifact，同一事务把包含该 record 的 artifact 置 `stale`，并写 `status_data_version=新 data_version`；只有隐私变化才置 `quarantined`。任一步失败整体回滚，不得留下“已经恢复内容、版本未变”或“artifact 仍 ready”的状态。
6. 恢复与传播/更正并发时按 §9.6 锁序等待；等待后必须重读，不能用基修订合并绕过。上述事务行为**尚未实现、未测试**，V-45 未执行前不得声称已满足。

### 5.2 日期合同

每个日期位置都使用三件套：

| 字段 | 类型 | 规则 |
|---|---|---|
| `*_date` | `TEXT NULL` | `day` 为 `YYYY-MM-DD`；`month` 为 `YYYY-MM`；`unknown` 必须为 `NULL` |
| `*_precision` | `TEXT NOT NULL` | `day` / `month` / `unknown` |
| `*_raw` | `TEXT NULL` | 原始输入或旧值，如“2019 年初”“2026-02-30”“不详” |

适用位置：`occurred_*`（开始/采样/记录日）、`end_*`（结束日）、`review_*`（拟复查日）、`report_*`（报告日）。

规则：

- 日必须是真实公历日；`2026-02-30` 不得被 `date()` 归一化成 `2026-03-02` 后存成事实日。无法验证时：`date=NULL`、`precision='unknown'`、`raw` 保留、`validation_state='needs_review'`。
- 月只存 `YYYY-MM`，不得写成 `YYYY-MM-01` 当事实；读模型排序可以计算 `sort_key`，但必须带“仅月份”标签，且不得与具体日混排。
- 未知不参与按日排序；列表把“日期未知”单独分组。不得用今天、文件时间、导入时间、治疗时长反推。
- 年份输入边界 1900–2100 是原型策略，不是临床结论；超出范围的旧值保留 `raw` 并标待核，不静默截断。是否保留该边界见 Q-05。
- `created_at`/`consented_at`/`decided_at` 等事件时间是 UTC 瞬时时间（ISO 8601 `Z`）；`occurred_date` 是本地民用日期，不做时区换算。跨时区旅行/记录见 Q-13。
- **字节规则**：日期列只接受定长 ASCII（`YYYY-MM-DD` 10 字节、`YYYY-MM` 7 字节），瞬时时间 20 字节 `YYYY-MM-DDTHH:MM:SSZ`；校验必须同时看字符数与字节数（`length` 与 `length(hex(...))`），拒绝全角数字、组合字符、尾随空格与非 ASCII 分隔符。存储层按 UTF-8 字节比较，不依赖 SQLite 的字符计数。具体 CHECK 与未覆盖列见 §9.3/V-31。
- 同一天多个点、同日并列、非数值、跨单位/方法/机构，均不得连成趋势或计算差值；这是 `metric-model.js` 已实现的约束，生产读模型必须继承。

### 5.3 记录类型

原型有“发作记录/当前用药/医嘱记录/血管资料/消化症状/消化道检查/资料库/问题清单”等 kind；生产不按页面建表，而用一套稳定 kind + 少量提升列 + 受版本约束的 `details_json`。

| 规范 kind | 原型来源 | 提升到修订列的字段 | `details_json` 示例 |
|---|---|---|---|
| `episode` | 发作记录 | started/ended、body_system | `site_text` |
| `symptom` | 症状记录、消化症状 | occurred、body_system | `symptom_text`（正文仍在 `text`） |
| `treatment` | 当前用药 | started/ended、ongoing | `drug_text`、`dose_text`、`cycle_text` |
| `advice` | 医嘱记录 | occurred、review_date | `proposer_text` |
| `check` | 血管资料、消化道检查、用药前检查 | occurred、report_date、body_system | `check_name_text`、`purpose`（`diagnostic/pre_treatment/follow_up/unknown`）、`department_text` |
| `note` | 资料库 | occurred（可未知） | `department_text` |
| `question` | 问题清单 | occurred（可未知） | 无 |
| `life_impact` | 心理与家庭、工作·费用、生活影响 | occurred | `domain` |
| `observation` | 检验指标 | occurred、report_date、`metric_code`、`metric_definition_version`、`value_num`、`value_text`、`unit_code`、`method_text`、`laboratory_text`、`reference_text` | 无可变展示字段；参考区间原文在 `reference_text` |
| `event` | 治疗与事件节点 | occurred | `event_type`、`label` |

说明：

- “发作与病程”“发作回顾”“部位与愈合”“病情档案”“病情汇总”“变更与更正”是**页面/读模型**，不新增事实表；它们从 episode/symptom/check/revision 派生。
- “血管资料”不是单独事实类型，是 `check` + `body_system='vascular'`；“用药前检查”是 `check` + `purpose='pre_treatment'`。这样同一检查不会因为页面不同而存两份。
- “副作用与感受”目前只有原型 `pathwayDetail.ae` 的演示注释，不是已建模事实。生产是否新增 `side_effect` kind、如何表示“本人怀疑与某治疗有关”而不写因果，见 Q-06。
- `details_json` 只放非关系、非隐私决策的展示属性；必须有 `details_schema_version`、≤8 KiB、JSON Schema 校验；不得在里面存外键、权限、来源文件路径或第二份正文。查询/排序/关联需要用的字段必须提升为列。
- `record_kind` 用注册表（kind、label、detail_schema_version、status），新增 kind 是数据行变更，不一定触发表迁移；新增**提升列/关系/索引**才需要迁移。

---

## 6. 导入、原件与候选

### 6.1 原件登记（只登记，不复制）

对齐 `docs/SPEC.md`：登记原件只保存名称、大小、登记时间和私密标记；**原件内容不复制、不缓存**，数据根内不出现原件副本，也不持久化原件的绝对路径。

`source_document`：

- `document_id`、`subject_id`、`display_name`（原文件名，仅显示）、`byte_size`、`registered_at`、`last_verified_at`、`privacy_state`（同三态，默认 `unknown`）、`privacy_ever_private`（0/1，仅在变为 `private` 时置 1，之后不清零）、`privacy_epoch`（进入 `private` 的次数，初值 0）、`privacy_state_seq`（任何实际隐私状态变化 +1，初值 0；`unknown` 往返也递增）、`link_state`（`unverified/verified/missing/removed`）、`removed_at`、`removed_by_actor_id`；`mime` 与可选 `sha256` 只用于识别，不是原件内容。SPEC 要求“名称、大小、登记时间、私密标记”，这些字段是其超集，仍不复制、不缓存内容。`privacy_ever_private` 是“曾经私密”的粘性标记，用于兑现“取消私密不自动公开记录”；它不是第二个当前隐私状态，读取当前状态仍只看 `privacy_state`。
- `link_state` **只表示“最近一次会话内核对的结果”**，不是“原件现在可达”的承诺，也**不是隐私状态**：`verified` 仅意味着上次核对成功，关闭/刷新后仍可能失效；读取界面必须显示核对时间（`last_verified_at`），不得把 `verified` 渲染成“已连接”或“可打开”。四态含义、可否新挂与保护影响如下（**没有 `active`**）：

| `link_state` | 含义 | 可新挂 | 对保护的影响 | 界面/投影 |
|---|---|---|---|---|
| `unverified` | 已登记，本次会话尚未重新选择核对（默认） | 允许 | 不改变隐私；保护只看 `privacy_state`/`ever`/`epoch`/`seq` | “尚未核对” |
| `verified` | 最近一次会话核对成功，`last_verified_at` 已更新 | 允许 | 不解除任何锁定，也不代表跨会话可打开 | “上次核对：<时间>” |
| `missing` | 最近一次核对失败（文件找不到、大小/哈希不符），登记行保留 | 拒绝：`document_missing` | 隐私可判定则按当前状态；不可判定→`unknown` | “原件未找到” |
| `removed` | 用户显式移除登记（`removed_at/by`），原文件不删、行不物理删 | 拒绝：`document_removed`，不得自动复活 | 已知 `not_private` 且 `ever=0` 不因移除本身受保护；`unknown`/曾私密未 release 仍按 `unknown` | “原件已移除/无原件”，对外来源投影 NULL |

- 读取/写入只接受上述四个值；任何 `active` 值都是非法枚举，按 §4.1 失败关闭，不得猜成 `verified`。`missing`/`removed` 不阻止已有关联的读模型按隐私状态解释，但**不得**作为新挂来源、也不得因“链接失效”自动把记录改成 `not_private` 或 `private`。
- `sha256` 可为 NULL：仅在用户显式同意时于内存读一次计算，用于再次选择文件时核对；**不缓存内容**，不计算也不阻塞登记。若用户拒绝读取，保持 NULL，重新打开时只核对名称/大小并在界面标明“未校验哈希”。
- 不存 `relative_path`、绝对路径、书签或可持久化的文件句柄。关闭/刷新后，工作台**无法自行重新打开原件**；重新打开只能由用户再次选择文件，并核对其名称/大小（有 `sha256` 时核对哈希）。这不是缺陷，是“不接管文件”的代价；界面必须如实写“原件在原位置，重新打开需你再次选择”。
- **重开只靠会话文件句柄**：用户在同一会话内重新选择文件后，运行时可在内存中保留一个 `FileSystemFileHandle`（或等价句柄）用于本次预览/再次读取；该句柄**不写库、不写 localStorage/IndexedDB、不进导出**，页面刷新或关闭即失效。句柄存在不等于隐私状态可信，读取前仍按 §4.1 判定。
- 记录只通过 `source_document_id` 做**出处/审计关联**，不是“可取回的文件引用”；不内嵌 `original:{title,text}`。原型里的 `original` 是合成演示副本，生产不得沿用，也不得把 `source_document_id` 当文件路径直接 `open()`。
- 同一 `display_name + byte_size` 可重复登记；UI 提示“可能同一文件”，是否合并由用户确认，不自动合并。
- 未重新选择/未核对时 `link_state='unverified'`；用户重新选择并核对成功才置 `verified` 并更新 `last_verified_at`；核对失败置 `missing`。不得把“登记过”当成“现在能重新打开”，也不得把 `verified` 当成跨会话有效。
- 移除登记：`link_state='removed'`、`removed_at`、`removed_by_actor_id`；`display_name`/`byte_size`/`registered_at` 保留（审计需要），磁盘上的用户原文件不删除。`source_document` 行不物理删除。
- **移除只改关联投影，不改历史**：`record_revision.source_document_id` 保留原值（历史修订不可变）；读模型在 `link_state='removed'` 时把对外 `sourceDocumentId` 投影为 NULL（即 SPEC 所说 `fileId`/`original` 置空），界面显示“原件已移除”/“无原件”。不把文件名从历史里抹掉，也不删除用户手工填写的 `source_text`。
- 移除前若存在已采纳记录：界面必须提示影响条数并让用户确认；确认只影响投影，不删除记录。若原件被标为私密，移除后记录仍按受保护处理（§4.1 来源链在状态不可判定时按保护）。

### 6.2 解析与候选

流程固定为：

```text
登记原件 → 明确告知 → 患者显式同意（cloud_parse 如适用）
→ 解析 run → 候选（pending）→ 逐条采纳/丢弃 → 记录 + 来源
```

**字段统一与引用（W-01）**：`import_run` 与 `import_candidate` 都必须显式持有 `subject_id` 与 `document_id`，不从 `record` 或 `source_document` 反推 subject，也不把 `document_id` 只留在候选文本里。

| 表 | 必填字段 | 复合引用/一致性 |
|---|---|---|
| `import_run` | `import_id`、`subject_id`、`document_id`、`method`、`status`、`started_at` | `(document_id, subject_id)` → `source_document`；`document_id NOT NULL` |
| `import_candidate` | `candidate_id`、`subject_id`、`import_id`、`document_id`、`state`、`privacy_state`、`validation_state` | `(import_id, subject_id)` → `import_run`；`(document_id, subject_id)` → `source_document`；`candidate.subject_id = run.subject_id`、`candidate.document_id = run.document_id` |
| 采纳互指 | `record.origin_candidate_id`、`candidate.adopted_record_id` | 两列必须互指；`record.subject_id = candidate.subject_id`；候选 `state='adopted'` 且 `adoption_state='resolved'` 才算采纳完成 |

这些字段是**显式列**，不是 `details_json` 里的可选键。`import_candidate.document_id` 是创建候选时冻结的来源快照：即使以后 `import_run.document_id` 被修复/迁移改变，也必须先通过迁移校验并同步候选，否则按 `source_unresolved` 失败关闭，不得静默取 run 的值继续。

- `import_run`：`import_id`、`subject_id`、`document_id`、`method`（`local_mock/local_ocr/cloud`）、`service_name`、`consent_id`、`status`、`parser_version`、`started_at`、`finished_at`、`error_code`。云解析 run 必须绑定 `consent_event`，且**失败关闭顺序固定**：`import.start` 先校验 `cloud_parse` consent（类型匹配、self 签发、未撤回、document/subject 与本次一致），通过后才允许创建 run、上传字节、创建候选；缺失或无效立即 `consent_required`，**零副作用**（无 run 行、无上传、无候选、无 `tmp/` 正文）。不得“先建 run 再等同意”，也不得在 run 失败后保留半条记录。`method='cloud'` 时 `import_run.consent_id` 必须非空（DB CHECK），`local_mock/local_ocr` 可为 NULL。
- **不另存整份解析全文**：解析结果只以候选行存在（候选本身即“可确认的文本”，`proposed_text` 按候选生命周期持久化）；除候选外不另存整份解析文本/OCR 全文，`manifests/import/<id>.json` 只存 run 元数据、文件元信息、计数与状态，**不存正文、不存候选文本、不存原件路径**。若某解析器必须落中间产物，只能写会话级 `tmp/`（§8.1），退出即清，且不得被备份/导出/日志采集。
- `import_candidate`：`candidate_id`、`subject_id`、`import_id`、`document_id`、`ordinal`、`proposed_kind`、`proposed_date/precision/raw`、`proposed_text`、`details_json`、`state`（`pending/adopted/discarded/withdrawn`）、`privacy_state`、`privacy_origin`、`validation_state`、`adoption_state`（`resolved/unknown`）、`adopted_record_id`、`decided_at`、`content_purged_at`。**运行时候选创建即 `adoption_state='resolved'`、`state='pending'`、`adopted_record_id=NULL`（明确“尚未采纳”，不是关系不明）；只有迁移无法判定旧采纳关系时才写 `unknown`。**
- **候选隐私在创建时派生，不是“跟着记录当前值”**：
  - 原件当前 `private` → 候选 `private`，`privacy_origin='inherited_document'`，`validation_state='ok'`；
  - 原件当前 `unknown` 或原件行缺失/不可解析 → 候选 `unknown`，`privacy_origin='inherited_document'`（缺失时 `legacy_unknown`），`validation_state='needs_review'`；
  - 原件当前 `not_private` 且 `privacy_ever_private=0` → 候选 `not_private`，`validation_state='ok'`；
  - 原件当前 `not_private` 但 `privacy_ever_private=1` → 候选 `unknown`，`validation_state='needs_review'`。**曾私密的原件不能因为当前改回公开，就让新候选自动变成公开**；候选级没有 release，必须先采纳成 record，再由本人逐条 `releaseSourceLink`。
  - 派生不写“默认 not_private”；任何无法判定的分支都落 `unknown`。
- **缺失/不一致的候选来源失败关闭**：候选的 `subject_id`/`import_id`/`document_id` 任一缺失、`import_id` 不存在、`document_id` 不存在、`import_run.document_id ≠ import_candidate.document_id`、`import_run.subject_id ≠ import_candidate.subject_id`、`source_document.subject_id ≠ import_candidate.subject_id`，或 `record.origin_candidate_id` 与 `candidate.adopted_record_id` 不互指时，候选一律 `unknown` + `validation_state='needs_review'`，并**禁止采纳**（`source_unresolved`；跨 subject 为 `cross_subject_reference`）。不得因为候选文本看起来完整就生成无源事实。**v1 明确要求 `subject_id`/`import_id`/`document_id` 非空，因此缺失来源时整批迁移必须失败关闭并保留现场，不存在“落 NULL 候选后待补”的路径；不得为满足 NOT NULL 伪造 ID、占位行或从别的表猜 subject。** 这是 Q-31 的阻塞点，不是“迁移成功但待补”。
  - 只有本人可以显式选择“转为手工记录”：创建 `source_kind='manual'`、`source_document_id=NULL` 的新记录，并在界面写明“不再关联原件/解析 run”；不得由代理静默转换，也不得把原候选直接改成 `not_private` 绕过。
- 原件隐私变化时，`pending` 候选按 §4.6 传播：转 `private/unknown` 时取“原状态与新状态的较强者”，转回 `not_private` 时**不自动解除**，保持原状态。候选自己的 `privacy_state` 不因采纳而被“洗白”。
- 采纳：候选 `adoption_state` 必须为 `resolved`；若为 `unknown`（迁移未判定），返回 `adoption_unresolved`，先由本人/迁移报告人工映射，不得按文本猜。在单个事务中创建 `record` + 初始 `record_revision`（`change_kind='import_adopt'`），写 `record.origin_candidate_id=candidate_id`，把候选置 `adopted` 并写 `adopted_record_id=record_id`（两列互指必须同事务校验）；同一 `request_id` 重放返回同一记录。初始修订按 §4.7 `attach_state(candidate.privacy_state, d)`，且**不得低于**候选与来源：候选 `private/unknown` → 记录至少同态；候选 `not_private` 但原件的当前状态/粘性使其受保护时，强制写 `unknown` + `validation_state='needs_review'`，不得写 `not_private`。**只要调用者是代理，初始修订以 `unknown` 为下限（候选 `private` 仍为 `private`），`privacy_origin='proxy_default'`；必须有有效 grant 覆盖 `kind` 与日期（未知日期需 `allow_unknown_date`）；候选/run/document 任一无法解析、跨 subject 或 document 不一致时直接 `source_unresolved`/`cross_subject_reference`，代理不得采纳。** 候选文本只是来源，不是第二份事实。
- **采纳后的作者状态（X-05）**：`candidate.adopt` 生成的 `record` 必须显式写作者：self 调用 → `author_state='known'`、`author_actor_id=subject.self_actor_id`；proxy 调用 → `known` + proxy actor + 覆盖该记录的 `on_behalf_grant_id`；迁移/旧库导入且 payload 没有作者证据 → `author_state='unknown'`、`author_actor_id=NULL`、`on_behalf_grant_id=NULL`，不得默认填成本人或 `system`。候选本身不存作者，不能拿“候选由谁导入”推断记录作者。
- 丢弃：`state='discarded'`，清空候选正文与 `details_json`，保留 tombstone 供审计；不得在页面、缓存、日志留正文。不影响已采纳记录。
- **撤回解析 run**（`import.withdraw`）：停止该 run、把 `pending` 候选置 `withdrawn` 并清正文、删除会话 `tmp/` 下该 run 的任何中间产物；`manifests` 本来就只有元数据，改为记录 `withdrawn_at` 与计数。**已采纳记录及其 `source_document_id`、手工 `source_text` 一律保留**，不按“移除原件”处理，也不改历史。审计只记 run/候选的 ID、状态、时间与计数。撤回后若用户还要删来源，必须另走“移除原件”并再次确认。
- 云解析的留存/删除：只记录“本地已知”的事实；服务方侧是否删除未核实，界面和审计都不得写“已从服务器删除”。产品侧不缓存原始文件；整份解析文本默认不另存（候选 `proposed_text` 除外），撤回时清会话临时产物。

---

## 7. 指标、事件与读模型（单一源）

### 7.1 指标

- `metric_category`：`category_id`、`name`、`display_order`、`version`。
- `metric_definition`：`metric_code`（稳定）、`version`、`display_name`、`category_id`、`value_type`（`numeric/text`）、`unit_family`、`display_order`、`status`、`source_note`。主键 `(metric_code, version)`。
- 观测是 `record(kind='observation')` + `record_revision`；修订里存 `metric_code`、`metric_definition_version`、`value_num`、`value_text`、`unit_code`、`method_text`、`laboratory_text`、`reference_text`、采样/报告日期。
- `value_num` 只允许精确数值；`<0.5`、`未检出`、`1+` 等放 `value_text`，`value_num=NULL`，**不解析、不近似、不换算**。
- 可比组 = 每个点自己的 `(unit_code, method_text, laboratory_text)`；缺失即“未知组”，不得与其他组合并。单位/方法/机构变化只拆组，不做换算。
- 单点不连线；同日多点、非数值、跨组交错都断开线段；`delta` 仅在最近两点唯一、数值、同组且中间无其他组点时计算，否则为空。UI 只并列数值，不判断好坏。
- 新增常规指标只插入 `metric_definition`，不改表；新增单位族/值类型/关系/索引才迁移。

### 7.2 事件

`event` 是 `record` 的一种 kind，不是独立事件数组。事件带 `event_type`、`label`、日期精度、来源、隐私。治疗条与事件条分层是 UI；数据层不把事件塞进治疗记录，也不复制到独立 `BEIPAL_EVENTS` 表。

原型 `BEIPAL_EVENTS` 与 `BEIPAL_METRICS` 是页面合成数组；生产读模型必须从 `record` 生成，避免“记录改了、事件没改”的漂移。

### 7.3 读模型

至少这些版本化投影：

| 读模型 | 输入 | 输出 | 版本 |
|---|---|---|---|
| `dashboard@v1` | 当前 subject 记录 | 计数、最近记录、待办提示 | `read_model_version=1` |
| `timeline@v1` | 记录 + 日期精度 | 日/月/未知分组、事件泳道 | 1 |
| `metrics@v1` | observation + definition | 序列、可比组、断点、delta | 1 |
| `pathway@v1` | treatment 记录 + observation | 每治疗记录一阶段的五块内容 | 1 |
| `visit@v1` | 选择集 + 记录修订 | 预览/导出条目 | 1 |

规则：

- **每个读模型调用同一个 §4.1 实现，但按输出显式传 scope**：当前记录/列表/计数/导出候选/AI/代理用 `protected(..., 'record')`（含历史来源链与候选派生）；历史修订正文用 `protected(rev, 'revision')`（只看修订自身状态，不回溯链）；**出站（AI 请求、导出、artifact 构建与再次下载）必须调用 `output_protected(record_id, revision_no)`，同时校验选中修订与 current record 两个 scope，任一受保护即拒绝**。不得各自写简化判定，也不得用 `record` scope 去隐藏公开历史（`revision` scope 只用于历史展示，不能作为出站放行依据）；投影可缓存判定结果，但缓存键必须含 `subject_id`、`data_version`、`read_model_version`、`viewer_actor_id`、记录当前修订号与授权 scope 版本，隐私/链/release 变化后失效。
- 所有读模型返回 `subject_id`、`viewer_actor_id`、`viewer_kind`、`data_version`、`read_model_version`、`generated_at`。
- **viewer 过滤在投影内完成**：`viewer='proxy'` 时，受保护记录不进入计数、列表、时间线、指标、事件泳道、导出候选，也不返回占位或“N 条已隐藏”。计数是“代记者可见集”的计数，不能与本人计数对账。
- `data_version` 是 subject 级单调递增整数；任何影响读模型的事实/隐私/授权/文件状态（含 `source_document.privacy_state`、`privacy_state_seq`、`link_state`、`access_grant` 的创建/撤销/范围变化、`import_candidate` 采纳/丢弃、`record.origin_candidate_id`/`candidate.adopted_record_id` 修复、`artifact.status`/`contains_private` 变化）变更都在**同一事务**递增。`import_candidate` 的纯文本编辑若不进入读模型，可不递增；一旦影响 `pending` 计数/可采纳性，必须递增。
- 缓存只能作为可重建投影；**缓存键必须包含 `subject_id + data_version + read_model_version + viewer_actor_id + 授权 scope 版本`**，缺任一键的条目一律丢弃。缺少 viewer 的缓存条目一律丢弃；**不同 subject 的缓存、本人视图与代理视图缓存不得互用**（代理缓存只能服务同一 `viewer_actor_id` 且授权仍有效的请求）；授权范围变化必须递增 `data_version`，使旧缓存失效。不得把本人视图缓存回给代记者。
- 同一 `data_version`、同一 viewer 下，看板计数、时间线条目、导出候选必须能对账；对不上就是读模型 bug，不是“页面差异”。
- 摘要预览是 `visit@v1` 的临时视图，不是独立表、不是产物；不落库、不单独存储，与导出共用同一选择集。只有用户确认生成时才写 `artifact`。
- 审计与授权页默认只对 self 展示；代理视图不返回 `audit_event` 中受保护记录的 ID、计数、旧/新隐私状态，避免从审计侧泄露存在性。
- 导出产物同样按 viewer 过滤：含受保护 `artifact_item` 的 `artifact` 对代理不可见、不可下载，也不返回“有 N 个导出”的计数；代理只能看到完全由可见记录生成且未含 `included_private=1` 的产物。**artifact 下载不是一次性构建快照：每次下载/再次导出都必须重新调用 `output_protected` 逐条校验并重算 `contains_private`；构建后被保护或来源链变化的产物置 `quarantined`，不可下载、不可分享，需本人重新确认后重建。`contains_private=1` 的产物中，每个 `included_private=1` 条目各需一条新的、匹配该条 `(record_id, revision_no)` 的 `private_export` 同意；旧同意不跨下载复用，一条同意不得覆盖多个条目。**
- 治疗阶段不推断阶段名/疗效/因果；每条治疗记录一阶段，按开始日稳定排序；日期未知的治疗记录不归入有日期的阶段。`pathwayDetail` 的影像/副作用/支持内容若来自真实记录，必须是独立记录并带来源；不能继续作为治疗记录里的匿名嵌套文本。

**`data_version` 与产物隔离一致（W-05）**：

- **递增一次**：传播、采纳、恢复、隐私变更、来源更换、授权变化、产物状态变化在各自批内只递增一次 `subject.data_version`；不得逐条记录递增，也不得先提交事实再异步补版本。
- **同事务写产物状态**：受影响 artifact 的 `status`（`ready`/`stale`/`quarantined`）、`contains_private`、`quarantine_reason` 与 `status_data_version=新 data_version` 必须和事实/隐私变更同事务提交。任一条更新失败 → 整批回滚，不允许“先提交、后台再隔离”。
- **`status_data_version` 不是放行凭证**：它只证明最后一次状态判定发生在哪个版本；下载仍逐条重判 `output_protected` 与 `private_export`。即使 `status='ready'` 且 `status_data_version` 看似不旧，只要任一 `artifact_item` 的 `checked_privacy_epoch`/`checked_document_state_seq` 与当前来源不一致，或 `contains_private` 重算与存储值不同，就按受保护失败关闭（`artifact_quarantined`/`artifact_stale`），不得放行。
- **构建**：`artifact.source_data_version` 记录构建时版本；构建事务结束前把本次构建的 `status_data_version` 写为同一版本。构建后事实变化不修改已冻结的正文/条目，只改状态与 `status_data_version`。
- **迁移/恢复**：迁移导入的 artifact 若无法确定 `status_data_version` 或 `contains_private`，置 `quarantined`（原因 `migration_unknown`），不得默认 `ready`；恢复旧备份时同样，不因“旧版本看起来没问题”放行。V-47 未执行前，不能声称以上同事务语义已验证。

---

## 8. 数据目录、文件与备份

### 8.1 真实数据目录

- 首次使用由用户**显式选择**目录；没有默认路径、不从用户名/项目名推断、不静默创建。
- 目录为空或只有本工作台 marker 时才可直接初始化；非空目录必须让用户确认“在此建立”，不得覆盖已有文件。
- 根目录 marker：`<root>/.behcet-workbench.json`，内容至少 `{workspaceId, schemaVersion, createdAt, appVersion}`。marker 的 `workspaceId` 必须与库内 `workspace.workspace_id` 一致；不一致拒绝打开，不自动“修复”。
- 应用设置保存“当前根路径”；库内**只**为工作台自己管理的文件存相对路径。移动整个目录后，marker + 库 ID 仍匹配即可继续使用，不需要批量改路径。
- 卸载应用不删除数据根；安装器/升级器不得把业务数据写进安装目录。
- **原件不进入数据根**：不复制、不缓存、不建 `input/` 原件副本。用户原件留在其原位置；工作台只登记元数据。若将来要支持“复制进库”，那是另一种产品承诺，需单独 G3 决定、迁移与告知（Q-17），不属于本版合同。

建议布局：

```text
<root>/
  .behcet-workbench.json
  workspace.sqlite
  tmp/session-<id>/<run-id>/<scratch-file>   # 会话临时，退出/启动清理
  output/YYYY/MM/<artifact-id>/<export-file>
  manifests/import/<import-id>.json
  backups/<UTC-timestamp>/
  tmp/
```

- **没有 `input/`，也没有持久的 `parsed/`**：原件二进制不复制；整份解析全文默认不另存（§6.2），候选 `proposed_text` 按候选表持久化，解析器所需的中间产物只能写 `tmp/session-<id>/`，会话结束、应用退出与下次启动时清理，且不进入备份/导出/日志。`output/` 正式产物；`manifests/` 导入清单（只元数据，不含原件内容或候选文本）；`backups/` 一致性备份；`tmp/` 原子写与会话临时区。若将来要额外持久化整份解析全文，必须单独立项（Q-17）并先证明它不构成第二份原件内容。
- 路径校验：拒绝绝对路径、`..` 段、NUL、Windows 盘符/UNC；`realpath(join(root, rel))` 必须以 `realpath(root) + sep` 开头；符号链接解析后再校验。写文件前再次校验，防止 TOCTOU。该规则只适用于上述受管理路径；原件路径不落库。
- 数据库与私密文件的操作系统权限、加密见 Q-02。当前不声称加密。

### 8.2 备份与恢复

- 运行中备份用 SQLite backup API 或 `VACUUM INTO`，不能只复制 `workspace.sqlite` 而漏掉 WAL。
- 备份包含库 + 工作台管理的持久文件（至少 `output/`、`manifests/`）；**不包含 `tmp/`**（会话临时/解析中间产物），也不存在可备份的 `parsed/`；生成 manifest（文件相对路径、sha256、大小）。
- **备份不包含原件**，因为原件从未被复制进根。备份清单只记原件的 `document_id`、`display_name`、`byte_size`、`sha256`（若曾计算）与 `link_state`，用于提示“这些原件需你另行保管/重新选择”；不得声称备份可恢复原件。
- 迁移前必须备份；备份后做 `PRAGMA integrity_check`、`PRAGMA foreign_key_check` 与关键表计数。
- 恢复演练：把备份复制到**新目录**，校验 marker/ID、schema 兼容区间、`integrity_check`、`foreign_key_check`、关键计数，再切换；不得在原目录上“边恢复边覆盖”。恢复后原件仍为 `unverified`，需用户重新选择才能重新打开。
- 备份保留期、加密、异地副本未定，见 Q-14；恢复兼容窗口见 Q-22。

### 8.3 持久化选型与 SQLite 执行前提

候选 B：SQLite + 文件目录。理由：单机单用户、关系与时间序列查询、事务、修订历史、迁移可控、无服务端依赖。候选 A（纯 JSON）只适合设置/小规模原型；候选 C（嵌入式文档库）增加依赖且关系约束弱；候选 D（远端）与本地隐私边界冲突。

本文件不宣布 B 已选定：宿主 DSH Desktop 的 SQLite 运行时能力尚未核验，性能/并发也未测。G3 可先认可“B 为默认候选”，但建库前必须补运行时证据；见 Q-08。

一旦使用 SQLite，下列执行前提属合同（不是“实现细节”）：

- **外键**：SQLite 默认 `foreign_keys=OFF`。每个连接建立后立即 `PRAGMA foreign_keys=ON`，并查询确认值为 1；为 0 则拒绝执行任何业务查询/写入，不用“应用层自己校验”替代。
- **写并发**：单写者；写事务用 `BEGIN IMMEDIATE`。设置 `busy_timeout`，冲突时重试或返回可识别错误；不用“最后写入者赢”。
- **日志模式**：WAL 作为默认候选；`synchronous=FULL` 至少用于迁移与产物生成。具体参数在 Q-08 运行时探针中确认，不以本文件为已验证。
- **外键完整性检查**：启动时、迁移后、恢复后执行 `PRAGMA foreign_key_check`；有行即拒绝启动并保留现场，不自动删行“修复”。**重建表时必须在重建事务 COMMIT 之前执行该检查**：有行先 `ROLLBACK`，不得先提交再发现孤儿；`PRAGMA foreign_keys=OFF/ON` 只能在事务外切换，提交后再复核一次。
- **不使用 `ON DELETE CASCADE`** 删除记录、修订、审计、授权、候选 tombstone；关联表用 `RESTRICT`/`NO ACTION`，删除一律走显式命令与软删除。
- **STRICT 表**：可作为候选（SQLite ≥ 3.37），但宿主版本未核验，不作本版硬合同；见 Q-08。

---

## 9. 实体与字段合同

### 9.1 关系图

```text
subject 1──1 actor(self)
subject 1──* access_grant *──1 actor(proxy)
access_grant 1──* grant_scope
access_grant 1──* grant_read_entry *──1 record
subject 1──* consent_event
subject 1──* source_document
source_document 1──* import_run 1──* import_candidate
import_candidate 0..1──0..1 record        (record.origin_candidate_id = candidate.candidate_id
                                           且 candidate.adopted_record_id = record.record_id，同 subject)
subject 1──* record 1──* record_revision
record_revision *──1 source_document      (历史指针；移除后仍在)
record_revision *──1 metric_definition(metric_code, version)
record 1──* artifact_item *──1 artifact
subject 1──* audit_event
workspace 1──* schema_migration
actor 1──* command_receipt
```

### 9.2 关键表

| 表 | 主键 | 关键字段 | 关键约束 |
|---|---|---|---|
| `workspace` | `workspace_id` | `schema_version`、`app_version`、`created_at` | 单库单行；ID 与 marker 一致；schema 在应用支持区间内 |
| `subject` | `subject_id` | `self_actor_id`、`display_label`、`data_version`、`status` | `self_actor_id` 必须指向 `self` actor；`data_version` 单调 |
| `actor` | `actor_id` | `actor_kind`、`identity_state`、`display_label` | `proxy` 不得成为 `self`；`system` 不得授权/代记；未认证不得当授权依据 |
| `access_grant` | `grant_id` | `subject_id`、`grantor_actor_id`、`grantee_actor_id`、`read_mode`、`status`、`supersedes_grant_id` | 授权人=subject.self_actor_id；grantee=proxy；撤回后不可再写；不能降低隐私 |
| `grant_scope` | `scope_id` | `grant_id`、`record_kind`、`period_from`、`period_to`、`allow_unknown_date` | 时间范围可为空（不限）；同一 grant 内重复 scope 由应用拒绝；不用含可空列的复合主键 |
| `grant_read_entry` | `(grant_id, record_id)` | — | 仅 `read_mode='explicit'` 使用；受保护记录不进投影，勾选也不可见 |
| `consent_event` | `consent_id` | `subject_id`、`actor_id`、`type`、`target_type/id`、`scope_hash`、`granted_at`、`revoked_at`、`text_version` | 出站动作必须引用；不可覆盖历史；`ai_context` 不得包含受保护内容 |
| `source_document` | `document_id` | `subject_id`、`display_name`、`mime`、`byte_size`、`sha256?`、`privacy_state`、`privacy_origin`、`privacy_ever_private`、`privacy_epoch`、`privacy_state_seq`、`validation_state`、`link_state`、`registered_at`、`last_verified_at`、`removed_at/by` | **无路径列、无可持久化句柄列**；原件不复制；`privacy_ever_private` 只置位不清零（sticky）；`privacy_epoch` 初值 0，每次**进入** `private` 严格 +1（注册即私密从 0→1，不是“从 1 开始”）；`privacy_state_seq` 初值 0，任何实际状态变化 +1（同值不增），`unknown` 往返也递增；`unknown` 不预置 ever/epoch；`link_state ∈ {unverified,verified,missing,removed}`（无 `active`），只表示最近会话核对、不是隐私状态、不改变 `privacy_state`/`epoch`/`seq`；新挂只允许 `unverified/verified`，`missing/removed` 不物理删行、不改历史、不自动复活；缺失/非法旧标记必须落 `unknown` + `needs_review`，不得默认 `not_private`；`UNIQUE(document_id, subject_id)` 供 `import_run`/`import_candidate` 复合引用 |
| `source_link_release` | `release_id` | `subject_id`、`record_id`、`document_id`、`privacy_epoch`、`document_state_seq`、`released_by_actor_id`、`released_at`、`request_id` | `UNIQUE(record_id, document_id, privacy_epoch, document_state_seq)`；只增不改；只由 self 通过 `record.releaseSourceLink` 写入；只清该条 sticky，不改记录隐私；document 当前必须 `not_private` 且 `document_state_seq = source_document.privacy_state_seq`；`unknown` 原件不得直接 release，须先本人 `document.setPrivacy(not_private)`；旧 epoch 或旧 state_seq 的 release 保留但失效，`unknown` 往返后必须重新 release |
| `import_run` | `import_id` | `subject_id`、`document_id`、`method`、`consent_id`、`status`、`parser_version` | 云解析必须有 consent；`method='cloud'` 时 `consent_id` NOT NULL（CHECK），无 consent 不建 run、不上传、不建候选；撤回不动已采纳记录；`UNIQUE(import_id, subject_id)`；`(document_id, subject_id)` → `source_document`（复合外键）；`subject_id`/`document_id` 均 NOT NULL |
| `import_candidate` | `candidate_id` | `subject_id`、`import_id`、`document_id`、`proposed_*`、`state`、`privacy_state`、`privacy_origin`、`validation_state`、`adoption_state`、`adopted_record_id`、`content_purged_at` | `pending` 不进事实读模型；隐私按 §6.2 派生，不从记录当前值继承；采纳不得降低；撤回只清正文；`UNIQUE(candidate_id, subject_id)`；`(import_id, subject_id)` → `import_run`、`(document_id, subject_id)` → `source_document`（均复合外键）；`candidate.subject_id = run.subject_id`、`candidate.document_id = run.document_id`；`adopted_record_id` 必须与 `record.origin_candidate_id` 互指；运行时创建即 `adoption_state='resolved'`（`state='pending'`、`adopted_record_id=NULL`）；`adoption_state='unknown'` 时 `state` 只能 `pending` 且 `adopted_record_id` 必须 NULL，人工映射前不可采纳；`adoption_state='resolved'` 才可按 state 采纳/丢弃 |
| `record` | `record_id` | `subject_id`、`kind`、`author_state`、`author_actor_id`、`on_behalf_grant_id`、`origin_candidate_id`、`legacy_ref`、`lifecycle_state` | subject 不可改；`author_state ∈ {known,unknown}`；`known` 时 `author_actor_id` 必须同 subject、proxy 作者必须有覆盖该记录的 `on_behalf_grant_id`，`unknown` 时两列均为 NULL；不得默认写本人/`system`；proxy 必须有 grant；proxy 不得写 `not_private`；`UNIQUE(record_id, subject_id)`；`origin_candidate_id` 与候选 `adopted_record_id` 必须互指且同 subject；悬空/不一致按 §4.1 受保护 |
| `record_revision` | `revision_id` | `record_id`、`revision_no`、`base_revision_no`、`merged_from_revision_no`、`restored_from_revision_id`、`occurred_*`、`end_*`、`review_*`、`report_*`、`body_system`、`text`、`source_*`、`privacy_*`、`metric_*`、`details_json`、`validation_state`、`change_kind`、`created_at/by` | `(record_id, revision_no)` 唯一；只增不改；隐私无默认值；源指针不随移除改写；`restored_from_revision_id` 只在 `change_kind='restore'` 时非空，且必须指向同一 `record_id` |
| `record_kind` | `kind` | `label`、`detail_schema_version`、`status` | 新 kind 先注册 |
| `metric_category` | `category_id` | `name`、`display_order`、`version` | 组顺序单一源 |
| `metric_definition` | `(metric_code, version)` | `display_name`、`category_id`、`value_type`、`unit_family`、`status` | 新增常规指标不改表 |
| `artifact` | `artifact_id` | `subject_id`、`kind`、`template_version`、`privacy_policy_version`、`source_data_version`、`selection_hash`、`contains_private`、`relative_path`、`sha256`、`status`、`status_data_version`、`quarantine_reason` | 生成后冻结；失败不留半文件；恢复后标 stale 不重写；`status` 含 `quarantined`（构建后被保护/来源链变化），隔离产物不可下载不可分享；`contains_private` 每次下载重算，不当作永久通行证；`status`/`contains_private`/`status_data_version` 与 `data_version` 同事务更新；`status_data_version` 只作审计，不用于放行 |
| `artifact_item` | `(artifact_id, ordinal)` | `record_id`、`revision_no`、`included_private`、`checked_privacy_epoch`、`checked_document_state_seq`、`checked_data_version`、`consent_id` | `included_private=1` 表示构建时经 §4.1 `output_protected` 双 scope 判定受保护（含来源链派生，不等于自身 `privacy_state='private'`）；必须有针对**本次构建**的 `private_export` consent；`checked_*` 只是构建快照，下载时必须重新判定，过期即隔离；`checked_data_version` 记录构建/最近判定版本，不替代逐条重判；AI 无此路径 |
| `audit_event` | `audit_id` | `subject_id`、`actor_id`、`action`、`target_type/id`、`old/new_state`、`request_id`、`batch_id`、`at` | 不含正文；只记 ID/状态；传播批共享 `batch_id` |
| `command_receipt` | `(subject_id, actor_id, request_id)` | `command`、`request_hash`、`result_json`、`created_at` | 与副作用同事务；同一 subject+actor 同 ID 不同载荷拒绝；不同 subject 或不同 actor 的相同 `request_id` 互相独立；重放不重复写；`result_json` **不得含受保护记录 ID/标题/日期/正文**，传播类只存计数与状态；读取必须同时匹配 `subject_id=当前 subject`、`actor_id=当前 actor`、`request_id`，proxy 不能读 self 回执，self 也不能跨 subject 读 |
| `schema_migration` | `migration_id` | `version_from`、`version_to`、`filename`、`sha256`、`applied_at`、`backup_ref`、`status` | `version_to` 唯一且连续；应用后不可改；失败不写 ledger |
| `ui_preference` | `(subject_id, key)` | `value_json`、`schema_version`、`updated_at` | 不存事实/私密正文；仅视图偏好 |

### 9.3 关键 DDL 片段（示意，未执行，非完整合同）

**本片段不构成建库合同，也不能被当成“完整 schema”。** 它只演示最容易写错的几类约束：隐私无默认值、修订不可变、外键不级联、日期/时间的字节与 ASCII 形状。完整建库脚本尚未产出，下面这些**刻意省略**：

- 其余全部表（`workspace`、`subject`、`actor`、`access_grant`、`grant_scope`、`grant_read_entry`、`consent_event`、`source_document`、`source_link_release`、`import_run`、`import_candidate`、`record`、`artifact`、`artifact_item`、`audit_event`、`command_receipt`、`schema_migration`、`ui_preference`）的 DDL；
- 全部索引与唯一约束（除示例中的 `UNIQUE`）、部分索引、排序规则；
- `record` 的 `kind`/`subject`/`author` 外键、`author_state` 与 `author_actor_id`/`on_behalf_grant_id` 的一致性、`lifecycle_state` 检查、`source_document` 的 `link_state` 四态检查、`source_kind` 与 `source_document_id` 的一致性（`manual` 不得有指针）、`consent_event` 的 `type` 检查；
- 触发器只示例“修订只增”，其余不变式（如“当前修订必须是 `MAX(revision_no)`”的跨行一致性）尚无触发器；
- 建库器需设置的 PRAGMA（`foreign_keys=ON` 是**每连接**执行，不属于建表语句）；
- 随包 JSON Schema（`details_json` 的字段合同）、应用层交叉校验（如代理授权、隐私传播、幂等载荷）和迁移脚本。

因此：**不要把示例字段数、示例 CHECK 当成“已覆盖”**；G3 评审 DDL 时必须按上面清单逐项对着完整脚本验收。以下 SQL 未在 DSH Desktop 的 SQLite 运行时执行过（版本未核验，见 Q-08）；2026-11-03 仅在 `node:sqlite` 内存库做过语法、日期与字节 CHECK 冒烟：`2026-02-30`、NULL 的 day 日期、全角数字、尾随空格、非 `Z` 的 `created_at` 被拒，合法 day/month 通过；这不是宿主执行、不是测试库、更不是生产库，仍不等于验收（V-03/V-31 保持“未执行”）。

```sql
-- 每连接执行，不属于 schema；值为 0 时拒绝业务读写
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE record_revision (
  revision_id          TEXT PRIMARY KEY,
  record_id            TEXT NOT NULL REFERENCES record(record_id) ON DELETE RESTRICT,
  revision_no          INTEGER NOT NULL CHECK (revision_no >= 1),
  base_revision_no     INTEGER CHECK (base_revision_no IS NULL OR base_revision_no >= 1),
  merged_from_revision_no INTEGER,
  occurred_date        TEXT,
  occurred_precision   TEXT NOT NULL
                       CHECK (occurred_precision IN ('day','month','unknown')),
  occurred_raw         TEXT,
  end_date             TEXT,
  end_precision        TEXT CHECK (end_precision IS NULL OR end_precision IN ('day','month','unknown')),
  end_raw              TEXT,
  ongoing              INTEGER CHECK (ongoing IN (0,1)),
  review_date          TEXT,
  review_precision     TEXT CHECK (review_precision IS NULL OR review_precision IN ('day','month','unknown')),
  review_raw           TEXT,
  report_date          TEXT,
  report_precision     TEXT CHECK (report_precision IS NULL OR report_precision IN ('day','month','unknown')),
  report_raw           TEXT,
  body_system          TEXT,
  text                 TEXT,
  source_kind          TEXT,
  source_text          TEXT,
  source_document_id   TEXT REFERENCES source_document(document_id) ON DELETE RESTRICT,
  privacy_state        TEXT NOT NULL
                       CHECK (privacy_state IN ('private','not_private','unknown')),
  privacy_origin       TEXT NOT NULL,
  metric_code          TEXT,
  metric_definition_version INTEGER,
  value_num            REAL,
  value_text           TEXT,
  unit_code            TEXT,
  method_text          TEXT,
  laboratory_text      TEXT,
  reference_text       TEXT,
  details_json         TEXT CHECK (details_json IS NULL OR
                       (json_valid(details_json)
                        AND length(CAST(details_json AS BLOB)) <= 8192)),
  details_schema_version INTEGER,
  validation_state     TEXT NOT NULL DEFAULT 'ok'
                       CHECK (validation_state IN ('ok','needs_review')),
  change_kind          TEXT NOT NULL
                       CHECK (change_kind IN ('initial','correction','privacy','import_adopt','migration','legacy_import','restore')),
  changed_fields_json  TEXT,
  created_at           TEXT NOT NULL,
  created_by_actor_id  TEXT NOT NULL REFERENCES actor(actor_id) ON DELETE RESTRICT,
  UNIQUE (record_id, revision_no),
  CHECK (
    length(created_at) = 20
    AND length(hex(created_at)) = 40
    AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z'
    AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
    AND strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%SZ', created_at) = created_at
  ),
  CHECK (
    (occurred_precision = 'unknown' AND occurred_date IS NULL)
    OR (occurred_precision = 'month'
        AND occurred_date IS NOT NULL
        AND length(occurred_date) = 7
        AND length(hex(occurred_date)) = 14
        AND occurred_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND substr(occurred_date,6,2) BETWEEN '01' AND '12')
    OR (occurred_precision = 'day'
        AND occurred_date IS NOT NULL
        AND length(occurred_date) = 10
        AND length(hex(occurred_date)) = 20
        AND occurred_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(occurred_date) IS NOT NULL
        AND date(occurred_date) = occurred_date)
  ),
  CHECK (
    (end_precision IS NULL AND end_date IS NULL)
    OR (end_precision = 'unknown' AND end_date IS NULL)
    OR (end_precision IS NOT NULL
        AND end_precision = 'month'
        AND end_date IS NOT NULL
        AND length(end_date) = 7
        AND length(hex(end_date)) = 14
        AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND substr(end_date,6,2) BETWEEN '01' AND '12')
    OR (end_precision IS NOT NULL
        AND end_precision = 'day'
        AND end_date IS NOT NULL
        AND length(end_date) = 10
        AND length(hex(end_date)) = 20
        AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(end_date) IS NOT NULL
        AND date(end_date) = end_date)
  ),
  CHECK (
    (review_precision IS NULL AND review_date IS NULL)
    OR (review_precision = 'unknown' AND review_date IS NULL)
    OR (review_precision IS NOT NULL
        AND review_precision = 'month'
        AND review_date IS NOT NULL
        AND length(review_date) = 7
        AND length(hex(review_date)) = 14
        AND review_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND substr(review_date,6,2) BETWEEN '01' AND '12')
    OR (review_precision IS NOT NULL
        AND review_precision = 'day'
        AND review_date IS NOT NULL
        AND length(review_date) = 10
        AND length(hex(review_date)) = 20
        AND review_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(review_date) IS NOT NULL
        AND date(review_date) = review_date)
  ),
  CHECK (
    (report_precision IS NULL AND report_date IS NULL)
    OR (report_precision = 'unknown' AND report_date IS NULL)
    OR (report_precision IS NOT NULL
        AND report_precision = 'month'
        AND report_date IS NOT NULL
        AND length(report_date) = 7
        AND length(hex(report_date)) = 14
        AND report_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND substr(report_date,6,2) BETWEEN '01' AND '12')
    OR (report_precision IS NOT NULL
        AND report_precision = 'day'
        AND report_date IS NOT NULL
        AND length(report_date) = 10
        AND length(hex(report_date)) = 20
        AND report_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(report_date) IS NOT NULL
        AND date(report_date) = report_date)
  ),
  CHECK (ongoing IS NULL OR ongoing = 0 OR end_date IS NULL)
);

CREATE TRIGGER record_revision_no_update
BEFORE UPDATE ON record_revision
BEGIN
  SELECT RAISE(ABORT, 'record_revision is append-only');
END;

CREATE TRIGGER record_revision_no_delete
BEFORE DELETE ON record_revision
BEGIN
  SELECT RAISE(ABORT, 'record_revision is append-only');
END;
```

**字节与字符不是一回事**：SQLite `length(text)` 数的是字符，`length(hex(text))` 数的是字节的十六进制长度；日期/时间字段要求**定长 ASCII 字节**（10/7/20 字符对应 20/14/40 个 hex 字符），避免全角数字、组合字符或尾随空格混进日期列。上例只写了 `occurred_date` 与 `created_at`；`end_date`、`review_date`、`report_date`、`removed_at`、`decided_at` 等**所有**日期/瞬时列必须套用同样检查，是否已全量覆盖见 V-31。`details_json` 的 8 KiB 上限也按 UTF-8 字节算，不按字符算。

`created_at` 的 CHECK 必须同时有 `strftime(...) IS NOT NULL` 与 `strftime(...) = created_at`：SQLite 的 `strftime` 对月份 13 这类非法值返回 `NULL`，而 `CHECK` 表达式为 `NULL` 时**视为通过**，只写等号会让 `2026-13-01T00:00:00Z` 进入库。`2026-02-30` 不是这个漏洞：`strftime` 会把它归一化成 `2026-03-02`，等号检查因不相等而拒绝；修复说明不能把它写成 NULL 漏洞。另加 `substr(created_at,12,2) BETWEEN '00' AND '23'`，因为 SQLite 接受 `24:00:00` 并保留该文本，仅靠 `strftime` 相等检查仍会放行；本模型要求 UTC 瞬时按 `00–23` 规范化，不接受 `24:00`。该段**只在 `node:sqlite` 内存库冒烟过部分日期值，未在宿主执行**；宿主 SQLite 是否接受 `Z` 后缀/`T` 分隔符需在 Q-08 探针中确认，确认前不得当成已通过。

`record.kind` 通过 `record_kind` 外键；`details_json` 的具体字段由随包 JSON Schema 校验，DB 只保证 JSON 合法与大小上限。`privacy` 变更插入新修订，所以“改隐私”也不会触发 UPDATE 触发器。**代理不得写 `not_private`、件级隐私传播、授权与幂等语义都无法只靠 DDL 表达**，必须在命令层实现并有应用测试；DDL 不是这些规则的证据。

### 9.4 命令与错误码（合同级）

所有写命令都带 `request_id`（幂等键）与 `expected_data_version`（乐观并发）；服务端在单事务中校验、写副作用、递增版本并写 `command_receipt`。同一 `request_id` 重放返回首次结果；载荷不同则 `idempotency_conflict`，**不得**当成新请求执行。

**所有写命令的调用者身份只从当前会话/宿主解析，不读请求体里的 `actor_id`/`subject_id`**（§3.5）。下表“允许调用者”是硬约束；未列出的调用者一律 `not_authorized`。`demo_unverified` 只能操作 `subject.is_demo=1` 的 demo subject，不能写任何生产 subject；proxy 必须 `host_authenticated` 且持有未撤销、范围覆盖该命令的 `access_grant`。

| 命令 | 允许调用者 | 关键校验 | 失败码 |
|---|---|---|---|
| `record.create` | self；proxy（需 grant 覆盖 kind+日期；未知日期需 `allow_unknown_date`）；demo 仅 demo subject | subject/kind/author_state；代记 grant 覆盖 kind+日期；至少一个内容字段；隐私非空且不是默认值；**初始隐私按 §4.7 `attach_state('not_private', d)` 写入；显式写 `not_private` 而来源受保护 → `privacy_locked`；代记新建以 `unknown` 为下限，不得选择或写入 `not_private`**；来源缺失/跨 subject/候选链不一致 → `source_unresolved`/`cross_subject_reference`；作者字段按 `author_state` 一致性校验：`known` 时 `author_actor_id` 同 subject、proxy 作者必须有覆盖 grant，`unknown` 时两列均 NULL，不得默认本人；无 document/候选指针时必须显式 `source_kind='manual'`，否则 `source_kind_required` | `not_authenticated`、`not_authorized`、`grant_scope_missing`、`invalid_date`、`invalid_kind`、`privacy_invalid`、`privacy_locked`、`source_unresolved`、`cross_subject_reference`、`source_kind_required`、`demo_violation` |
| `record.correct` | self；proxy（需 grant 覆盖 kind+日期且记录当前可见）；demo 仅 demo subject | `BEGIN IMMEDIATE` 内重读当前修订；`base_revision_no` = 当前修订号（或可合并的祖先）；仅允许本人/有效代记；**只接受内容字段，不得携带 `privacy_state`/`privacy_origin`；携带即 `privacy_changed`**；当前修订隐私与基修订不同也 `privacy_changed`；变更字段非空；按 §5.1 做三路合并；**不写隐私、不因 `source_locked=false` 获得写隐私能力**；更换来源时按 §4.7 重算，若抬高保护返回 `privacy_locked`；来源缺失/跨 subject/候选链不一致返回 `source_unresolved`/`cross_subject_reference`；代理操作受保护记录一律 `privacy_locked` | `not_authenticated`、`not_authorized`、`grant_scope_missing`、`stale_revision`、`stale_data_version`、`revision_conflict`、`privacy_changed`、`privacy_locked`、`source_unresolved`、`cross_subject_reference`、`no_change`、`demo_violation` |
| `record.setPrivacy` | **仅 self** | **只有 subject self；这是唯一可降低/由用户选择记录隐私的命令，§4.7 `record.attachSource` 只能提高且不能代替它**；`expected_data_version` 匹配；改 `not_private` 前只重查 `source_locked(record_id)`（来源链当前状态 + 候选/run/document 可解析 + `privacy_ever_private` 未解除的当前 `(epoch, state_seq)` sticky）；链上有受保护/不可判定/跨 subject/悬空环节则拒绝；已有 release 只清 sticky，不等于记录已公开；不可用应用级“系统”身份绕过；代记/`system`/demo 无此命令；`record.correct`/`restoreRevision` 不得代行 | `not_authorized`、`not_authenticated`、`stale_data_version`、`privacy_locked`、`source_unresolved`、`cross_subject_reference`、`already_set` |
| `record.releaseSourceLink` | **仅 self** | record 属于当前 subject；document 在该 record 的 `source_chain`；document 当前 `not_private`、`privacy_ever_private=1`、`privacy_epoch>=1`；写入 `document_state_seq` 必须等于 document 当前 `privacy_state_seq`；同 `(record, document, 当前 epoch, 当前 state_seq)` 尚无有效 release；`expected_data_version` 匹配；**`candidate_source_ok(record_id)` 必须为真且 document 同 subject，否则 `source_unresolved`/`cross_subject_reference`**。只插入 release、写审计、`data_version+1`；**不改记录隐私、不改 document、不批量**。若链上还有其他锁定源/悬空环节，返回 `source_locked=true` | `not_authorized`、`record_not_found`、`document_not_linked`、`privacy_locked`（document 当前 private/unknown、seq 不匹配或链 unresolved）、`source_unresolved`、`cross_subject_reference`、`not_locked`（从未 private，无需解除）、`already_released`、`stale_data_version` |
| `record.attachSource` | **仅 self** | `expected_data_version` 与 `expected_current_revision_no` 匹配；事务内重读 record/当前修订/document；document 必须存在、同 subject、`link_state ∈ ('unverified','verified')`；`missing`→`document_missing`、`removed`→`document_removed`，不得自动复活；按 §4.7 `source_floor`/`attach_state` 计算新保护，**只能提高或保持，不得降低**；请求携带 `privacy_state`/`not_private` 选择 → `privacy_changed`；新修订保留正文/日期/类型，写 `source_document_id`/`source_text` 与保护；提高时 `change_kind='privacy'`、`privacy_origin='inherited_document'`，否则 `correction`；候选链悬空/跨 subject/不一致 → `source_unresolved`/`cross_subject_reference`；不删除、不改写历史 | `not_authorized`、`stale_data_version`、`stale_revision`、`privacy_changed`、`source_unresolved`、`cross_subject_reference`、`document_not_found`、`document_missing`、`document_removed`、`no_change` |
| `document.register` | **仅 self** | 用户显式选择；文件句柄仅在本次会话可用；只登记元数据、不复制；写入 `registered_at` 与首次核对 `last_verified_at`；用户确认展示名与隐私。登记即 `private`：`privacy_ever_private=1`、`privacy_epoch` 从 0 递增到 1、`privacy_state_seq=1`；登记为 `not_private/unknown`：`privacy_ever_private=0`、`privacy_epoch=0`、`privacy_state_seq=0`，不得预置 sticky | `not_authorized`、`document_missing`、`document_unreadable`、`source_handle_unavailable`、`duplicate_document` |
| `document.setPrivacy` | **仅 self** | `expected_data_version` 匹配；置 `private` 时同时置 `privacy_ever_private=1`，且原状态不是 `private` 时 `privacy_epoch += 1`（已是 private 不重复递增；初值 0，首次私密从 0→1）；改回 `not_private`/`unknown` **不清零 ever、不回退 epoch**；**任何实际状态变化 `privacy_state_seq += 1`，同值重复提交不增**；旧 epoch/旧 seq 的 release 保留但不再生效；**`unknown → not_private` 是解除 `unknown` 当前锁定的唯一路径**，必须由本人显式确认“原件确非私密”；ever=0 时不需要 release，ever=1 时仍需按当前 `(epoch, state_seq)` 逐条 release；按 §4.6 来源链（当前/历史修订、采纳候选 run）在同一事务内处理：**转 `private/unknown` 时只对当前 `not_private` 记录追加隐私修订（新修订状态必须等于 document 新状态），已受保护记录不改写、不降级；候选取原状态与新状态较强者**，转 `not_private` 时**不追加、不自动解除记录锁定**；随后更新 `data_version`、移除选择并把含受影响记录的产物标 `quarantined`；回执只写计数 | `not_authorized`、`stale_data_version`、`propagation_failed` |
| `document.remove` | **仅 self** | 只移除登记/链接（`link_state='removed'`），不删原件、不删已采纳记录与历史；不改 `privacy_state`、不清 `privacy_ever_private`、不回退 `privacy_epoch`/`privacy_state_seq`；`source_locked` 仍按原状态计算。移除后若原件当前 `not_private` 且曾 private，仍可按 `record.releaseSourceLink` 逐条解除；当前 `private/unknown` 时 release 被拒，须先显式改 document 状态 | `not_authorized`、`document_not_found` |
| `import.start` | **仅 self** | 原件已登记、未 removed，且本次会话已由用户重新选择并提供**会话文件句柄**（无句柄即不可解析，不存在 `present` 这种持久状态）；**云解析先校验 `cloud_parse` consent（self、未撤回、type 匹配、document/subject 一致），通过后才允许建 run/上传/建候选；缺失即 `consent_required` 且零副作用，不得先建 run 再补同意**；只由 self 触发，proxy 不得代触发解析 | `not_authorized`、`consent_required`、`document_missing`、`document_removed`、`source_handle_unavailable` |
| `import.withdraw` | **仅 self** | 撤回分析：清候选正文与会话 `tmp/` 中间产物；`manifests` 只记元数据与 `withdrawn_at`；**已采纳记录与来源指针保留**；同 `request_id` 重放返回首次结果 | `not_authorized`、`import_not_found`、`already_withdrawn`（新请求；重放不算） |
| `candidate.adopt` | self；proxy（仅来源可解析且 grant 覆盖时，强制 `unknown` 下限）；demo 仅 demo subject | candidate `pending` 且 `adoption_state='resolved'`（`unknown` 返回 `adoption_unresolved`，人工映射前不得采纳）；candidate/run/document 的 `subject_id` 必须与会话 subject 一致、`candidate.document_id = run.document_id` 且来源链完整可解析，否则 `source_unresolved`/`cross_subject_reference`（见 §6.2）；候选受保护时仅 self；按 §4.7 `attach_state(candidate.privacy_state, d)` 写初始修订，不得降低/洗白；同时置 `candidate.state='adopted'`、写 `record.origin_candidate_id` 与 `candidate.adopted_record_id` 并校验互指；候选 `not_private` 但原件当前状态或粘性使来源链受保护时，强制 `unknown` + `validation_state='needs_review'`；**代理采纳以 `unknown` 为下限（候选 `private` 仍为 `private`）+ `privacy_origin='proxy_default'`，并要求有效 grant 覆盖 kind+日期（未知日期需 `allow_unknown_date`）**；目标 kind 合法；record 作者按 §3.2/§6.2：self→`known`+self、proxy→`known`+proxy+`on_behalf_grant_id`、迁移/无证据→`unknown`（两列 NULL），不得默认本人；新修订号 = 当前 `MAX+1` 并做 §5.1 编号/内容自检；来源指针写当前 revision | `not_authenticated`、`not_authorized`、`grant_scope_missing`、`candidate_not_pending`、`adoption_unresolved`、`source_unresolved`、`cross_subject_reference`、`privacy_locked`、`invalid_kind`、`demo_violation` |
| `candidate.discard` | **仅 self** | `pending`；候选受保护时仅 self；清空正文 | `not_authorized`、`candidate_not_pending` |
| `grant.create/revoke` | **仅 self** | 只有 self actor；grantee 是 proxy；不得授予私密；不得改变记录隐私；grant 必须记录 scope（kind/日期范围）与有效期 | `not_authorized`、`invalid_grantee`、`privacy_escalation` |
| `record.restoreRevision` | **仅 self** | `BEGIN IMMEDIATE` 内重读 record/current/target 与 `data_version`；`expected_data_version`/`expected_current_revision_no` 任一不匹配 → `stale_data_version`/`stale_revision`；目标修订属于同 record 且同 subject；以**新修订**写入（`change_kind='restore'`，`restored_from_revision_id`=目标，`revision_no`=事务内当前 `MAX+1`）；不删历史；**只恢复内容，不读取/写入请求里的隐私字段；新修订隐私取事务内当前记录隐私，不得由恢复改变**；请求携带 `privacy_state`/`privacy_origin` 一律 `privacy_changed`；目标修订保护等级高于当前记录，或按 §4.7 目标来源会抬高保护 → `privacy_locked`；复制目标 `source_document_id`/`source_text`，不得清空来源；代理一律 `not_authorized` 且拒绝不泄露目标存在；不因恢复改变 `privacy_ever_private`/`privacy_epoch`；同事务递增 `data_version` 并把受影响 artifact 标 `stale`/`status_data_version` | `not_authorized`、`revision_not_found`、`privacy_changed`、`privacy_locked`、`stale_revision`、`stale_data_version` |
| `artifact.build` | self；proxy（仅选择集全部为可见 `not_private` 时） | 选择集非空；每条调用 `output_protected(record_id, revision_no)`（选中修订 + current record 双 scope）；**每条受保护项各自必须有匹配 `(record_id, revision_no)` 的 `private_export`，缺一条即整批 `consent_required`，一条同意不得覆盖多个条目**；proxy 不能签署 `private_export`，含受保护条目的构建只能 self；`artifact_item.consent_id` 记该条目的同意；`artifact_item.checked_data_version` 与 `artifact.status_data_version` 写当前 `data_version`；写临时文件成功；回执只记产物 ID 与计数，不记受保护记录 ID | `not_authorized`、`empty_selection`、`consent_required`、`privacy_locked`、`stale_data_version`、`write_failed` |
| `artifact.download` | self；proxy（仅 `contains_private=0` 且逐条可见时） | 每次下载重新调用 `output_protected` 逐条校验并重算 `contains_private`；`status='quarantined'` 一律拒绝；**`status_data_version`/`checked_data_version` 落后或与当前链不一致时同样失败关闭，不得以旧状态放行**；**每个 `included_private=1` 条目各需一条新的、匹配该条 `(record_id, revision_no)` 的 `private_export`，一条同意不得覆盖多条**；proxy 不得下载含私密条目或需私密同意的产物；不返回“有 N 个产物”的计数 | `not_authorized`、`artifact_quarantined`、`artifact_stale`、`consent_required`、`privacy_locked`、`artifact_not_found` |

**Sticky 来源链的逐条解除（合同已写，实现与验收未完成）**：本版提供 `record.releaseSourceLink(document_id)` 作为唯一解除路径，但**只解除指定的 `(record, document, 当前 privacy_epoch, 当前 privacy_state_seq)`**，不批量、不按原件批量放开、不由“改回公开”自动触发、不改变记录自身的 `privacy_state`。完整操作顺序是：①本人先把原件显式改为 `not_private`（这一步不清 `privacy_ever_private`，也不自动公开任何记录，但会递增 `privacy_state_seq`）；②对该记录逐条 `releaseSourceLink`，签发的 `document_state_seq` 必须等于当时的 `privacy_state_seq`；③再单独 `record.setPrivacy(not_private)`。若原件当前仍是 `private/unknown`，①之前的 release 一律 `privacy_locked`；原件 `removed` 但当前 `not_private` 且曾私密时仍可 release，当前 `unknown` 时必须先显式改状态，不能靠移除绕过。原件再次进入 `private` 会递增 `privacy_epoch`，任何状态往返（含 `unknown`）都会递增 `privacy_state_seq`，旧 release 保留但失效，必须重新逐条解除。代理无此命令，也不能借回执推断哪些记录被解除。

**该合同尚未实现、未接 UI、未写迁移、未测端到端，属于 G3 阻塞，不能写成“已完成”**。在实现并验证之前，本版不得声称“sticky 已有可用解除路径”，也不得把“`record.setPrivacy(not_private)` 成功”误当成来源链已解锁；只要 `source_locked` 仍为真，记录在读模型、导出候选与代理可见性中仍是受保护。Q-27 记录剩余实现/验收项，不再作为“无入口”的借口。

代记读取没有“读命令错误码”可泄露存在性：越界或受保护一律 `not_available`，**同一错误码、同一响应时延量级**，不区分“不存在”“无权限”“私密”。

**乐观并发与三路合并**（`record.correct`）：

1. 请求带 `base_revision_no`（客户端读到的修订）与 `expected_data_version`。
2. 若 `base_revision_no` = 当前修订，直接写新修订。
3. 若 `base_revision_no` 是祖先，逐字段比较 `base`、`current`、`proposed`：只有 `current == base` 的字段可接受 `proposed`；`current != base` 且 `proposed != base` 且 `proposed != current` → `revision_conflict`，返回冲突字段，不写半条。`base_revision_no` 不属于该记录或大于当前修订 → `stale_revision`。
4. **隐私字段完全不参与内容合并**：请求只接受内容字段；归一化后的 `proposed.privacy` 恒等于 `current.privacy`（服务端从当前修订复制，不从请求读取）。若请求携带 `privacy_state`/`privacy_origin`，或 `current` 与 `base` 的隐私不同（保存期间隐私被改过），一律返回 `privacy_changed`，要求用户重新查看并走 `record.setPrivacy`。即使 `source_locked=false` 也不得借此写隐私；`correct` 不产生 `change_kind='privacy'` 的修订。
5. 合并结果写入新修订，`base_revision_no` 记录基准，`merged_from_revision_no` 记录被合并的当前修订；`changed_fields_json` 列出实际变更字段。
6. 同一事务写 `audit_event`、递增 `subject.data_version`、写 `command_receipt`；任一失败整体回滚。

冲突响应必须包含：冲突字段名、当前值摘要（受保护内容不返回给代理）、当前修订号、可重试建议。客户端不得用“强制覆盖”按钮绕过，只能重新读取后再次提交。

### 9.5 幂等与命令回执

- `command_receipt(subject_id, actor_id, request_id, command, request_hash, result_json, created_at, PRIMARY KEY(subject_id, actor_id, request_id))`；`request_hash` 是规范化载荷（含 `expected_data_version`）的哈希，**不存载荷明文**。`request_id` 只在“同一 subject + 同一 actor”内唯一；不同 subject 或不同 actor 使用相同 `request_id` 是互相独立的多条回执，不能命中彼此；不得只按 `(actor_id, request_id)` 查，否则跨 subject 会串。
- 事务顺序：校验 → 执行副作用 → 写回执 → 提交。回执与副作用同成同败；崩溃后不会出现“已写数据无回执”。
- 重放：同 `(subject_id, actor_id, request_id)` + 同 `request_hash` → 返回 `result_json`，不重复写；同 subject+actor 同 ID + 不同 hash → `idempotency_conflict`，不执行；不同 subject/actor 的相同 ID 命中各自回执。**不得只按 `request_id` 或只按 `(actor_id, request_id)` 查回执**，否则代理、self 与不同 subject 的幂等空间会串。
- `request_id` 由客户端生成（UUID/随机），生命周期与本地会话解耦；离线补发、双击提交、宿主重试都必须命中同一 ID。
- **回执最小化**：`result_json` 只存调用者继续操作所需的最小结果（自己的记录 ID、修订号、状态、错误码、计数、`release_id`、`source_locked` 布尔）。**不得**存正文、标题、日期、药名、候选文本、原件名，也不得存受保护记录的 ID 列表；`document.setPrivacy`、`artifact.build` 等批量命令只存 `batch_id`/产物 ID 与 `affected_count`、`skipped_count`。代理的回执只返回状态与计数 + 不透明 `operation_ref`，不返回任何 record/document ID。
- **回执作用域**：读取必须同时匹配 `subject_id = 当前 subject`、`actor_id = 当前 actor`、`request_id`；代理不能读 self 的回执，self 也不能借回执看到“代理操作里被隐藏了哪些记录”，更不能跨 subject 读；没有“管理员查看全部回执”的界面或导出。代理重复提交自己的 request_id 只得到自己的回执，不暴露他人是否执行过相似命令。迁移时，旧 `(request_id)` 单列主键或 `(actor_id, request_id)` 双列主键的回执**全部失效**：不得把旧记录按“未知 subject/actor”继承，不得用旧回执命中新请求；重建 `command_receipt` 时必须清空或隔离旧回执并按新主键重建。
- 回执保留期见 Q-19。清理旧回执不得早于“所有可能重试的客户端路径”失效；默认建议 ≥30 天，最终由 G3 定。
- 读命令不需要回执；但带副作用的“预览生成”“导出”算写命令。
- `stale_data_version`、`stale_revision`、`revision_conflict` 是三种不同错误：分别为 subject 级视图过期（如隐私传播后）、基修订非法/不属于本记录、字段级并发冲突。客户端必须分别处理，不能合并成“刷新即可”，也不能把 `revision_conflict` 当成可强制覆盖。**隐私变化优先于内容合并**：同一请求里版本已推进且当前修订隐私已变，先返回 `stale_data_version`，重读后再遇隐私差异返回 `privacy_changed`。
- **恢复后的回执**：备份恢复会把回执与事实带回不同时间点，旧回执可能让重放跳过“本该重新发生”的写入。恢复后必须使回执失效（清空或按 `restore_epoch` 隔离）；具体策略**未设计、未实现、未测试**（Q-28），**Q-28 是 G3 阻塞**，本版不声称已验证。

### 9.6 并发、锁序与回执边界（合同草案，未实测）

- 单写者：所有写命令 `BEGIN IMMEDIATE`；读用 WAL 快照，但一个读模型必须在**同一读事务**内取行与 `data_version`，不得先读计数再读行导致跨版本拼装。
- 固定锁序（由外到内）：`subject` → `source_document` → `record` → `artifact` → `command_receipt`。传播事务先锁 subject 与 document，再锁受影响 record；更正事务先锁 subject，再读 document、锁 record。**禁止**先锁 record 再回头锁 document（与传播相反会造成死锁）。
- 锁等待：`busy_timeout` 有上限，超时返回 `write_busy`（可重试，带建议退避），不无限自旋、不在 UI 里假装成功。
- 传播与更正：传播提交后 `data_version` 已变；更正以旧 `expected_data_version` 到达时先 `stale_data_version`，重读后再按 §4.1 判 `privacy_changed`。不得在传播事务未提交时读半状态做合并。
- 崩溃点：唯一可能“副作用已提交、响应丢失”的窗口在 `COMMIT` 之后；客户端用同一 `request_id` 重试，回执返回首次结果。`COMMIT` 之前的任何失败整体回滚，不留部分修订/部分回执。
- 回执写入在同一事务的最后一步，但仍是事务的一部分；迁移重建 `command_receipt` 表时必须同时使旧回执失效（见 §10.2）。
- 以上是**合同草案**：锁序、`busy_timeout` 取值、WAL 下的读一致性、回执失效策略均**未在宿主实测**，也没有并发压测数据；不得引用本节声称“并发已验证”。

### 9.7 跨 subject 引用校验（G3 阻塞，未实现）

**外键只保证“行存在”，不保证“同一 subject”。** 本版所有引用必须逐条校验 subject 一致性；任何一条不满足即拒绝写入/迁移，不得靠 UI 过滤或“正常情况下不会发生”放行。

必须校验的引用（至少）：

| 引用 | 必须满足 |
|---|---|
| `record.subject_id` ← `actor`/`author_actor_id`、`on_behalf_grant_id` | author 是该 subject 的 self 或该 subject 有效 grant 的 grantee；`on_behalf_grant_id.subject_id = record.subject_id` |
| `record_revision.record_id` | 同 record；`source_document_id` 的 `subject_id = record.subject_id` |
| `import_run.subject_id` / `import_candidate` → `run`/`document` | `import_run` 与 `import_candidate` 都必须显式带 `subject_id`、`document_id`（NOT NULL）；run、document、candidate 三者同 subject；`candidate.document_id = run.document_id`；复合外键 `(document_id, subject_id)`、`(import_id, subject_id)` 必须指向同 subject 的行；不得从 record 或 document 反推候选 subject |
| `source_link_release` → `record`/`document` | 两者同 subject；document 在 record 的 `source_chain` |
| `access_grant`/`grant_scope`/`grant_read_entry` → grantee actor、subject、kind | grant 的 subject = 目标数据 subject；scope 的 kind/日期范围在 grant 内；`grant_read_entry` 不得指向别的 subject 的条目 |
| `consent_event` → subject/记录/artifact | consent 的 subject = 目标 subject；`private_export` 的目标记录/修订/artifact 同 subject；发起人必须是 self |
| `artifact`/`artifact_item` → subject/record/revision | artifact 的 `subject_id` = 每个 item 的 record subject；item 的 `revision_no` 属于同一 record |
| `artifact.status_data_version` / `artifact_item.checked_data_version` | artifact 的 `subject_id` 与 item/record 同 subject；状态/版本更新必须与对应 `data_version` 同事务；版本落后或与来源链/隐私快照不一致时按失败关闭，不得以版本号单独放行 |
| `audit_event`/`command_receipt`/`ui_preference` | 写入时 subject/actor 必须与当前会话一致；读取也必须三键匹配，不得跨 subject 命中 |
| `import_candidate.adopted_record_id`、`record.origin_candidate_id` | 两列互指且同 subject；仅 `adoption_state='resolved'` 且 `candidate.state='adopted'` 时成立：`candidate.adopted_record_id = record.record_id` 且 `record.origin_candidate_id = candidate.candidate_id`；`adoption_state='unknown'` 必须两列 NULL、state=`pending`；任一悬空/不一致即 `source_unresolved`，记录按 §4.1 受保护 |

- 写入路径：所有命令在事务内做上述校验，失败返回 `cross_subject_reference`/`source_unresolved`，不写半条；不得用触发器之外的应用层“先写后查”。来源链校验必须解析候选 → run → document 三层，不能只查 `source_document.subject_id`。
- 迁移后校验：迁移完成前必须跑跨 subject 不变量查询（每个引用 join 两侧 subject 比较），有任何行即 `ROLLBACK` 并保留现场；不得把“外键通过”当作迁移成功。
- **G3 阻塞**：本版没有实现上述校验、没有迁移后不变量查询、没有负向测试；在补齐并验证前，不得声称多 subject 隔离已成立。Q-30 记录剩余项；迁移中的采纳关系另见 Q-31。

---

## 10. 迁移合同

### 10.1 版本与边界

- `schema_version` 是整数，存在 `workspace` 与 marker；`app_version` 是应用版本；`read_model_version` 单独演进。三者不得混用。
- 迁移文件 `migrations/NNNN_<name>.sql` 一旦应用即不可修改；文件 SHA-256 写入 `schema_migration`。需要修正时新增迁移。
- **默认每个迁移在单事务中执行**；SQLite 的 DDL 在事务内可回滚。应用前获取写锁，禁止并发写入。
- **唯一例外是重建表（12 步 alter）**：`PRAGMA foreign_keys` 不能在事务内切换（SQLite 会忽略），所以重建无法与“关外键”同处一个原子事务。此类迁移必须显式标记 `kind='rebuild'`，顺序固定为：事务外 `PRAGMA foreign_keys=OFF` → `BEGIN IMMEDIATE` → 重建/回填 → **事务内 `PRAGMA foreign_key_check`；有行即 `ROLLBACK`** → 无行才 `COMMIT` → 事务外 `PRAGMA foreign_keys=ON` 并确认值为 1 → 再跑一次 `foreign_key_check`。**不能先 COMMIT 再检查**；先提交会把孤儿行留在库里，回滚也来不及。它**不是原子迁移**，崩溃窗口与补偿流程见 §10.2，且**恢复方案未设计，Q-29 为 G3 阻塞**。不得把重建伪装成普通单事务迁移，也不得在失败后自动继续。
- 除重建外的迁移若需要“临时关外键”，说明设计有误：改为新增表/新列 + 回填，不用关外键。
- 迁移只做“结构 + 数据映射”，不在迁移里调用网络、不解析原件、不生成临床判断。
- 支持区间：应用只接受 `[min_supported, max_supported]`。库版本 **高于** `max_supported` → `schema_too_new`，拒绝写入并保持只读/退出，不尝试“向下迁移”；低于 `min_supported` → 要求先装中间版本逐级迁移，不跳级。
- 迁移链必须**连续且唯一**：`schema_migration.version_to` 唯一、无缺口、从 1 开始；缺失或校验和不符 → 拒绝启动，不从“最近的”迁移猜。

### 10.2 迁移前/中/后

**前：**

1. 检查 `PRAGMA integrity_check` 与 `PRAGMA foreign_key_check`；
2. 用 SQLite backup / `VACUUM INTO` 生成一致性备份，记录 `backup_ref`；
3. 记录关键表行数、最大 ID、`data_version`、私密计数、授权计数、候选计数；
4. 检查磁盘余量 ≥ 2× 预计增量；
5. 写 `migration.lock`（含迁移 ID、开始时间、PID），防止并发启动；锁已存在且 PID 不可判活 → 不自动删锁，要求人工确认。

**中：**

1. 逐个迁移：`BEGIN IMMEDIATE` → 执行 SQL → 校验 → 写 `schema_migration` → `COMMIT`；
2. 失败则 ROLLBACK，保留锁与错误，不继续后续迁移；**失败不写 `schema_migration`**，否则 ledger 会假装成功；
3. 不允许“跳过失败迁移继续跑”；不允许手工改已应用迁移的校验和；
4. **SQLite 特有约束**：
   - 重建表（12 步 alter）需要临时关闭外键：必须在事务**外**执行 `PRAGMA foreign_keys=OFF`，`BEGIN IMMEDIATE` 后重建/回填，**在同一个重建事务内、`COMMIT` 之前执行 `PRAGMA foreign_key_check`**；有行立即 `ROLLBACK`，不得先提交。无行才 `COMMIT`，然后在事务外 `PRAGMA foreign_keys=ON` 并查询确认值为 1，再跑一次 `foreign_key_check` 作为提交后复核。不可在事务内切 `foreign_keys`（SQLite 会忽略）。**这会产生一个非原子窗口**：`migration.lock` 只能说明“重建开始过”，不能说明旧表/新表哪个是完整的；崩溃后**不得自动续跑或自动选表**，必须停止启动、保留现场、从迁移前备份恢复（恢复步骤见 §10.3）。重建迁移应尽量拆成“新表 + 双写/回填 + 后续版本切换”以缩短窗口，但完整切换流程与崩溃检测**未设计，Q-29 为 G3 阻塞**。
   - 重建 `command_receipt` 表时，旧回执必须同时失效；不得让重建后的空表与“事实已前进”的库组成可重放状态（§9.5、Q-28）。
   - `VACUUM` 不能放在事务内，迁移脚本不得依赖它；
   - 不用 `ALTER TABLE ... RENAME` 猜列语义；改名走“新列 + 回填 + 后续版本删旧列”；
   - 部分索引/表达式索引需确认宿主 SQLite 版本支持（Q-08 未核验前不写入冻结迁移）；
   - 触发器在重建表时会被一并删除，迁移必须显式重建并验证存在。

**后：**

1. 跑第 11 节中适用于迁移的不变量查询（V-02～V-04、V-09、V-13、V-19、V-27 等）与 `foreign_key_check`；
2. 抽检 `record`/`record_revision` 的 ID、计数、日期精度、隐私状态、授权引用；
3. 以只读模式启动应用，打开看板/时间线/指标/复诊预览各一次；
4. 通过后删除 `migration.lock`，记录完成时间；
5. 失败：停止启动，保留备份与失败库；恢复时把备份复制到新目录并校验，不原地覆盖。

### 10.3 兼容与回滚

- 采用 expand/contract：先加可空列/新表/新索引，双读，回填，再在后续版本收紧；同一版本不先删旧列/旧表。
- 旧应用读新库：至少保留一个兼容窗口；新增列可空、旧查询不受影响。若无法兼容，必须在发布说明中写“不可降级”，并提供恢复路径。
- 回滚分两种：**应用回滚**（旧版本读新库，受兼容窗口约束）与**数据恢复**（用迁移前备份覆盖/重建）。不得用“删库重建”当迁移失败方案。
- 回滚会丢失备份之后的写入；执行前必须导出/告知。恢复后的库仍带 `schema_migration` 历史，不能把 ledger 清空伪装成“从未迁移”。
- **版本恢复（记录级）**：`record.restoreRevision` 以新修订回写目标内容，不删任何历史、不改 `revision_no` 序列；恢复私密记录不会把隐私降为公开；恢复不触发原件重读。恢复后 `subject.data_version` 递增，受影响产物标 `stale`。
- **版本恢复（库级）**：从备份恢复是“回到某时间点”，不是“撤销迁移”。恢复后必须重跑 `integrity_check`、`foreign_key_check`、ledger 连续性检查；若备份的 schema 低于当前应用 `min_supported`，需按 10.1 逐级迁移，不得直接打开。

### 10.4 原型 → 目标映射

当前原型只有内存合成数据，没有生产旧库。下表用于未来真实导出/旧库的映射，也用于检查“哪些原型字段不能直接搬”。因此它**是迁移合同，不是已验证迁移**；fixture 目前只能由原型导出/手工构造，真实旧库 fixture 需在 M5 取得用户授权并去标识后补充，未取得前不得声称迁移已通过：

| 原型字段/数组 | 目标 | 规则 |
|---|---|---|
| `records[].id`（数字/时间戳） | `record.record_id` + `legacy_ref` | 生成新稳定 ID；旧 ID 只进 `legacy_ref`，不复用 |
| `kind` 中文值 | `record_kind` | 按第 5.3 节映射；`血管`/`血管资料` 合并为 `check`+vascular；`消化症状` 为 `symptom`+digestive |
| `date` + `datePrecision` | `occurred_date/precision/raw` | 有精度按原值；缺精度不按形状猜，`unknown` + `raw` + `needs_review` |
| `endDate` + `ongoing` | `end_date/precision/raw` + `ongoing` | 不推算结束日；`ongoing=1` 时结束为空 |
| `reviewDate` | `review_date/precision/raw` | 医嘱专用；缺失即未知 |
| `reportDate`/`reportDatePrecision` | `report_date/precision/raw` | 检查/检验专用；缺失即未知 |
| `private` 布尔 | `privacy_state` | `true→private`、`false→not_private`、缺失→`unknown` |
| `history[]` | `record_revision` | 对象按已知字段映射；未知键放 `details_json.legacy` 并标 `needs_review`，单条超 8 KiB 拒绝迁移转人工；字符串不解析成结构，存为 `legacy_import` 修订、隐私 `unknown`、正文原样保留。**顺序按数组原序（老→新）：`history[i]` → `revision_no=i+1`；当前内容 → `revision_no=len(history)+1`。不得把当前写成 1、历史写成 2..N+1，也不得按日期重排。** |
| `source` | `source_text` + `source_kind` | 不把“原件：文件名”当结构化外键；有 `fileId` 才建 link。**手工来源必须保留**：迁移不得因“无法解析成文件”而丢弃或覆盖 `source` 文本；无法识别时原样进 `source_text` 并标 `needs_review` |
| `fileId` | `source_document_id` | **该记录所有修订（含历史）均无可用指针且无原件痕迹（`fileId` 键缺失或为 null，`original` 为空，`source` 不以“原件：/原件已移除”开头，且无候选互指）→ `no_file`**：`source_document_id=NULL`、`source_kind='manual'`、保留 `source_text`，不强制 `unknown`、不标 `needs_review`；**`fileId` 有值但目标行不存在/跨 subject，或 `fileId` 为 null/键缺失但 `original` 非空或 `source` 显示“原件：/原件已移除” → `unresolved`**：置空且记录至少 `unknown` + `needs_review`，`source_kind='document'`，不得伪造 `source_document`，不得洗成手工；两类必须靠原件证据区分，不能只看 `fileId` 是否为空 |
| `original:{title,text}` | 不迁移为事实 | 原型内嵌副本，不是工作台原件；**不复制进数据根**。若它是唯一副本且无磁盘文件，先让用户选择“在原位置登记为原件”或“转为 `note` 记录”，不得静默丢弃；生产只存 `source_document_id` |
| `pathwayDetail.{imaging,ae,support}` | 不自动迁移 | 演示注释，不是已确认事实；如真实存在，拆成独立 `check`/`symptom`/`note` 记录并带来源 |
| `department`/`site` | `details_json` 或 `body_system` | 仅展示属性；不参与诊断/分型 |
| `drug`/`dose`/`cycle` | `details_json` | 原文抄录；不结构化剂量、不换算 |
| `BEIPAL_METRICS` | `record(kind='observation')` | 每个点一条 observation，生成稳定 `record_id`（不能拿数组索引当身份）；`metricId→metric_code`；单位/方法/机构逐点保留 |
| `BEIPAL_EVENTS` | `record(kind='event')` | 生成稳定 `record_id`；日期/类型/标签；来源默认未知；不得复制成独立事件表 |
| `selected`/`timelineSelected`/`expandedHistory`/`flipped`/`metricIds`/`pin`/`showEvents` | 不迁移 | 视图状态；导出选择只进 `artifact_item` 快照 |
| `width`/`range`/`zoom` | `ui_preference` | 仅视图偏好；不含私密/正文 |
| `files[].content/blob` | 不迁移 | 内存文本缓存是可重算缓存，不入库、不复制；原件留在原位置，只登记 `source_document` 元数据 |
| `candidates[]` | `import_candidate` | 未采纳不迁移为事实；正文按候选规则处理；隐私按 §6.2 派生，不写 `not_private` 默认值 |

**隐私初始化（迁移 v1 必须显式执行，不能靠列默认值）**

原型 JSON 里只有 `private` 布尔，且 `history[]`、`files[]`、`candidates[]` 的标记各自独立。迁移必须按下面的表逐项写入，禁止用 `DEFAULT 'not_private'` 或“没有 `private` 就当公开”：

| 旧输入 | 目标 `privacy_state` | `privacy_origin` | `validation_state` | 备注 |
|---|---|---|---|---|
| 记录当前 `private: true` | `private` | `migration_default` | `ok` | 记录自身私密 |
| 记录当前 `private: false` | `not_private` | `migration_default` | `ok` | 仅在来源链也不受保护时成立 |
| 记录当前缺失 / `null` / 非 JSON 布尔（字符串 `"true"`、数字 `1` 等） | `unknown` | `legacy_unknown` | `needs_review` | 不按形状猜 |
| 记录 `fileId` 指向的原件为 `private` | `private`（取记录自身与原件中更强的一档） | 自身 `private=true` 时 `migration_default`，否则 `inherited_document` | `ok` | 对齐 SPEC“原件私密时已生成记录同步私密” |
| 记录 `fileId` 指向的原件为 `unknown` | `unknown` | `inherited_document` | `needs_review` | 原件行不可判定 |
| 记录所有修订均无可用 `fileId`（键缺失或 null）、`original` 为空且 `source` 无原件痕迹，且无候选互指（从未登记文件） | 保持记录自身状态（缺失→`unknown`）；`source_floor='not_private'` | `migration_default`（缺失时 `legacy_unknown`） | `ok`；仅隐私缺失时 `needs_review` | `no_file`：`source_document_id=NULL`、`source_kind='manual'`、保留 `source_text`；不因“没有文件”强制 unknown；若之后写入了候选互指，必须重算来源保护 |
| 记录 `fileId` 有值但目标原件不存在/不同 subject，或 `fileId` 为 null/键缺失但 `original`/`source` 显示曾有原件（`unresolved`） | `source_document_id=NULL`；记录至少 `unknown` | `legacy_unknown` | `needs_review` | 不伪造 `source_document`；`source_kind='document'`；不得当成 `no_file`/手工来源 |
| `history[]` 单项 `private: true/false` | `private/not_private` | `legacy_import` | `ok` | **只看该历史项自身，不继承记录当前值** |
| `history[]` 单项缺失/非布尔 | `unknown` | `legacy_unknown` | `needs_review` | 正文原样保留 |
| `files[]` 项 `private: true` | `private` | `migration_default` | `ok` | `privacy_ever_private=1`、`privacy_epoch=1` |
| `files[]` 项 `private: false` | `not_private` | `migration_default` | `ok` | `privacy_ever_private=0`、`privacy_epoch=0` |
| `files[]` 项缺失/非布尔 | `unknown` | `legacy_unknown` | `needs_review` | `privacy_ever_private=0`、`privacy_epoch=0`；**不得预置 sticky**；这是“无法判定”，不是“曾私密”的事实断言 |
| `candidates[]` 项 | 按 §6.2 从所属原件派生 | `inherited_document` 或 `legacy_unknown` | `needs_review` 除非可判定 | 无原件/原件未知一律 `unknown`；从不默认公开 |
| `created_at`/历史时间缺失或非法 | 迁移时间戳 | — | `needs_review` | 原字符串存入 `details_json.legacy.created_at_raw`，不得丢弃 |

**采纳关系的解析（W-02）**

原型/旧库没有统一的“候选 ↔ 记录”外键，只有三种可能痕迹：`record.candidateId`/`originCandidateId`、`candidate.adoptedRecordId`、`candidate.state`。迁移必须先解析这三者，不得按文本相似、数组顺序、日期接近或“看起来像同一条”推断采纳关系。

- **可判定**：候选标 `adopted` 且 `adoptedRecordId` 指向某 record，同时该 record 的 `originCandidateId` 反向指向该候选，三者同 subject → `adoption_state='resolved'`，写互指。
- **明确未采纳**：候选标 `discarded`/`withdrawn` 且没有任何 record 反向指向它；或 payload 完全没有 `records`（不存在可对应记录）且候选 `pending` → `adoption_state='resolved'`，`adopted_record_id=NULL`，保持原状态。
- **不可判定/冲突**：一侧有链接而另一侧没有、两列指向不同对象、record 指向的候选不存在/跨 subject、同一候选被多条 record 指向；**payload 存在 `records` 但候选 `pending` 且无双向链接**（无法证明是否已采纳）；或只有“文本/顺序相似”可猜 → `adoption_state='unknown'`。**禁止**用文本相等、日期相等、`legacy_ref` 相似或数组位置补出关系，也禁止伪造 `record_id`/`candidate_id` 占位。
- **两种处理模式**，迁移入口必须在报告中写明实际模式；默认 `unknown`，`strict_reject` 需显式 opt-in，不能静默切换：
  - `unknown`（默认）：候选写 `state='pending'`、`adoption_state='unknown'`、`adopted_record_id=NULL`；对应 record 的 `origin_candidate_id=NULL`（原值只写入 `details_json.legacy`，不丢证据）、修订保持 `legacy_import`；候选在人工映射前**不可采纳**（`candidate.adopt` 返回 `adoption_unresolved`）。报告逐条列 legacy 键与原因，不把 `unknown` 写成“已采纳/未采纳”。
  - `strict_reject`（显式 opt-in）：只要出现一条不可判定/冲突，整批 `ROLLBACK`，报告 `adoption_unresolved` 与计数，保留现场并交人工映射；不得写部分成功。

迁移报告必须包含 `adoption_resolved`、`adoption_unresolved`、`adoption_rejected` 计数与逐条原因；没有这份报告，不得声称迁移完整。`adoption_state` 是候选的显式列（§9.2），不是 `details_json` 里的注释；`record.origin_candidate_id` 与 `candidate.adopted_record_id` 仍必须互指，`unknown` 时两者都为 NULL。

**迁移算法（伪代码，合同级；不是可执行 SQL）**

> **2026-11-03 复核决定：draft.4 的 SQL 骨架已整段删除，任何人不得从旧版本或 git 历史复制执行。** 删除原因不是“排版不好”，而是四处会直接写错数据：① `record_revision` 的列名 `created_by` 与 DDL 的 `created_by_actor_id` 不一致，且漏掉必填的 `occurred_precision`；② `source_document` 与 `record_revision` 对多行数据复用单一 `:document_id/:revision_id/:record_id`，多行会撞主键或把归属写错；③ `history[]` 用 `/* 同上列 */` 占位，无法执行；④ 候选 `UPDATE import_candidate ... FROM import_candidate c LEFT JOIN source_document d` 没有 `WHERE c.candidate_id = import_candidate.candidate_id`，自连接会把连接结果写到所有候选，造成**跨行隐私泄露**。draft.6 进一步删除了同一段残留的 `UPDATE import_candidate` 伪 SQL——v1 迁移中候选行尚不存在，`affected_rows` 必然为 0；改为逐条 INSERT `import_run`/`import_candidate` 的伪代码。正式迁移只能由迁移文件 + fixture + 测试构成；本节的伪代码是合同，不是脚本，**不得被复制、拼接或改写为可执行 SQL**。

```text
migrate_v1(payloads, ctx, adoption_mode='unknown'):
  assert ctx.schema_version == 0
  assert ctx.subject_id != null and ctx.subject_actor_id != null
  assert ctx.migration_actor_id != null and ctx.migration_actor_id != ctx.subject_actor_id
  assert adoption_mode in ("strict_reject", "unknown")
  BEGIN IMMEDIATE
  ts = ctx.migration_ts                  # UTC ...Z，合法定长

  # 0) 先解析采纳关系；不根据文本/顺序猜测（W-02）。默认 unknown；strict 才整批拒绝。
  adoption = resolve_adoption(payloads)
  if adoption.unresolved and adoption_mode == "strict_reject":
      ROLLBACK
      report("adoption_unresolved", adoption.unresolved)
      raise migration_error("adoption_unresolved")

  # 1) 原件：逐项登记，每项生成独立 document_id；不复制文件内容。
  for f in payloads.files, 按数组顺序逐项:
      doc_id = new_stable_id("doc", f.legacy_id)
      st, origin, val = derive_document_privacy(f.private)
      ever  = (st == "private") ? 1 : 0
      epoch = (st == "private") ? 1 : 0   # 初值 0，进入 private 才为 1
      INSERT source_document(
        document_id=doc_id, subject_id=ctx.subject_id,
        display_name=f.name, mime=f.mime, byte_size=f.byte_size, sha256=NULL,
        privacy_state=st, privacy_origin=origin, validation_state=val,
        privacy_ever_private=ever, privacy_epoch=epoch,
        privacy_state_seq=(st == "private") ? 1 : 0,
        link_state="unverified", registered_at=ts, last_verified_at=NULL)
      file_map[f.legacy_id] = doc_id

  # 2) 记录：每条 record 生成独立 record_id，每个修订生成独立 revision_id。
  #    resolve_author: 仅当 payload 有 authorActorId/onBehalfGrantId 且能同 subject 校验时 known；
  #    否则 -> ("unknown", NULL, NULL)。不得默认 ctx.subject_actor_id，也不得用迁移 actor 冒充作者。
  #    历史修订的来源指针必须同样落库（source_chain 覆盖历史），分类规则与当前修订一致。
  resolve_ref_fields(x):
      has_ref = ("fileId" in x) and (x.fileId != NULL)
      doc_id = has_ref ? resolve_same_subject(file_map, x.fileId) : NULL
      trace = (x.original != NULL) or origin_marker(x.source)   # “原件：/原件已移除”
      kind = (has_ref or trace) ? "document" : "manual"
      return (doc_id, kind)
  for r in payloads.records, 按数组顺序逐条:
      rec_id = new_stable_id("rec", r.id)
      has_file_ref = ("fileId" in r) and (r.fileId != NULL)
      doc_id = has_file_ref ? resolve_same_subject(file_map, r.fileId) : NULL
      has_origin_trace = (r.original != NULL) or origin_marker(r.source)  # “原件：/原件已移除”
      history = r.history ? r.history : []    # 老→新，按原序，不排序
      # 聚合当前及全部历史来源；悬空、跨主体或曾有原件但指针丢失均 unresolved。
      resolution = resolve_legacy_source_chain(r, history, file_map)
      # 无任何指针和原件痕迹才 no_file；所有指针均可解析且同主体才 resolved。
      st, origin, val = derive_record_privacy(r.private, doc_id)
      if resolution == "unresolved":
          st, origin, val = "unknown", "legacy_unknown", "needs_review"
      rec_source_kind = (has_file_ref or has_origin_trace) ? "document" : "manual"
      aes, a_id, grant_id = resolve_author(r)
      INSERT record(record_id=rec_id, subject_id=ctx.subject_id,
        kind=map_kind(r.kind), author_state=aes, author_actor_id=a_id,
        on_behalf_grant_id=grant_id, origin_candidate_id=NULL, legacy_ref=r.id,
        lifecycle_state="active", created_at=coalesce_utc(r.created_at, ts))
      record_map[r.id] = rec_id

      n = len(history)
      for i, h in enumerate(history):         # 历史：1..N（老→新）
          rev_no = i + 1
          h_rev = new_stable_id("rev", r.id, rev_no)
          h_doc, h_kind = resolve_ref_fields(h)   # h_doc 为 NULL 且 h_kind='document' 即“指针已丢”
          h_st, h_origin, h_val = derive_history_privacy(h.private)  # 隐私只看该项自身，来源不改写
          INSERT record_revision(
            revision_id=h_rev, record_id=rec_id, revision_no=rev_no,
            occurred_*, privacy_state=h_st, privacy_origin=h_origin,
            validation_state=h_val, source_document_id=h_doc, source_text=h.source,
            source_kind=h_kind, change_kind="legacy_import",
            created_by_actor_id=ctx.migration_actor_id, created_at=coalesce_utc(h.created_at, ts),
            details_json=<原样 + 未知键>)       # 不得复用任何已有 revision_id/rec_id 作为新行 ID

      # 当前修订：N+1，内容取 record 自身，不取 history 最后一项。
      cur_no = n + 1
      rev_cur = new_stable_id("rev", r.id, cur_no)
      INSERT record_revision(
        revision_id=rev_cur, record_id=rec_id, revision_no=cur_no,
        occurred_date=parse_date(r.date), occurred_precision=precision_or_unknown(r.datePrecision),
        occurred_raw=r.date, end_*=<from r.endDate/ongoing>,
        privacy_state=st, privacy_origin=origin, validation_state=val,
        source_document_id=doc_id, source_text=r.source,
        source_kind=rec_source_kind,
        change_kind="legacy_import", created_by_actor_id=ctx.migration_actor_id,
        created_at=coalesce_utc(r.created_at, ts), details_json=<8KiB 内原样>)
      # 缺精度 -> unknown + needs_review；非法日期 -> raw 保留 + needs_review；
      # 未知键放 details_json.legacy；字符串不解析成结构。
      # 自检：cur_no == MAX(revision_no) == n+1；编号连续 1..n+1 无重复；
      #      当前字段逐项等于 r 的当前字段（失配 -> ROLLBACK revision_self_check_failed）

  # 3) 解析 run：document_id 必须非空；缺失即失败关闭，不写占位行。
  for run in payloads.import_runs, 按数组顺序逐项:
      run_id = new_stable_id("run", run.legacy_id)
      run_doc_id = resolve_same_subject(file_map, run.fileId)
      if run_doc_id == NULL:
          ROLLBACK
          raise migration_error("source_unresolved")   # import_run.document_id NOT NULL
      method = map_run_method(run.method)
      consent_id = map_consent(run)
      if method == "cloud" and consent_id == NULL:
          ROLLBACK
          raise migration_error("consent_unresolved")  # 无明确 consent 的云 run 不得迁移，也不得补造
      INSERT import_run(
        import_id=run_id, subject_id=ctx.subject_id, document_id=run_doc_id,
        method=method, consent_id=consent_id,
        status=map_run_status(run.status), parser_version=run.parserVersion,
        started_at=coalesce_utc(run.startedAt, ts), finished_at=coalesce_utc(run.finishedAt, NULL),
        error_code=run.errorCode)
      run_map[run.legacy_id] = run_id
      run_doc_map[run_id] = run_doc_id

  # 4) 候选：逐条 INSERT，绝不 UPDATE ... FROM 自连接广播。
  for c in payloads.candidates, 逐条:
      cand_id = new_stable_id("cand", c.legacy_id)
      run_id = resolve_run_same_subject(run_map, c.runId)
      doc_id = resolve_same_subject(file_map, c.fileId)
      if run_id == NULL or doc_id == NULL or run_doc_map[run_id] != doc_id:
          ROLLBACK
          raise migration_error("source_unresolved")   # 三项 NOT NULL 且必须一致
      st, origin, val = derive_candidate_privacy(doc_id)
      a_state, adopted_record_id, c_state = resolve_candidate_adoption(
        adoption, c, record_map, adoption_mode)
      INSERT import_candidate(
        candidate_id=cand_id, subject_id=ctx.subject_id, import_id=run_id,
        document_id=doc_id, ordinal=next_ordinal(run_id),
        proposed_kind=map_kind(c.kind), proposed_text=c.text,
        state=c_state, privacy_state=st, privacy_origin=origin,
        validation_state=val, adoption_state=a_state,
        adopted_record_id=adopted_record_id,
        created_at=coalesce_utc(c.createdAt, ts), details_json=<8KiB 内原样>)
      candidate_map[c.legacy_id] = cand_id
      assert inserted_rows == 1            # 0 或 >1 立即 ROLLBACK

  # 5) 仅对 resolved 的采纳关系写互指；unknown 保持两列 NULL。
  for (record_key, candidate_key) in adoption.resolved:
      rec_id = record_map[record_key]
      cand_id = candidate_map[candidate_key]
      UPDATE record SET origin_candidate_id=cand_id
        WHERE record_id=rec_id AND subject_id=ctx.subject_id
      UPDATE import_candidate SET adopted_record_id=rec_id,
        state="adopted", adoption_state="resolved"
        WHERE candidate_id=cand_id AND subject_id=ctx.subject_id
      assert changes == 1 for each UPDATE

  # 6) 迁移后自检（含跨 subject 不变量；外键通过不算通过）
  assert 无 NULL 的 privacy_state/occurred_precision/created_by_actor_id
  assert 无孤儿 revision、无跨 subject 的 source_document_id
  assert 每条 record_revision.source_document_id 的 subject 与 record 相同
  assert 每条 import_run/import_candidate 的 subject 与 document 相同
  assert 每条 import_run/import_candidate 的 document_id 非空
  assert 每条 import_candidate.document_id = 所属 run.document_id
  assert 每条 resolved 采纳关系两列互指且同 subject
  assert 每条 unknown 候选 adoption_state="unknown" 且两列均为 NULL
  assert 每条 record 的 revision_no 连续 1..N+1、当前 = MAX、无重复；当前字段 = payload 当前字段
  assert author_state="unknown" 的记录两列作者字段均为 NULL；known 的作者同 subject、proxy 有 grant
  assert 无 method="cloud" 且 consent_id IS NULL 的 run；无 unresolved 来源被写成 not_private
  assert 每个 no_file 记录 source_kind="manual" 且 source_document_id IS NULL（source_text 保留）
  assert 无指针但 original/来源含“原件：/原件已移除”的记录 source_kind="document" 且至少 unknown+needs_review（不得落 no_file）
  assert 任一副本（含历史修订）source_kind="document" 且 source_document_id IS NULL 的记录，resolve_source='unresolved' 且至少 unknown+needs_review
  assert 不存在“当前修订 not_private 但 resolve_source 受保护（private/unknown/ever 未 release）”的记录；
         互指写入后若出现，必须追加 privacy 修订或整批 ROLLBACK
  assert 旧 ID 不复用、每行 ID 唯一
  write_migration_report(adoption)
  COMMIT
```

**伪代码约束（必须逐条实现，不能“等价简化”）：**

- **每行独立 ID**：`document_id`、`record_id`、`revision_id` 必须逐行生成；不得用同一个绑定参数覆盖多行，不得用数组下标当稳定 ID。
- **必填列显式给值**：`record_revision.occurred_precision` 至少 `unknown`；`created_by_actor_id` 使用真实列名；`privacy_state`/`privacy_origin` 无默认值；`validation_state` 显式写。
- **候选逐行插入**：v1 中没有预置候选行；必须为每个候选生成独立 `candidate_id` 并 INSERT，`subject_id`/`import_id`/`document_id` 显式写入且同 subject。不得用 `UPDATE ... FROM` 把连接结果广播到所有候选，也不得假设“先有行再更新”。
- **隐私派生**：按 §10.4 上表；`unknown` 不预置 `privacy_ever_private`/`privacy_epoch`（0/0），`privacy_state_seq=0`；`private` 为 1/1，`privacy_state_seq=1`；`not_private` 为 0/0/0；`history[]` 只看该项自身。迁移不得为 `unknown` 预置 ever/epoch，也不得把 `unknown` 写成 `not_private`。
- **跨 subject 校验**：每个引用在 INSERT 前校验同 subject；迁移后必须跑 §9.7 的不变量查询，发现任何跨 subject 行即 `ROLLBACK`，不得只依赖 `foreign_key_check`。
- **失败关闭**：任何必填缺失、目标原件跨 subject、JSON 非布尔、ID 冲突、行数不符、自检失败 → `ROLLBACK`，不写 ledger，不跳过继续。
- **采纳关系不猜**：只接受双向显式链接与合法 `state`；不得用文本/日期/顺序/`legacy_ref` 相似度推断。默认 `unknown` 只写 `adoption_state='unknown'` + 两列 NULL + 报告，候选保持 `pending` 且不可采纳；显式 `strict_reject` 下任一 unresolved 整批回滚。
- **run/candidate 来源非空**：`import_run.document_id` 与 `import_candidate.subject_id/import_id/document_id` 均 NOT NULL；任一解析不到同 subject 的真实行即整批失败，不得用空字符串、`0`、伪造 ID 或“先插 NULL 再补”绕过。
- **采纳互指自检**：resolved 关系必须 `record.origin_candidate_id = candidate.candidate_id` 且 `candidate.adopted_record_id = record.record_id`，同 subject；unknown 关系两列必须都为 NULL。缺一或指向别的 subject 即 `ROLLBACK`。
- **报告**：`write_migration_report` 必须写 resolved/unresolved/rejected 计数与 legacy 键；`strict_reject` 失败报告保留现场，不写 `schema_migration`。

时间列不套用上面的 `:migration_ts` 就完事：能解析成合法 UTC 的原值优先保留；否则写迁移时间戳，并把原字符串放进 `details_json.legacy.created_at_raw`、`validation_state='needs_review'`。**上述迁移算法是伪代码，未实现、未在宿主执行**；JSON1 行为、`json_type` 对字符串/数字的返回值、以及 `history[]` 的排序必须在 Q-08 探针中用真实导出验证后再冻结。

**明确不迁移：** `docs/` 里的演示说明、`BEIPAL_DEMO_RECORDS` 的合成 ID、原型中的 `pathwayDetail` 展示文本、任何 `original` 内嵌副本。生产初始化不得带 demo 数据；若要演示，使用独立 demo manifest 与精确 ID 清理，且不得写入真实数据根。**手工录入的 `source` 不在“不迁移”之列**：它属于用户事实，必须保留；只有无来源的展示文本才丢弃。

### 10.5 冻结与变更（阻塞项 vs 未来事项）

G3 签认时必须把“现在必须定”的和“以后可以再定”的分开；**未来事项不阻塞本版冻结，但必须登记，不能悄悄当成已解决**。

**阻塞冻结（G3 前必须有明确结论，否则不进入建库/实现）**：

- `schema_version=1`、第 5.3 节 kind 表、第 5.2 节日期字节规则；
- 第 4 节隐私判定：`protected_revision` / `protected_record` 两个作用域、`source_locked` 的来源链口径、候选派生、`privacy_ever_private` 粘性、`record.releaseSourceLink` 的逐条解除合同、按条历史（Q-03 已按 SPEC 定）、本版 AI 硬禁止（Q-10 本版部分）；
- 第 6 节候选生命周期与“原件不复制、不做文件引用”的边界；
- 第 8.1 节目录布局（无 `parsed/`、`tmp/` 会话临时）、第 8.2 节备份不含 `tmp/`；
- 第 9.3 节 `created_at` 的 NULL/24:00 检查、第 9.5/9.6 节回执 `(subject_id, actor_id, request_id)` 复合主键与三者同时匹配的作用域、锁序与隐私优先的错误顺序；
- 第 10.1/10.2 节“单事务默认 + 重建例外”的迁移边界，以及重建时 **COMMIT 前** 的 `foreign_key_check`、事务外的 `foreign_keys=OFF/ON`；
- 第 10.4 节旧数据隐私初始化：true/false/缺失/非布尔、`history[]` 逐项、`files[]`（unknown 不预置 ever/epoch）、`fileId` 缺失/null（区分无原件痕迹与曾有原件痕迹）、`created_at` 的显式规则与**伪代码**（不是 SQL）；V-33 仍未验证；
- 第 10.4 节采纳关系：`adoption_state`、默认 `unknown` 模式、显式 `strict_reject` 整批拒绝、run/candidate 来源非空、互指自检与报告；Q-31/V-48 未验证；
- T-03 `record.correct` 不得改变隐私；T-04 epoch 统一口径；T-05 非本人不见受保护历史元数据；T-06 unknown 原件解锁路径；T-07 回执三列主键；T-08 迁移 unknown 不预置 ever；T-09 传播写入新状态。

**本草案自身的 G3 阻塞（不是“设计已完成”）**：以下六项均**明确阻塞**，冻结/建库/生产发布前不得绕过：

- **Q-27（sticky 逐条解除）**：`record.releaseSourceLink` 只有合同，**实现、UI、迁移回填、审计展示与端到端测试均未完成**；不得用原件级开关代替，不得提供批量解除。
- **Q-28（恢复后回执失效）**：策略未设计、未实现、未测试；备份恢复后旧回执可能使重放跳过应重新发生的写入，阻塞版本恢复相关的生产发布。
- **Q-29（重建表迁移崩溃检测/补偿）**：非原子窗口的检测、停机与恢复流程未设计；未设计前不得进入生产迁移，也不得自动续跑或自动选表。
- **Q-30（跨 subject 引用校验）**：§9.7 只有清单，**写入校验、迁移后不变量查询、负向测试均未实现**；外键只保证行存在，不保证同 subject。未验证前不得声称多 subject 隔离成立。
- **Q-31（迁移采纳关系不可判定）**：§10.4 的 `adoption_state`/`resolve_adoption`/`strict_reject`/`unknown` 只有合同与伪代码；**没有 fixture、没有真实旧导出验证、没有整批回滚/unknown 模式测试**。任何迁移在无法证明候选↔记录关系时，不得按文本/顺序猜测或写假互指；默认 `unknown`（候选不可采纳、两列 NULL、报告逐条原因），`strict_reject` 必须显式选择并整批回滚。未验证前不得声称迁移完整或采纳关系已还原。
- **Q-33（旧 cloud run 无 consent 证据）**：迁移侧无法证明 `cloud_parse` consent 时整批 `ROLLBACK`/`consent_unresolved`；不补造 consent 行、不写 run、不改写成成功状态。该项属**迁移阻塞**（不改变运行时合同），取得真实旧导出/服务方回执前不得声称迁移完整。

**未来事项（记录在案，不阻塞 v1；不得在本版实现）**：Q-27/Q-28/Q-29/Q-30/Q-31/Q-33 不在本清单，已移入上方“本草案自身的 G3 阻塞”；Q-32 默认 `author_state='unknown'`，不阻塞本版。

- Q-10 的“本人逐条授权私密内容进 AI”是否放开——需先改 `docs/SPEC.md` 并重走评审；
- P-04 回溯口径——需先改 SPEC 再改 §4.1；
- Q-17 是否允许把原件复制进库/持久化解析文本；
- Q-02/Q-23 加密与文件权限、Q-19 回执保留期、Q-14 备份保留与异地副本。

G3 记录应逐项写“已定/阻塞/未来”，不能把未来事项写成“已确认”。冻结后变更分三类：
  1. **数据变更**：新增普通指标/新 kind（若无需新列）→ 只改数据/注册表，不升 `schema_version`；
  2. **兼容结构变更**：新增可空列/索引/表 → 升 `schema_version`，走 expand/contract；
  3. **破坏性变更**：改名/删列/改语义 → 必须新增大版本、双读/回填/切换，禁止原地改。
- 每次结构变更都必须带：迁移文件、fixture、前后计数、回滚说明、`data_version` 兼容说明。

---

## 11. 可验证约束

下表是**可执行/可复核**的合同断言，不是“已通过”的声明。G3 前大部分状态为“未执行”；M5 建测试库后才逐条跑。

| 编号 | 约束 | 验证方式 | 当前状态 |
|---|---|---|---|
| V-01 | 本任务只修改 `docs/DATA-MODEL-DRAFT.md`；没有创建数据库/数据目录/迁移文件，也没有改其他文件 | 核对本文件与 `git status --short`；工作树中既有未提交修改和并发修改不属本任务，不得回滚 | 已核对（2026-11-03，修订结束时复核）：仅本文件变更；库/目录/迁移均未创建 |
| V-02 | 每条 `record` 都有 subject/kind/`author_state`；`known` 时作者字段非空且同 subject、`unknown` 时两列均为 NULL；每条修订都有 privacy/precision/created_by_actor_id | SQL：`COUNT(*) WHERE ... IS NULL` 全为 0，且 `author_state` 与两列作者字段的一致性查询为 0 行 | 未执行（无库） |
| V-03 | 日期组合合法：unknown→NULL；month→`YYYY-MM`；day→真实公历日；非法旧值保留 raw+needs_review；日期列是定长 ASCII 字节 | fixture 含 `2026-02-30`、`2019 年初`、空精度、全角数字/带空格日期；查询非法组合=0，`length(hex(...))` 不符=0 | 未执行 |
| V-04 | 修订只增不改；`revision_no` 连续；当前=max | 尝试 UPDATE/DELETE 触发 ABORT；查询断号=0 | 未执行 |
| V-05 | 候选不是事实：`pending` 不出现在看板/时间线/导出/指标 | 各读模型中 `record.origin_candidate_id` 指向的候选 `state!='adopted'` 计数=0 | 未执行 |
| V-06 | 无有效 grant 的代记写入被拒；有界授权期的未知日期默认拒绝 | 以 proxy 调 `record.create`，断言 `not_authorized/grant_scope_missing`；审计有拒绝记录 | 未执行 |
| V-07 | 私密/未知默认不进导出、摘要、AI；显式纳入有 consent | 默认查询私密计数=0；逐条纳入后 `artifact_item.included_private=1` 且有 `consent_id`；AI 路径无 override | 未执行 |
| V-08 | 受保护历史默认只回元数据；公开历史按条可见、不回溯隐藏；**非本人 0 正文且 0 元数据**；打印 DOM 无正文/元数据 | API 默认响应无 `text/details`；非本人查询受保护历史断言正文、ID、修订号、时间、类型、隐私状态、计数均为 0，且不出现空位/断号；当前记录转私密后旧 `not_private` 修订仍按条可读（SPEC 口径）；打印快照扫描 | 未执行 |
| V-09 | 来源链上任一原件为私密/未知/removed 不可判定，或原件曾为 private 且该 `(record, document)` 未解除时，记录不能为 `not_private`；删当前 `source_document_id` 也不解除 | 当前修订 `not_private` 但链上有受保护环节的记录计数=0；构造“历史修订引用私密原件、当前修订删指针”仍受保护；原件 private→not_private 后记录仍受保护；改公开被拒 | 未执行 |
| V-10 | 受管理路径不越界；原件不复制、只登记元数据；**无持久 `parsed/`、无 `input/`**；登记时可选 hash/size 一致 | 构造 `../`、绝对路径、越界 symlink 写 `output/tmp`，全部拒绝；原件目录在登记前后文件数不变；解析后数据根无 `parsed/`；hash 错配被拒 | 未执行 |
| V-11 | 指标不换算、不合并可比组、不把空当 0、单点不连线 | 用跨单位/方法/机构、同日并列、`<0.5` fixture 跑 `metrics@v1`，断言断点/delta 为空 | 未执行 |
| V-12 | 同一 `data_version` 下跨页对账；事实变更后旧 artifact 只标 stale，且 `status_data_version` 与 `data_version` 同事务 | 计数对账；改一条记录后 `data_version+1`，artifact `source_data_version` 不变、`status='stale'` 且 `status_data_version=新版本`；注入 artifact 更新失败断言事实也回滚 | 未执行 |
| V-13 | 迁移保留 ID/计数/日期/隐私/授权；失败可回滚；备份可恢复 | fixture 升级前后对比；注入失败；从备份恢复到新目录并只读启动 | 未执行 |
| V-14 | 撤回解析：候选正文与会话临时产物清除；**已采纳记录与其 `source_document` 指针保留**；不声称云端已删 | fixture 撤回后候选正文=0、已采纳记录仍在、`source_document_id` 未变；UI/审计文案检查 | 未执行 |
| V-15 | 审计/日志不含正文或私密值；只含 ID/状态 | 扫描 `audit_event.old_state/new_state` 与日志样本；断言无 `text`/药名/数值 | 未执行 |
| V-16 | 真实根目录：无默认创建；非空目录需确认；卸载不删除 | 首次启动无根时禁止写入；非空目录弹确认；模拟卸载后根仍在 | 未执行 |
| V-17 | 指标分类顺序/组名/项数在看板与一图秀同源 | 两读模型对比 `categoryOrder` 与 item 数 | 未执行 |
| V-18 | 生产根不含 demo 数据；demo 清理只按精确 ID | 初始化脚本不写入合成记录；生产根无 demo manifest；清理脚本只匹配 manifest ID | 未执行 |
| V-19 | 每个连接 `foreign_keys=1`；删除不级联；孤儿行=0；重建迁移在 COMMIT 前查孤儿、外键开关在事务外 | 查询 `PRAGMA foreign_keys` 必须为 1；尝试删被引用行被 RESTRICT 拒绝；重建 fixture 注入孤儿后 `foreign_key_check` 在事务内返回行、`ROLLBACK` 后新表不存在；提交后 `ON` 并复核空 | 未执行（仅 §11.1 内存冒烟） |
| V-20 | 写命令幂等：同 `(subject_id, actor_id, request_id)` 同载荷重放不重复写；同 subject+actor 不同载荷拒绝；不同 subject/actor 同 ID 独立；回执最小化且按三者同时匹配 | 连续两次同请求断言行数不变、返回同结果；改载荷断言 `idempotency_conflict`；两个 actor 或两个 subject 用同一 `request_id` 各得一条、互不命中；只按 `(actor_id, request_id)` 查不得返回他 subject；proxy 读不到 self 回执，proxy 回执无 record/document ID | 未执行（仅 §11.1 三列主键/查询骨架） |
| V-21 | 并发正确更新：基于旧修订且改动不同字段可合并成功；改同一字段冲突；**`record.correct` 不改变隐私** | 两个客户端从 rev N 出发，A 改 text、B 改日期，B 后提交成功且两处都在；再构造同字段冲突断言 `revision_conflict`；构造携带 `privacy_state` 的 correct 断言 `privacy_changed`，且修订的 privacy 与 current 相同 | 未执行 |
| V-22 | 隐私变更仅 self 可做，代理调用被拒，且无“系统”绕过 | 以 proxy 调 `record.setPrivacy`/`document.setPrivacy` 断言 `not_authorized`；审计有拒绝记录 | 未执行 |
| V-23 | 件级隐私传播原子且**不降级**：一次事务只对当前 `not_private` 记录追加隐私修订，已受保护记录不改写、不把 `private` 降为 `unknown`；候选按“原状态与新状态较强者”更新；产物置 `quarantined` 并写 `status_data_version=新 data_version`；`data_version` 整批 +1；失败全回滚 | 注入中途失败，断言无半传播、`data_version` 未增、artifact 状态未变；成功时当前 `not_private` 记录计数与修订一致；已 `private` 候选在 document→unknown 后仍 `private`；已受保护记录状态不变；含受影响记录的 artifact `status='quarantined'` 且版本同事务 | 未执行 |
| V-24 | 代理视图不含受保护记录的存在性、计数、占位、元数据 | 以 proxy 拉看板/时间线/导出候选，断言受保护项=0 且无 `hidden_count`；响应与“不存在”不可区分 | 未执行 |
| V-25 | AI 上下文零私密/未知：任何 AI 请求载荷不含受保护记录或其摘要，且只含当前修订 | 拦截 AI 请求体扫描；构造“当前公开、选中旧私密修订”断言拒绝；构造全私密库断言上下文为空；无 `ai_context` consent 时拒绝 | 未执行 |
| V-26 | 移除文档不删原件、不删已采纳记录、不改写历史来源；备份不声称含原件 | 移除后原件仍在、记录与 `source_document` 行仍在、`link_state='removed'`；备份清单无原件文件 | 未执行 |
| V-27 | 版本恢复：`record.restoreRevision` 新增修订不删历史；**只恢复内容、不恢复/降低隐私、不得洗白**；self-only；代理拒绝且不泄露目标；恢复后来源指针保留；库恢复校验 ledger 连续 | 恢复后修订数 +1、旧修订仍在、当前隐私不变；请求带 `privacy_state` 断言 `privacy_changed`；目标私密/未知而当前 `not_private` 断言 `privacy_locked`；proxy 调用断言 `not_authorized` 且无存在性差异；新修订 `restored_from_revision_id` 正确且 `source_document_id` 未被清空；篡改 ledger 缺口断言拒绝启动 | 未执行 |
| V-28 | 9.3 DDL 明确标注非完整合同；示例字段不被当作 G3 已覆盖 | 人工核对 §9.3 省略清单；G3 记录引用完整脚本而非示例 | 本文件已标注；G3 待签（不依赖建库） |
| V-29 | 来源链继承：当前/历史修订或候选 run 引用受保护原件时，`protected(...,'record')` 在链解除前始终为真；采纳不洗白；移除原件登记不解除；原件取消私密后仍靠 sticky 受保护；`protected(...,'revision')` 不因此隐藏公开历史 | fixture：原件 private → 候选 private → 采纳后记录 protected；把当前修订 `source_document_id` 置空后仍 protected；`document.remove` 后仍 protected；原件改回 not_private 后记录仍 protected；同一记录的公开历史修订仍 `revision` scope 可见；`protected(...,'record')` 与读模型结果一致 | 未执行 |
| V-30 | 原件只靠会话句柄重开：库内无路径/句柄；`import.start` 无会话句柄即 `source_handle_unavailable`；无 `present` 状态 | 扫描 schema 确认无 path/handle 列；刷新后未重选文件调 `import.start` 断言失败；重选后成功；localStorage/IndexedDB 无句柄 | 未执行 |
| V-31 | 所有日期/瞬时列定长 ASCII 字节：`length` 与 `length(hex())` 同时匹配；`details_json` 按字节 ≤8 KiB；`created_at` 为 UTC `...Z` | 对每个日期列注入全角数字、组合字符、尾随空格、`2026-02-30T...`、`2026-13-01T...`、`24:00:00`；断言 CHECK 拒绝；`details_json` 用多字节内容断言按字节计 | 部分：仅 §11.1 的 `created_at` 骨架；未覆盖所有日期列，未在宿主执行 |
| V-32 | `created_at` 的 NULL/24:00 修复不能被旧 CHECK 误述：`2026-13-01` 必须拒绝，`2026-02-30` 由归一化不等拒绝而不是 NULL 放行，`24:00` 必须拒绝 | 同一 fixture 分别插入旧 CHECK 与新 CHECK；断言旧表接受 `2026-13-01`/`24:00`、新表全部拒绝；`2024-02-29` 接受、`2026-02-29` 拒绝 | 部分：§11.1 骨架含对应断言，本次未保留执行输出，未在宿主执行 |
| V-33 | 迁移隐私与结构初始化：true/false/缺失/非布尔分别落 private/not_private/unknown；`history[]` 逐项不继承当前私密；`files[]` 写 ever/epoch/**seq**，unknown 必须 0/0/0；**`history[i]` 按老→新写 `revision_no=i+1`，当前内容写 `N+1` 且不重复进历史**；历史修订的 `fileId`/`source` 同样落 `source_document_id`/`source_kind`（隐私仍只看该项 `private`），不得丢历史指针；**来源三态**：`fileId` 键缺失或 null 且 `original` 为空、`source` 无“原件：/原件已移除”→`no_file` + `source_kind='manual'`；有值但悬空/跨主体，或 `fileId` 为空但保留原件痕迹→`unresolved` + `source_kind='document'` + 至少 unknown+needs_review；**作者**：无证据→`author_state='unknown'` + 两列 NULL，不得默认本人；**云 run**：无 consent 整批 `ROLLBACK`/`consent_unresolved`，不补造 | 用原型形状 fixture 跑 §10.4 伪代码/等价实现；断言 `history` 缺失项 unknown、公开项保留、当前私有项不传播到历史；断言历史编号连续、当前 = `MAX` 且字段 = payload；`fileId` 键缺失/null 且无原件痕迹的记录 `source_document_id IS NULL`、`source_kind='manual'` 且不因缺文件强制 unknown；悬空记录至少 unknown+needs_review；`fileId` 为空但 `original`/来源含原件痕迹的记录断言 `unresolved`+`source_kind='document'`+`needs_review`，不得落 manual；`files` unknown 的 ever/epoch/seq 均为 0；`import_candidate` 行数=payload 候选数且 `import_id` 非空；跨 subject 候选被拒；cloud run 缺 consent 断言无 run/无候选且整批回滚 | **未验证**：伪代码无实现、真实旧库未取得；不得把伪代码当 SQL |
| V-34 | sticky 逐条解除：release 只清 `(record, document, 当前 epoch, 当前 state_seq)`；旧 epoch/旧 seq 失效；`unknown` 往返后旧 release 失效；release 不改记录隐私；proxy 无此能力；未实现前整套流程是 G3 阻塞 | fixture：doc private→not_private(ever=1) 仍 protected；release 后 `source_locked` 才可能为 false；doc 再 private（epoch+1）后旧 release 不生效；`not_private→unknown→not_private`（seq 递增）后旧 release 不生效，必须重新 release；同 `(record,doc,epoch,seq)` 重复 release 被拒；release 后记录仍 `not_private`，需单独 `setPrivacy` | **部分且不可当证据**：§11.1 旧 release/epoch 断言曾观察过；draft.6 新增的 `privacy_state_seq`/`document_state_seq` 断言本次未执行；命令/UI/迁移/端到端均无证据；G3 阻塞 |
| V-35 | 出站双 scope：AI/导出/artifact 必需同时校验选中 revision 与 current record；任一侧受保护即拒绝；AI 只发当前修订 | fixture：记录当前公开但选中旧私密修订 → AI/导出/artifact 全部拒绝；当前受保护但选中旧公开修订 → 同样拒绝；AI 载荷只含 current `revision_no`，不含修订号列表/来源 ID | 未执行 |
| V-36 | artifact 构建/下载隔离：构建时记录双 scope `included_private`；下载时重判并重算 `contains_private`；构建后被保护置 `quarantined`；每个私密条目各自需新的匹配 `private_export`；proxy 不可下载含私密产物 | 构建后把记录转 private，断言 artifact `quarantined` 且下载拒绝；同一 `private_export` 第二次下载断言 `consent_required`；含两条私密项的产物只签一条同意，断言 `consent_required`；proxy 下载含私密条目断言 `not_authorized`；回执无记录 ID | 未执行 |
| V-37 | restore 不洗白：self-only；目标保护等级高于当前（private > unknown > not_private）→ `privacy_locked`；代理拒绝且响应不区分目标存在；新修订隐私等于当前记录且不低于目标；来源指针保留；`restored_from_revision_id` 同 record | 构造“旧私密修订 + 当前公开记录”和“旧私密修订 + 当前 unknown 记录”调用 restore，均断言 `privacy_locked`；构造“旧公开修订 + 当前 private 记录”断言成功且新修订仍 `private`；proxy 调用断言 `not_authorized` 且与不存在响应同码；恢复后 `source_document_id` 与目标一致；`restored_from_revision_id` 指向同 record 目标 | 未执行 |
| V-38 | 跨 subject 引用全部校验：record/author/grant、revision/source_document、run/candidate/document、release、consent、artifact_item、audit/回执、adopted/origin/restored 指针均同 subject；写入拒绝且迁移后不变量为 0 | 对每类引用构造跨 subject fixture，断言 `cross_subject_reference`/`source_unresolved` 且无半写；迁移后跑 §9.7 不变量查询断言 0 行；只靠 FK 的旧实现会被该 fixture 抓到 | 未执行；G3 阻塞（Q-30） |
| V-39 | 缺失候选来源失败关闭 + proxy adopt 强制 unknown：import/document 缺失、run 与候选 document 不一致、跨 subject → `unknown`+`needs_review` 且采纳 `source_unresolved`；proxy 采纳一律 `unknown`+`proxy_default`+`needs_review` 且需 grant；仅 self 可显式转 manual | 构造缺 `document_id`/缺 `import_id`/不一致/跨 subject 四类候选，断言不可采纳且无 `not_private` 记录生成；proxy 采纳公开候选断言初始修订 `unknown`/`proxy_default`；self 转 manual 断言 `source_kind='manual'` 且 `source_document_id IS NULL` | 未执行 |
| V-40 | 身份与授权前置：actor 只来自会话；请求体 `actor_id` 被忽略；demo 不能写生产 subject；proxy 需 `host_authenticated`+有效 grant 覆盖 kind/日期；consent/setPrivacy/release 仅 self；拒绝不区分无权限/不存在 | 伪造请求体 actor 断言无效；demo 写生产断言 `demo_violation`；proxy 无 grant/日期越界断言 `grant_scope_missing`；proxy 调 consent/setPrivacy/release 断言 `not_authorized`；比较“不存在”与“无权限”响应码/时延量级 | 未执行 |
| V-41 | 缓存键含 subject：`subject_id + data_version + read_model_version + viewer_actor_id + 授权 scope 版本`；缺任一键丢弃；本人/代理、跨 subject 缓存不互用；授权变更递增 `data_version` 使缓存失效 | 构造两个 subject 同 viewer 请求，断言不串数据；proxy 请求不复用 self 缓存；撤销 grant 后旧缓存不再命中；删除缓存键中 `subject_id` 的负向实现会被抓到 | 未执行 |
| V-42 | `unknown` 往返 release 失效：`privacy_state_seq` 任何实际状态变化 +1、同值不增；release 记录签发 seq；`private→not_private→release→unknown→not_private` 后旧 release 不生效，需重新逐条 release；迁移 seq 正确（private=1，其他=0） | 按序列构造并断言每步 seq 值；旧 release 在 seq 变化后 `source_locked` 仍为真；重复提交同状态 seq 不变；迁移 fixture 断言三类初始值 | 未执行 |
| V-43 | 来源链悬空/跨 subject/不一致失败关闭：`record.origin_candidate_id` 指向的候选/`import_run`/`source_document` 任一缺失、跨 subject、`candidate.document_id != run.document_id`、或 `adopted_record_id` 与 `origin_candidate_id` 不互指，`protected(...,'record')` 恒真；`candidate.adopt`/`releaseSourceLink`/`setPrivacy(not_private)` 全部拒绝；不得回退成“无来源/公开” | 构造候选缺失、run 缺失、document 缺失、document 跨 subject、run 与候选 document 不一致、互指只写一侧六类 fixture；断言 `source_locked=true`、`source_unresolved`/`cross_subject_reference`、无 `not_private` 新修订、历史公开修订的单 scope 判定可读，但当前记录锁定后 `output_protected` 仍拒绝出站；删除当前 `source_document_id` 仍受保护 | 未执行 |
| V-44 | `import_run`/`import_candidate` 字段与复合引用一致：两表 `subject_id`/`document_id` NOT NULL；`candidate.document_id = run.document_id`；`(document_id,subject_id)`/`(import_id,subject_id)` 复合外键同 subject；`adoption_state` 与互指关系可判定；迁移缺 run/document 整批拒绝 | 直接 INSERT 缺 `subject_id`/`document_id` 的 run/candidate 断言 NOT NULL 失败；构造 candidate 指向别的 run/document 的复合外键失败；跨 subject 失败；`adoption_state='unknown'` 而 `adopted_record_id` 非空被拒；迁移 fixture 缺 run/document 断言 `source_unresolved` 且无 partial 行 | 未执行 |
| V-45 | `record.restoreRevision` 事务内重读与版本前置：`BEGIN IMMEDIATE` 后重读当前修订/目标修订/当前隐私/来源链；`expected_data_version`、`expected_current_revision_no` 先校验；目标隐私在提交前重查；恢复只写内容与新修订，不洗白；artifact 同事务 stale | 在 UI 读到目标后、提交前并发改隐私/来源/当前修订，断言 `stale_data_version`/`stale_revision` 优先、`privacy_changed`/`privacy_locked` 按重读结果、无半写；目标私密+当前公开断言 `privacy_locked`；成功断言修订 +1、来源保留、artifact `stale` 且 `status_data_version` 同事务；注入 artifact 更新失败断言恢复回滚 | 未执行 |
| V-46 | 新挂受保护来源写入保护（INV-06 消矛盾）：`record.create`/`record.attachSource`/`candidate.adopt` 对新挂 `private`/`unknown`/`ever_private=1` 未 release 来源，初始/新修订必须写 `private`/`unknown`；显式 `not_private` 断言 `privacy_locked`；`attachSource` 只升不降、仅 self；`record.correct` 换到此类来源拒绝；`setPrivacy` 仍是唯一降低入口 | 分别构造 private、unknown、ever_private=1 已改 not_private 未 release 三类来源；断言新记录/采纳/attach 后存储态为 private/unknown（不是仅读时过滤）；显式公开请求失败；attach 到更弱来源保持当前 private；attach 后 `setPrivacy(not_private)` 才能降；proxy/demo 调 attach 断言 `not_authorized`；直接 SQL 写 `not_private` 的负向实现被读模型/不变量抓到 | 未执行 |
| V-47 | `data_version` 与产物隔离同事务：传播/采纳/恢复/隐私/来源/授权/产物状态每批只 +1；受影响 artifact `status`/`contains_private`/`status_data_version` 同事务；任一条失败整体回滚；下载逐条重判，不靠 `status_data_version` 放行 | 统计一次传播的 `data_version` 增量恰为 1；artifact `status_data_version` 等于新版本且 `quarantined`/`stale` 同事务；注入 artifact 更新失败断言 `data_version` 与事实均回滚；`status_data_version` 落后但 `status='ready'` 时下载仍按 `output_protected` 拒绝；`contains_private` 重算与存储不一致断言隔离 | 未执行 |
| V-48 | 迁移采纳关系不猜：显式双向链接且同 subject → `adoption_state='resolved'` 并写互指；缺失/一侧/冲突 → 默认 `unknown` 模式候选 `pending`+`adoption_state='unknown'`+两列 NULL+不可采纳，报告逐条原因；显式 `strict_reject` 整批 `ROLLBACK`、不写 ledger；禁止文本/顺序/日期推断与伪造 ID | 用四类 fixture：双向一致、仅 record 一侧、仅 candidate 一侧、两列指向不同对象；断言 resolved 互指、默认模式写入 unknown 且 `candidate.adopt` 返回 `adoption_unresolved`、显式 strict 整批回滚且候选/记录为 0；文本相同但无链接的 fixture 不得被判定 adopted；报告计数与 legacy 键可核对 | 未执行；G3 阻塞（Q-31） |
| V-49 | 历史编号与当前自检：`revision_no` 连续无重复，历史 1..N（老→新）、当前 N+1=`MAX`；写入/读取/迁移都自检“当前字段 = 第 N+1 版修订”；失配 `revision_self_check_failed`/`needs_review`，不回退历史最后一项；非本人只对可见集重排显示序号 | 用 3 条历史 + 1 当前 fixture：断言编号 1..3 与 4；按旧“当前=1、历史=2..4”写法的实现被抓；篡改当前字段与第 4 版不一致，断言读取失败关闭且不显示历史末项；非本人响应无规范编号、无断号、无空位 | 未执行 |
| V-50 | `link_state` 四态语义：无 `active`；`unverified/verified` 可新挂，`missing/removed` 被拒（`document_missing`/`document_removed`）且不自动复活；四态均不改 `privacy_state`/`epoch`/`seq`；`removed` 且已知 `not_private`+`ever=0` 不因移除受保护，`unknown`/曾私密未 release 仍受保护 | 四态 fixture 分别 attach：missing/removed 断言失败；插入 `active` 断言非法枚举；removed 的公开记录断言仍可读；removed 的 unknown/曾私密记录断言仍受保护；verified 后隐私字段不变、`last_verified_at` 更新 | 未执行 |
| V-51 | 来源三态：`no_file`（无任何来源指针——含历史修订——且 `source_kind='manual'`；迁移 `fileId` 键缺失/null 且任一修订均无原件痕迹、新写入显式声明）不强制 unknown、不标 needs_review；`resolved` 需行存在同 subject 且候选链一致；`unresolved`（悬空/跨主体/不一致/互指不成立/任一副本 `source_kind='document'` 但无指针/指针已丢但保留原件痕迹）→ unknown+source_locked+needs_review，禁止 adopt/release/setPrivacy(not_private)；`source_document_id IS NULL` 不等于手工 | 手工无来源记录断言 `no_file`、`source_kind='manual'`、非 needs_review；删指针的悬空链断言仍 `unresolved` 受保护；`fileId` 为 null 但 `original`/来源含“原件：/原件已移除”的记录断言 unresolved+document+needs_review，不得判 manual；跨 subject 断言 `cross_subject_reference`；resolved 文档 attach 成功；NULL 指针但 `origin_candidate_id` 存在的记录不得判 `no_file` | 未执行 |
| V-52 | 云解析无 consent 失败关闭：`import.start` 在建 run/上传/建候选前校验 `cloud_parse` consent（self、未撤回、document/subject 匹配）；缺失 `consent_required` 且无 run/无上传/无候选/无 `tmp/`；`method='cloud'` 的 `import_run.consent_id` NOT NULL；迁移 cloud run 无 consent 整批回滚 `consent_unresolved`，不补造 | 无 consent 调 `import.start` 断言 `consent_required` 且 run/候选计数为 0、无上传调用；撤回 consent 后同断言；直接插入 cloud run 缺 consent 断言 CHECK 失败；迁移 fixture 含无 consent cloud run 断言 `ROLLBACK`、无 consent 行、报告 `consent_unresolved` | 未执行 |
| V-53 | 作者未知不伪造：`author_state ∈ {known,unknown}`；unknown 两列 NULL、UI“作者未知”；known self/proxy 约束；迁移无作者证据一律 unknown，不得默认 `ctx.subject_actor_id`/`system`；`own_entries` 不把 unknown 当自己写的 | 旧 payload 无作者字段迁移后全部 `unknown` 且两列 NULL；有明确作者/代理 grant 的记录 known 且一致；篡改 unknown 记录填 self 断言约束失败；proxy `own_entries` 不含 unknown 作者记录；读模型/回执不把 unknown 显示成本人 | 未执行 |

### 11.1 本机可复现 SQLite 验证（2026-11-03）

环境：Node `v24.22.2`、`node:sqlite` 内置 SQLite `3.53.4`、`:memory:` 库；**未创建任何 `.sqlite` 文件、未建生产库、未在 DSH Desktop 宿主执行**。

本节只保留**可重跑的最小骨架**，不声称完整验证。draft.4 的批量断言结果表已删除：脚本未落盘、无法复现，不能作为 G3 证据。骨架覆盖：`created_at` 新旧 CHECK、重建事务内孤儿检查与回滚、`command_receipt` 三列主键、sticky/release/epoch/`privacy_state_seq` 核心查询。它**不覆盖**命令层、UI、迁移（含采纳关系）、代理授权、跨 subject、来源链、恢复事务或宿主行为。**以下代码是可复制重跑的骨架；本次只保留代码与覆盖范围，不附“全部通过”结论，重跑输出才算证据。draft.6 新增的 `privacy_state_seq`/`document_state_seq` 断言本次未执行。**

最小复现骨架（复制到 `node --input-type=module` 可重跑上述核心回归；这是骨架，不是完整测试脚本）：

```js
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const db = new DatabaseSync(':memory:');
const check = `CHECK (length(created_at)=20 AND length(hex(created_at))=40
  AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z'
  AND substr(created_at,12,2) BETWEEN '00' AND '23'
  AND strftime('%Y-%m-%dT%H:%M:%SZ',created_at) IS NOT NULL
  AND strftime('%Y-%m-%dT%H:%M:%SZ',created_at)=created_at)`;
db.exec(`CREATE TABLE t(created_at TEXT NOT NULL ${check}); CREATE TABLE old(created_at TEXT NOT NULL CHECK (
  length(created_at)=20 AND length(hex(created_at))=40
  AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z'
  AND strftime('%Y-%m-%dT%H:%M:%SZ',created_at)=created_at));`);
const ins = (t, v) => { try { db.prepare(`INSERT INTO ${t} VALUES (?)`).run(v); return true; } catch { return false; } };
assert.equal(ins('t','2026-11-03T12:34:56Z'), true);
assert.equal(ins('t','2026-13-01T00:00:00Z'), false);
assert.equal(ins('t','2026-11-03T24:00:00Z'), false);
assert.equal(ins('old','2026-13-01T00:00:00Z'), true);
assert.equal(ins('old','2026-11-03T24:00:00Z'), true);
assert.equal(ins('old','2026-02-30T00:00:00Z'), false);

db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE; CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(id INTEGER PRIMARY KEY, p_id INTEGER NOT NULL REFERENCES p(id));');
db.prepare('INSERT INTO p VALUES (1)').run(); db.prepare('INSERT INTO c VALUES (2,999)').run();
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 1);
db.exec('ROLLBACK;');
assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='c'").get().n, 0);

db.exec(`CREATE TABLE receipt(subject_id TEXT, actor_id TEXT, request_id TEXT, result_json TEXT, PRIMARY KEY(subject_id,actor_id,request_id));`);
db.prepare('INSERT INTO receipt VALUES (?,?,?,?)').run('s1','self','req-1','{"record_id":"r1"}');
db.prepare('INSERT INTO receipt VALUES (?,?,?,?)').run('s1','proxy','req-1','{"operation_ref":"op-1"}');
db.prepare('INSERT INTO receipt VALUES (?,?,?,?)').run('s2','self','req-1','{"record_id":"r2"}');
assert.equal(db.prepare('SELECT count(*) n FROM receipt WHERE request_id=?').get('req-1').n, 3);
assert.equal(db.prepare('SELECT count(*) n FROM receipt WHERE subject_id=? AND actor_id=? AND request_id=?').get('s1','self','req-1').n, 1);

db.exec(`CREATE TABLE d(document_id TEXT PRIMARY KEY, privacy_state TEXT, privacy_ever_private INTEGER, privacy_epoch INTEGER, privacy_state_seq INTEGER); CREATE TABLE r(record_id TEXT PRIMARY KEY); CREATE TABLE rev(record_id TEXT, rev INTEGER, doc TEXT); CREATE TABLE release(release_id TEXT PRIMARY KEY, record_id TEXT, document_id TEXT, privacy_epoch INTEGER, document_state_seq INTEGER, actor TEXT, UNIQUE(record_id,document_id,privacy_epoch,document_state_seq));`);
db.prepare('INSERT INTO d VALUES (?,?,?,?,?)').run('d1','not_private',1,1,2);
db.prepare('INSERT INTO r VALUES (?)').run('r1');
db.prepare('INSERT INTO rev VALUES (?,?,?)').run('r1',1,'d1');
const locked = () => db.prepare(`SELECT EXISTS(SELECT 1 FROM rev JOIN d ON d.document_id=rev.doc WHERE rev.record_id='r1' AND (d.privacy_state<>'not_private' OR (d.privacy_ever_private=1 AND NOT EXISTS(SELECT 1 FROM release WHERE release.record_id='r1' AND release.document_id=d.document_id AND release.privacy_epoch=d.privacy_epoch AND release.document_state_seq=d.privacy_state_seq AND release.actor='self')))) v`).get().v;
assert.equal(locked(), 1);
db.prepare('INSERT INTO release VALUES (?,?,?,?,?,?)').run('rel1','r1','d1',1,2,'self');
assert.equal(locked(), 0);
assert.throws(() => db.prepare('INSERT INTO release VALUES (?,?,?,?,?,?)').run('rel2','r1','d1',1,2,'self'));
db.prepare('UPDATE d SET privacy_state=?, privacy_epoch=?, privacy_state_seq=? WHERE document_id=?').run('private',2,3,'d1');
assert.equal(locked(), 1);
db.prepare('INSERT INTO release VALUES (?,?,?,?,?,?)').run('rel2','r1','d1',2,3,'self');
assert.equal(locked(), 0);
// unknown 往返：状态实际变化递增 state_seq，epoch 不变；旧 release 必须失效，需按新 seq 重新签发。
db.prepare('UPDATE d SET privacy_state=?, privacy_state_seq=? WHERE document_id=?').run('unknown',4,'d1');
db.prepare('UPDATE d SET privacy_state=?, privacy_state_seq=? WHERE document_id=?').run('not_private',5,'d1');
assert.equal(locked(), 1);
db.prepare('INSERT INTO release VALUES (?,?,?,?,?,?)').run('rel3','r1','d1',2,5,'self');
assert.equal(locked(), 0);
console.log('SQLite core regression: PASS');
```

补充静态检查（可在无库时做）：

- 本文件第 9.3 节 DDL 曾用含最小 stub 表的 SQLite 临时内存库做过**语法冒烟**（不落盘、不算生产库）；未保留脚本与输出，2026-11-03 只在 `node:sqlite` 观察过，Desktop 宿主仍未核验；这不是完整 DDL 执行，也不是 V-31 的全列覆盖；
- `record_revision` 的日期 CHECK 对 `2026-02-30` 拒绝、对 `2026-02` 接受、对 `2026-13` 拒绝；
- `privacy_state='unknown'` 不得被任何默认读模型当成 `not_private`。

这些检查必须在 M5 的测试库重新执行，并把结果附在 G3/M5 记录中；仅“文档写了”或“骨架跑通”不算通过。**V-33 的迁移隐私/编号/来源三态/作者/consent 初始化、V-43～V-53 的来源/采纳/恢复/保护写入/版本隔离/链状态/作者状态均没有可执行实现或测试，状态保持“未验证/未执行”。**

---

## 12. 已定项与未决项

Q-03 已按 SPEC 定案，保留在表中是为了让 G3 看到“为什么不是二选一”；其余未标“已定”的才是待决问题。

| 编号 | 问题 | 为什么不能现在拍板 | 建议处理 |
|---|---|---|---|
| Q-01 | 身份/登录/服务端授权；本机单用户是否足够 | 当前无账号，代记权限无法真实验证 | M5 前确认宿主身份能力；不能则明确“单用户本地、无代记” |
| Q-02 | 数据库/私密文件是否加密；密钥如何保管 | 原型无加密；SQLCipher/OS 权限未核验 | 至少做 OS 权限与备份加密评估；未实现前写“未加密” |
| Q-03 | **已定（2026-11-03）**：隐私历史按条判断，不回溯覆盖 | `docs/SPEC.md` 已明确“私密/未知的更正历史初始不渲染正文，公开历史仍可直接查看”；P-04 与之冲突，不能作为默认 | 本版按 SPEC 执行；P-04 仅登记为备选，若未来采用必须先改 SPEC 再改 §4.1/V-08，不是 G3 的二选一 |
| Q-04 | 记录删除/彻底清除；医疗/法律留存 | 与“不可变历史”冲突 | 区分软删除、隐藏、硬清除；硬清除需单独同意与备份说明 |
| Q-05 | 未知日期边界：1900–2100 是否有依据；“年初/三个月前/至今”如何表达 | 原型只有 day/month/unknown；raw 已保留但无结构化近似 | 患者访谈后再决定是否加 `approximate`；不急于扩类型 |
| Q-06 | 副作用/感受、检查目的、生活领域 taxonomy；observation/event 是否维持为 record kind | 页面存在但场景未走通；原型 `pathwayDetail` 只是演示 | G3 定最小 kind 集；未定前不建表 |
| Q-07 | 参考区间、不等式值、单位换算 | 原型无结构化参考范围；换算会制造错误 | 只存原文/数值，不换算；参考区间待临床来源与 G3 |
| Q-08 | SQLite 在 DSH Desktop 的运行时/并发/多窗口/STRICT/部分索引支持 | 本机无 Desktop，未核验 | 建库前做宿主能力探针；两窗口写入需锁 |
| Q-09 | MinerU/云解析留存、删除证明、告知文案 | 服务未接通，条款未核实 | 每次显式 consent；不承诺服务方删除；本地可撤回 |
| Q-10 | 私密/未知是否可进 AI | **本版已定禁止**（SPEC 当前口径），且本版不实现任何逐条授权开关；未来是否允许本人逐条授权仍是未决政策，不能由数据模型或 G3 勾选自行放开 | 本版：无 `allow_private_ai`/override/force，无例外路径；未来若要放开，必须先改 `docs/SPEC.md` 并重走需求/伦理/安全评审，再单独设计、验证 consent 与撤回语义；在此之前一律禁止 |
| Q-11 | 导出格式（txt/PDF）、是否带原件、旧产物保留期 | 原型只出 txt；PDF/打印未验收 | 先冻结文本合同；PDF 另立验收 |
| Q-12 | 多患者/家庭共用、主体合并 | 当前单 subject 模型；合并会改 subject_id | 先禁止合并；多 subject 只做数据分区 |
| Q-13 | 时区/旅行/夏令时；日期是否始终民用日 | 原型用本地日期，无时区字段 | 明确“日期是本地民用日”；跨时区另记来源，不转换旧日期 |
| Q-14 | 备份加密、保留期、异地副本、恢复演练频率 | 无真实数据，未定 | M5 前定最低策略；恢复演练纳入验收 |
| Q-15 | **已改口径（2026-11-03 审查）**：真实根目录选择 UX；是否复制原件；移动目录 | 审查要求不复制原件 | **不复制原件**；只登记元数据；移动整树靠 marker+ID。若未来要“复制进库”，另立 Q-17 |
| Q-16 | G3 哪些决定可下放、哪些必须签 | 需要开发者/患者/临床共同确认 | 用第 13 节清单逐项签，不打包“整体通过” |
| Q-17 | “不复制原件”的边界：除候选外的整份解析全文是否允许持久化、保留多久；未来是否支持把原件复制进数据根 | 本版已定“二进制不复制、整份解析全文默认不另存（只走会话 `tmp/`），候选 `proposed_text` 按生命周期存在”；但“是否允许额外持久化整份解析文本/复制原件”仍属产品与隐私取舍 | 本版按默认执行，不提供持久 `parsed/` 与复制选项；若未来要放开，需独立 G3、迁移、告知与删除语义，不得在实现里悄悄落盘 |
| Q-18 | 代理可见的元数据边界：文件名/大小/日期/机构名是否算私密 | 审查指出“不能见私密元数据”，但逐字段清单未定 | G3 前按最严：代理只对可见（`not_private`）条目返回记录 ID 与必要展示字段；受保护条目连隐私状态/存在性都不返回；逐字段确认后再放开 |
| Q-19 | `command_receipt` 保留期与清理策略 | 太短会导致重放重复写，太长占空间 | 建议 ≥30 天；M5 定值并写进迁移/清理任务 |
| Q-20 | 三路合并冲突时 UI 如何呈现“当前值摘要”而不泄露私密 | 代理不能看正文，本人可看 | 本人显示字段级差异；代理只显示“该字段已变更” |
| Q-21 | 件级隐私传播是否需要“预览影响范围”再确认 | 传播会改多条修订，误操作代价高 | 建议先给计数（仅 self 可见）与受影响记录列表，再执行 |
| Q-22 | 备份/恢复支持的 schema 兼容窗口（可回退几个版本） | 未定，影响 `schema_too_new` 与恢复流程 | M5 前定；恢复只保证窗口内 |
| Q-23 | 数据库文件、会话 `tmp/` 与导出产物的 OS 权限、是否随备份加密 | 与 Q-02 相关但范围更大；本版已无持久 `parsed/` | 与 Q-02 合并评估；`tmp/` 至少要求仅当前用户可读写并在退出时清理；未实现写“未加密” |
| Q-24 | 是否需要“操作回执”对用户可见（网络重试/双击提交） | 影响 UI 文案与诊断 | 建议只对失败/冲突展示；成功不打扰 |
| Q-25 | 迁移中重建表时触发器/索引的自动比对方式 | SQLite 无内建 schema diff | 迁移测试需快照 `sqlite_master` 并逐项比对 |
| Q-26 | 原型→目标映射里 `original` 唯一副本的用户选择 UX | 涉及“登记原件/转 note/丢弃”三选一 | 原型确认阶段做交互；默认不丢 |
| Q-27 | 来源链保护的**解除**流程：记录曾引用受保护原件/受保护候选（含 `privacy_ever_private` 粘性锁定），之后如何由本人逐条解除，需什么证据、存储与审计 | §4.1 已给存储与命令合同（`source_document.privacy_epoch`/`privacy_state_seq`、`source_link_release.document_state_seq`、`record.releaseSourceLink`），但**命令实现、UI、迁移回填、审计展示和端到端测试都没有完成**；不能靠改一行 `source_document_id` 或原件改回 `not_private` 绕过 | 默认不提供批量解除；解除必须 self、document 当前 `not_private` 且曾私密、按 `(record, document, 当前 epoch, 当前 state_seq)` 逐条确认、写 `audit_event`、保留历史；只清该条 sticky，不改记录隐私，之后仍需单独 `record.setPrivacy`；`unknown` 往返使旧 release 失效。**实现完成前整套流程是 G3 阻塞**，不得写“已解决”或“已有可用入口” |
| Q-28 | 备份恢复后 `command_receipt` 如何失效（清空 vs `restore_epoch`） | 旧回执可能指向已被回滚的副作用，重放会跳过真实写入；两种方案对离线客户端影响不同 | 恢复后默认使回执失效；具体 epoch/清理实现待 M5 设计并测试。**该策略未设计、未实现、未测试，是 G3 阻塞**；未定前写“恢复后回执不可信”，不得进入依赖该策略的生产恢复流程 |
| Q-29 | 重建表迁移的崩溃检测与恢复：如何判断旧表/新表完整，是否自动补偿 | SQLite 关外键必须在事务外，重建存在非原子窗口；`migration.lock` 不足以判断进度 | 默认失败即停、从迁移前备份恢复，不自动续跑；完整检测/补偿未设计。**未设计前重建迁移不得进入生产发布，是 G3 阻塞** |
| Q-30 | 跨 subject 引用校验的实现与迁移后不变量：§9.7 列出的每类引用是否都在写入路径校验同 subject；迁移后是否有全量不变量查询与负向测试 | 本版只有合同，**没有实现、没有迁移后校验、没有跨 subject fixture**；外键只保证行存在，不保证同 subject。多 subject 分区在 `subject_id` 泄漏时等于失效 | 所有写命令在事务内校验并返回 `cross_subject_reference`；迁移 `COMMIT` 前跑 §9.7 不变量查询，有行即 `ROLLBACK`；补 V-38 负向测试。**实现并验证前，多 subject 隔离不得声称成立，是 G3 阻塞** |
| Q-31 | 迁移无法证明候选↔记录采纳关系：`record.origin_candidate_id`/`candidate.adopted_record_id` 缺失、单侧、冲突或跨 subject 时，是否继续迁移 | 旧导出没有统一外键；文本/日期/顺序相似不能证明同一事实，按相似度猜会伪造采纳关系，整批拒绝又会阻塞迁移。两种错误都会让“迁移完整”成为假声明 | §10.4 定义 `adoption_state`、默认 `unknown` 模式（候选 `pending`+两列 NULL+不可采纳+报告）、显式 `strict_reject` 整批 `ROLLBACK`；禁止推断/伪造 ID。**实现、fixture、真实旧库验证均未完成，Q-31/V-48 为 G3 阻塞** |
| Q-32 | 旧数据作者判定证据：什么字段/来源足以证明“作者是谁”（录入者、代理授权号、署名、导入清单），无法证明时是否永久 `unknown` | 旧导出没有统一作者字段；按“谁执行迁移”或“记录属于该 subject”推断作者，会把代记/他人内容冒充本人；永久 unknown 又会影响代记 `own_entries`、导出署名与审计展示 | 默认 `author_state='unknown'`，不推断、不默认本人/`system`；M5 取得真实旧导出后确认可核验证据；未取得前 unknown 是正确结果，不阻塞本版合同 |
| Q-33 | 旧云解析 run 的 consent 证据：旧导出/服务方回执能否证明当时取得 `cloud_parse` 同意；没有证据时整批拒绝还是隔离 run 供人工核对 | 补造 consent 等于伪造患者同意；把无 consent 的 run 迁进来又会让“已同意”成为假声明；两种都会污染审计 | 本版按 D-30/INV-32 失败关闭：无法证明 consent 的 cloud run 整批 `ROLLBACK`/`consent_unresolved`，不写 run、不补 consent；若要迁移必须先取得可核验证据。**该项属迁移阻塞（不改变运行时合同）** |

---

## 13. G3 签认清单

G3 不是“文档看过了”，而是对下列合同逐项签字。**阻塞项未清零，不进入生产建库；未来事项必须被明确登记为“不阻塞 v1”，不得伪装成已定。**

- [ ] **主体与授权**：确认 `subject/actor/access_grant/consent_event` 的关系；确认代记 scope、撤回后作者不回写、未知日期默认拒绝；确认代理不得改变记录/件级隐私（V-22）。
- [ ] **隐私**：确认三态、未知按受保护、隐私变更产生修订；确认 **Q-03 已定按条历史**（P-04 仅备选，不是默认，也不能配置切换）；确认 §4.1 两个显式 scope：`protected(...,'record')` 含当前状态、来源链、候选派生与 `privacy_ever_private` 粘性，`protected(...,'revision')` 只看修订自身、不回溯隐藏公开历史，所有出口按输出调用同一实现（INV-21/INV-22）；确认 `record.releaseSourceLink` 的逐条解除合同、`privacy_epoch`/`privacy_state_seq` 双失效与“release 后仍需单独 setPrivacy”；确认**非本人对受保护历史连元数据/修订号/计数/空位都不可见**；确认 `record.correct`/`restoreRevision` **不得改变隐私**、唯一**降低**入口是 `setPrivacy`，且 `unknown` 原件只能由本人 `document.setPrivacy(not_private)` 解锁；确认 `record.create`/`attachSource`/`candidate.adopt` 新挂 `private`/`unknown`/`ever_private=1` 未 release 来源时必须**写入** `private`/`unknown`，不能只靠读时 `source_chain` 过滤；`attachSource` 只升不降、仅 self（V-46）；确认三个出口的默认排除与逐条纳入规则；确认件级传播原子性、不降级与 §4.6 传播矩阵（V-23）。**该解除流程的实现/UI/迁移/测试未完成，签认时必须标为 G3 阻塞，不得写“已完成”。**
- [ ] **出站双 scope**：确认 AI/导出/artifact 构建与再次下载都调用 `output_protected(selected_revision, current_record)`，任一受保护即拒绝；确认 AI 只发当前修订、不含来源 ID/修订号列表；确认 artifact 下载时重判、构建后受保护置 `quarantined` 并写 `status_data_version`、每个 `included_private=1` 条目各需新的匹配 `private_export`；确认 `data_version` 与 artifact 状态同事务、下载不靠旧 `status` 放行（V-35/V-36/V-47）。
- [ ] **恢复不洗白**：确认 `record.restoreRevision` 仅 self、`BEGIN IMMEDIATE` 后重读当前/目标并**先**校验 `expected_data_version`/`expected_current_revision_no`、目标隐私在提交前重查、恢复不改变当前隐私且新修订取当前隐私、目标保护等级高于当前（private > unknown > not_private）时 `privacy_locked`、来源指针保留并写 `restored_from_revision_id`、artifact 同事务 stale、代理拒绝不泄露存在性（V-37/V-45）。
- [ ] **跨 subject 引用**：确认 §9.7 每类引用（record/author/grant、revision/document、run/candidate、release、consent、artifact_item、审计/回执、adopted/origin/restored 指针）在写入与迁移后都校验同 subject；确认 `import_run`/`import_candidate` 的 `subject_id`/`document_id` 非空、候选 doc=run doc、复合引用同 subject；确认**外键不等于隔离**，Q-30 未实现前多 subject 隔离不得声称成立（V-38/V-44）。
- [ ] **缺失来源与代理采纳**：确认候选 import/document 缺失、不一致、跨 subject 时 `unknown` + `needs_review` 且采纳 `source_unresolved`；确认 `adoption_state` 未解析时两列 NULL、候选不可采纳；确认仅本人可显式转 `source_kind='manual'`；确认 proxy 采纳一律 `unknown`+`needs_review`+`privacy_origin='proxy_default'` 且有覆盖 kind/日期的 grant（V-39）。
- [ ] **身份与授权前置**：确认 actor 只从会话/宿主解析、请求体身份被忽略；确认 `demo_unverified` 只能写 demo subject；确认 proxy 需 `host_authenticated` + 有效 grant 且 scope 覆盖 kind/日期；确认 consent/setPrivacy/release 仅 self；确认拒绝不区分无权限/不存在（V-40）。
- [ ] **缓存隔离**：确认缓存键含 `subject_id + data_version + read_model_version + viewer_actor_id + 授权 scope 版本`；确认本人/代理、跨 subject 缓存不互用；确认授权变化递增 `data_version`（V-41）。
- [ ] **unknown 往返**：确认 `privacy_state_seq` 在每次实际状态变化时递增、同值不增；确认 release 绑定签发 seq，`private→not_private→release→unknown→not_private` 后旧 release 失效、必须重新逐条 release；确认迁移 seq 初值（private=1，其他=0）（V-34/V-42）。
- [ ] **历史**：确认 `record_revision` 全量快照、只增不改、当前=max=N+1、历史编号 1..N（老→新）连续、当前内容不重复进历史；确认写入/读取/迁移都自检“当前字段 = 第 N+1 版”，失配失败关闭（V-49）；确认受保护历史默认只回元数据（**仅本人视图**；非本人 0 正文且 0 元数据）、按条判断不回溯、打印不输出正文与元数据。
- [ ] **日期**：确认 day/month/unknown + raw；确认不补日期、不展开月份、非法旧值标待核；确认年份边界（或改）；确认日期/瞬时字段按**定长 ASCII 字节**校验（V-31）。
- [ ] **事实类型**：确认第 5.3 节 10 个 kind 与页面映射；确认 observation/event 不再平行建表；确认“副作用/感受”是否新增 kind（Q-06）。
- [ ] **导入**：确认候选生命周期、采纳事务、丢弃清空正文、私密继承、云解析 consent 的失败关闭顺序（建 run/上传/建候选**之前**校验；缺失 `consent_required` 且零副作用；迁移无 consent 的 cloud run 整批拒绝，不补造，V-52）与“不声称云端已删”；确认**整份解析全文默认不另存**（候选 `proposed_text` 除外，中间产物只走会话 `tmp/`）、`manifests` 只存元数据；确认**撤回解析不删已采纳记录与来源指针**（V-14）。
- [ ] **原件**：确认**不复制原件、只登记元数据**、`source_document_id` 只是出处/审计关联、重开需**会话文件句柄**（不持久化）；确认 `link_state` 只有 `unverified/verified/missing/removed`（无 `active`）、只表示最近会话核对、不是隐私状态，新挂只允许前两者、`missing/removed` 不得自动复活，且不因移除把已知 `not_private+ever=0` 改为受保护（V-50）；确认无 `present`、无持久 `parsed/`；确认 Q-17 的“未来是否允许持久解析/复制原件”仍是未来事项。
- [ ] **数据目录**：确认显式选择、marker、**仅受管理文件用相对路径**、根边界、目录布局（含会话 `tmp/`）、备份不含 `tmp/`、卸载不删除。
- [ ] **持久化**：确认 SQLite 为默认候选；确认每连接 `foreign_keys=ON`、`BEGIN IMMEDIATE`、无级联删除；在 Q-08 取得宿主运行时证据前不建生产库。
- [ ] **并发与幂等**：确认 `command_receipt` 复合主键 `(subject_id, actor_id, request_id)`、最小化（不存受保护 ID/正文）与三者同时匹配的作用域、`expected_data_version`、三路合并，以及 `revision_conflict`/`stale_revision`/`stale_data_version` 的优先级（V-20/V-21）；确认 §9.6 锁序只是草案、未经压测。
- [ ] **AI**：确认**本版** AI 永不接收私密/未知、无逐条例外、无 override；确认 **Q-10 的“未来逐条授权”仍是未决政策**，不得由 G3 勾选或配置打开（V-25）。
- [ ] **迁移**：确认 `schema_version=1`、迁移 ledger 连续唯一、备份/失败回滚、expand/contract；确认**单事务为默认、重建表是显式非原子例外**且 Q-29 未设计前不进入生产；确认重建时 `foreign_keys=OFF` 在事务外、`foreign_key_check` 在 COMMIT 前、`ROLLBACK` 不留孤儿、提交后 `ON` 并复核；确认原型映射与 §10.4 隐私初始化（true/false/缺失/非布尔、`history[]` 逐项、`files[]` unknown 为 0/0/0、`fileId` 缺失/null 且无原件痕迹、`created_at`）**只有伪代码，不含可执行 SQL，未实现、未验证**；确认候选/run 逐条 INSERT、两表来源非空、`adoption_state`/互指/报告按 §10.4；确认默认 `unknown`（候选不可采纳）、`strict_reject` 显式整批回滚（V-44/V-48）；确认历史编号 `history[i]→i+1`、当前 `N+1` 且迁移后自检（V-49）；确认来源三态 `no_file/resolved/unresolved`、`fileId` 键缺失/null 与“曾有原件但指针已丢”分开处理（V-33/V-51）；确认无作者证据时 `author_state='unknown'`、两列 NULL，不默认本人（V-53）；确认 cloud run 无 consent 整批 `ROLLBACK`/`consent_unresolved`（V-52）。**Q-27/Q-28/Q-29/Q-30/Q-31 均为 G3 阻塞；Q-33 为迁移阻塞。**
- [ ] **版本恢复**：确认记录级恢复以新修订写入、不删历史、**只恢复内容、不恢复/降低隐私、不得洗白**、self-only、来源指针保留；库级恢复走 10.3 校验；确认恢复后回执失效**尚未设计，Q-28 为 G3 阻塞**（V-27/V-37）。
- [ ] **验证**：确认第 11 节 V-01～V-53 为 M5 验收项，而不是“开发自测即可”；§11.1 只保留**可重跑骨架**（`created_at` CHECK、外键重建回滚、三列回执主键、sticky/release/epoch），**不是**“批量断言全部通过”，也不覆盖命令层、迁移、代理授权、跨 subject 或宿主 Q-08；不得把骨架当端到端证据。本版新增 V-35～V-42、V-43～V-48 与 V-49～V-53 全部为**未执行**，不得写成已通过；V-48 另受 Q-31 阻塞，V-53/Q-32、V-52/Q-33 的旧数据证据仍未取得。
- [ ] **DDL**：确认第 9.3 节只是示意、其省略清单已逐项对完整脚本验收；不把示例字段数当合同；确认字节/ASCII 检查只示例了部分列（V-28/V-31）。
- [ ] **未决项**：Q-01～Q-33 中仍标未决的每项有负责人/结论（Q-03 已定，不再作为二选一）；**Q-27/Q-28/Q-29/Q-30/Q-31 已明确列入 G3 阻塞，不得写成“不阻塞 v1”**；Q-33 为迁移阻塞（不改变运行时合同），Q-32 默认 `unknown` 且不阻塞本版；未来事项仅保留 Q-10 未来例外、Q-17 放宽、P-04 备选、Q-02/Q-23/Q-19/Q-14 等，逐条标注“不阻塞 v1”，不得以“后续再说”混进阻塞清单，也不得把未设计写成已完成。

**签认后也只允许：** 先建测试库 → 跑 fixture/不变量 → 通过后再建用户数据根。  
**签认不等于：** 患者访谈、临床审核、路径全通过、真实云服务、Desktop 装机或安全验收。

---

## 14. 变更记录

| 版本 | 日期 | 变更 | 状态 |
|---|---|---|---|
| v0.1.0-draft.1 | 2026-11-03 | 只读分析 G2 原型与现有文档后，原创起草主体授权、隐私历史、单一源、未知日期、导入候选、真实数据目录、迁移合同与验证清单 | 历史 |
| v0.1.0-draft.2 | 2026-11-03 | 按独立审查（R-01～R-14）修订：不复制原件、手工来源保留、代理无元数据/不可降隐私、AI 永不接收私密/未知、撤回不删已采纳来源、默认保护与件级传播原子性、乐观并发+三路合并、`command_receipt` 幂等、SQLite 外键/迁移约束、版本恢复、DDL 明确非完整合同；新增 §0.1 对照、§3.4、§4.5–4.6、§9.5、V-19～V-28、Q-17～Q-26 | 待 G3 |
| v0.1.0-draft.3 | 2026-11-03 | 按独立复核二次修订：① Q-10 拆成“本版硬禁止 + 未来例外未决”，删除任何开关暗示；② Q-03 按 SPEC 定为按条历史，P-04 降为备选并须先改 SPEC；③ 统一 `protected()`（历史来源链、候选派生、失败关闭），传播矩阵改为链覆盖，新增 INV-21/22；④ 原件改为出处关联 + 会话文件句柄，删 `present`、删持久 `parsed/`，`link_state` 仅最近核对；⑤ G3 冻结拆阻塞/未来；⑥ 回执最小化与 actor 作用域、§9.6 锁序草案、迁移单事务+重建非原子例外、日期字节/ASCII 检查；⑦ 取消原件私密改为 `privacy_ever_private` 粘性锁定（不再自动公开来源链记录，解除流程 Q-27）；新增 V-29～V-31、Q-27～Q-29 | 待 G3；仅为合同文本修订，未建库/未迁移/未实现/未验证 |
| v0.1.0-draft.4 | 2026-11-03 | 按 SPEC 已定“逐条公开/按条历史”修订：① 拆 `protected_revision` 与 `protected_record` 两个 scope，历史显示只看修订自身，消除来源链回溯隐藏公开历史的冲突；② 新增 `source_document.privacy_epoch`、`source_link_release` 与 `record.releaseSourceLink`，给 sticky 一条逐条解除路径（不批量、不改记录隐私、旧 epoch 失效）；③ 修 `created_at` CHECK 的 `strftime` NULL 放行与 `24:00` 放行，并把 `2026-02-30` 从“NULL 漏洞”更正为“归一化不等拒绝”；④ 重建表改为事务外 `foreign_keys=OFF`、事务内 `foreign_key_check` 后 `COMMIT`、提交后 `ON` 复核；⑤ 候选隐私创建时派生、曾私密/缺失→unknown，采纳不洗白；⑥ `command_receipt` 主键改 `(actor_id, request_id)` 并加 `subject_id`，读取按 actor+subject；⑦ §10.4 增 `history[]`/`files[]`/缺失 `fileId`/`created_at` 的隐私初始化规则与 SQL；⑧ 新增 V-32～V-34 与 §11.1 本机 42 条 SQLite 断言 | **历史**：已被 draft.5 取代。其中 42 条断言声明与迁移 SQL 已在 draft.5 撤销；release 流程当时即属 G3 阻塞 |
| v0.1.0-draft.5 | 2026-11-03 | 按独立审查（Q-27/28/29 阻塞、迁移 SQL 缺陷、V33 未验证、批量断言声明不可复现）与全文一致性自查修订：① Q-27/Q-28/Q-29 **全部明确列为 G3 阻塞**，从“未来事项”移出；② 删除 §10.4 不可执行/跨行泄露的迁移 SQL（列名错、漏必填、多行共用 ID、候选 `UPDATE...FROM` 无逐行条件），改为逐行伪代码与硬约束；③ `record.correct`/`restoreRevision` **完全不得改变隐私**，携带或企图写隐私一律 `privacy_changed`，唯一入口 `setPrivacy`；④ 统一 `privacy_epoch`：初值 0，每次进入 `private`（含注册/迁移即私密）严格 +1，`unknown` 不预置 ever/epoch；⑤ 非本人对受保护历史**连元数据/修订号/计数/空位都不可见**，打印同样不放；⑥ 明确 `unknown` 原件唯一解锁路径（`document.setPrivacy(not_private)`，ever=0 不需 release，ever=1 仍需逐条 release）；⑦ `command_receipt` 主键改为 `(subject_id, actor_id, request_id)`，重放/读取/迁移全部三列匹配，旧单列/双列回执失效；⑧ 迁移 `unknown` 不预置 ever/epoch，候选逐行更新；⑨ 传播新修订必须写 document 的新状态（private/unknown），不得一律写 private；⑩ 删除批量断言“全部通过”声明与不可复现结果表，§11.1 只保留可重跑骨架；V-33 改为**未验证**；新增 T-01～T-12 逐条处置 | **待 G3**；Q-27/Q-28/Q-29 阻塞；未建库/未迁真实旧库/未在 Desktop 宿主执行；迁移只有伪代码，无任何可执行 SQL |
| v0.1.0-draft.6 | 2026-11-03 | 按安全复核（U-01～U-10）修订：① 出站统一 `output_protected(selected revision, current record)`，AI 只发当前修订，导出/artifact 构建与每次下载双 scope 校验；artifact 构建后被保护置 `quarantined`，`contains_private=1` 每次下载需新 `private_export`；② `record.restoreRevision` 改 self-only、恢复不改当前隐私、目标保护等级高于当前即 `privacy_locked`、复制来源并新增 `restored_from_revision_id`；③ 新增 §9.7 跨 subject 引用清单、写入校验与迁移后不变量，Q-30 列为 G3 阻塞；④ 候选来源缺失/不一致/跨 subject 失败关闭为 `source_unresolved`，仅本人可显式转 manual；⑤ proxy adopt 强制 `unknown`+`needs_review`+`privacy_origin='proxy_default'` 并校验 grant，新增 §3.5 身份与授权前置，命令表加“允许调用者”；⑥ 缓存键加 `subject_id` 与授权 scope 版本；⑦ 传播只改当前 `not_private` 记录、候选不降级、artifact 隔离；⑧ 新增 `privacy_state_seq`，release 绑定 `document_state_seq`，`unknown` 往返旧 release 失效；⑨ 删除 §10.4 残留 `UPDATE import_candidate` 伪 SQL，改为逐条 INSERT `import_run`/`import_candidate`；⑩ 新增 V-35～V-42（全部未执行），更新 V-23/V-25/V-27/V-33/V-34；新增 INV-23～27、D-22～24、U-01～U-10；**未声称任何实现/迁移/验收已完成** | **待 G3**；Q-27/Q-28/Q-29/Q-30 阻塞；未建库/未迁真实旧库/未在 Desktop 宿主执行；迁移只有伪代码，无可执行 SQL；新增验收全部“未执行” |
| v0.1.0-draft.7 | 2026-11-03 | 按五问复核（W-01～W-05）修订：① 来源链加入 `candidate_source_ok`，候选/run/document 悬空、跨 subject、`candidate.document_id != run.document_id`、`adopted_record_id`/`origin_candidate_id` 不互指一律失败关闭，`source_locked=true`，不可采纳/解除/降公开（V-43）；② `import_run`/`import_candidate` 统一 `subject_id`/`document_id` 非空与复合引用，候选 doc=run doc，迁移缺失整批拒绝（V-44）；③ 新增 `import_candidate.adoption_state` 与 §10.4 采纳解析：只有双向显式一致才写互指，默认 `unknown` 模式候选 `pending`+两列 NULL+不可采纳并报告，显式 `strict_reject` 整批 `ROLLBACK`，禁止文本/顺序/日期推断（Q-31/V-48）；④ `record.restoreRevision` 在 `BEGIN IMMEDIATE` 内重读 `current/target/privacy/source_chain`，先校验 `expected_data_version`/`expected_current_revision_no`，再做保护判定，artifact 同事务 stale（V-45）；⑤ 新增 §4.7：create/attachSource/adopt 新挂受保护来源必须**写入** `private`/`unknown`，显式公开 `privacy_locked`，attachSource 只升不降、仅 self，修正 INV-06 与读时过滤矛盾（V-46）；⑥ `data_version` 每批只 +1，artifact `status`/`contains_private`/`status_data_version` 同事务更新，下载逐条重判（V-47）；新增 D-25/26、INV-28/29；**V-43～V-48 全部未执行；Q-27～Q-31 阻塞；未实现/未迁移/未在宿主执行** | **待 G3**；Q-27/Q-28/Q-29/Q-30/Q-31 阻塞；未建库/未迁真实旧库/未在 Desktop 宿主执行；迁移只有伪代码，无可执行 SQL；新增验收全部“未执行” |
| v0.1.0-draft.8 | 2026-11-03 | 按六项复核（X-01～X-06）修订：① 历史编号固定为老→新 1..N、当前 N+1，迁移伪代码改为 `history[i]→i+1`、当前 `len+1`，写入/读取/迁移自检“当前字段 = 第 N+1 版”（D-27/INV-30/§5.1/V-33/V-49）；② 删除不存在的 `link_state='active'`，明确四态、可新挂白名单与“link_state 不改隐私”，`missing/removed` 拒绝新挂、不自动复活，也不把已知 `not_private+ever=0` 记录变成受保护（D-28/INV-31/§4.7/§6.1/V-50）；③ 来源解析统一 `no_file/resolved/unresolved`，悬空/跨主体/不一致→`unresolved→unknown`，手工无来源→`no_file` 且不强制 unknown，`fileId` 键缺失/null 与“曾有原件但指针已丢”分开（D-29/INV-28/§4.1/§4.5/§10.4/V-33/V-51）；④ 云解析无 consent 失败关闭：建 run/上传/候选前校验、缺失零副作用、`method='cloud'` 的 `consent_id` NOT NULL、迁移无 consent 整批回滚（D-30/INV-32/§6.2/§9.2/§9.4/V-52）；⑤ 新增 `record.author_state`，unknown 时两列 NULL、UI“作者未知”，迁移不再默认写本人（D-31/INV-08/INV-33/§3.2/§9.2/§10.4/V-53）；⑥ 重写 V-33、新增 V-49～V-53 全部未执行；新增 Q-32/Q-33 | **待 G3**；Q-27～Q-31 阻塞；未建库/未迁真实旧库/未在宿主执行；迁移只有伪代码，无可执行 SQL；V-33/V-49～V-53 均“未验证/未执行” |

---

## 15. 本文件明确没有做的事

- 没有创建 `workspace.sqlite`、任何 `.db`/`.sqlite` 文件或表；
- 没有把第 9.3 节 DDL 当作完整建库脚本执行；只在内存 stub 上做过语法冒烟，该片段不是完整建库脚本，省略项见 §9.3；
- 没有创建真实数据目录、没有复制任何原件、没有上传任何资料；
- 没有修改 `docs/SCHEMA.md`、`docs/API-CONTRACT.md`、`docs/DEV-PLAN.md` 或其他现有文件；本任务只改本文件；
- 没有把原型合成数据当成生产数据，也没有声称已完成迁移、加密、服务端隔离或 Desktop 装机；
- 没有声称 AI 隔离、代理视图、幂等/合并、隐私传播已实现——它们只是合同与验收项，代码未写、未测；
- 没有实现 §4.1 `protected_revision`/`protected_record`、§4.6 传播、§9.6 锁序、回执最小化或会话文件句柄；它们只是合同草案，未编码、未测并发、未压测；
- 没有实现 `record.releaseSourceLink`、`source_link_release` 表、UI、迁移回填或端到端测试；**sticky 的逐条解除只有合同，整套流程是 G3 阻塞**，不能因为文档写了命令名就当成可用功能；
- 没有在 DSH Desktop 宿主执行任何迁移/DDL；§9.3 的日期/字节检查只在 `node:sqlite` 3.53.4 内存库做过语法/CHECK 冒烟，§11.1 只保留可重跑骨架（不是批量断言结果），宿主 `Z` 后缀/`T` 分隔符/JSON1/部分索引兼容性仍未核验（Q-08）；
- 没有实现 §10.4 迁移伪代码，也没有留下任何可执行迁移 SQL；没有在真实旧库执行迁移，真实旧库需 M5 授权与去标识后才可验证（V-33 保持“未验证”）；没有实现 `adoption_state`、`resolve_adoption`、`strict_reject`/`unknown` 模式、候选/run 非空拒绝或互指自检，**迁移采纳关系未实现、未迁移、未测试（Q-31/V-48 阻塞）**；历史编号/当前自检、来源三态、作者 unknown、cloud consent 的迁移分支同样未实现（V-33/V-49～V-53），无 consent 的旧 cloud run 无证据时整批拒绝（Q-33）；
- 没有实现历史编号“老→新 1..N、当前 N+1”的写入/读取/迁移自检，也没有实现 `record.author_state`、`link_state` 四态校验、来源三态 `resolve_source` 或云解析 consent 的前置失败关闭；V-49～V-53 全部“未执行”，不得把合同当可用功能；
- 没有验证备份恢复后的回执失效（Q-28）或重建表崩溃恢复（Q-29）；两项均明确标为 **G3 阻塞**，未设计前不得进入生产发布；
- 没有实现 §3.5 身份/授权前置、`output_protected` 双 scope、§9.7 跨 subject 校验、`privacy_state_seq`/`document_state_seq`、`candidate_source_ok` 来源链解析、§4.7 `source_floor`/`attach_state`/`record.attachSource`、§5.1 恢复事务重读/版本前置、或 `data_version` 与 artifact `status_data_version` 同事务；这些只是合同与验收项，V-35～V-53 全部“未执行”；
- 没有修复任何已发布代码或数据库；本文件只是 draft.8 合同文本，不能当作漏洞已修复的证据；
- 没有把 G2 当成 G3；本文件仍需签认。