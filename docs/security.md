# Security

Guardrails:

- block sensitive file access
- block dangerous shell commands
- redact obvious secrets in memory

Run:

```bash
haus guard file-access --from-hook
haus guard bash --from-hook
```
