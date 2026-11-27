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
