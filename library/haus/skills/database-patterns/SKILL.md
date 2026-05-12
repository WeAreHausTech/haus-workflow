---
name: database-patterns
description: Database router for PostgreSQL, MariaDB, MSSQL, and Elasticsearch data/model/query changes.
---

# Database Patterns

## Use when

- task changes schema, indexes, query behavior, or search mappings
- task touches migrations, repositories/query builders, or ES index definitions

## Do not use when

- task is UI-only data presentation with no persistence/search behavior change
- task is auth/session-only logic with no DB contract impact

## Inspect first

- migrations/schema files and model mappings
- repository/query files for affected feature
- Elasticsearch index templates/mapping files when search involved

## Avoid mistakes

- shipping query changes without index/perf consideration
- introducing non-backward-compatible migration steps without rollout plan
- mixing search document schema with transactional model assumptions

## Router

1. Load `references/scope.md` for storage-specific target files.
2. Load `references/workflow.md` only for read/write/search flow analysis.
3. Validate migration safety and query impact before handoff.

## References

- references/scope.md
- references/workflow.md
