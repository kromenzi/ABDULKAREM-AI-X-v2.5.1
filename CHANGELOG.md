# Changelog

## v2.5.1 — Windows Stability & UI Overlap Hotfix

- Normalized CRLF/LF-sensitive tests for real Windows execution.
- Replaced `latest` direct dependency specs with exact pins and pinned TypeScript to `5.9.2`.
- Windows install/release flow bootstraps `package-lock.json` when missing, then uses `npm ci`.
- Enabled Electron main-window `sandbox:true` while preserving `contextIsolation:true` and `nodeIntegration:false`.
- Added a non-Electron compatibility screen instead of crashing on missing `window.abdx`.
- Lazy-loads Monaco to reduce initial UI payload pressure.
- Added screenshot-driven Windows layout guards for the right rail, research panel, context strip and composer.
- Replaced the multi-row capability icon grid with a fixed-height horizontal capability rail to stop overlap with chat/composer content.
- Right-panel tabs now scroll horizontally instead of colliding with each other.
- Router/model/context labels now clip with ellipsis instead of painting into adjacent columns.
- Right content and capability rail are isolated into fixed grid rows so research cards cannot cover the icon rail.
- Added `ui-layout-stability.test.js` and wired it into `npm run check`, `check:windows`, and the Release Gate.
- Preserved protected `qwen3-coder:30b` and all human-approval boundaries.

## v2.5.0 — Agent Test Lab & Evaluation Harness

- Added persistent Agent Test Lab and Evaluation Harness.
- Added deterministic Planner Routing benchmarks.
- Added Safety Invariant and Tool Surface critical suites.
- Added subsystem-readiness evaluation.
- Added optional live Ollama model probes with latency/compliance results.
- Added persistent per-tool success rate and average latency metrics from real Agent tool calls.
- Added Regression Baseline comparison with configurable score threshold.
- Added Release Gate states: `PASS`, `WARN`, `BLOCK`.
- Added UI-only baseline promotion; HTTP API cannot promote a baseline.
- Added `GET /v1/evals/status` and `POST /v1/evals/run`.
- Added Lab right-panel and Settings → Test Lab controls.
- Added evaluation state to Diagnostics and Backup/Restore.
- Added `npm run release:gate`; Windows EXE builder now blocks packaging when the deterministic release gate returns `BLOCK`.
- Added `evaluation-engineering` skill.
- Preserved `qwen3-coder:30b` protection and all cloud human-approval invariants.

## v2.4.0 — Parallel Isolated Coding Lanes & Conflict-Safe Merge

- Added 2–3 independent Git worktree coding lanes for eligible complex coding tasks.
- Added region-aware unified-diff conflict detection.
- Added conservative structural conflict handling for add/delete/rename/binary changes.
- Added best-verified-lane fallback when lane patches overlap.
- Added integration worktree merge queue for disjoint patches.
- Added pre-original integration Build/Lint/Typecheck/Test verification.
- Added original drift guard before bundle application.
- Added original Transaction snapshot and post-merge rollback gate.
- Added Lanes UI panel, bundle patch preview and `/v1/lanes/status`.
- Added `parallel-coding-lanes` skill.
- Worktree Manager now tracks multiple active worktrees per original workspace.
- `qwen3-coder:30b` remains protected; no model-delete path added.

## v2.3.0 — Isolated Worktrees & Patch Merge Engine

- Added host-controlled detached Git worktree sandboxes for eligible coding mutations.
- Added clean-Git eligibility gate with automatic Transactional Workspace fallback for dirty/non-Git projects.
- Added runtime dependency links (`node_modules`, `.venv`, `venv`) into the sandbox when available; links are removed before patch export.
- Added binary-capable verified patch export covering added, modified and deleted files.
- Added sandbox HEAD rewrite guard and original HEAD/working-tree drift guard.
- Added pre-merge Transaction snapshot of the original workspace.
- Added post-merge project verification with automatic original-workspace rollback on failure.
- Added stale worktree crash recovery that aborts rather than auto-merges.
- Added Sandbox panel, patch preview, settings controls and `/v1/worktrees/status`.
- Added `isolated-worktree` Skill and regression tests.
- Preserved mandatory human approval for cloud mutations and protected `qwen3-coder:30b`.

## v2.2.0 — Agent Sandbox & Transactional Workspace

- Added host-controlled Workspace Transaction Manager.
- Added pre-mutation snapshots under `.abdulkarem/transactions`.
- Added changed-file Diff summary and before/after preview.
- Added Verification-gated Commit for mutating Agent runs.
- Added automatic Rollback when coding/project verification fails.
- Failed/cancelled DAG execution cannot pass the transaction gate.
- Added stale `ACTIVE` transaction recovery before a new Agent mutation starts.
- Added fail-closed snapshot size/file limits.
- Added Tx desktop panel and Transaction settings.
- Added read-only `/v1/transactions/status` API metadata.
- OpenAI-compatible responses can expose transaction outcome metadata.
- Agent has no transaction Commit/Rollback tool.
- Preserved Cloud Human Approval and `qwen3-coder:30b` protection.

## v2.1.0 — DAG Executor & Parallel Agent Runtime

