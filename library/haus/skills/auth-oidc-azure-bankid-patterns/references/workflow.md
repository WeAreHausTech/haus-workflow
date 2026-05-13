# Workflow

## Implementation steps

1. Identify provider: OIDC generic, Azure AD (v1/v2 endpoint), or BankID — check existing config files
2. Locate auth middleware/guard chain — map which routes/resolvers it protects
3. Check callback handler: verify state/nonce validation, PKCE verifier, token endpoint call
4. Trace claim extraction: from `id_token` or `userinfo` endpoint to application user object
5. Validate role/permission mapping: confirm downstream authorization checks match new claims
6. Verify redirect URI alignment: env vars, provider app registration, and middleware matcher all consistent
7. Check token storage: httpOnly cookie vs session store — confirm expiry and refresh logic
8. For BankID: verify personal number assertion is validated before trust, check auth level (`loa`)
9. Run auth flow end-to-end in dev environment: login → callback → session → protected route

## Commands

```bash
# NestJS/Node
yarn tsc --noEmit                  # type check token/claims types
jest --testPathPattern auth       # run auth unit tests

# Laravel (Socialite / Laravel Passport)
php artisan test --filter=Auth    # run auth feature tests
php artisan route:list | grep callback  # inspect registered callback routes

# .NET
dotnet test --filter Category=Auth
```

## Validation checklist

- [ ] Token signature verified against provider JWKS endpoint — never skip
- [ ] `state` and `nonce` parameters validated on callback to prevent CSRF/replay
- [ ] Redirect URIs match exactly (no trailing slash drift) in env and provider config
- [ ] Session expiry and refresh token rotation implemented for long-lived sessions
- [ ] Role/claim mapping tested with both positive and negative claim values
- [ ] BankID `loa` level meets application minimum assurance requirement
- [ ] Auth guard applied to all protected routes — no accidental public exposure
