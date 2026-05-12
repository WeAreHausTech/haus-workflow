---
name: auth-oidc-azure-bankid-patterns
description: Auth integration router for OIDC, Azure AD, and BankID style identity flows.
---

# Auth OIDC Azure BankID Patterns

## Use when

- task modifies login/session/token/claims or external identity provider integration
- task touches auth middleware/guards, callback handlers, or identity config

## Do not use when

- task is generic user profile CRUD with no auth protocol change
- task is unrelated to identity, tokens, or access policy

## Inspect first

- auth guard/middleware and session/token handling files
- OIDC/Azure/BankID provider config and callback handlers
- claim/role mapping logic and downstream authorization checks

## Avoid mistakes

- accepting unvalidated tokens/claims
- changing redirect/callback URLs without env/config alignment
- mixing authentication identity with authorization policy logic

## Router

1. Load `references/scope.md` for provider integration touchpoints.
2. Load `references/workflow.md` only for auth flow and failure path tracing.
3. Validate token/session lifecycle and permission impact.

## References

- references/scope.md
- references/workflow.md
