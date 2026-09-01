# ABDULKAREM AI X — OMNI PRO v2.5.1


## v2.5.1 Windows Stability + UI Overlap Hotfix

v2.5.1 is a stabilization release driven by a real Windows/Codex evaluation and Windows screenshots. It fixes CRLF-sensitive tests, dependency drift, browser-preview compatibility, Electron sandbox hardening, and the overlapping right-side UI.

UI layout changes:

- right panel is a bounded grid column with clipped overflow;
- right tabs use horizontal scrolling instead of overlapping;
- Deep Research/right-panel content scrolls inside its own row;
- the old multi-row capability grid is now a **72px horizontal capability rail**;
- capability items have stable 78px cells and horizontal scrolling;
- context/router/model labels ellipsize instead of crossing into adjacent panels;
- at narrower desktop widths the right rail is compacted, then hidden below 1050px rather than covering the chat;
- `ui-layout-stability.test.js` is part of the Windows/release regression suite.

Windows release validation:

```powershell
cd C:\ABDULKAREM-AI-X-v2.5.1
.\WINDOWS-RELEASE-CHECK.ps1
```


## v2.5 Agent Test Lab & Evaluation Harness

v2.5 adds a persistent evaluation layer that measures the system instead of trusting self-reported success. The desktop **Lab** panel and **Settings → Test Lab** expose deterministic planner-routing, safety-invariant, tool-surface and subsystem-readiness suites plus optional live Ollama model probes.

Release states:

```text
PASS  — all critical suites pass and no blocking regression is detected
WARN  — critical suites pass, but quality/latency/tool metrics need attention
BLOCK — a critical suite fails, a critical regression crosses threshold, or overall quality falls below the release floor
```

Key rules:

- Regression baselines are persistent and must be promoted explicitly from the desktop UI.
- The HTTP API can run/read evaluations but cannot promote a baseline.
- Tool call success/latency is recorded from real Agent tool execution.
- Optional live model probes call Ollama and are non-blocking by default.
- `BUILD-WINDOWS-EXE.ps1` now executes `npm run release:gate` before packaging.
- The release gate never deletes, replaces or modifies Ollama models.
- `qwen3-coder:30b` remains protected.

Local evaluation endpoints:

```text
GET  /v1/evals/status
POST /v1/evals/run
```

Build-time gate:

```powershell
npm run release:gate
```

The deterministic build gate writes `.abdulkarem-eval/release-gate.json` and exits non-zero on `BLOCK`.


Local-first Windows AI workstation built around Ollama. v2.4 adds **Parallel Isolated Coding Lanes & Conflict-Safe Merge** on top of the v2.3 verified Git worktree sandbox.

All earlier capabilities remain: Isolated Worktrees, Transactional Rollback, DAG Parallel Agents, Production Intelligence Core, Resource Governor, Runtime Recovery, Background Automation, Workflow Checkpoints, Approval-Gated Cloud Actions, Long-term Memory, Model Manager, Autonomous Coding Agent, Office Pro, Knowledge RAG, Vision, Deep Research, MCP and the OpenAI-compatible local API.

## v2.4 Parallel Isolated Coding Lanes

For an eligible complex coding task on a clean Git workspace, the host can create 2–3 detached worktrees from the same base HEAD. Each Coder lane works independently. Heavy local model calls still obey Resource Governor limits, so logical lane concurrency never overrides RAM/VRAM safety.

```text
Original Workspace (clean + unchanged)
        ↓
  ┌─────┴───────────────┐
  ↓                     ↓
Coder Lane A         Coder Lane B      [optional Lane C]
Worktree A           Worktree B
  ↓                     ↓
Tx + Build/Test      Tx + Build/Test
  ↓                     ↓
Verified Patch A     Verified Patch B
  └──────────┬──────────┘
             ↓
Region-aware Conflict Detector
       ↙             ↘
 conflict          disjoint
   ↓                  ↓
Best verified      Merge Queue
lane only          ↓
                   Integration Worktree
                   ↓
                   Build/Test
                   ↓
Original Drift Check
                   ↓
Original Transaction Snapshot
                   ↓
Combined Patch Apply
                   ↓
Post-merge Verification
             ↙             ↘
           PASS            FAIL
            ↓               ↓
          COMMIT         ROLLBACK
```

