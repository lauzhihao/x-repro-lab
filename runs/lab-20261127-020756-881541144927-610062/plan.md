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
