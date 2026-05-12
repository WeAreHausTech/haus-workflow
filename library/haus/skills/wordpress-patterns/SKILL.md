---
name: wordpress-patterns
description: WordPress core router. Use for theme/plugin behavior, hooks, REST endpoints, and template logic.
---

# WordPress Patterns

## Use when

- task changes WordPress plugin/theme behavior via hooks, filters, templates, or REST handlers
- task touches `wp-content/themes/*`, `wp-content/plugins/*`, or Bedrock app overrides

## Do not use when

- task is exclusively Bedrock environment/config bootstrap
- task is Laravel/NestJS/.NET service logic not running in WP runtime

## Inspect first

- entry plugin/theme files and hook registrations (`add_action`, `add_filter`)
- template files and block registration files
- custom post type/taxonomy/ACF integration points when relevant

## Avoid mistakes

- hook priority conflicts that silently override behavior
- direct DB writes bypassing WP APIs and sanitization
- missing capability/nonce checks on admin actions

## Router

1. Load `references/scope.md` for runtime file map.
2. Load `references/workflow.md` only when tracing request-hook-render flow.
3. Keep changes hook-scoped and validate admin + frontend impact.

## References

- references/scope.md
- references/workflow.md