Core rules:

- Lanes never edit the original workspace while they are experimenting.
- Every lane gets its own Transaction snapshot and verification gate.
- Patch analysis uses both file identity and unified-diff hunk ranges on the base file.
- Added/deleted/renamed/binary changes on the same path are treated conservatively as structural conflicts.
- Overlapping hunks are never auto-blended.
- Disjoint same-file hunks can proceed only if the sequential `git apply --check` passes in the integration worktree.
- Conflicting alternatives use **best-verified-lane** policy rather than merging ambiguous changes.
- The integration worktree is verified before the original workspace is touched.
- The original HEAD/working tree is checked again immediately before the bundle is applied.
- The original receives a Transaction snapshot before merge and a second project verification after merge.
- Failure after merge restores the original snapshot.
- No Agent tool exposes lane merge/apply/commit/rollback. Host runtime owns those decisions.
- Dirty/non-Git workspaces fall back to v2.2 Transactional Workspace instead of silently weakening protection.

Desktop additions:

- Right-side **Lanes** panel for bundle history, selected lane count, conflict policy, combined patch size and patch preview.
- **Settings → Intelligence → Parallel Isolated Coding Lanes**.
- Configurable lane count: 2–3.
- Configurable verified bundle size limit.

Read-only API:

```text
GET /v1/lanes/status
```

## v2.3 Isolated Worktrees & Patch Merge Engine

The v2.3 single verified-worktree path remains the fallback for eligible coding work when parallel lanes are not selected. It still provides detached worktree execution, binary patch export, original drift checks, transactional merge and post-merge rollback.

## v2.2 Agent Sandbox & Transactional Workspace

Mutating top-level Agent runs can now be wrapped in a Workspace transaction. The protection happens outside the model/tool loop, so the Agent cannot silently approve its own changes.

Transaction lifecycle:

```text
Preflight
  → Workspace Snapshot
  → Agent / DAG mutation
  → Diff
  → Verification Gate
  → COMMIT or automatic ROLLBACK
```

Key rules:

- Enabled by default with `transactionalWorkspaceEnabled`.
- Snapshot is created before a mutating Agent run starts.
- `.git`, `.abdulkarem`, `node_modules`, build outputs and virtual environments are excluded from the snapshot.
- Snapshot creation is fail-closed: if configured file/size limits are exceeded, the Agent mutation does not start.
- Coding transactions run `project_check` after the Agent finishes; optional tests can be included in the Commit Gate.
- Failed/cancelled DAG execution is not committed.
- Failed Verification can trigger automatic rollback to the exact pre-run snapshot.
- A stale `ACTIVE` transaction found after an interruption is rolled back before a new mutating Agent run starts.
- Transaction history is stored per Workspace under `.abdulkarem/transactions/` and excluded from Git.
- The desktop Tx panel exposes transaction history, changed-file summary and before/after file previews.
- The Agent has no `transaction_commit` or `transaction_rollback` tool. Commit/Rollback policy stays in the host runtime.

Read-only API status:

```text
GET /v1/transactions/status
```

Desktop IPC also supports transaction status, diff, before/after preview and manual rollback of an active transaction.

## v2.1 DAG Executor & Parallel Agent Runtime

v2.1 turns the v2.0 Task Graph into an actual executor. Independent read/research/vision nodes can run concurrently, while agents that can mutate the same Workspace are serialized behind an exclusive mutation lock. Reviewer, Verifier and Final Synthesis remain dependency-gated after specialist work.

Execution rules:

- Parallelism is bounded by `intelligenceMaxParallel` (default 3).
- Research/Vision/read-only specialist nodes may overlap.
- Coder/Office/Data/Orchestrator nodes with a Workspace acquire `workspace:<path>` mutation lock.
- Two writers cannot modify the same Workspace concurrently.
- Failed dependencies cause downstream nodes to become `SKIPPED`; they are not executed optimistically.
- Cyclic graphs are rejected before execution.
- Lock waits have a timeout to prevent indefinite deadlock.
- Cancellation is cooperative: it prevents new nodes from starting; an already-running native/tool call is allowed to settle safely before the run closes.
- A failed DAG is never silently replayed, because replaying a completed mutation could duplicate changes.

