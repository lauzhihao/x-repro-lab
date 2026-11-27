# `foru17/neko-master` 实测执行日志

- **Run ID**: `lab-20261127-093521-447299604596-bacb0e`
- **评估节点与容器**: `ubuntu_rtx5060` 远端主机上的隔离容器（镜像 `node:22-slim`，`--cap-drop=ALL --security-opt=no-new-privileges --pids-limit=256 --memory=16g --cpus=8`）
- **仓库版本**: `main` 分支提交 `93ca4bcfb790`（`2026-11-10T19:20:38Z`，`package.json` 版本 `1.4.4`）

---

## 1. 环境准备与一次性容器启动

核查发现 `local/claude-tokyo:ubuntu24` 镜像内仅预装 Node v18.19.1 且缺少 `git` / `npm` / `pnpm`，而目标仓库要求 Node.js 22。因此选用允许的官方镜像 `node:22-slim`（Node `v22.23.5` + glibc），无需额外编译工具即可直接加载 `better-sqlite3` 预编译二进制。

```bash
docker pull node:22-slim
# DOCKER_PULL_SECONDS=9
docker run -d --rm \
  --label xrl.run_id=lab-20261127-093521-447299604596-bacb0e \
  --name xrl-lab-20261127-093521-447299604596-bacb0e \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --pids-limit=256 --memory=16g --cpus=8 \
  -p localhost:13000:3000 -p localhost:13001:3001 -p localhost:13002:3002 \
  -v /tmp/xrl-lab-20261127-093521-447299604596-bacb0e:/work -w /work \
  node:22-slim sleep infinity
```

> **Self-Healing #1（容器权限）**: 首次以容器默认 `root` 执行 `docker exec` 写入 `/work` 时触发 `EACCES: permission denied`（因为 `--cap-drop=ALL` 移除了对宿主机 uid 1000 目录的越权写能力）。切换为 `docker exec -u node`（uid 1000）并将工作目录缓存置于 `/work/.home` 与 `/work/.tools` 后顺利解决。

---

## 2. 源码拉取、结构检查与依赖安装

在容器内通过 Node.js 原生 `fetch` 下载 `main` 分支归档包（`12,057,285` 字节，2 秒完成解压），并在 `/work/.tools` 局部安装 `pnpm@9.15.9` 后执行 `pnpm install --frozen-lockfile`：

```text
HEAD_SHA=93ca4bcfb790 DATE=2026-11-10T19:20:38Z
TARBALL_BYTES=12057285
FETCH_EXTRACT_SECONDS=2
NODE=v22.23.5 PNPM=9.15.9
Packages: +898
Done in 23.1s using pnpm v9.15.9
PNPM_INSTALL_SECONDS=23
SQLITE_OK function
```

同时检查 `apps/agent` 目录时发现一个仓库维护细节：`apps/agent/neko-agent`（`8,752,706` 字节，头部魔数 `cffaedfe` 的 Mach-O arm64 可执行文件）被直接提交进了代码库中。

---

## 3. 内置检查、单测与生产构建

初次直接运行 `pnpm --filter @neko-master/collector test` 时，因共享包尚未编译而报错 `Failed to resolve entry for package "@neko-master/shared"`。

> **Self-Healing #2（Monorepo 构建顺序）**: 遵循 `Dockerfile` 的构建顺序，先执行 `pnpm --filter @neko-master/shared build` 生成共享包构建产物，随后重跑 Collector Vitest 测试与后续构建，全部通过。

```text
=== CHECK API ROUTES ===
[api-routes] frontend routes: 44
[api-routes] backend routes: 59
[api-routes] missing backend routes: 0
[api-routes] backend-only routes: 15

=== BUILD SHARED ===
BUILD_SHARED_SECONDS=0

=== COLLECTOR TESTS ===
Test Files  26 passed (26)
     Tests  205 passed | 2 skipped (207)
COLLECTOR_TEST_SECONDS=4

=== BUILD COLLECTOR ===
BUILD_COLLECTOR_SECONDS=2

=== BUILD WEB ===
▲ Next.js 16.2.7 (webpack)
✓ Compiled successfully in 13.1s
✓ Generating static pages using 6 workers (3/3) in 259ms
BUILD_WEB_SECONDS=33
```

按 `Dockerfile` 方式拼装 Next.js `standalone` 目录，并写入前端运行时配置将 WebSocket 端口指向映射端口 `13002`（便于后续本地浏览器直连验证实时推送）。

---

## 4. 生产服务冷启动与基线健康检查

启动 Collector（API 端口 `3001`、WebSocket 端口 `3002`、SQLite 持久化到 `/work/data/stats.db`）与 Next.js Standalone Web（端口 `3000`）：

```text
COLLECTOR_READY_MS=230 BODY={"status":"ok"}
WEB_READY_MS=419 STATUS=200 HTML_BYTES=68063
CHECK http://localhost:3001/api/auth/state 200 {"enabled":false,"hasToken":false,"forceAccessControlOff":false,"showcaseMode":false}
CHECK http://localhost:3001/api/backends 200 []
CHECK http://localhost:3000/api/auth/state 200 {"enabled":false,"hasToken":false,"forceAccessControlOff":false,"showcaseMode":false}
CHECK http://localhost:3000/api/backends 200 []
CHECK http://localhost:3000/api/stats/global 200 {"totalConnections":0,"totalUpload":0,"totalDownload":0,"uniqueDomains":0,"uniqueIPs":0,"backendCount":0}
MEM=280.5MiB / 16GiB CPU=0.00% PIDS=21
```

---

## 5. 多网关实时采集、Agent 上报与接口性能验证

