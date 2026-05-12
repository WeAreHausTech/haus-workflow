---
name: wordpress-bedrock-patterns
description: Bedrock router. Use for Roots/Bedrock env/config/bootstrap and WordPress deployment layout concerns.
---

# WordPress Bedrock Patterns

## Use when

- task changes Bedrock config, environment loading, or web/app separation
- task touches `config/`, `web/`, `composer.json`, or environment mapping files

## Do not use when

- task is normal WordPress hook/template logic without Bedrock config impact
- task is infrastructure outside project repo deployment assumptions

## Inspect first

- `config/application.php`, environment-specific config files
- `composer.json` and Bedrock package wiring
- `web/app` structure for mu-plugins/themes/plugins placement

## Avoid mistakes

- mixing production secrets into committed config
- changing env precedence and breaking boot order
- placing code under wrong Bedrock directory root

## Router

1. Load `references/scope.md` for Bedrock path boundaries.
2. Load `references/workflow.md` only for bootstrap/config flow debugging.
3. Keep WordPress runtime logic in WP skills, not Bedrock config files.

## References

- references/scope.md
- references/workflow.md
