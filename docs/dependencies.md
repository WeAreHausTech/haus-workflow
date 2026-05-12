# Dependencies

Runtime dependencies must stay minimal and purpose-bound.
Do not add terminal UX frameworks or orchestration frameworks without explicit product need.

## Current runtime dependencies

- `commander`: CLI routing only
- `fast-glob`: scanning filesystem patterns
- `ignore`: gitignore-style filtering
- `picomatch`: precise pattern matching
- `yaml`: Claude/plugin/catalog config parsing and generation
- `zod`: schema validation
- `fs-extra`: safe filesystem operations
- `semver`: version/range checks
- `execa`: safe process execution
- `diff`: unified diffs for update/apply previews

## Must not be used for

- `commander`: not business logic container
- `diff`: not binary patching system
- `execa`: not interactive shell UI; avoid `shell: true` unless unavoidable
- `semver`: not schema validation replacement
- `fs-extra`: not policy layer; only IO

## Explicitly avoided unless future requirement justifies

- `chalk`
- `ora`
- terminal UI/TUI frameworks
- workflow engines
- agent orchestration frameworks
