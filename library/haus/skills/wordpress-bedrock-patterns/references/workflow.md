# Workflow

## Implementation steps

1. For plugin installs: use Composer — never install via WP admin in Bedrock projects
2. Check WPackagist availability: `wpackagist-plugin/plugin-slug` for free WP.org plugins
3. Add plugin to `composer.json` under `require`; run `composer install`
4. For WP core upgrade: change `roots/wordpress` version constraint; run `composer update roots/wordpress`
5. For new config constant: add to `config/application.php`; add env var to `.env` and `.env.example`
6. For environment-specific overrides: add to correct file in `config/environments/`
7. Verify `WP_HOME` and `WP_SITEURL` are correct for each environment in `.env`
8. For Trellis deployment: update `group_vars/` if new env vars added; run `ansible-playbook deploy.yml`

## Commands

```bash
# Composer (plugin/dependency management)
composer require wpackagist-plugin/plugin-slug
composer require wpackagist-theme/theme-slug
composer update roots/wordpress          # upgrade WP core
composer install                         # install from lockfile
composer show                            # list installed packages

# WP-CLI (run inside web root context)
wp core version                          # confirm WP version
wp plugin list                           # list active plugins
wp db check                              # verify DB connection

# Trellis provisioning/deployment (if used)
ansible-playbook server.yml -e env=staging
ansible-playbook deploy.yml -e env=production -e site=example.com
```

## Validation checklist

- [ ] No plugin installed via WP admin — only via `composer require`
- [ ] `composer.lock` committed after every dependency change
- [ ] `.env.example` updated with any new required env var (without real values)
- [ ] `WP_HOME` and `WP_SITEURL` correct for each environment
- [ ] Secrets never committed in `config/*.php` — use `.env` for all sensitive values
- [ ] `web/wp/` not modified — WordPress core is Composer-managed
- [ ] mu-plugins added to `web/app/mu-plugins/` — not `web/wp-content/mu-plugins/`
