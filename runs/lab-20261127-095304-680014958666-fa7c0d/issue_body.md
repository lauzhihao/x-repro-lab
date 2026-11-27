# 面向编程智能体的现代 Web 最佳实践技能插件与 CLI

- **全局追踪 ID (`run_id`)**: `lab-20261127-095304-680014958666-fa7c0d`
- **当前终态**: `completed`（实测结论: `repro_with_gotcha`）
- **原帖链接**: https://x.com/hisevenih/status/2124391680014958666
- **原帖作者**: [@hisevenih](https://x.com/hisevenih)
- **原帖标题/主题**: 面向编程智能体的现代 Web 最佳实践技能插件与 CLI
- **执行节点**: `ubuntu_rtx5060`
- **SLA 计时**: 决定引用 `2026-11-27T01:52:31.078Z` -> 结束 `2026-11-27T02:05:35.532Z`（耗时 **13.1 分钟** / 上限 120 分钟）

## 一、JEV 立项判定（引用理由）

- **裁决模型**: `jev-1.14.0` | **通过门槛**: 正向题 `>= 0.7`，阻断题 `<= 0.3`（中间区 `0.30~0.70` 一律作罢）
- **最终结论**: `GO`（`all_9_slots_passed`）
- **识别到的实测对象**: `GoogleChrome/modern-web-guidance-src`（github_repo）
- **提炼验证目标**: Run the modern-web-guidance CLI with Node.js 22+, test the search, retrieve, and legacy-scan commands on a sample codebase, and verify its installation and guideline retrieval behavior.

| 编号 | 角色 | 判断题（中文摘要） | 选项判定标准 | 得分 | 结果 |
|:-----|:-----|:-------------------|:-------------|-----:|:-----|
| `has_concrete_runnable_target` | 正向立项 | 是否存在可由 Agent 实测验证的公开开源 GitHub 库 | >= 0.7 | 0.98 | PASS (YES) |
| `has_falsifiable_claim` | 正向立项 | 是否包含可观测/可证伪结论或步骤 | >= 0.7 | 0.98 | PASS (YES) |
| `has_engineering_value` | 正向立项 | 实测结果是否具备工程交流价值 | >= 0.7 | 0.87 | PASS (YES) |
| `requires_paid_or_new_account` | 风险/成本阻断 | 是否需要付费、绑卡、新注册或缺失凭据 | <= 0.3 | 0.06 | PASS (NO) |
| `requires_unavailable_hardware_or_os` | 风险/成本阻断 | 是否超出本机与远程节点硬件/系统能力 | <= 0.3 | 0.05 | PASS (NO) |
| `exceeds_120min_or_needs_offline_action` | 风险/成本阻断 | 是否超过 2 小时时限或需要线下物理动作 | <= 0.3 | 0.04 | PASS (NO) |
| `endangers_hardware_or_host_stability` | 风险/成本阻断 | 是否可能危及硬件或宿主机系统稳定性 | <= 0.3 | 0.03 | PASS (NO) |
| `triggers_software_risk_control_or_tos_violation` | 风险/成本阻断 | 是否涉及平台风控对抗或违反服务条款 | <= 0.3 | 0.03 | PASS (NO) |
| `violates_ethics_business_or_law` | 风险/成本阻断 | 是否违背人类伦理、商业道德或法律法规 | <= 0.3 | 0.02 | PASS (NO) |

## 二、执行计划

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

## 三、执行过程与自愈记录

# 实测执行日志：GoogleChrome/modern-web-guidance-src

## 1. 仓库元信息与容器环境确认
- **GitHub 仓库核验**：
  - 源码仓库 `GoogleChrome/modern-web-guidance-src`：Apache-2.0 协议，TypeScript，实测时 **11,265** Stars。
  - 分发仓库 `GoogleChrome/modern-web-guidance`：实测时 **26,675** Stars。
  - npm 包 `modern-web-guidance` 最新版：`1.0.2`，要求 Node `>=22.0.0`。
- **执行容器**：在远程 `ubuntu_rtx5060` 节点（`ubuntu-rtx5060`）使用官方 `node:22-slim`（Node `v22.23.5`、npm `10.9.9`，无 `git`/`curl`）运行一次性隔离容器（`--rm`、`--cap-drop=ALL`、`--security-opt=no-new-privileges`、`--pids-limit=256`、`--memory=16g`、`--cpus=8`）。

```text
$ docker run --rm ... node:22-slim sh -c 'node -v; npm -v'
v22.23.5
10.9.9
```

---

## 2. 边界自愈记录 1：无权限覆盖容器目录写入问题
- **现象**：首次在 `--cap-drop=ALL` 下以容器默认 UID 0 运行 `npx` 时，因宿主机挂载目录 `/work` 属主为 UID/GID `1000:1000` 且内核能力已丢弃，创建缓存目录触发 `EACCES: syscall mkdir, path /work/npm-cache/_cacache`（退出码 `1`）。
- **修复**：在 `docker run` 中显式追加与宿主机一致的用户映射参数 `-u $(id -u):$(id -g)`（对应容器内置 `node` 用户 `1000:1000`），所有缓存与临时目录均在 `/work` 下正常读写。

---

## 3. 已发布 npm CLI（`modern-web-guidance@1.0.2`）实测

### 3.1 冷/热启动耗时与子命令概览
```text
$ npx -y modern-web-guidance@latest --version
1.0.2
--- exit=0 elapsed_ms=5987 ---

$ npx -y modern-web-guidance@latest --help
Usage: modern-web-guidance <command> [args]

Commands:
  search <query>            Search use cases by English query
  list                      List all available use cases
  retrieve <ids>            Retrieve use case(s) by ID(s), comma-separated
  legacy-scan [path] [options]  Analyze codebase for legacy web platform patterns
  set-allow-origin-trials   Opt in to experimental Origin Trial guidance
  set-allow-volatile-features Opt in to volatile feature guidance
  install [options]         Install the modern-web-guidance skill
  uninstall                 Uninstall the modern-web-guidance skill
  update                    Update skills
--- exit=0 elapsed_ms=1357 ---
```

### 3.2 `list` 与 `search` 检索测试（含中文边界用例）
- `list` 命令共输出 **210** 条 JSON 行指南索引；npm 包内 `guides/` 目录下共包含 **211** 个 `.md` 指南文件（含 `prompt-api.md` 对 `language-model.md` 的副本）。
- 英文检索命中精准且耗时稳定在 **1.34s–1.36s**；中文检索返回空数组并在 stderr 提示必须使用英文关键词。

```text
$ npx -y modern-web-guidance@latest list | wc -l
210

$ npx -y modern-web-guidance@latest search "animate a dialog modal backdrop"
[{"id":"light-dismiss-a-dialog","description":"Create a modal dialog that can be closed via light dismiss (i.e. clicking or tapping outside of the dialog)"},
{"id":"animate-to-from-top-layer","description":"Animate elements such as dialogs, popovers, and tooltips as they're entering/exiting the top layer."},
{"id":"prevent-page-scroll-under-modal-dialog","description":"Prevent the underlying page from scrolling while a modal dialog is open."},
...（共返回 10 条）]
--- exit=0 elapsed_ms=1347 ---

$ npx -y modern-web-guidance@latest search "dark mode scrollbar"
[{"id":"dark-mode","description":"Implement dark mode support in a way that respects the user's light/dark theme preference and adapts browser UI (e.g. scrollbars, form controls, etc)"},
{"id":"component-specific-light-dark-theme","description":"Force certain elements to be in light mode or dark mode (e.g. code blocks, media players, etc) independently of the page's color-scheme."},
{"id":"adapt-scrollbar-to-contrast-preferences","description":"Enhance scrollbar visibility for users who prefer high-contrast interfaces"},
...（共返回 10 条）]
--- exit=0 elapsed_ms=1350 ---

$ npx -y modern-web-guidance@latest search "container query responsive card"
[{"id":"card","description":"Build a card component that adapts its presentation to its own available space and contents."},
{"id":"css-layout","description":"Modern CSS layouts such as flexbox, grid, subgrid, container queries, anchor positioning, and intrinsic sizing..."},
...（共返回 10 条）]
--- exit=0 elapsed_ms=1360 ---

$ npx -y modern-web-guidance@latest search "弹窗背景动画"
[]
Note: Search queries must be in English (e.g., search "light dismiss dialog").
--- exit=0 elapsed_ms=1342 ---
```

### 3.3 `retrieve` 指南读取测试（单 ID、多 ID、无效 ID 与输出体量）
- 当返回的指南内容超过约 9.5 KB 时，`retrieve` 会将其写入 `/tmp/mwg-guide-*.md` 并在终端提示阅读该临时文件，避免长输出被代理工具截断；当输出重定向到管道/文件时则直接输出完整 Markdown。
- `animate-to-from-top-layer.md` 实测体量为 **11,135 字节 / 1,382 词 / 253 行**，涵盖 `@starting-style`、`transition-behavior: allow-discrete`、`overlay`、`::backdrop` 动画，并附带 `Baseline` 浏览器支持状态（如 Popover `Baseline since 2025-01-27`）及条件特性检测回退代码（`@oddbird/popover-polyfill` 懒加载、`@supports not selector(:popover-open)`）。

```text
$ npx -y modern-web-guidance@latest retrieve "animate-to-from-top-layer"
Output (10.9 KB, 254 lines) saved to /tmp/mwg-guide-280-1795744598751.md to prevent CLI stdout truncation.
Read /tmp/mwg-guide-280-1795744598751.md in full using your file-reading tool (254 lines total)—do not use cat or head.
--- exit=0 elapsed_ms=1191 ---

$ npx -y modern-web-guidance@latest retrieve "animate-to-from-top-layer,light-dismiss-a-dialog"
Output (15.1 KB, 346 lines) saved to /tmp/mwg-guide-63-1795744628896.md to prevent CLI stdout truncation.
Read /tmp/mwg-guide-63-1795744628896.md in full using your file-reading tool (346 lines total)—do not use cat or head.
--- exit=0 elapsed_ms=1357 ---

$ npx -y modern-web-guidance@latest retrieve "non-existent-guide-id"
Retrieve failed for non-existent-guide-id: Error: No guide found for use case: non-existent-guide-id
--- exit=1 elapsed_ms=1214 ---
```

- 测量已发布包中 `skills/modern-web-guidance/SKILL.md` 的上下文开销：
  - YAML Frontmatter（会话常驻摘要）：**904 字节 / 108 词 / 约 226 tokens**（与官方标注约 `~205 tokens` 接近）。
  - 完整 `SKILL.md` 正文：**9,807 字节 / 1,346 词 / 90 行 / 约 2,447 tokens**。

### 3.4 `legacy-scan` 遗留代码扫描测试
在 `/work/sample-app` 构造包含 `index.html`、`styles.css`、`app.js`、`package.json` 的样例工程（包含 `::-webkit-scrollbar`、`max-height` 折叠动画、`JSON.parse(JSON.stringify(...))`、`document.execCommand('copy')`、`XMLHttpRequest`、`float` 布局、`100vh`、`role="dialog"` 等写法），分别运行默认模式、`.` 相对路径与 `--json` 结构化模式：

```text
$ npx -y modern-web-guidance@latest legacy-scan /work/sample-app
Modern Web Guidance legacy-scan — /work/sample-app
Found 4 modernization opportunities across 3 guides (scanned 38 guides with deterministic rules; ~20% of the guidance corpus):
Note: Static analysis results are provisional — verify against the Keep/Drop criteria below.

* animate-to-intrinsic-sizes (1 finding)
  CSS transition on max-height simulates intrinsic size animation; modernize with interpolate-size: allow-keywords or calc-size().
  - styles.css:31
    .accordion-panel {

* customize-scrollbar-color-and-thickness (2 findings)
  Vendor ::-webkit-scrollbar pseudo-elements customize or hide scrollbars; use standard scrollbar-color and scrollbar-width (including scrollbar-width: none) instead.
  - styles.css:22
    ::-webkit-scrollbar {
  - styles.css:28
    ::-webkit-scrollbar-thumb {

* js (1 finding)
  Replace JSON.parse(JSON.stringify(x)) deep-copy workarounds with structuredClone(x).
  - app.js:16
    return JSON.parse(JSON.stringify(obj));

Retrieve a guide: npx modern-web-guidance retrieve <guide-id>
--- exit=0 elapsed_ms=1565 ---
```

- 使用 `legacy-scan .` 耗时 **1,465 ms**（`exit=0`）；`--json` 模式耗时 **1,453 ms**（`exit=0`），输出 `"activeRuleCount": 52`、`"activeGuideCount": 38`、`"scannedFileCount": 4`、`"totalFindings": 4`，且每条规则自带 `verifierRubric`（`keepWhen` / `dropWhen` 条件）供代理二次过滤误报。

### 3.5 `install` 安装命令测试
在 `/work/install-test` 测试非交互安装 `npx -y modern-web-guidance@latest install --agent claude-code -y`：

```text
$ npx -y modern-web-guidance@latest install --agent claude-code -y
◇  Source: https://github.com/GoogleChrome/modern-web-guidance.git
■  Failed to clone repository
│  [SKILLS_GIT_CLONE_FAILED] Failed to clone https://github.com/GoogleChrome/modern-web-guidance.git: Error: spawn git ENOENT
└  Installation failed
--- exit=1 elapsed_ms=7584 ---
```
- 实测发现：`install` 底层调用 `skills` CLI 克隆 `GoogleChrome/modern-web-guidance.git`，因此除了文档声明的 Node.js 22+ 外，在无 `git` 的精简容器镜像（如 `node:22-slim`）中会直接因 `spawn git ENOENT` 失败。

---

## 4. 源码仓库（`GoogleChrome/modern-web-guidance-src`）构建与测试

### 4.1 下载与指南体量审计
通过 Node 原生 `fetch` 下载 `main` 分支源码归档（**76,408,036 字节**，耗时 **4,751 ms**）并解压至 `/work/repo`。盘点 `/work/repo/guides/` 下全部 `guide.md`：
- 覆盖 **18** 个一级目录（其中 `modern-web-guidance` 目录为 0 个子指南，其余 17 个学科/场景分类共含 **255** 个 `guide.md` 源文件）。
- 全量源码指南总大小 **1,948,658 字节 / 261,960 词**；单篇中位数 **6,134 字节 / 831 词**（最小 172 字节，最大 51,784 字节）。
- 重点分类分布：`ui-behaviors`（45）、`performance`（32）、`ui-components`（28）、`forms`（27）、`visual-design`（27）、`css`（20）、`security`（17）、`ui-atoms`（14）、`html`（11）、`pwa`（10）等。

### 4.2 依赖安装、自愈及 `build` / `typecheck` / `lint` / `test`
- **边界自愈记录 2（`pnpm install` postinstall 失败）**：
  - 首次运行 `npx -y pnpm@10.30.3 install --frozen-lockfile` 耗时 **22,025 ms** 下载完 302 个包后，在 `onnxruntime-node@1.30.0` 的 `postinstall` 脚本中因拉取构建列表收到 `HTTP status code = 302` 而中断（`exit=1`），导致 `.bin/tsc` 与 `.bin/oxlint` 未完成链接，`typecheck` 与 `lint` 报 `not found`。
  - **修复**：改用 `npx -y pnpm@10.30.3 install --frozen-lockfile --ignore-scripts` 完成包链接（耗时 **530 ms**，`exit=0`），随后重新执行 `typecheck` 与 `lint`。

```text
$ npx -y pnpm@10.30.3 run typecheck
> tsc && tsc -p src/dashboard/tsconfig.json
typecheck_rc=0

$ npx -y pnpm@10.30.3 run lint
> oxlint --ignore-path .oxlintignore
Found 2 warnings and 0 errors.
Finished in 57ms on 627 files with 94 rules using 8 threads.
lint_rc=0
```

- **构建流水线（`pnpm run build`）**：
  - 第一阶段 `node src/build/build-guides.ts --target=skills-cli` 成功执行，提示 `65 chunk(s) across 22 guide(s) not yet in guide-chunk-cache (using BM25 until release embedding)`，并成功生成 **213** 个可用指南至 `out/build/skills-cli/gen/guides.json`。
  - 第二阶段 `src/build/build-dist.ts` 已完成 `search.mjs`、`legacy-scan.mjs`、`modern-web.mjs` 与 `watchdog` 打包（生成了可运行的 `dist/skills-cli/skills/modern-web-guidance/modern-web.mjs`），但在随后调用 `git tag -l` / `git log -1` 提取版本元数据时因容器无 `git` 且源码为 tarball 解压而报 `spawnSync git ENOENT`（`exit=1`，耗时 **3,512 ms**）。
  - 直接运行本地打包出的 `node dist/skills-cli/skills/modern-web-guidance/modern-web.mjs search "animate a dialog modal backdrop"` 与 `retrieve "animate-to-from-top-layer"` 均正常返回预期结果。

- **单元测试（`pnpm test` vs 核心 CLI/RAG 子集）**：
  - 全量 `src/**/*.test.ts` 共运行 **3,268** 个测试（268 个测试套），**3,119 通过、136 失败、13 跳过**，耗时 **321.4 s**；失败原因主要集中于无 `git` 仓库/命令（`spawn git ENOENT`）以及依赖完整校准目标/分支状态的预期覆盖检查。
  - 单独运行核心运行时测试集 `node --test --test-reporter spec src/cli/*.test.ts src/rag/*.test.ts`：共 **111** 个测试（18 个测试套），**109 通过、0 失败、2 跳过**（依赖本机 Claude/skills 集成测试自动跳过），耗时 **8.56 s**（`exit=0`）。

---

## 5. 远程环境清理
测试完成后已在 `ubuntu-rtx5060` 核查无残留容器并彻底删除临时目录：

```text
$ docker ps -a --filter label=xrl.run_id=lab-20261127-095304-680014958666-fa7c0d
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
$ rm -rf /tmp/xrl-lab-20261127-095304-680014958666-fa7c0d
```

- 完整全程回放日志: [events.jsonl](https://github.com/lauzhihao/x-repro-lab/blob/main/runs/lab-20261127-095304-680014958666-fa7c0d/events.jsonl)

## 四、执行结果与实测数据

- **项目定位**: Google Chrome 联合 Edge、Firefox 和 MDN 团队维护的现代 Web 最佳实践技能插件与 CLI，通过紧凑索引、按需语义检索与静态遗留代码扫描，引导 AI 编程智能体优先采用原生现代 Web API 并自动补齐兼容回退方案。
- **是否可成功部署运行**: `是（已跑通）`
- **结果摘要**: 在 Node.js v22.23.5 隔离容器中实测已发布的 modern-web-guidance@1.0.2 CLI，search、retrieve、list 与 legacy-scan 均开箱即用，热执行耗时 1.19s–1.57s，SKILL.md 会话常驻摘要仅 904 字节（约 226 tokens），且指南正文确实附带 Baseline 状态与条件 Polyfill 回退代码；源码仓库 255 篇原生指南的 TypeScript 类型检查与 oxlint 静态检查均 0 错误通过，核心 CLI 与 RAG 单元测试 109/109 通过。主要限制在于 install 命令底层依赖 git 克隆仓库导致无 git 精简容器失败、search 仅支持英文查询，以及源码完整打包和全量测试强依赖 git 与 onnxruntime-node 二进制下载。

### 实测亮点
- 上下文开销极低：SKILL.md 常驻 YAML Frontmatter 实测仅 904 字节（108 词 / 约 226 tokens），避免占满上下文；单篇指南超 9.5 KB 时会自动落盘到 /tmp/mwg-guide-*.md 防止 CLI 截断输出。
- 检索与静态扫描开箱即用且响应快：search/retrieve/legacy-scan 热启动耗时 1.19s–1.57s，在 4 文件样例工程上 1.5s 内精准定位 4 处遗留模式（::-webkit-scrollbar、max-height 动画、JSON 深拷贝）并附带 keepWhen/dropWhen 误报过滤准则。
- 指南质量与回退完备：实测 animate-to-from-top-layer（11,135 字节 / 253 行）涵盖 @starting-style 与 transition-behavior: allow-discrete，同时给出 Baseline 日期、特征检测条件导入及 @supports 降级代码。

| 指标项 | 原帖声称 | 我方实测 | 备注 |
|:-------|:---------|:---------|:-----|
| GitHub Stars（源码库 / 分发库） | 9.9k Stars | 11,265（modern-web-guidance-src）/ 26,675（modern-web-guidance） | 截至实测当日均已超过帖文发布时的 9.9k |
| 可用实战指南数量 | 204 个精简实战案例 | 已发布 CLI list 共 210 条（包内 211 个 .md）；main 源码构建 213 条（guides/ 目录共 255 个 guide.md） | 数量随版本迭代持续增长，源码中位数单篇 6,134 字节（831 词） |
| SKILL.md 常驻摘要 Token 开销 | 不怎么占上下文 Token（README 标称 ~205 tokens） | Frontmatter 904 字节 / 108 词（约 226 tokens）；完整 SKILL.md 9,807 字节（1,346 词） | 触发前仅常驻 Frontmatter 摘要，命中后再按需调用 CLI |
| CLI 命令实测耗时（Node v22.23.5） | 一行命令装上与轻量调用 | 冷启动 --version 5,987 ms；热启动 search 1,347–1,360 ms；retrieve 1,191 ms；legacy-scan 1,453–1,565 ms | 多次调用稳定在 1.2s–1.6s 区间 |
| legacy-scan 规则覆盖与样例命中 | 扫描老旧前端模式 | 覆盖 38 个指南 / 52 条确定性规则（约占语料 20%），4 文件样例命中 4 处问题 | 支持 --json 结构化输出，附带 keepWhen/dropWhen 校验规则 |
| 源码仓库工程检查与核心测试 | TypeScript 源码与自动化测试 | typecheck 0 错误；oxlint 57 ms 内扫描 627 文件 0 错误（2 警告）；核心 CLI+RAG 测试 109 通过 / 0 失败 / 2 跳过（8.56 s） | 全量测试 3,268 项中 3,119 通过、136 失败（失败主要因容器缺 git 及完整校准夹具） |

### 自愈修复记录
- 在 --cap-drop=ALL 容器中以默认 root 身份写入 UID 1000 属主的挂载缓存目录触发 EACCES 权限错误: 在 docker run 参数中补充 -u $(id -u):$(id -g) 匹配宿主机 UID/GID（1000:1000） -> 已解决，所有 npx 与文件读写命令正常执行
- 源码仓库 pnpm install --frozen-lockfile 在 onnxruntime-node postinstall 拉取构建列表时遇到 HTTP 302 失败并中断 .bin 链接: 使用 pnpm install --frozen-lockfile --ignore-scripts 完成依赖树与 .bin 可执行文件链接 -> 已解决（530 ms 完成），typecheck、oxlint、build-guides 及核心 CLI/RAG 单元测试全部顺利执行

### 上手提醒 / 踩坑点
- install 命令隐含依赖 git：文档仅标明需要 Node.js 22+，但 install 实际调用底层 skills CLI 克隆分发仓库，在无 git 的纯净 node:22-slim 容器中会报 SKILLS_GIT_CLONE_FAILED（spawn git ENOENT）退出码 1。
- search 仅支持英文查询：输入中文关键词（如“弹窗背景动画”）返回空数组 []，并在 stderr 提示必须使用英文检索词。
- legacy-scan 并非全量规则扫描：当前确定性规则仅覆盖 38 个指南（52 条规则，约占全部语料的 20%），官方明确提示其余场景仍需结合 search 命令。
- 源码仓库安装与构建陷阱：pnpm install 在 onnxruntime-node@1.30.0 postinstall 阶段因远程构建列表返回 HTTP 302 失败，需加 --ignore-scripts；同时 build-dist.ts 与部分单元测试强依赖 .git 仓库和 git 命令。

### 拟引用推文草稿（一期仅存档，不自动发送）
> Chrome 联合 Edge 等团队做的这套前端技能包，装进编程 AI 专治总写过时 API 的毛病，平时只占 904 字节几乎不烧上下文，1.2–1.6 秒就能搜出原生新写法并配齐回退代码。注意两个坑：环境没装 git 时 install 会报错失败，且检索只认英文词，输中文会返回空。
> 
> 实测记录：https://github.com/lauzhihao/x-repro-lab/issues/3
