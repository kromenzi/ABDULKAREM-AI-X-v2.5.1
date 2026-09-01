# ABDULKAREM AI X v2.5 — API Quickstart

Default local API base:

```text
http://127.0.0.1:8787/v1
```

Use the API key shown in the in-app API panel.

## Health

```http
GET /health
```


## v2.5 Agent Test Lab

Read the persistent evaluation state, current baseline, tool metrics and latest Release Gate:

```http
GET /v1/evals/status
Authorization: Bearer akx_...
```

Run the deterministic release suite without loading models:

```http
POST /v1/evals/run
Authorization: Bearer akx_...
Content-Type: application/json

{
  "liveModels": false
}
```

Optional local Ollama probes:

```json
{
  "liveModels": true,
  "modelNames": ["abdulkarem-general-sa:v2", "qwen3-coder:30b"]
}
```

Baseline promotion is intentionally **desktop UI only**. There is no HTTP endpoint that can silently change the regression baseline.

## Production Intelligence Core

```http
GET /v1/intelligence/status
Authorization: Bearer akx_...
```

Returns the Capability Registry, planner policy, counters and recent plans.

Preview a plan without executing the assistant request:

```http
POST /v1/intelligence/plan
Authorization: Bearer akx_...
Content-Type: application/json

{
  "mode": "code",
  "workspace": "C:\\Projects\\my-app",
  "messages": [
    {"role":"user","content":"افحص المشروع وأصلح build ثم تحقق"}
  ]
}
```

The response includes the primary Agent, Team/Single strategy, Task Graph, Verification Gates, risk and local Compute/Latency heuristic scores.

## Resource Governor

```http
GET /v1/resources/status
Authorization: Bearer akx_...
```

The Intelligence Core chooses the plan; Resource Governor performs runtime model admission, context sizing and OOM protection.

## OpenAI-compatible chat

```http
POST /v1/chat/completions
Authorization: Bearer akx_...
Content-Type: application/json

{
  "model": "abdulkarem-ai",
  "messages": [
    {"role":"user","content":"افحص المشروع وأصلح المشكلة"}
  ]
}
```

When enabled, the response includes:

```text
abdulkarem.intelligence.plan
abdulkarem.intelligence.evaluation
```

Cloud approval remains UI-only. The local API cannot approve GitHub/Vercel/Supabase mutations.


## v2.4 Transactional Workspace

Read the host-level transaction engine status:

```http
GET /v1/transactions/status
Authorization: Bearer akx_...
```

Mutating top-level Agent requests can create a Workspace transaction automatically. OpenAI-compatible responses may include:

```text
abdulkarem.transaction.status
abdulkarem.transaction.diff
abdulkarem.transaction.verification
```

Commit/Rollback authority is intentionally **not** exposed as an Agent tool. Desktop IPC provides diff/preview/active rollback controls; the HTTP API remains read-only for transaction administration.

## v2.1 DAG Executor

Inspect current/previous DAG execution state:

```http
GET /v1/dag/status
Authorization: Bearer <local-api-key>
```

Top-level chat responses expose DAG telemetry through `abdulkarem.agents.dag` when Team execution used the DAG runtime. The local HTTP API intentionally does not expose a hard-kill endpoint for active tool mutations; desktop cancellation is cooperative and prevents new DAG nodes from starting.


## v2.4 Worktree Sandbox status

```http
GET /v1/worktrees/status
Authorization: Bearer akx_...
```

This endpoint is read-only. Patch merge remains a host-controlled operation and is not exposed as an Agent or HTTP approval endpoint.

## v2.4 Parallel Coding Lanes status

Read-only status endpoint:

```http
GET /v1/lanes/status
Authorization: Bearer akx_...
```

It reports recent lane bundles, selected lane ids, conflict analysis, bundle patch metadata and commit/rollback state. Applying or approving a lane merge is intentionally not exposed through the HTTP API.

Relevant desktop IPC operations:

```text
lanes:status
lanes:preview
```

Complex pure-coding plans can become lane-eligible when the workspace is a clean Git worktree and Production Intelligence Core selects Team mode. The Resource Governor may serialize heavy model inference even when the isolated worktree tasks are logically parallel.