在容器内启动自包含 Mock 脚本 `mock-gateways.mjs`，模拟：
1. **Clash / Mihomo 网关**（`http://localhost:19090`，WebSocket `/connections` 每秒推送 4 个活跃域名的递增字节流，首帧为空基线以配合仓库自身的存量连接过滤逻辑）；
2. **Surge v5+ 网关**（`http://localhost:19091`，HTTP `/v1/requests/recent` 每 2 秒被轮询，提供 2 条带策略决策链注释的请求流）；
3. **远程 Agent 上报**（`agent://lab-edge-01`，发送心跳、gzip 压缩的 `/api/agent/report` 流量上报，以及重复 `requestId` 重试以验证幂等去重）。

运行验证脚本 `verify-e2e.mjs`，连接 Neko Master 自带实时 WebSocket 服务（`ws://localhost:3002`），等待 35 秒完成一轮完整 30 秒 `BatchBuffer` SQLite 落盘后全量校验所有聚合接口：

```text
TEST_CONN_CLASH: 200 { success: true, message: 'Connection successful' }
TEST_CONN_SURGE: 200 { success: false, message: 'Invalid response format from Surge API' }
CREATED_BACKENDS: { clashId: 1, surgeId: 2, agentId: 3, hasAgentToken: true }
AGENT_HEARTBEAT: 200 { success: true, backendId: 3, agentId: 'lab-edge-01' }
AGENT_REPORT_GZIP: 200 { success: true, backendId: 3, accepted: 2, dropped: 0 }
AGENT_REPORT_DEDUP: 200 { success: true, backendId: 3, accepted: 0, dropped: 0, duplicate: true }
WS_LIVE_FRAMES: 34 WS_LAST_SNAPSHOT: { totalConnections: 4, totalUpload: 2937000, totalDownload: 34485000, domains: 4 }
```

各后端落盘后的全量统计与查询耗时实测（均通过 Web 同源代理 `/api/stats/*` 访问）：

- **Clash-Gateway-Lab (id=1)**:
  - `totalConnections=4`, `totalUpload=3,026,000 B`, `totalDownload=35,530,000 B`（与 34 次增量精确一致）
  - 4 个域名 (`youtube.com`, `github.com`, `api.openai.com`, `registry.npmjs.org`)、4 个节点 (`JP-BGP-01`, `HK-IEPL-01`, `US-West-02`, `DIRECT`)、4 条规则、3 个设备 IP
  - 响应耗时：`summary=11.21ms`, `domains=3.61ms`, `ips=3.80ms`, `proxies=2.12ms`, `rules=2.33ms`, `devices=2.23ms`, `trend=2.11ms`, `hourly=2.01ms`
- **Surge-Gateway-Lab (id=2)**:
  - `totalConnections=2`, `totalUpload=459,000 B`, `totalDownload=3,485,000 B`
  - 2 个域名 (`dash.cloudflare.com`, `pypi.org`)、2 个节点 (`SG-CN2-01`, `DIRECT`)、2 条规则、2 个设备 IP
  - 响应耗时：`summary=2.64ms`, `domains=1.55ms`, `rules=1.83ms`, `trend=1.46ms`
- **Agent-Device-Lab (id=3)**:
  - `totalConnections=5` (`3+2`), `totalUpload=49,152 B`, `totalDownload=6,144,000 B`（重复 `requestId` 未重复计入）
  - 2 个域名 (`huggingface.co`, `docker.io`)、2 个节点 (`US-West-02`, `HK-IEPL-01`)、2 条规则、2 个设备 IP
  - 响应耗时：`summary=2.67ms`, `domains=1.54ms`, `rules=1.38ms`, `trend=1.29ms`
- **全局汇总 (`/api/stats/global`)**: `totalConnections=11`, `uniqueDomains=8`, `uniqueIPs=8`, `backendCount=3`
- **多网关切换 (`POST /api/backends/:id/activate`)**: Surge/Clash 切换均返回 `200`
- **多网关并发采集期间容器资源**: `MEM=270.5MiB / 16GiB`, `CPU=1.65%`, `PIDS=32`

> **实测细节说明**: Surge 采集器轮询 `/v1/requests/recent` 数据完全正常入库，但内置健康检查与「测试连接」按钮会因模拟网关未返回完整 Surge 流量/版本校验结构而报告 `unhealthy`（不影响真实流量拉取）。

---

## 6. 浏览器可视化与交互核验

通过临时 SSH 本地端口转发（`13000` / `13002`）使用 `ego-browser`（空白沙盒 Profile）访问 `http://localhost:13000`，自动跳转 `/zh` 并正常建立 WebSocket 连接，渲染出完整仪表盘与实时数字变化（从 `81.11 MB` 实时增长）。

截图产物已保存于 `/tmp/xrl-lab-20261127-093521-447299604596-bacb0e/out/screenshots/`：
- `01-overview.png`（149 KB）：总览页，顶部多网关状态胶囊（`Clash-Gateway-Lab`、`Surge-Gateway-Lab`、`Agent-Device-Lab`）、实时汇总卡片、流量趋势图及热门域名/代理/地区排行
- `02-domains.png`（122 KB）：域名分析页，Top 域名堆叠柱状图与可搜索/分页域名明细表
- `03-rules.png`（172 KB）：规则分析页，规则占比环图、规则列表与 React Flow 规则链路流向图（`Streaming -> JP-BGP-01`）及关联域名表

---

## 7. 资源清理

退出浏览器 TaskSpace、关闭 SSH 端口转发任务，并销毁远端一次性容器与 `/tmp/xrl-lab-20261127-093521-447299604596-bacb0e` 目录（`REMAINING_CONTAINERS=0`）。
