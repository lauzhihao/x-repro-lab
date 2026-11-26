# x-repro-lab

JEV-gated reproducible verification ledger for technical X posts.

## Workflow
1. **Intake & Fact Extraction**: Fetch post context (and GitHub README metadata via `gh` when applicable), run deterministic safety/risk-control filtering, and distill a neutral English fact card.
2. **JEV Fail-Closed Gate (`jev-1.14.0`)**: Evaluate 9 atomic `noul` questions covering target runnability, falsifiability, engineering value, hardware/time feasibility (120-minute SLA), hardware safety, software risk-control/ToS compliance, and legal/ethical boundaries.
3. **Sandboxed Execution**: Dispatch `GO` tickets via `sagy` (`gemini-pro-orchestrator-neon`) with bounded self-healing, global `run_id` traceability, live NDJSON replay logs (`events.jsonl`), and deterministic zero-residue teardown on completion, timeout, or manual cancel.
4. **Privacy Guard & Archival**: Redact IPs, hostnames, paths, secret tokens, and sensitive env var names/values prior to committing under `runs/<run_id>/` and creating a GitHub Issue.

## Control CLI
```bash
node src/lab_ctl.mjs status
node src/lab_ctl.mjs list
node src/lab_ctl.mjs evaluate --url <x_url>
node src/lab_ctl.mjs run --url <x_url>
node src/lab_ctl.mjs cancel <run_id>
node src/lab_ctl.mjs replay <run_id>
```
