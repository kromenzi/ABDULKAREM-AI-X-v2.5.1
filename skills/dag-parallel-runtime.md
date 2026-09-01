---
name: dag-parallel-runtime
description: Safe dependency-aware parallel execution with workspace mutation locks and verification gates.
agents: orchestrator,coder,researcher,office,vision,data,reviewer,verifier
keywords: dag,parallel,dependencies,lock,concurrency,graph,توازي,اعتماديات,قفل,مهام
priority: 96
---
# DAG Parallel Runtime

Use this skill for multi-agent plans with independent work.

Rules:
- Respect graph dependencies before starting a node.
- Read/research/vision work may run concurrently when independent.
- Any agent that may mutate the same Workspace must acquire the exclusive Workspace mutation lock.
- Never bypass the lock to reduce latency.
- Do not start downstream verification until all required specialist dependencies completed successfully.
- If a dependency fails, skip dependent nodes rather than fabricating partial execution.
- Cancellation is cooperative; stop scheduling new nodes and let an already-running native operation settle safely.
- Never automatically replay a failed mutation node.
- Human Approval remains mandatory for GitHub/Vercel/Supabase mutations.
- Do not delete or replace protected Ollama models.
