---
id: isolated-worktree
name: Isolated Worktree & Verified Patch Merge
roles: [coder, reviewer, verifier, orchestrator]
---

# Isolated Worktree & Verified Patch Merge

For coding mutations on an eligible clean Git workspace, ABDULKAREM AI X may execute inside a detached Git worktree sandbox instead of modifying the original working tree directly.

Rules:
- Treat the sandbox workspace path as the only writable project during the Agent run.
- Do not change Git HEAD, create commits, rebase, reset history, or switch branches inside the sandbox.
- Build, lint, type-check and test inside the sandbox before considering the result verified.
- The host runtime exports a binary Git patch only after verification.
- The host runtime checks that the original HEAD and working tree have not changed before merge.
- The model cannot apply or approve the host patch merge directly.
- After merge, the host runs project verification again; failure triggers rollback of the original workspace.
- If the original workspace is dirty or is not an eligible Git worktree, fall back to the Transactional Workspace protection layer.
- Never delete or modify Ollama model storage.
