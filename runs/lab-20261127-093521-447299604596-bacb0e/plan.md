# Evaluation Plan: `foru17/neko-master`

- **Run ID**: `lab-20261127-093521-447299604596-bacb0e`
- **Target Repository**: `https://github.com/foru17/neko-master`
- **Execution Node & Isolation**: `ubuntu_rtx5060` (`ubuntu-rtx5060`) inside a disposable `node:22-slim` Docker container (`--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--pids-limit=256`, `--memory=16g`, `--cpus=8`), mounting only `/tmp/xrl-lab-20261127-093521-447299604596-bacb0e:/work` and mapping local loopback ports `13000`/`13001`/`13002` to container `3000`/`3001`/`3002`.
- **Visual Verification**: Local `ego-browser nodejs` (`Profile 1`, TaskSpace `xrl-lab-20261127-093521-447299604596-bacb0e`) accessing the dashboard over a temporary SSH port-forward to `localhost:13000` and `localhost:13002`, saving PNG screenshots under `/tmp/xrl-lab-20261127-093521-447299604596-bacb0e/out/screenshots/`.

## Deployment & Verification Steps

1. **Container Bootstrap**: Pull `node:22-slim` and start the disposable sandbox container `xrl-lab-20261127-093521-447299604596-bacb0e`.
2. **Source Fetch & Dependency Install**: Download the `main` branch tarball via Node `fetch`, inspect repository layout (including `apps/agent`, `Dockerfile`, and `docker-start.sh`), install `pnpm@9.15.9` locally under `/work/.tools`, run `pnpm install --frozen-lockfile`, and verify the `better-sqlite3` native addon loads.
3. **Tests & Production Build**: Run `pnpm check:api-routes` and `pnpm --filter @neko-master/collector test`, then build `@neko-master/shared`, `@neko-master/collector`, and `@neko-master/web` sequentially in production mode and assemble the Next.js standalone runtime bundle.
4. **Service Startup & Baseline Health**: Launch the collector (API on `3001`, WebSocket on `3002`, SQLite DB in `/work/data/stats.db`) and Next.js standalone frontend (port `3000`), recording cold-start readiness latency, baseline memory usage, and health/auth/global API responses.
5. **Multi-Gateway Traffic Verification**: Run a self-contained Node.js mock harness inside the container simulating:
   - A Clash/Mihomo gateway (WebSocket `/connections` + HTTP `/version`, `/proxies`, `/rules`, `/providers/proxies`),
   - A Surge v5+ gateway (HTTP polling `/v1/requests/recent`, `/v1/policy_groups`, `/v1/policies`, `/v1/rules`), and
   - A remote Agent client posting gzip-compressed `/api/agent/heartbeat` and `/api/agent/report` payloads (including duplicate request ID deduplication).
   Verify Neko Master WebSocket live push frames (`ws://localhost:3002`), SQLite persistence, multi-backend switching, and `/api/stats/*` endpoints (`summary`, `domains`, `ips`, `proxies`, `rules`, `devices`, `trend`, `hourly`, `connections`).
6. **Dashboard UI & Screenshot Verification**: Open `http://localhost:13000` via SSH tunnel in `ego-browser`, confirm rendered traffic statistics, charts, domain/rule breakdowns, and multi-gateway switching, and capture screenshots.
7. **Teardown**: Close browser TaskSpace, terminate SSH tunnel, remove the disposable remote container and temporary `/tmp/xrl-lab-20261127-093521-447299604596-bacb0e` directory, and write `execution.md` and `result.json`.

## Expected Observable Behavior

- `pnpm install --frozen-lockfile`, collector Vitest tests, and all 3 workspace production builds succeed cleanly under Node 22.
- Collector and Next.js standalone frontend start within seconds, respond to `/health` and `/api/stats/*`, and stream real-time updates over WebSocket.
- All three ingestion modes (Clash WS, Surge HTTP polling, Agent push) populate dashboard metrics accurately with deduplicated Agent reports and functional multi-gateway switching.
- Dashboard UI renders cleanly in browser without console/fatal errors and displays live traffic charts and breakdowns.
