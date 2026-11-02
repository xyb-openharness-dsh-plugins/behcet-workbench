# 37 部署目标：只有 DSH Desktop 一台

> 一句话：开发出来的工作台**只装进本机 DSH Desktop（`io.dsh.desktop`）自己的 Harness profile**。
> `~/.dsh` 与 `DeepSeek Harness`（另一款 app）都不是目标，装上去不算交付。
> 没装 Desktop 就停下来，把 <https://www.dshdesktop.com/> 给用户。

这条要求是 2026-10-26 用户点名加的，属**最高优先级**：它排在"怎么写代码"之前，因为
**宿主找错，后面全白做**——页面能开、`npm run check` 全绿、tgz 也打出来了，但用户在
Desktop 的列表里根本看不到这台工作台。

**跨平台前提**：这是社区 GitHub 项目，使用者不一定是 macOS。本文只写"判据"，**不写要背的路径**；
具体位置一律由 `node scripts/check-install.mjs` 现场探测（macOS / Windows / Linux 同一命令）。

## 1. 为什么值得单列一条

装错宿主不会报错，只会"安静地没效果"，且三种表现各不相同：

| 表现 | 真因 |
| --- | --- |
| 市场/工作台列表里没有这一台 | 装进了 Desktop 不读的 Harness（`~/.dsh`） |
| 列表里有，但点开是旧版 | 装的是另一个 profile，或同一 profile 里旧 tgz 没被替换 |
| 市场里不显示"已安装"、也没有 app 内卸载 | 手工/native 装法，没有市场安装记录 |

三种都不是"再装一次就好"，都得先确认目标。所以把它做成规则，而不是某次踩坑的记录。

## 2. 三平台的位置（对照用，别当判据）

Harness 都在 app 自己的 **Electron userData** 下，再往下是 `harness/profiles/<名>`：

| 平台 | app 安装位置（探测点，任一存在即可） | Harness |
| --- | --- | --- |
| macOS | `/Applications/DSH Desktop.app`、`~/Applications/DSH Desktop.app` | `~/Library/Application Support/dsh-desktop/harness` |
| Windows | `%LOCALAPPDATA%\Programs\DSH Desktop`、`%LOCALAPPDATA%\dsh-desktop`、`%PROGRAMFILES%\DSH Desktop`、`%PROGRAMFILES(x86)%\DSH Desktop` | `%APPDATA%\dsh-desktop\harness` |
| Linux | `/opt/DSH Desktop`、`/opt/dsh-desktop`、`/usr/lib/dsh-desktop`、`~/.local/share/dsh-desktop`、`~/Applications` 等处的 `.AppImage` | `${XDG_CONFIG_HOME:-~/.config}/dsh-desktop/harness` |

- **实测状态**：macOS 2026-10-21 / 10-26 实测（DSH Desktop 0.12.0，活动 profile 恰为 `web`）；
  **Windows 与 Linux 未实测**，上面是按 Electron 安装与 userData 约定列的探测点，脚本会逐个试并打印它实际认了哪一个。
- app 装在非常规位置（绿色版、便携版、自定义目录）：`--app <路径>` 或 `DSH_DESKTOP_APP=<路径>` 显式指定，不要改脚本里的常量。
- **不按目录名猜 profile**：`web` 只是本机活动 profile 的名字，不是约定；以宿主配置/argv 为准，`--profile` 可覆盖。

## 3. 判据：三条，缺一即"没装上"

1. 目标 profile 的 `package.json` → `dependencies` 里有本包，值是 `file:<绝对路径>.tgz`；
2. 同一文件的 `dsh.profile.bundles` 数组里有本包名；
3. 重启宿主后 `harness/desktop-workbenches/state.json` 有 added/pinned 记录、`harness.log` 无本包报错。

**怎么装**（包管理器版本、`DSH_HOME`、`bundles` 两处改、Windows 与 macOS/Linux 的命令差异）
只看 [06-VALIDATION-AND-RELEASE.md](06-VALIDATION-AND-RELEASE.md)「安装到正确 Desktop」——那里是手法的唯一来源，本文不复制命令。

## 4. 没装 DSH Desktop 怎么办

1. **停下**，不要开始装机，也不要写"已验证"。
2. 告诉用户去 <https://www.dshdesktop.com/> 下载对应平台的安装包，装完**至少启动一次**
   （首次启动才会生成 Harness 目录与 `state.json`）。
3. 回来重跑 `node scripts/check-install.mjs`，读到"已登记"再继续。

三种"顶替"一律不接受，因为它们都只在开发语境里看着像成功：

- 起了 dev server、页面能开 → 那是源码树，不是宿主；
- 装进 `~/.dsh`（Windows 为 `%USERPROFILE%\.dsh`）→ CLI 侧 Harness，Desktop 不读；
- 装进 DeepSeek Harness（`com.deepseek.dsh`）→ 另一款 app，profile 不共享。

## 5. 机器执行

`node scripts/check-install.mjs`（`init` 随项目下发）只做**只读核对**，三平台同一命令：

| 输出 | 含义 | 退出码 |
| --- | --- | --- |
| 找不到 DSH Desktop | 没装，或没启动过 | 1（并打印下载地址） |
| 找到 Desktop 但依赖/bundles 缺一项 | 装了不加载 | 1 |
| 已登记 + 市场记录 | 装机成立 | 0 |

它会把**它实际认了哪个 app 位置、哪个 Harness、哪个 profile** 打在"判定基准"一行里——
换平台或换机器时先看这一行，别凭记忆对路径。

`npm run audit` 里有两条对应检查：`deploy/装机脚本`（脚本还在、且仍认 DSH Desktop 为唯一目标）、
`deploy/AGENTS`（项目 `AGENTS.md` 保留本节规则与下载地址）。**fail 不交付。**

## 6. 明确未做 / 未验证

- **Windows、Linux 只在 macOS 上做了分支模拟**（`Object.defineProperty(process,'platform',…)` 跑过提示文案与探测分支），
  **没有在真机装过**。真机第一次跑请把"判定基准"整行贴进 issue/交接，便于纠偏。
- 打包格式差异（NSIS / Squirrel / AppImage / deb）只体现在 app 路径探测上；**卸载残留**在 Windows 更常见
  （`%APPDATA%\dsh-desktop` 留着但 app 已删），所以判"装没装"必须 app 路径与 harness 证据**任一成立**，不能只看目录在。
- 存量 20+ 工作台若装在了错的地方，本文不回填；**下一轮动到那台时按本节重新核对**。
