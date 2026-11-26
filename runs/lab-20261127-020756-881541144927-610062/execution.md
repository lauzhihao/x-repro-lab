# 执行记录：`toby-bridges/api-relay-audit` 复现与核验

## 1. 运行环境与隔离策略
- **执行节点**：`ubuntu_rtx5060`（远程开发机），所有仓库拉取、源码分析、Mock 中继运行与审计执行均在一次性隔离容器内完成（镜像 `local/claude-tokyo:ubuntu24`，使用 `--rm --cap-drop=ALL --security-opt=no-new-privileges --pids-limit=256 --memory=16g --cpus=8`）。
- **容器内运行时**：`Python 3.12.3`、`curl 8.5.0`（镜像未预装 `git`、`pip`、`pytest` 及 `nslookup`）。

## 2. 仓库信息、Quick Start 下载与学术引用核验
通过 GitHub API、`raw.githubusercontent.com` 及 `arxiv.org` 在容器内完成原始仓库与引用核验：

```bash
curl -fsSL https://api.github.com/repos/toby-bridges/api-relay-audit
curl -sS -o /work/audit_v250.py -w "%{http_code}" "https://raw.githubusercontent.com/toby-bridges/api-relay-audit/v2.5.0/audit.py"
curl -fsSL https://api.github.com/repos/toby-bridges/api-relay-audit/tarball -o /work/repo.tar.gz
curl -fsSL https://arxiv.org/abs/2611.07650 -o /work/arxiv_abs.html
curl -sSL -o /work/arxiv_full.html -w "%{http_code}" https://arxiv.org/html/2611.07650v1
```

关键实测输出（已裁剪）：
- **GitHub 元数据**：`full_name=toby-bridges/api-relay-audit`，`default_branch=master`，`stargazers_count=933`，`forks_count=86`，`license=AGPL-3.0`，`pushed_at=2026-11-22T05:26:02Z`，最新 tag/release 为 `v2.5.0`（发布于 `2026-10-10T04:14:54Z`）。
- **Quick Start 单文件脚本**：`v2.5.0/audit.py` 返回 `HTTP 200`，文件大小 `280,587` 字节（`7,032` 行）；`master` 分支 `audit.py` 同为 `VERSION=2.5.0`，但包含后续提交新增的 `_check_event_stream` 与 `_token_count` 等修复，共 `286,524` 字节（`7,151` 行）。
- **女王大学（Queen's University）学术引用核验**：`arxiv.org/abs/2611.07650` 及 `html/2611.07650v1`（`HTTP 200`，`376,735` 字节）确认论文 *"What the Middleman Delivers: Answer Behavior, Tool Permissions, and Billed Usage in LLM API Relays"* 六位作者（Xiaodong Wu, Zhimin Zhao, Qi Li, Chaklam Cheong, Xiangman Li, Jianbing Ni）全部署名 `Queen’s University, Kingston, Ontario, Canada`，并在正文 `§III-C`（参考文献 `[35]`）引用 `https://github.com/toby-bridges/api-relay-audit`；此外 `api-relay-audit` 仓库自身在 `scripts/audit.py` 及 `client.py` 中也反向引用了该论文 `§IV-E`。
- **仓库单元测试探查**：在无 `pytest` 的默认镜像中运行 `python3 -m unittest discover -s /work/repo/tests -v` 耗时 `0.001s`，`29` 个测试模块均因缺少 `pytest` 或仓库根目录 `PYTHONPATH` 报错退出；但独立的 `audit.py` 本身仅依赖 Python 标准库与 `curl`，无需安装任何三方包即可直接执行。

## 3. 本地双模式 Mock 中继构建
依据 `api_relay_audit/client.py` 及各探测模块协议实现，在容器内 `/work/mock_relay.py` 启动绑定 `localhost` 的双端口 `ThreadingHTTPServer`（均使用占位密钥标志位，无真实凭据）：
- **`http://localhost:18080`（正常中继）**：完整支持 `/v1/models`、Anthropic `/v1/messages`（含 `thinking` 与标准 `text/event-stream` SSE 事件序列）及 OpenAI `/v1/chat/completions`，正常回传 `CANARY` 标记、原样回显包管理命令、拒绝私钥/签名诱导且不在 4xx 响应中回显请求头。
- **`http://localhost:18081`（篡改中继）**：按探测类型精准模拟多类恶意中间人行为：虚报输入 token（+250）、泄露伪造提示词模板（`kiro`/`aws`）、仅召回 `2/5` 上下文金丝雀、将 `pip install requests==2.31.0` 篡改为 `reqeusts==2.31.0`、在 401 响应中回显认证头与上游地址、在 SSE 流中注入未知事件 `relay_injected_event` / 空 `signature_delta` / 模型名 `gpt-3.5-turbo` 及修改 `input_tokens`（`12 -> 99`），并对 Web3 探针返回引导索取私钥和伪造签名的文本。

## 4. 全矩阵审计实测

