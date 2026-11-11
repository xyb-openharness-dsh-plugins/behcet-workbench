# 变更记录

只增不删；每条写清"改了什么 + 为什么 + 用户可见结果"。版本号与 VERSION、package.json 三处必须一致。

## 0.1.1 — 2026-11-11

从「只有注册骨架 + /health」补到可装机运行的工作台外壳。

- 新：`scripts/build-public.mjs` 把 `prototypes/v0.2`（5 件脚本 + index.html）生成到 `public/`，并**把仓级 `assets/patterns/disease-primer.{css,js}` 一并落到 `public/patterns/`，把 `../../assets/patterns/` 改写成 `./patterns/`**——漏这一步的表现是页面正常、顶栏「?」点了没反应（相对路径在装机后 404）。版本字面量只改 title 一处，用锚点正则。
- 新：`dsh/static.js`（`resolveStatic` 拒绝 `..`/绝对路径/符号链接逃逸）+ `dsh/index.js` 注册 `/api/behcet/ui` 前缀路由；`files` 白名单补 `public`。
- 新：`lib/client.js` 换成家族 A 形态外壳（自建顶栏 + 业务 iframe + 1px 可拖分隔线 + 右侧原生会话常挂载 + 窄屏抽屉 + 宽度本地记忆）；`lib/layout.js` 为面板参数唯一来源，由 `build-version` 注入并生成 `lib/version.js`。
- 新：会话契约 9 条落地——`ownsSession(currentSession())` 判会话、无会话点按钮 `newSession(defaultWorkspace()?.workspaceId)`、取消目录不留空会话、创建失败报原因、订阅重渲染、草稿只填入不发送。
- 实测证据（本机 stub 宿主起服务，非 Desktop）：`/ui/` 200 text/html、`/ui/patterns/disease-primer.js` 200、`/ui/patterns/disease-primer.css` 200、`/ui/primer-data.js` 200、`/ui/../../package.json` 404；index.html 含 `data-primer-open` 且引用已改写为 `./patterns/`。
- **仍未通过（既存，非本次引入）**：`node --test test/*.test.mjs` 有 **45 条 not ok**（改动前后同为 45）——集中在日期精度 unknown 保持、来源指针与墓碑、双档案切换与回滚、消化道同日并列、医嘱独立于用药、私密出口过滤。这些是业务事实层与交互行为，属 M3/M4 待实现部分；结构检查（包清单/宿主契约/面板契约/探针覆盖/版本字面量/静态引用/primer 链接）**全部通过**。
- 未验证：实机点击（面板是否出现、取消目录是否留空会话、双档案切换）需装机后人工走查。

## 0.1.0 — 2026-11-02

- 由社区脚手架 dsh-wb-cli@1.10.0-rc.3 (32b9937) 初始化，仅有注册骨架与健康接口，无业务功能。
