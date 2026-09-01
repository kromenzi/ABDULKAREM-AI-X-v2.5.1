---
id: parallel-coding-lanes
name: Parallel Isolated Coding Lanes
roles: [coder, reviewer, verifier, orchestrator]
---

# Parallel Isolated Coding Lanes

For eligible complex coding work on a clean Git workspace, the host may execute multiple independent Coder lanes in detached worktrees from the same base HEAD.

Rules:
- Each lane must treat its assigned worktree as the only writable workspace.
- Lanes are independent alternatives; never assume another lane changed your files.
- Run Build/Lint/Typecheck/Test in the lane before exporting a patch.
- The host compares patch files and base-file hunk regions before integration.
- Overlapping or structural conflicts are never auto-blended. The host may select the best verified lane instead.
- Disjoint patches are applied first to a separate integration worktree and verified there.
- The original workspace remains untouched until the integration patch passes verification and drift checks.
- Post-merge verification is mandatory; failure rolls the original workspace back transactionally.
- The model cannot approve or invoke lane merge/commit/rollback operations.
- Resource Governor may serialize heavy local model calls even when worktree lanes are logically parallel.