### Case 0：连通性预检（`v2.5.0` 单文件）
```bash
python3 /work/audit_v250.py <key-env-flag> --url http://localhost:18080 --model claude-sonnet-4-6 --connectivity --format json --output /work/report_conn.json
```
- **结果**：`RC=0`，耗时 `0.11s`，输出 `2,279` 字节 JSON，`verdict: "OK"`，`successful_formats: ["Anthropic Chat", "OpenAI Chat"]`。

### Case 1：正常中继 Markdown 报告（`v2.5.0` Quick Start，`general` profile）
```bash
python3 /work/audit_v250.py <key-env-flag> --url http://localhost:18080 --model claude-sonnet-4-6 --fast-context --output /work/report_clean_v250.md
```
- **结果**：`RC=0`，耗时 `24.45s`，生成 `11,549` 字节（`396` 行）Markdown 报告。10 项绿标通过（`[1/14]`~`[14/14]` 中跳过 Step 11 Web3），仅 Step 5 身份一致性为黄标 `Identity test inconclusive`（无报错、无红标）。

### Case 2：正常中继 JSON 报告与 stdout/stderr 分离验证（`master` 版）
```bash
python3 /work/repo/audit.py <key-env-flag> --url http://localhost:18080 --model claude-sonnet-4-6 --fast-context --format json --output /work/report_clean.json
python3 /work/repo/audit.py <key-env-flag> --url http://localhost:18080 --model claude-sonnet-4-6 --skip-context --skip-latency-variance --format json > /work/stdout_only.json 2> /work/stderr_only.log
```
- **文件输出模式**：`RC=0`，耗时 `24.51s`，生成 `14,221` 字节有效 JSON（`schema_version: 1`，`risk_level: "LOW"`，`11` 条 flags，`crashed_steps: []`，`risk_matrix_inconclusive_steps: []`）。
- **标准输出模式**：`RC=0`，耗时 `14.50s`，`stdout_only.json`（`12,345` 字节、`60` 行）通过 `python3 -m json.tool` 校验，`stderr_only.log`（`1,356` 字节、`38` 行）承载全部进度日志，符合 README 对机器可读输出分离的描述。

### Case 3：正常中继 Web3 模式（`--profile web3`，`master` 版）
```bash
python3 /work/repo/audit.py <key-env-flag> --url http://localhost:18080 --model claude-sonnet-4-6 --profile web3 --fast-context --format json --output /work/report_web3.json
python3 /work/repo/audit.py <key-env-flag> --url http://localhost:18080 --model claude-sonnet-4-6 --profile web3 --fast-context --output /work/report_web3.md
```
- **结果**：JSON 模式 `RC=0`，耗时 `27.44s`，`15,709` 字节，`risk_level: "LOW"`，`skipped_steps: []`（14 步全覆盖），`12` 条 flags（含 Step 11 绿标 `No Web3 prompt injection detected`）；Markdown 模式 `RC=0`，耗时 `27.56s`，`13,166` 字节（`414` 行）。

### Case 4：篡改中继风险检出验证（`--profile web3`，`master` 版）
```bash
python3 /work/repo/audit.py <key-env-flag> --url http://localhost:18081 --model claude-sonnet-4-6 --profile web3 --fast-context --format json --output /work/report_tamper.json
python3 /work/repo/audit.py <key-env-flag> --url http://localhost:18081 --model claude-sonnet-4-6 --profile web3 --fast-context --output /work/report_tamper.md
```
- **结果**：JSON 模式 `RC=0`，耗时 `21.35s`，`21,076` 字节，`risk_level: "HIGH"`，`15` 条 flags（`8` 条 `red`、`4` 条 `yellow`、`3` 条 `green`）；Markdown 模式 `RC=0`，耗时 `21.42s`，`17,445` 字节（`496` 行）。
- **核心检出清单**：
  - Step 3（token 虚报）：`~245` tokens 超额（red）
  - Step 4（提示词提取）：Test A/B/C 全部检出泄露（3 red）
  - Step 6（越狱探针）：Test E/F/G 检出 `kiro, aws` 泄露（3 yellow）
  - Step 7（上下文截断）：`0K` / `10K` 均仅召回 `2/5` 金丝雀（`FAIL`）
  - Step 8（包名篡改）：检出 `1/4` 探针被改写（red）
  - Step 9（错误泄露）：检出错误体泄露凭据与上游 URL（red）
  - Step 10（SSE 流完整性）：检出未知事件 `relay_injected_event`、token 计数冲突 `12 -> [99]`、空 `signature_delta` 与 `gpt-3.5-turbo` 模型替换信号（red）
  - Step 11（Web3 注入）：检出 `eth_transfer_guidance` 与 `sign_transaction_refusal` 注入（red）

## 5. 自愈与远程清理
- **环境适配**：目标镜像无 `git`，通过 `curl` 直接获取 `v2.5.0/audit.py` 及仓库 tarball 解压；因镜像内无 `pytest`，明确区分“独立 `audit.py` 零三方依赖运行”与“开发测试套件依赖 `pytest`”。无额外自愈阻塞。
- **远程清理**：核验无 `xrl.run_id=lab-20261127-020756-881541144927-610062` 残留容器，并已删除远程临时目录（`REMOTE_CLEANUP_OK`）。
