---
name: wordpress-acf-elementor-jetengine-patterns
description: WordPress builder-data router. Use for ACF, Elementor Pro, and JetEngine data/model wiring.
---

# WordPress ACF Elementor JetEngine Patterns

## Use when

- task changes field groups, dynamic templates, listing/grid data, or meta schema
- task touches ACF JSON/PHP registration, Elementor template hooks, or JetEngine config

## Do not use when

- task is generic theme/plugin hook logic without builder/meta impact
- task is unrelated backend API/service behavior

## Inspect first

- ACF field registration (`acf-json/`, PHP field group registration)
- Elementor template/widget integration files
- JetEngine custom content type/meta/listing config files

## Avoid mistakes

- renaming field keys and breaking existing content mappings
- coupling presentation templates to unstable raw meta structures
- missing sanitization/escaping in dynamic output

## Router

1. Load `references/scope.md` for builder-specific file map.
2. Load `references/workflow.md` only when tracing data-to-template flow.
3. Preserve backward compatibility for existing field/meta keys.

## References

- references/scope.md
- references/workflow.md
