# Scope

## In-scope files and dirs

- `wp-content/themes/*/functions.php` — hook registrations, theme setup
- `wp-content/themes/*/inc/**` — modular theme includes
- `wp-content/themes/*/template-parts/**` — reusable template partials
- `wp-content/themes/*/*.php` (template files) — `single.php`, `archive.php`, `page.php`, etc.
- `wp-content/plugins/*/plugin-name.php` — plugin entry file with `add_action`/`add_filter`
- `wp-content/plugins/**/src/**` — plugin PHP source classes
- `wp-content/plugins/**/includes/**` — plugin includes (CPT registration, REST endpoints)
- `wp-content/mu-plugins/**` — must-use plugins (always loaded)

## Stack boundaries

- WordPress runtime: hooks (`add_action`, `add_filter`), template hierarchy, `WP_Query`, REST API
- Custom post types and taxonomies: `register_post_type`, `register_taxonomy`
- REST API: `register_rest_route`, `WP_REST_Controller`
- Not in scope: Bedrock environment/config bootstrap (use wordpress-bedrock-patterns)
- Not in scope: ACF field registration or Elementor widget code (use wordpress-acf-elementor-jetengine-patterns)

## Triggers

- Adding `add_action` or `add_filter` hook in theme or plugin
- Registering or changing a custom post type or taxonomy
- Adding or modifying a REST API endpoint
- Changing template file (`single.php`, `archive.php`, `page.php`, template part)
- Adding a block (block.json + PHP render callback or JS block)
- Adding capability checks or nonce verification to admin actions
