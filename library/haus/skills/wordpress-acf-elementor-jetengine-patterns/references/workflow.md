# Workflow

## Implementation steps

1. For ACF field changes: make changes in WP admin ACF UI → ACF auto-saves to `acf-json/` → commit JSON
2. For field key renames: update ALL `get_field('old_key')` calls before renaming — or migrate existing content
3. For Elementor widget: create PHP class extending `\Elementor\Widget_Base`; register via `elementor/widgets/register` hook
4. For JetEngine content type: configure in WP admin; export config JSON; commit to `config/jet-engine/`
5. For dynamic tags: register tag class extending `\Elementor\Core\DynamicTags\Tag`; return ACF field value
6. Sanitize and escape all dynamic output: `esc_html()`, `esc_url()`, `wp_kses_post()` as appropriate
7. Test with real content: populate ACF fields; preview Elementor template with dynamic data enabled

## Commands

```bash
# WP-CLI commands
wp acf sync                         # sync ACF field groups from JSON files
wp post list --post_type=custom-type # list custom post type entries

# Local development
wp-env start                        # if using @wordpress/env
# or: Local by Flywheel / Valet / DDEV

# PHP linting
composer run lint                   # project-specific lint script
phpcs --standard=WordPress src/     # WordPress coding standards check
phpcbf --standard=WordPress src/    # auto-fix

# Composer
composer install                    # install PHP dependencies
```

## Validation checklist

- [ ] Renamed ACF field keys: all `get_field('key')` call sites updated
- [ ] `acf-json/` directory committed with updated field group JSON
- [ ] Elementor widget registered via `elementor/widgets/register` hook — not deprecated hook
- [ ] Dynamic output escaped: `esc_html()` for text, `esc_url()` for URLs, `wp_kses_post()` for HTML
- [ ] JetEngine content type config JSON exported and committed
- [ ] ACF fields exposed to REST API only if frontend consumption requires it
- [ ] Template tested with empty/null field values — conditional ACF output handles missing data
