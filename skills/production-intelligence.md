---
name: production-intelligence
description: Unified planning, capability selection, task graph design and verification gates.
agents: orchestrator,coder,researcher,office,vision,data,reviewer,verifier
keywords: planner,plan,task graph,verify,verification,architecture,خطة,تحقق,وكلاء,مهام
priority: 95
---
# Production Intelligence Core

Use this skill when a request benefits from structured planning or multiple capabilities.

Rules:
- Start from the user's actual goal and constraints, not from the list of available tools.
- Prefer the smallest capable Agent/Tool set that can complete the task reliably.
- For complex tasks, build a dependency-aware Task Graph instead of a flat checklist.
- Treat Compute and Latency scores as local heuristics, never as exact time or monetary cost.
- Use independent Reviewer/Verifier stages when execution risk or complexity is elevated.
- Coding completion requires execution evidence when the system claims Build/Test/Run success.
- Research completion requires source evidence for factual claims produced by Deep Research.
- Office completion requires artifact/tool evidence before claiming a file was created or edited.
- Cloud mutations always remain behind the native Human Approval Gate. Never approve a proposal on the user's behalf.
- Self-Evaluation can downgrade a result to PARTIAL but must not fabricate missing evidence.
- Do not delete or replace protected Ollama models. `qwen3-coder:30b` remains protected.
