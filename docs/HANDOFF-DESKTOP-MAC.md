# 把 M6（装机验证）交给 Mac 端 agent

> 文档编号：HANDOFF-DESKTOP-MAC ｜ 版本：`v0.1.0-draft.2`（2026-11-03）｜ 状态：SSH 与应用存在性已验证；实际 profile 和工作台装机未验证。
> 用途：本机（instabox，Linux）无法完成 M6/V1–V3，因为 DSH Desktop 官方不支持 Linux。要让装机、真实加载和真机截图成为**实测**而不是「未验证」，需要一台装有 DSH Desktop 的 Mac。

## 一、为什么需要这台 Mac

`AGENTS.md` 规定：部署目标只认本机 DSH Desktop（`io.dsh.desktop`）；没装 Desktop 就当场停下，**不许拿 dev server、`~/.dsh` 或 CLI profile 顶替，也不许写「已验证」**。已实测：

- 本机 `env -u DSH_HOME node scripts/check-install.mjs` → 「✗ 这台机器上没有找到 DSH Desktop（io.dsh.desktop）」。
- dsh-desktop 上游无任何 Linux 分发物，源码构建被 `Office runtime: unsupported native target linux/x64` 硬阻断。

因此 M6 的**唯一**可行路径是在 Mac 上做。

## 二、连接状态及仍需核实的信息

2026-11-03 通过 Tailscale SSH 实测可登录 Mac mini，远端用户名 `sammini`；`/Applications/DSH Desktop.app` 存在，版本 0.12.1。该结果只证明 SSH 和应用文件存在，未证明应用正在运行、profile 已定位或工作台已安装。下面保留原交接清单供后续核验：

1. **可登录的用户名**与登录方式（下列任一）：
   - 把下面第三节的公钥加进该用户的 `~/.ssh/authorized_keys`（推荐，最小授权）；或
   - 开启 Tailscale SSH 并授权 `qinxiaoqiang@` 的 tailnet 身份访问该机。
2. **DSH Desktop 的实际安装位置与正在加载的 profile 目录**。判定基准不是 `~/.dsh/profiles/*`，而是 `io.dsh.desktop` 这个 app 的 `harness/profiles/<宿主实际加载的>`。请给出该目录的绝对路径。
3. **Desktop 是否已安装并可启动**（版本号），以及是否登录过。
4. **能否在该 Mac 上执行 npm/pnpm 安装本工作台的 tgz**。
5. **GUI 截图方式**（供 README 按 33 号放实渲截图）：是否能 `screencapture`，或需要人工提供截图。

## 三、本次用于连接的密钥

本机已生成专用密钥（仅此用途，不用于其他机器）：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHc5B/8qACyLzCI7/l51qjdAjx2nr42ouVeRoq6bBHwH instabox-behcet-workbench-M6
```

Mac 端执行（把公钥加入 `authorized_keys`）：

```sh
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHc5B/8qACyLzCI7/l51qjdAjx2nr42ouVeRoq6bBHwH instabox-behcet-workbench-M6' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

私钥留在本机 `~/.ssh/id_ed25519_instabox`，不离开本机。

## 四、本机在拿到访问权后会做什么（M6 步骤）

1. `node scripts/check-install.mjs`（不带 `DSH_HOME`）确认 Desktop profile 位置 —— 这是**唯一**的核验命令。
2. 改包必升版 → `npm run release:pack` 产出 tgz + sha256。
3. 按 06 号四要素对照 tgz 内容（`cordis.patch.yml`、`public/`、`schema/migrations/` 必须在包内）。
4. `corepack pnpm` 安装到该 Desktop profile，登记 bundle。
5. 重启后**先新建会话**（宿主按会话授权），再真机走查。
6. 真机截图刷新 README（33 号 ≥4 张 + 折叠态）。
7. 如实记录：代码检查 / 安装完成 / 界面加载 / 业务可用 / 外部服务成功，五者不互相替代。

## 五、当前如实状态（不能省略）

- 本机 **M6 未执行**，Desktop 未安装、未验证。
- 用户于 2026-11-03 确认 G2；数据模型 M3 草案进行中，G3 未签，业务实现与临床库尚未完成。
- 即使 Mac 端接通，第 4–7 步仍须等工作台实现、打包和相关验收前置条件具备，不能把 G2 确认等同装机许可或业务验证。
- 本文件是**前置准备**，不是「已接通」的声明。

## 六、给 Mac 端 agent 的一句话

请提供：可登录用户名 + 授权上述公钥（或开启 Tailscale SSH）+ DSH Desktop 安装路径与其实际加载的 profile 绝对路径 + 截图方式。**不要**为此修改工作台仓的任何文件。
