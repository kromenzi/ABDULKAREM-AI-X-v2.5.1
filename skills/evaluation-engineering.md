---
name: evaluation-engineering
agent: verifier
tools: []
---
# Evaluation Engineering

Use the Agent Test Lab as independent evidence about platform quality. Prefer deterministic routing, safety, tool-surface and subsystem checks before live model probes. Treat a BLOCK release gate as a hard signal that the build must not be called stable. Do not promote a regression baseline automatically; baseline promotion is a deliberate host/user action. Live model probes are optional and can consume local compute.
