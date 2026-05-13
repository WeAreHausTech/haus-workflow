# Scope

## In-scope files and dirs

- `src/auth/**` — auth guards, strategies, decorators, session handlers
- `src/middleware/auth.*` — request-level auth middleware
- `config/auth.*`, `config/oidc.*`, `config/azure-ad.*` — provider configuration
- `src/**/callback.*`, `src/**/redirect.*` — OIDC/BankID callback handlers
- `src/**/claims.*`, `src/**/roles.*` — claim extraction and role mapping
- `src/**/token.*` — token validation, refresh, introspection
- `.env*` — provider client IDs, secrets, tenant IDs, redirect URIs
- `src/**/session.*` — session store and cookie settings

## Stack boundaries

- OIDC/OpenID Connect: authorization code flow, PKCE, token exchange
- Azure AD: app registrations, tenant config, app roles, group claims
- BankID: personal number assertion, signed assertions, auth level handling
- Not in scope: generic user CRUD with no identity protocol contract change
- Not in scope: database schema changes not driven by auth claim mapping

## Triggers

- Adding or modifying OIDC provider (tenant ID, client ID, scopes)
- Changing redirect/callback URIs or post-login redirect logic
- Adding new claim/role mappings to downstream authorization checks
- Switching session storage backend (Redis, DB, cookie)
- Changing token validation library or JWT verification logic
- Adding BankID personal number assertion or auth level check
- Touching auth guard on any route/resolver/controller
