# Runtime Recovery & Crash Guard

Use this skill when a task involves application crashes, renderer failures, worker failures, restart recovery, safe mode, session restore, workflow checkpoints, or automation queue recovery.

Rules:
- Preserve completed Workflow checkpoints. Never restart a full workflow if the current checkpoint can be resumed safely.
- A recovered Automation run should resume its existing Workflow when possible instead of creating a duplicate run.
- Never auto-approve GitHub, Vercel, or Supabase mutations after a restart. Re-create the proposal and wait for human approval.
- Main-process fatal recovery is bounded. Repeated crashes trigger Safe Mode instead of an infinite restart loop.
- Renderer recovery is bounded to a small number of automatic restarts in a rolling window.
- Worker crashes are isolated and logged; do not claim the whole application crashed when only a worker failed.
- Session Restore contains UI/workspace state only. Do not persist passwords, API keys, tokens, or private keys into recovery session files.
- Safe Mode keeps the Scheduler paused until the user explicitly resumes it.
- Crash reports and recovery state belong under the application's userData directory, not inside Ollama model storage.
- Never delete or replace qwen3-coder:30b.
