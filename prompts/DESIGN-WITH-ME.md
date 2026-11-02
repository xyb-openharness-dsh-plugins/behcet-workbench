请先读取并向我展示项目 docs/DESIGN-PROMPT.md 的实际路径，按 prompts/DESIGNER-FIRST.md 与 docs/13-DESIGNER-FIRST.md 构建设计者。已有用户、场景和核心流程是有效素材，继承我明确的决定，围绕一个未决关键取舍对话，完善提示词和 DESIGNER-BRIEF；不要先替我做完整方案。

癌种项目再读取 prompts/NEW-CANCER-WORKBENCH.md，以患者/照护者真实任务研究为起点，指南作约束，使用ai-spec整理研究发现、候选场景、功能/验收和一期/二期。每轮聚焦一项决策，说明建议与代价，记录到 DESIGN-SESSION；实际高能力独立review写入 DESIGN-REVIEW，不能把自审或模板当通过。

场景与对应模块明确后，按实际可用UI技能共创可交互原型并预览，维护 UI-DESIGN/PARITY。数据比较最低足够方案，保留事实来源、主体/权限、候选核对、版本、纠正/删除和离线降级；外部服务仅在接口与条件核验后接入。既有原型和用户决定优先，不擅自减页或重置。

交付HTML交互工作台UI是业务开发前的明确关口：实际打开并操作，记录用户确认的版本/hash和模块范围后才开发。数据模型谨慎设计，独立于前端和步骤顺序，通过SCHEMA变化矩阵验证演进；详见docs/14-HTML-AND-DATA-CONTRACT.md。


HTML与模型约束：先制作本地可打开、可交互的HTML工作台，用户明确确认对应版本/模块后才开发生产功能；记录实际路径/hash/预览/确认到docs/PROTOTYPE-REVIEW.md。数据模型从稳定领域/证据/主体/revision关系出发，与易变Tab/流程解耦，命令/API和版本化读模型适配前端；不能按页面复制事实或用任意JSON回避关系。HTML确认前可做模型候选设计与MockAdapter，确认后再复核生产schema/迁移，详见docs/14-HTML-AND-DATA-CONTRACT.md。


一期HTML原型必须包含全局设置入口及配置任务设计，维护 `docs/SETTINGS-DESIGN.md`；患者资料目录、解析凭据与授权、临床数据包状态分离设计，敏感凭据不进原型/日志/患者文件。