- Added persistent DAG Executor state and execution telemetry.
- Converted v2.0 Task Graphs into real dependency-gated execution.
- Added bounded parallel execution for independent specialist nodes.
- Added exclusive Workspace mutation locks for mutating agents.
- Added lock timeouts and graph cycle validation for deadlock protection.
- Added dependency failure propagation (`SKIPPED`) instead of unsafe downstream execution.
- Added cooperative run cancellation; new nodes stop scheduling after cancellation.
- Added DAG run metadata to Agent results and the Planner panel.
- Added `/v1/dag/status`, IPC DAG status/cancel, Diagnostics and Backup/Restore coverage.
- Added Intelligence settings for Parallel DAG, maximum parallel nodes and mutation-lock timeout.
- Added `dag-parallel-runtime` Skill and deterministic executor tests.
- Preserved Human Approval for cloud mutations and `qwen3-coder:30b` protection.

## v2.0.0 — Production Intelligence Core

- Added a central Unified Planner before top-level Agent execution.
- Added a Capability Registry spanning Agents, Tool Groups and Skills.
- Added task classification, complexity scoring and Agent-fit ranking.
- Added automatic Single-Agent vs Team strategy for complex work.
- Added dependency-aware Task Graph generation.
- Added local Compute/Latency heuristic scoring and risk classification.
- Added Self-Evaluation and Verification Gates for coding, research, Office, Cloud and complex tasks.
- Added Planner metadata to OpenAI-compatible responses.
- Added `/v1/intelligence/status` and `/v1/intelligence/plan`.
- Added a Planner right-panel view and Settings → Intelligence controls.
- Added persistent planner history to Backup/Restore and Diagnostics.
- Added `production-intelligence` Skill.
- Preserved Human Approval for Cloud mutations and `qwen3-coder:30b` protection.

## v1.9.0 — Resource Governor & Intelligent Performance Engine

- Added RAM/CPU/GPU resource sampling and Ollama running-model observations.
- Added dynamic `num_ctx` selection by task/profile/pressure.
- Added RAM reserve and cold-load OOM preflight.
- Added exclusive heavy-model queue and configurable normal concurrency.
- Added adaptive five-minute context cooldown after OOM-like failures.
- Added preflight fallback integration, recent decision history, Performance settings UI and `/v1/resources/status`.
- Preserved all v1.8 recovery/background/automation/workflow/security features and protected `qwen3-coder:30b`.

## v1.8.0 — Runtime Recovery, Crash Guard & Session Restore

- Added persistent Recovery Manager heartbeat and unclean-shutdown detection.
- Added bounded main-process fatal relaunch with crash-loop SAFE MODE.
- Added Renderer Watchdog with maximum 3 automatic UI restarts per 5-minute window.
- Added crash reports under userData with common credential-pattern redaction.
- Added Python worker failure isolation/reporting.
- Added UI Session Restore for Workspace, active mode/tab, model, code file and window bounds.
- Added exact Automation recovery: an interrupted run resumes its existing Workflow/checkpoint instead of creating a duplicate Workflow.
- Preserved completed Workflow checkpoints and run count across restart recovery.
- Added Recovery Guard status to the System Tray and Control Center.
- Added `GET /v1/recovery/status`.
- Added `runtime-recovery` Skill.
- Backup/Restore now includes the UI recovery session file, but not crash-loop state.
- SAFE MODE pauses the Scheduler until explicit user resume.
- Cloud Approval Gate remains mandatory after recovery/restart.
- `qwen3-coder:30b` remains protected; no model-delete route was added.

## v1.6.0 — Automation & Background Task Engine

- Added persistent Automation Scheduler.
- Added Manual / Once / Interval / Daily schedules.
- Added background Queue with bounded concurrency.
- Added execution history and overlap protection.
- Added retry attempts with Backoff.
- Added one-run catch-up after application restart.
- Each automation run creates a fresh persistent Workflow.
- Cloud mutations remain blocked at human `WAITING_APPROVAL`.
- Added Automation workspace, IPC and local API endpoints.
- Added `automation-orchestrator` Skill and guarded agent automation tools.
- Added automation data to Backup/Restore and Diagnostics.
- Preserved `qwen3-coder:30b` protection.

## v1.5.0 — Workflow Engine & Checkpoints

- Added persistent Workflow Manager with atomic JSON state persistence.
- Added READY/RUNNING/WAITING_APPROVAL/PAUSED/COMPLETED/FAILED/CANCELLED workflow states.
- Added per-step checkpoints and exact-cursor resume/retry.
- Added restart recovery: interrupted workflows reopen PAUSED rather than pretending success.
- Added four built-in workflow templates: coding repair, code release preview, quality gate and research report.
- Linked Integration Hub proposals to Workflow steps; successful native approval resumes the next step.
- Added desktop Workflow workspace UI with progress, step output, checkpoints and controls.
- Added local Workflow API endpoints.
- Added workflow data to Diagnostics and Backup/Restore.
- Added workflow-orchestrator Skill.
- Preserved v1.4 human approval boundary and protected Ollama model policy.

## 1.4.0 — Approval-Gated Cloud Actions

- Added two-phase Proposal → Human Approval flow.
- Added GitHub current-branch Push proposal/execution.
- Added GitHub PR creation proposal/execution.
- Added Vercel Preview and Production deployment proposals.
- Added Supabase DB Push proposal with dry-run evidence.
- Added expiring, single-use approval tickets.
- Added Workspace fingerprint validation before execution.
- Added native Electron confirmation dialog before every approved cloud mutation.
- Approval/rejection blocked from HTTP API; UI-only human boundary.
- Agent may propose but has no approval tool.
- Added approval queue and risk/effect/preflight UI.
- Extended Integration Audit Log for proposal, approval, invalidation and execution stages.
- Kept fixed command allow-list, credential redaction and official CLI credential storage.
- No Delete / Reset / Force Push actions added.
- Preserved all v1.3 and earlier capabilities.