The right-side **Planner** view now shows DAG run status, node count, maximum observed parallelism and duration. **Settings → Intelligence** includes Parallel DAG Execution, Max Parallel Nodes and Mutation Lock Timeout.

Local API additions:

```text
GET /v1/dag/status
```

IPC also exposes DAG status and cooperative cancellation to the desktop UI. DAG history is persisted under `userData/intelligence/dag-state.json` and included in Backup/Restore and Diagnostics.


## v2.0 Production Intelligence Core

Every top-level assistant request can pass through the Unified Planner before an Agent starts.

The planner performs:

- Task classification: general / coding / research / office / vision / data.
- Cross-signals for Cloud and Automation work.
- Complexity scoring from 1–6.
- Capability Registry lookup across Agents, Tool Groups and Skills.
- Candidate Agent scoring and primary Agent selection.
- Automatic Single-Agent vs Team strategy for complex tasks.
- Task Graph generation with explicit dependencies.
- Local Compute and Latency scores. These are heuristics, not monetary cost or exact completion-time predictions.
- Risk classification.
- Verification Gate selection.

For complex work the graph can include:

```text
Understand & Constrain
        ↓
Specialist Agent(s)
        ↓
Independent Reviewer
        ↓
Verifier / Gates
        ↓
Final Synthesis
```

## Verification Gates

The Self-Evaluation layer checks evidence after execution.

Examples:

- Coding: tool execution + successful verification evidence.
- Research: real source evidence.
- Office: file/artifact tool evidence.
- Cloud mutation: no unsupported Push/Deploy/DB completion claim and Human Approval remains mandatory.
- Complex tasks: independent verification threshold.

A failed gate downgrades the result to `PARTIAL`; it does not invent missing evidence.

## Capability Registry

Open **Settings → Intelligence** to inspect:

- registered Agents
- Tool Groups
- loaded Skills
- recent planner decisions
- Single vs Team counts
- Verification Gate failures
- Human Approval invariant

Configurable controls:

- Production Intelligence Core on/off
- Auto Team for complex tasks
- Verification Gates on/off
- maximum Agent count (1–5)

The right panel includes a **Planner** tab showing the current Task Graph, selected Agents, Compute/Latency score, risk, and gate results.

## Resource Governor integration

The Production Intelligence Core chooses *what* should run. The Resource Governor still decides whether the selected local model can safely run under current RAM/VRAM pressure and can reduce context or trigger fallback before Ollama execution.

`qwen3-coder:30b` remains protected and the application has no Model Delete action.

## Local API

New v2.0 endpoints:

```text
GET  /v1/intelligence/status
POST /v1/intelligence/plan
```

Existing endpoints remain available, including:

```text
GET /health
GET /v1/models
GET /v1/models/plan
GET /v1/resources/status
GET /v1/runtime/status
GET /v1/recovery/status
POST /v1/chat/completions
POST /v1/responses
```

OpenAI-compatible responses include an `abdulkarem.intelligence` object with the plan and Self-Evaluation when the core is enabled.

## Windows installation

Extract the ZIP to:

```text
C:\ABDULKAREM-AI-X-v2.4
```

Run:

```powershell
cd C:\ABDULKAREM-AI-X-v2.4
powershell -NoProfile -ExecutionPolicy Bypass -File .\VERIFY-MODELS.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\INSTALL-WINDOWS.ps1
.\START-WINDOWS.bat
```

Or double-click:

```text
INSTALL-AND-START.bat
```

Background runtime:

```text
START-BACKGROUND.bat
```

## Protected data/models

Do not delete these as part of an app update:

```text
C:\ABDULKAREM-AI-X-MODEL
C:\Users\Gaming\.ollama
```

The application does not issue `ollama rm`.

## Windows EXE

After dependencies and the production UI build pass on Windows:

```powershell
.\BUILD-WINDOWS-EXE.ps1
```

Expected installer name:

```text
release\ABDULKAREM-AI-X-Setup-2.4.0.exe
```

## Build verification in this package

The package includes deterministic tests for the Production Intelligence Core and Resource Governor plus source syntax/Python compile checks. Production Vite/NSIS verification still requires installed Node dependencies; the Windows installer performs `npm install` before the real production build and stops on failure.
