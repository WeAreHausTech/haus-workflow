# Workflow

## Implementation steps

1. Check `turbo.json` pipeline before adding new script: match task name exactly with `package.json` script key
2. For new package: scaffold with correct `package.json` scripts; add to workspace glob if needed
3. Add `dependsOn: ["^build"]` for any task that requires upstream packages to be built first
4. Set `outputs` for build tasks: Turbo uses this to restore artifacts from cache
5. Set `inputs` for tasks that should re-run on source changes only (exclude test output files)
6. Test locally with `--dry-run` first — inspect which tasks would run and their cache status
7. Validate CI uses `--filter` or `--affected` correctly: only run what changed
8. For remote cache: configure `TURBO_TOKEN` and `TURBO_TEAM` env vars in CI secrets

## Commands

```bash
turbo build                              # run build across all packages
turbo build --filter=app-name           # run build for one app and its deps
turbo build --filter=...[HEAD^1]        # run for packages changed since last commit (Turbo 2)
turbo build --dry-run                   # show what would run without executing
turbo build --force                     # bypass cache — force full rebuild
turbo build --summarize                 # show task summary and cache hits

turbo test --filter=pkg-name
turbo lint --parallel                   # run lint in parallel across packages

# Cache management
turbo daemon status                     # check Turbo daemon
rm -rf .turbo                           # clear local cache
```

## Validation checklist

- [ ] Task name in `turbo.json` pipeline matches `package.json` script key exactly
- [ ] `dependsOn: ["^build"]` set for tasks that consume other packages' build output
- [ ] `outputs` arrays cover all files Turbo needs to cache and restore
- [ ] `inputs` arrays exclude test output, dist files, and other non-source paths
- [ ] `--affected` or `--filter` used in CI — not bare `turbo build` on every PR
- [ ] Remote cache hits confirmed in CI logs for unchanged packages
- [ ] New package added to root `workspaces` glob (or `pnpm-workspace.yaml`)
