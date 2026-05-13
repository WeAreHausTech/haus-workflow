# Scope

## In-scope files and dirs

- `acf-json/` — ACF field group JSON sync files (auto-saved by ACF UI)
- `inc/acf/**`, `functions.php` sections with `acf_add_local_field_group()` — PHP field registration
- `inc/elementor/**`, `src/elementor/**` — custom Elementor widget PHP classes
- `templates/elementor/**` — Elementor template PHP files with dynamic tag integration
- `inc/jetengine/**` — JetEngine custom content type registration, relations, query config
- `config/jet-engine/**` — JetEngine exported config JSON (if using import/export)
- `inc/acf-to-rest/**` — ACF REST API exposure configuration

## Stack boundaries

- ACF: field groups, field keys, conditional logic, `get_field()`, `get_sub_field()`, flexible content
- Elementor Pro: dynamic tags, widget registration, `\Elementor\Widget_Base` extensions
- JetEngine: custom post types, custom taxonomies, meta fields, listing grids, query builder
- Not in scope: generic WordPress hook logic without builder/ACF field integration
- Not in scope: Elementor template design (visual editor only changes)

## Triggers

- Adding, renaming, or restructuring an ACF field group or field key
- Adding a custom Elementor widget class
- Registering or changing a JetEngine custom content type or meta field
- Wiring an ACF field to a JetEngine relation
- Adding a dynamic tag to expose ACF data in Elementor
- Changing ACF `get_field()` call to updated field key
