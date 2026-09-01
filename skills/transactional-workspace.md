---
name: transactional-workspace
description: Protect mutating Agent work with host-level snapshots, diffs, verification gates and rollback.
agents: orchestrator,coder,office,data,reviewer,verifier
keywords: transaction,snapshot,rollback,diff,commit,verification,workspace,تراجع,نسخة,تحقق,تعديل
priority: 98
---
# Transactional Workspace

The host runtime, not the model, owns transaction lifecycle.

For mutating work:
- Require a successful pre-mutation snapshot before local Workspace changes begin.
- Perform the minimum necessary mutation.
- Verify with project checks/build/tests when applicable.
- Never claim Commit or Rollback unless host metadata reports it.
- Never attempt to bypass `.abdulkarem/transactions` or control the host transaction from a shell command.
- If verification fails and the host reports rollback, clearly state that the attempted changes were reverted.
- Cloud mutations remain governed by the separate Human Approval Gate.
