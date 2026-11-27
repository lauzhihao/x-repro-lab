# 开源工具 API Relay Audit 获学术引用

- **全局追踪 ID (`run_id`)**: `lab-20261127-020756-881541144927-610062`
- **当前终态**: `completed`（实测结论: `verified_with_numbers`）
- **原帖链接**: https://x.com/li9292/status/2124416881541144927
- **原帖作者**: [@li9292](https://x.com/li9292)
- **原帖标题/主题**: 开源工具 API Relay Audit 获学术引用
- **执行节点**: `ubuntu_rtx5060`
- **SLA 计时**: 决定引用 `2026-11-26T18:07:26.554Z` -> 结束 `2026-11-26T18:16:16.676Z`（耗时 **8.8 分钟** / 上限 120 分钟）

## 一、JEV 立项判定（引用理由）

- **裁决模型**: `jev-1.14.0` | **通过门槛**: 正向题 `>= 0.7`，阻断题 `<= 0.3`（中间区 `0.30~0.70` 一律作罢）
- **最终结论**: `GO`（`all_9_slots_passed`）
- **识别到的实测对象**: `toby-bridges/api-relay-audit`（github_repo）
- **提炼验证目标**: Clone toby-bridges/api-relay-audit, run audit.py against a local mock OpenAI/Claude-compatible relay endpoint, and verify it completes and outputs a valid Markdown or JSON report.

| 编号 | 角色 | 判断题（中文摘要） | 选项判定标准 | 得分 | 结果 |
|:-----|:-----|:-------------------|:-------------|-----:|:-----|
| `has_concrete_runnable_target` | 正向立项 | 是否存在具体可运行/可验证对象 | >= 0.7 | 0.99 | PASS (YES) |
| `has_falsifiable_claim` | 正向立项 | 是否包含可观测/可证伪结论或步骤 | >= 0.7 | 0.97 | PASS (YES) |
| `has_engineering_value` | 正向立项 | 实测结果是否具备工程交流价值 | >= 0.7 | 0.89 | PASS (YES) |
| `requires_paid_or_new_account` | 风险/成本阻断 | 是否需要付费、绑卡、新注册或缺失凭据 | <= 0.3 | 0.20 | PASS (NO) |
| `requires_unavailable_hardware_or_os` | 风险/成本阻断 | 是否超出本机与远程节点硬件/系统能力 | <= 0.3 | 0.04 | PASS (NO) |
| `exceeds_120min_or_needs_offline_action` | 风险/成本阻断 | 是否超过 2 小时时限或需要线下物理动作 | <= 0.3 | 0.04 | PASS (NO) |
| `endangers_hardware_or_host_stability` | 风险/成本阻断 | 是否可能危及硬件或宿主机系统稳定性 | <= 0.3 | 0.04 | PASS (NO) |
| `triggers_software_risk_control_or_tos_violation` | 风险/成本阻断 | 是否涉及平台风控对抗或违反服务条款 | <= 0.3 | 0.04 | PASS (NO) |
| `violates_ethics_business_or_law` | 风险/成本阻断 | 是否违背人类伦理、商业道德或法律法规 | <= 0.3 | 0.08 | PASS (NO) |

## 二、执行计划

# Verification Plan: `toby-bridges/api-relay-audit`

## Target & Claim
- **Repository**: `toby-bridges/api-relay-audit` (Python stdlib + `curl` local security audit script for AI API relays / LLM proxies).
- **Claimed Workflow**:
  1. Download standalone `audit.py` from `toby-bridges/api-relay-audit` (README Quick Start references `v2.5.0`).
  2. Run `python audit.py` with `--key` (or `--key-env`) and `--url` pointing to an OpenAI/Claude-compatible API relay.
  3. Generate local Markdown or JSON (`--format json`) audit reports covering prompt injection, model substitution signals, context truncation, SSE stream anomalies, error-response leakage, and Web3 wallet risks (`--profile web3`).
- **Academic Citation Claim**: Post states the open-source project was cited by Queen's University.

## Execution Environment
- **Node**: `ubuntu_rtx5060` (`ubuntu-rtx5060`)
- **Container Image**: `local/claude-tokyo:ubuntu24` (`Python 3.12.3`, `curl 8.5.0`)
- **Isolation Flags**: `--rm --label xrl.run_id=lab-20261127-020756-881541144927-610062 --name xrl-lab-20261127-020756-881541144927-610062 --cap-drop=ALL --security-opt=no-new-privileges --pids-limit=256 --memory=16g --cpus=8 -v /tmp/xrl-lab-20261127-020756-881541144927-610062:/work -w /work`

## Verification Steps & Expected Metrics
1. **Repository & Citation Inspection**:
   - Query GitHub API metadata (stars, default branch, license, latest release/tag), test README Quick Start download (`v2.5.0`), extract full tarball, check `--help`, and run repository unit tests if present.
   - Verify the Queen's University citation by fetching `https://arxiv.org/abs/2611.07650` (and HTML if available) inside the container.
2. **Protocol Inspection & Dual-Mode Mock Relay (`localhost`)**:
   - Inspect `audit.py` probe endpoints, payloads, SSE parsing, and detector logic.
   - Build a local `ThreadingHTTPServer` mock relay on `localhost` with two ports:
     - Clean relay (`http://localhost:18080`): compliant OpenAI/Claude-compatible responses and SSE streams.
     - Tampering relay (`http://localhost:18081`): intentionally injects error-response credential leakage, command/response tampering, and/or Web3 anomalies.
3. **End-to-End CLI Matrix**:
   - Clean relay: default profile Markdown report, `--format json` with `<key-env-flag>` (both `--output` file and stdout + stderr separation), and `--profile web3` JSON + Markdown reports.
   - Tampering relay: `--profile web3` JSON + Markdown reports to verify detector triggering and risk elevation.
4. **Expected Verifiable Metrics**:
   - Download HTTP status / exit codes, unit test pass/total counts and elapsed time, CLI exit codes, per-run wall-clock runtime, report sizes/line counts, probe breakdown (`pass` / `inconclusive` / findings), and risk ratings (`LOW` / `MEDIUM` / `HIGH`).

## 三、执行过程与自愈记录

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

- 完整全程回放日志: [events.jsonl](https://github.com/lauzhihao/x-repro-lab/blob/main/runs/lab-20261127-020756-881541144927-610062/events.jsonl)

## 四、执行结果与实测数据

- **是否可成功部署运行**: `是（已跑通）`
- **结果摘要**: 在隔离 Docker 容器中完整复现了 toby-bridges/api-relay-audit（933 Stars，AGPL-3.0）的独立脚本下载与本地 Mock 中继审计流程，并核实 arXiv:2611.07650（六位作者均来自加拿大女王大学）在 §III-C 确实引用了该项目。基于 Python 标准库与 curl（零三方依赖），v2.5.0 单文件版与 master 版均可在 21–28 秒内完成 14 步探针并输出合规的 Markdown 与 JSON 报告，面对恶意模拟中继时能够准确捕获包名篡改、错误泄露、SSE 异常及 Web3 私钥诱导并将风险等级由 LOW 升至 HIGH。

| 指标项 | 原帖声称 | 我方实测 | 备注 |
|:-------|:---------|:---------|:-----|
| Quick Start v2.5.0 下载与体积 | curl 下载 v2.5.0 单文件 audit.py 并可直接运行 | HTTP 200，280,587 字节（7,032 行）；master 同版本标签为 286,524 字节（7,151 行） | 无需安装 requirements.txt 中的 httpx 即可独立运行 |
| 学术引用核验 (arXiv:2611.07650) | 被加拿大女王大学 Queen's University 引用 | 论文 6 位作者均署名 Queen's University，HTML 正文 §III-C 参考文献 [35] 引用本仓库 URL | 仓库自身代码也反向引用该论文 §IV-E |
| 连通性预检 (--connectivity --format json) | 快速检测 Anthropic/OpenAI 接口连通性 | 退出码 0，耗时 0.11s，JSON 输出 2,279 字节，Anthropic 与 OpenAI 均返回 OK | v2.5.0 单文件对正常模拟中继测试 |
| 正常模拟中继审计 (general / web3) | 生成 Markdown 与 JSON 报告并支持 --profile web3 | v2.5.0 Markdown 耗时 24.45s（11,549 字节/396 行）；master JSON 耗时 24.51s（14,221 字节，risk_level=LOW，11 flags）；web3 JSON 耗时 27.44s（15,709 字节，14 步全覆盖，risk_level=LOW） | 使用 --fast-context 模式；仅 Step 5 身份测试在无特定预设话术下为 inconclusive |
| JSON stdout/stderr 分离 | 不指定 --output 时 stdout 仅输出单个 JSON，进度走 stderr | 耗时 14.50s，stdout 为 60 行 / 12,345 字节有效 JSON，stderr 为 38 行 / 1,356 字节进度输出 | 通过 python3 -m json.tool 校验 |
| 篡改模拟中继风险检出 (--profile web3) | 检测提示词注入、模型替换信号、上下文截断、SSE 异常、错误泄露及 Web3 风险 | 耗时 21.35s（JSON 21,076 字节）/ 21.42s（MD 17,445 字节），risk_level=HIGH，共 15 条 flags（8 red / 4 yellow / 3 green） | 成功触发包名篡改(1/4)、错误回显、SSE 未知事件与空签名、token 虚报(~245)、提示词泄露、0K/10K 截断及 Web3 注入 |

### 自愈修复记录
- 容器镜像 local/claude-tokyo:ubuntu24 未安装 git 与 pytest: 改用 curl 下载 GitHub tarball 并解压以审查完整源码，并围绕独立运行的 audit.py 构建本地双模式 Mock 中继完成全量端到端验证 -> 成功完成源码审查与全部 6 组端到端审计验证

### 上手提醒 / 踩坑点
- tag v2.5.0 的 audit.py（7,032 行 / 280,587 字节）与 master 分支（7,151 行 / 286,524 字节）虽版本号同为 2.5.0，但 master 额外包含 _check_event_stream 等修复。
- 独立 audit.py 仅需 Python 标准库和 curl，但仓库自带的 tests/ 目录包含 29 个基于 pytest 的测试模块（最小容器中未预装 pytest 会全部导入报错）。
- 最小化容器缺少 nslookup 时 Step 1 的 CNAME 检查会输出缺失提示；在毫秒级响应的 localhost 环境下，Step 13 延迟方差探针因微秒级波动易判为 variable（CV=0.26~0.34）。

### 拟引用推文草稿（一期仅存档，不自动发送）
> 用中转 API 最怕遇到暗中换模型或截断上下文，这个开源工具专门拿来给中转站做体检。单文件零三方依赖，20 多秒跑完 14 步探针直接出报告，连 SSE 异常和 Web3 私钥诱导都能抓出来，建议直接拉 master 分支体验。
> 
> 实测记录：https://github.com/lauzhihao/x-repro-lab/issues/1
