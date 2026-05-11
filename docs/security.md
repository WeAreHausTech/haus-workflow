# Security

Guardrails:

- block sensitive file access
- block dangerous shell commands
- redact obvious secrets in memory

## Scanner signals and recommendations

When `haus scan` writes non-empty `securityRisks` on `context-map.json`, `haus recommend` adds a **Scan reported security signals** line to `recommendation.json` warnings and applies a **flat score penalty** to every catalog candidate (until finer per-risk rules exist). Treat these recommendations as lower confidence until risks are addressed.

Run:

```bash
haus guard file-access --from-hook
haus guard bash --from-hook
```
