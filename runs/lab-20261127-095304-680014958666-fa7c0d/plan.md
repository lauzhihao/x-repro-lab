# 实测计划：GoogleChrome/modern-web-guidance-src（modern-web-guidance CLI）

## 1. 测试节点与容器隔离策略
- **执行节点**：`ubuntu_rtx5060`（SSH 目标 `ubuntu-rtx5060`）。
- **容器镜像**：预拉取官方镜像 `node:22-slim`（内置 Node.js `v22.23.5` 与 npm `10.9.9`，满足 CLI `>=22.0.0` 及源码仓库 `>=22.18.0` 的运行要求）。
- **安全与资源隔离**：所有下载、安装、构建与测试命令均在一次性 `docker run --rm` 容器内执行，挂载 `/tmp/xrl-lab-20261127-095304-680014958666-fa7c0d:/work`，限制 `--cap-drop=ALL`、`--security-opt=no-new-privileges`、`--pids-limit=256`、`--memory=16g`、`--cpus=8`，并将所有缓存与主目录写入置于 `/work` 下，不修改宿主机环境。

## 2. 实测验证步骤

### 阶段一：已发布 npm CLI（`npx modern-web-guidance@latest`）实测
1. **冷启动与帮助信息**：测量冷启动 `--version` 与热启动 `--help` 耗时，确认版本号与子命令列表。
2. **`search` 检索测试**：
   - 运行帖子宣称命令 `search "animate a dialog modal backdrop"` 及两个补充英文场景查询（滚动条深色模式、容器查询响应式卡片）。
   - 测试中文查询边界情况（`search "弹窗背景动画"`），验证非英文查询的处理提示与退出码。
3. **`retrieve` 指南读取测试**：
   - 运行帖子宣称命令 `retrieve "animate-to-from-top-layer"`，统计输出字节数、行数、词数及大致 Token 开销，检查是否包含现代原生 CSS API 与降级回退方案。
   - 测试逗号分隔多 ID 读取及无效 ID 错误处理。
4. **`legacy-scan` 遗留代码扫描测试**：
   - 查看 `legacy-scan --help` 支持参数。
   - 构造包含典型遗留前端写法（手写模态框 `role="dialog"`、无 `autocomplete` 表单、`::-webkit-scrollbar`、`float` 布局、`100vh`、`max-height` 折叠动画、`window.addEventListener('scroll', ...)`、`document.execCommand('copy')`、`XMLHttpRequest`、`JSON.parse(JSON.stringify(...))` 以及 `moment`/`lodash`/`body-scroll-lock`/`focus-trap`/`clipboard` 依赖）的样例项目 `/work/sample-app`，运行 `legacy-scan` 并记录耗时与命中的规则、推荐指南 ID。
5. **`install` 安装向导测试**：
   - 在隔离目录 `/work/install-test` 测试非交互参数 `install --agent claude-code -y`，记录产物或潜在依赖限制（如底层 `skills` CLI 是否依赖 `git`）。

### 阶段二：源码仓库（`GoogleChrome/modern-web-guidance-src`）下载与构建测试
1. 通过 Node 原生 `fetch` 下载 `main` 分支源码压缩包并解压到 `/work/repo`（不依赖宿主机配置）。
2. **指南规模与上下文开销审计**：统计 `guides/` 实际指南数量（核对帖文宣称的 204 个案例）、`SKILL.md` 上下文 Token 开销以及全量指南文本体量。
3. **依赖安装与工程检查**：使用 `pnpm@10.30.3` 运行 `install --frozen-lockfile`、`build`、`typecheck`、`lint` 与单元测试 `test`，并验证本地构建产物 CLI 是否可正常执行检索。

## 3. 预期结果与清理
- 预期确认 CLI 的检索、指南读取、遗留代码扫描以及源码仓库的构建与单元测试表现，同时识别并记录任何真实环境依赖或边界限制（如英文查询要求、无 `git` 镜像下的安装行为等）。
- 实验结束后，确认无残留测试容器并彻底删除远程临时目录 `/tmp/xrl-lab-20261127-095304-680014958666-fa7c0d`。
