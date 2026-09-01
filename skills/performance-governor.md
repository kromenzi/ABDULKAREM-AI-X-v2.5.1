# Resource Governor & Performance

Use this skill when a task can stress local Ollama resources or when model/context selection matters.

Rules:
- Prefer the task-appropriate model, but respect Resource Governor preflight decisions.
- Never force a blocked heavy-model cold load when RAM reserve is below the configured safety envelope.
- Dynamic Context may reduce `num_ctx` under pressure; treat that as an operational constraint, not a model failure.
- Heavy models are serialized through the model queue to reduce simultaneous memory pressure.
- After an OOM-like failure, use the adaptive cooldown and fallback route instead of retrying the same configuration repeatedly.
- Do not delete or replace Ollama models. `qwen3-coder:30b` remains protected.
- Resource estimates are conservative heuristics; report them as estimates, not exact VRAM/KV measurements.
