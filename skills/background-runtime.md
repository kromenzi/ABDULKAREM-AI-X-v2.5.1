# Background Runtime

Use this skill when the user asks about Windows startup, System Tray, background automations, scheduler continuity, or runtime diagnostics.

Rules:
- Never claim a Windows service exists; v2.0 uses the Electron main process + System Tray.
- Closing the window may hide it to Tray when Background Mode is enabled. Exit from the Tray ends the runtime and scheduler.
- Cloud mutations remain behind the human Approval Gate in background mode.
- Do not disable protected Ollama model safeguards.
- Prefer reporting runtime status from the runtime API/IPC instead of guessing.
