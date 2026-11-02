# 35 · 页面版本字面量：UI 显示哪一版必须等于服务端跑的一版

## 一句话

**版本号是唯一手写点**（`VERSION`），其余全部派生——**页面是最容易被漏掉的一处**。
页面里写死 `v0.1.0` 时不会有任何报错，只会让用户拿着旧版本号来提问。

## 为什么单独成文（L2 门槛已满足）

| 来源病种 | 形态 | 证据 |
| --- | --- | --- |
| cervical-workbench | `scripts/check-version.mjs:67` 检查 `public/index.html` 版本字面量去重后与 VERSION 比对 | 该仓自立闸门 |
| PF-ILD-workbench v0.2.0 | 升版 `0.1.0 → 0.2.0` 后 `npm run audit` 报红：`public/index.html 里有版本字面量与 VERSION 不一致（0.1.0）` | 徽标 `#ver-chip`、页脚 `#app-version` 各一处写死；移植脚本只替换了 `prototype-bar` 第三处 |

两次独立复现、形态一致、可用检查项表达 → 按 §1 上提到 **L2 能力层**。

## 两种约定（按项目现状选）

### A. 占位符约定（推荐，PF-ILD 已落地）

页面里**一个版本字面量都不许有**，全部走占位符：

```html
<b>__VERSION_DISPLAY__</b> · <em>__BUILD_DATE__</em>
```

服务端注入器在响应时替换（`injectTokens()`）：

```js
.replace(/__VERSION_DISPLAY__/g, displayVersion)   // v0.2.0
.replace(/__BUILD_DATE__/g, buildDate)             // 2026-10-25
```

好处：**物理上不可能不一致**——页面显示的就是服务端正在跑的那一版。

### B. 字面量约定（存量项目兼容）

页面里写 `v0.2.0`，但必须与 `VERSION` 完全一致。改了版本忘了改页面 → 报错。

## 闸门

`scripts/check-version-literal.mjs`（随 `init` 下发，进 `npm run check`）：

| 场景 | 行为 |
| --- | --- |
| 还没有 `public/index.html`（原型阶段） | 跳过，exit 0（check 必须从第一天就绿） |
| 有占位符，且无任何写死版本/日期 | 通过 |
| 有占位符，但页面还有写死的 `vX.Y.Z` / `20XX-XX-XX` | **失败**，带行号 |
| 无占位符，字面量全部等于 VERSION | 通过 |
| 无占位符，字面量与 VERSION 不一致 | **失败**，带行号 |
| 页面完全不显示版本 | **失败**（用户看不出装的是哪版） |

## 交付判据（照抄进 PR 描述）

- [ ] `public/index.html` 里 `grep -c 'v[0-9]\+\.[0-9]\+\.[0-9]\+'` 为 0（占位符约定），或全部等于 VERSION（字面量约定）
- [ ] `npm run check` 含 `check-version-literal` 且绿
- [ ] 升版后**打开界面**确认版本号变了（不是只看 grep）——`test/version-inject.test.mjs` 有注入断言
- [ ] 失败示例留痕：把某处改回旧版本号，确认闸门变红

## 与既有文档的关系

- `docs/06-VALIDATION-AND-RELEASE.md` 原本只有一句原则「UI 不复制写死常量」，**没有自动化校验**。本文补上闸门。
- `docs/34-*`（AI 一键发送契约）同属「契约必须有断言守」的思路，此处是版本域的同一形态。
