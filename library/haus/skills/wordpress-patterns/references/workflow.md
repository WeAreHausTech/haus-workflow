# Workflow

## Implementation steps

1. Identify entry point: plugin entry file or `functions.php` — trace hook registration from there
2. For new functionality: add via hook (`add_action`/`add_filter`) — never modify WP core files
3. Set hook priority explicitly if order matters — default `10` is often insufficient for custom logic
4. For REST endpoints: use `register_rest_route` in `rest_api_init` action; add `permission_callback`
5. For admin actions: validate nonce with `check_admin_referer()`; verify capability with `current_user_can()`
6. For CPT registration: call `register_post_type` in `init` hook with correct `supports` and `rewrite` args
7. Escape all output: `esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses_post()` — never echo raw user data
8. Test: activate plugin/theme in local WP install; check for PHP errors in debug log; test hook behavior

## Commands

```bash
# WP-CLI
wp plugin activate plugin-slug          # activate plugin for testing
wp plugin deactivate plugin-slug
wp cache flush                          # clear object cache
wp rewrite flush                        # flush rewrite rules after CPT registration
wp post list --post_type=custom-type    # verify CPT content
wp rest list-endpoints                  # list registered REST routes

# PHP linting
phpcs --standard=WordPress src/         # WordPress coding standards
phpcbf --standard=WordPress src/        # auto-fix

# PHP syntax check
php -l wp-content/plugins/my-plugin/plugin.php
```

## Validation checklist

- [ ] All hooks registered in correct action (`init`, `rest_api_init`, `admin_init`) — not directly in file
- [ ] Hook priority set explicitly when order-sensitive (conflicts checked with `has_filter`)
- [ ] REST endpoints have `permission_callback` — never `__return_true` on non-public routes
- [ ] Admin form actions validate nonce (`check_admin_referer`) and capability (`current_user_can`)
- [ ] All dynamic output escaped with appropriate function before echo
- [ ] CPT registered with `rewrite flush` tested — permalink structure resolves correctly
- [ ] No direct DB queries without `$wpdb->prepare()` for parameterized data
