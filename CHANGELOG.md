# Changelog

## [0.31.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.30.0...v0.31.0) (2026-06-23)

### Features

- opt-in UX for tiered skills + config scaffold ([#141](https://github.com/WeAreHausTech/haus-workflow/issues/141)) ([f60207b](https://github.com/WeAreHausTech/haus-workflow/commit/f60207b78af4651656d457c6f80665bd25deaa7f)), closes [#33](https://github.com/WeAreHausTech/haus-workflow/issues/33) [#33](https://github.com/WeAreHausTech/haus-workflow/issues/33)

## [0.30.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.29.0...v0.30.0) (2026-06-22)

### Features

- auto recommend config setups ([#137](https://github.com/WeAreHausTech/haus-workflow/issues/137)) ([56e7941](https://github.com/WeAreHausTech/haus-workflow/commit/56e79413a6cfe00e35f5e48abd03baeeb377214f))
- **cloneandsetup:** reuse local env values, never commit secrets ([#130](https://github.com/WeAreHausTech/haus-workflow/issues/130)) ([cf74a19](https://github.com/WeAreHausTech/haus-workflow/commit/cf74a196d369fbc59798de97e76bbcd3120155f7))
- co-install suppression and recommender gates ([#134](https://github.com/WeAreHausTech/haus-workflow/issues/134)) ([4ca1f20](https://github.com/WeAreHausTech/haus-workflow/commit/4ca1f20a6b90645cd7007d195e6cc474558cc971))
- curated source tools exempt from non-tsx npx ban and update archetype dependencies ([#132](https://github.com/WeAreHausTech/haus-workflow/issues/132)) ([a63d0b2](https://github.com/WeAreHausTech/haus-workflow/commit/a63d0b224ee9d1fd7b686b9aa3979562228f2333))
- prune deprecated catalog items on apply/update ([#126](https://github.com/WeAreHausTech/haus-workflow/issues/126)) ([fdf6ecc](https://github.com/WeAreHausTech/haus-workflow/commit/fdf6ecc1d36f4eb090cdaa8d9b044381c5836c77))
- stripe server gate [#139](https://github.com/WeAreHausTech/haus-workflow/issues/139) ([fb2dc35](https://github.com/WeAreHausTech/haus-workflow/commit/fb2dc35b0d332cdd6f3c7dcbaebef94dce06899c))

## [0.29.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.28.1...v0.29.0) (2026-06-17)

### Features

- add haus scaffold command for config file distribution ([#124](https://github.com/WeAreHausTech/haus-workflow/issues/124)) ([092a343](https://github.com/WeAreHausTech/haus-workflow/commit/092a3433f9bcab69877dab902b5506d8b01dd5a8))

## [0.28.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.28.0...v0.28.1) (2026-06-17)

## [0.28.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.27.1...v0.28.0) (2026-06-17)

### Features

- catalog compatibility for curated provenance and deprecations ([#121](https://github.com/WeAreHausTech/haus-workflow/issues/121)) ([1a8a790](https://github.com/WeAreHausTech/haus-workflow/commit/1a8a7902bf7c27462e905d01dfa4d0baac319b57))
- **cloneandsetup:** add up-front data-access preflight + seed access/empty-ok ([#120](https://github.com/WeAreHausTech/haus-workflow/issues/120)) ([70e32ad](https://github.com/WeAreHausTech/haus-workflow/commit/70e32adba2f5ed25ade170a09d1f0cfb2bd198d7))

## [0.27.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.27.0...v0.27.1) (2026-06-16)

### Bug Fixes

- deep audit execution ([#115](https://github.com/WeAreHausTech/haus-workflow/issues/115)) ([eada2d0](https://github.com/WeAreHausTech/haus-workflow/commit/eada2d06f8f6c27f62c0bd82b893290d916c62ff))

## [0.27.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.26.1...v0.27.0) (2026-06-15)

### Features

- **install:** suggest Caveman and RTK after global install ([#111](https://github.com/WeAreHausTech/haus-workflow/issues/111)) ([ab39845](https://github.com/WeAreHausTech/haus-workflow/commit/ab3984550f931f10083aa8e9e5b736c9a7765e94))

## [0.26.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.26.0...v0.26.1) (2026-06-15)

## [0.26.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.25.1...v0.26.0) (2026-06-15)

### Features

- **catalog:** exempt agent content from the only-npx-tsx rule ([#107](https://github.com/WeAreHausTech/haus-workflow/issues/107)) ([e335ecc](https://github.com/WeAreHausTech/haus-workflow/commit/e335eccd9e33e70781f3172cc96952fc070c28a9))

### Bug Fixes

- **scanner:** detect php stack so php-gated catalog items are recommendable ([#109](https://github.com/WeAreHausTech/haus-workflow/issues/109)) ([4daa09e](https://github.com/WeAreHausTech/haus-workflow/commit/4daa09e2ef2e5133f43437b5a6e73277b8c6ab69))

## [0.25.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.25.0...v0.25.1) (2026-06-15)

## [0.25.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.24.1...v0.25.0) (2026-06-12)

### Features

- **cloneandsetup:** deterministic env phase, prereq gate, standalone needs, clone fallback ([#105](https://github.com/WeAreHausTech/haus-workflow/issues/105)) ([c6f5858](https://github.com/WeAreHausTech/haus-workflow/commit/c6f585850591eba48d08f7f6e2d8b1a2aa50c355))

## [0.24.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.24.0...v0.24.1) (2026-06-12)

### Bug Fixes

- **settings:** reconcile haus permission rules on update/apply ([#104](https://github.com/WeAreHausTech/haus-workflow/issues/104)) ([8ab070c](https://github.com/WeAreHausTech/haus-workflow/commit/8ab070c006943f600b6dccb7582b8330d452d3c1))

## [0.24.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.23.1...v0.24.0) (2026-06-12)

### Features

- **cloneandsetup:** local-dev orchestration via localdev.yml ([#97](https://github.com/WeAreHausTech/haus-workflow/issues/97)) ([8a2b5d3](https://github.com/WeAreHausTech/haus-workflow/commit/8a2b5d3e9a767bfe92152189b37921d58878818b))

## [0.23.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.23.0...v0.23.1) (2026-06-12)

## [0.23.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.22.1...v0.23.0) (2026-06-12)

### Features

- **catalog:** full skill cache and superpowers shared install ([#100](https://github.com/WeAreHausTech/haus-workflow/issues/100)) ([d366ccc](https://github.com/WeAreHausTech/haus-workflow/commit/d366ccc99a6f42791a7ae3dfe34456662bb41bdf))
- **security:** add ask tier to Claude Code permissions ([#99](https://github.com/WeAreHausTech/haus-workflow/issues/99)) ([937487c](https://github.com/WeAreHausTech/haus-workflow/commit/937487c2a2c5bd2ccc64f501b759e7f4dfb110f5))

## [0.22.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.22.0...v0.22.1) (2026-06-11)

## [0.22.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.21.0...v0.22.0) (2026-06-11)

### Features

- **audit:** offline, perf cleanup, CI ([#92](https://github.com/WeAreHausTech/haus-workflow/issues/92)) ([a133f06](https://github.com/WeAreHausTech/haus-workflow/commit/a133f06d52b9a9e2a15f949c443c7042ed125735))
- **catalog:** ingest chokepoint ([#91](https://github.com/WeAreHausTech/haus-workflow/issues/91)) ([712d72b](https://github.com/WeAreHausTech/haus-workflow/commit/712d72b252ae3181bcdb9ce02614ede098c5bab5))

### Bug Fixes

- **cloneandsetup:** read repo setup docs before file-heuristics ([#95](https://github.com/WeAreHausTech/haus-workflow/issues/95)) ([8219b92](https://github.com/WeAreHausTech/haus-workflow/commit/8219b92d1c40b71ecb78661929ca57e1fe858603))

## [0.21.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.20.0...v0.21.0) (2026-06-11)

### Features

- **clone:** add project:cloneandsetup command for cloning and setting up repos ([#94](https://github.com/WeAreHausTech/haus-workflow/issues/94)) ([3e7d279](https://github.com/WeAreHausTech/haus-workflow/commit/3e7d2799433106615a1bf25e94be3402f4eb69d2))

### Bug Fixes

- **audit:** correctness hardening ([#90](https://github.com/WeAreHausTech/haus-workflow/issues/90)) ([823b98d](https://github.com/WeAreHausTech/haus-workflow/commit/823b98dc9e4deb2d28ecc5b57b721e80af555a05))

## [0.20.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.19.0...v0.20.0) (2026-06-11)

### Features

- **clone:** enhance user confirmation prompts before cloning repositories ([#93](https://github.com/WeAreHausTech/haus-workflow/issues/93)) ([1f3e6b4](https://github.com/WeAreHausTech/haus-workflow/commit/1f3e6b4c4e97b2ab7b979ab4fbcab8ce6cda3f32))

## [0.19.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.18.2...v0.19.0) (2026-06-11)

### Features

- **clone:** implement single repository cloning command and related … ([#89](https://github.com/WeAreHausTech/haus-workflow/issues/89)) ([3ac9883](https://github.com/WeAreHausTech/haus-workflow/commit/3ac98838db79bf69a602f5c3c17cfd6a1a7f924a))

## [0.18.2](https://github.com/WeAreHausTech/haus-workflow/compare/v0.18.1...v0.18.2) (2026-06-11)

### Bug Fixes

- **validate-catalog:** mirror catalog command frontmatter checks ([#87](https://github.com/WeAreHausTech/haus-workflow/issues/87)) ([765983b](https://github.com/WeAreHausTech/haus-workflow/commit/765983bf1b810b8fd4647b1d7158f0ccee51cefe)), closes [#14](https://github.com/WeAreHausTech/haus-workflow/issues/14)

## [0.18.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.18.0...v0.18.1) (2026-06-09)

### Bug Fixes

- **ci:** improve PR creation logic in sync-catalog-fixture workflow ([d7717d6](https://github.com/WeAreHausTech/haus-workflow/commit/d7717d6024bb400b02f3254ff7f2d33b6e1fb4c6))

## [0.18.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.17.1...v0.18.0) (2026-06-09)

### Features

- prune stale catalog copies and simplify validators ([#83](https://github.com/WeAreHausTech/haus-workflow/issues/83)) ([f87541c](https://github.com/WeAreHausTech/haus-workflow/commit/f87541cc182e9cf2461ba6b388dc227aba88900e))

### Bug Fixes

- **validate:** parse folded YAML description frontmatter ([#84](https://github.com/WeAreHausTech/haus-workflow/issues/84)) ([677d7de](https://github.com/WeAreHausTech/haus-workflow/commit/677d7def4e838c4e5381f34c870a5525c4614073))

## [0.17.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.17.0...v0.17.1) (2026-06-09)

### Bug Fixes

- **ci:** fixture-sync push when PR branch already exists ([#82](https://github.com/WeAreHausTech/haus-workflow/issues/82)) ([db0273c](https://github.com/WeAreHausTech/haus-workflow/commit/db0273cec86712b44fad234272ad5f1de353bd25))

## [0.17.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.16.3...v0.17.0) (2026-06-09)

### Features

- **catalog:** support curated superpowers skills and commands ([#80](https://github.com/WeAreHausTech/haus-workflow/issues/80)) ([2e49c80](https://github.com/WeAreHausTech/haus-workflow/commit/2e49c80d6780e8ff753536f2d4042b4ce7fa2ae8))

## [0.16.3](https://github.com/WeAreHausTech/haus-workflow/compare/v0.16.2...v0.16.3) (2026-06-09)

### Bug Fixes

- **install:** keep skill frontmatter valid by stamping marker as a field ([#79](https://github.com/WeAreHausTech/haus-workflow/issues/79)) ([76ddbf1](https://github.com/WeAreHausTech/haus-workflow/commit/76ddbf1248b8844538363dcfd3744cd975d96f52))

## [0.16.2](https://github.com/WeAreHausTech/haus-workflow/compare/v0.16.1...v0.16.2) (2026-06-09)

## [0.16.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.16.0...v0.16.1) (2026-06-09)

## [0.16.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.15.0...v0.16.0) (2026-06-05)

### Features

- support catalog contexts and refresh-aware sync ([1ab1d6c](https://github.com/WeAreHausTech/haus-workflow/commit/1ab1d6c1ca91a412fc4e7269e1616050c4397101))

### Bug Fixes

- Add forbidden-content, sources-report, and drift ([e7cbd07](https://github.com/WeAreHausTech/haus-workflow/commit/e7cbd076f7f8d8a21555c5e0cdba058b9788ee29))

## [0.15.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.14.0...v0.15.0) (2026-06-05)

### Features

- add manifest drift check to contract validation ([90c5efc](https://github.com/WeAreHausTech/haus-workflow/commit/90c5efc683b9a62f48493ee8705b60b6206750dc))

### Bug Fixes

- Handle cache write failures and refresh global install ([e4a7d58](https://github.com/WeAreHausTech/haus-workflow/commit/e4a7d58b187cd5b1722fbbfe20994c5a2a8336f4))
- Make apply/undo merge-safe for project settings ([977cf4f](https://github.com/WeAreHausTech/haus-workflow/commit/977cf4f39809cfc68632b7856284b089deb5b835))
- refresh project .claude files on update ([a4b55db](https://github.com/WeAreHausTech/haus-workflow/commit/a4b55db650c748e17085ecf093b70b9689ec6081))

## [0.14.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.13.2...v0.14.0) (2026-06-04)

### Features

- **workspace:** add repo auto-discovery ([#70](https://github.com/WeAreHausTech/haus-workflow/issues/70)) ([4b57571](https://github.com/WeAreHausTech/haus-workflow/commit/4b57571a32ef733dda0faf474d593b7fbb297a8e))
- **workspace:** extract shared setup core for workspace configuration ([#68](https://github.com/WeAreHausTech/haus-workflow/issues/68)) ([5e9b1ea](https://github.com/WeAreHausTech/haus-workflow/commit/5e9b1eaf72e8c7a32ec28148611f778367e4f1ef))
- **workspace:** manifest + drift doctor + command wiring (Tasks 4–5) ([#72](https://github.com/WeAreHausTech/haus-workflow/issues/72)) ([4526005](https://github.com/WeAreHausTech/haus-workflow/commit/4526005e693cc2f254ee6c1c5991a92f356506cc))
- **workspace:** per-repo setup loop + workspace aggregate layer ([#71](https://github.com/WeAreHausTech/haus-workflow/issues/71)) ([5c7ae9d](https://github.com/WeAreHausTech/haus-workflow/commit/5c7ae9d5691b0bd262c3449bad2fe649fd0271bf))

## [0.13.2](https://github.com/WeAreHausTech/haus-workflow/compare/v0.13.1...v0.13.2) (2026-06-04)

### Bug Fixes

- catalog-audit drift + scanner EMFILE (TDD) ([#65](https://github.com/WeAreHausTech/haus-workflow/issues/65)) ([815ad79](https://github.com/WeAreHausTech/haus-workflow/commit/815ad798b5c28b98f53a8b8fc62c4e8decf9350e))

## [0.13.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.13.0...v0.13.1) (2026-06-03)

### Bug Fixes

- **catalog:** download skill reference files into cache ([#63](https://github.com/WeAreHausTech/haus-workflow/issues/63)) ([db67180](https://github.com/WeAreHausTech/haus-workflow/commit/db671807273a45e97d5f5cd9505b43284d7b7389))

## [0.13.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.12.1...v0.13.0) (2026-06-03)

### Features

- **recommender:** binary eligibility + docs-skill integration ([0f26431](https://github.com/WeAreHausTech/haus-workflow/commit/0f26431f3b338fbe344ee734d43d7d27837337f2))
- **recommender:** binary eligibility + docs-skill integration ([ee61a6b](https://github.com/WeAreHausTech/haus-workflow/commit/ee61a6be3a976759c3d430b97f5c82cd5e5248fc))

### Bug Fixes

- **recommender:** defensively parse deep-context.json shapes ([5b20c53](https://github.com/WeAreHausTech/haus-workflow/commit/5b20c53531105e8216e7359569284d2f3af9026e))
- **recommender:** defensively parse deep-context.json shapes ([ecbe6b4](https://github.com/WeAreHausTech/haus-workflow/commit/ecbe6b48e116da84a8ab9a0995ce8aed0c00dea6))

## [0.12.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.12.0...v0.12.1) (2026-06-03)

### Bug Fixes

- **template:** address review — dry-run safety, empty-body, hermetic test ([6744f94](https://github.com/WeAreHausTech/haus-workflow/commit/6744f94104b03de51829962c25b7706d3d0124bf))
- **template:** fetch workflow standard from catalog when cache is empty ([0168f5e](https://github.com/WeAreHausTech/haus-workflow/commit/0168f5ed028f8d3bf6588297d5472511cf4813b6))

## [0.12.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.11.1...v0.12.0) (2026-06-03)

### Features

- **install:** full-auto postinstall on global npm install + prepare crash fix ([aa5cfb2](https://github.com/WeAreHausTech/haus-workflow/commit/aa5cfb2a6be50f6513ef344ecef514d0cbf4c8de)), closes [package.json#files](https://github.com/WeAreHausTech/package.json/issues/files)
- **memory+router:** delete in-repo memory store, enforce token budget ([d54e220](https://github.com/WeAreHausTech/haus-workflow/commit/d54e2208c7e3636bf5481733d0a4268f08346286))
- **scanner:** data-driven detection registry + detectionStatus ([6951a72](https://github.com/WeAreHausTech/haus-workflow/commit/6951a72490a53b3643ebfd8f329d49a4cafc5e06))
- **security:** write permissions.deny + consolidate SENSITIVE (WS1, partial) ([32baf77](https://github.com/WeAreHausTech/haus-workflow/commit/32baf7792e2298ac7dc2f45489a326cf5be009e3))
- **security:** write permissions.deny into project .claude/settings.json (WS1) ([c2e6a23](https://github.com/WeAreHausTech/haus-workflow/commit/c2e6a2324fb708de2162b699362c06deba82dcc7))
- **ux:** non-developer desktop UX — slash commands, scoped allow, plain language ([3d95a1b](https://github.com/WeAreHausTech/haus-workflow/commit/3d95a1b581cc40deb117406a86acd91f7853f645))
- **workflow-config:** auto-fill commands from the repo + --refill-config ([2c16bbe](https://github.com/WeAreHausTech/haus-workflow/commit/2c16bbed464efa4ca1d0895e5d3f3b1ad2dd89f3))

### Bug Fixes

- **catalog:** skip id-less items in tag audit ([d04b5ab](https://github.com/WeAreHausTech/haus-workflow/commit/d04b5aba54264f1cf4fe10236aa144c2b0edfb10)), closes [#3](https://github.com/WeAreHausTech/haus-workflow/issues/3)
- **context:** preserve tokenEstimate in normalize; drop stale memory hook from install fragment ([63e980c](https://github.com/WeAreHausTech/haus-workflow/commit/63e980cc5e9d3951e45fbaef8c5747cb74276933))
- **doctor,guard:** verdict truly first; well-formed import check; flag() for hooks; drop backticks in guard reasons ([d562199](https://github.com/WeAreHausTech/haus-workflow/commit/d5621996b49fa331b5d895ed13197a8f797883eb))
- **install:** postinstall notice distinguishes added vs updated; settings 'ensured present' ([e3737b8](https://github.com/WeAreHausTech/haus-workflow/commit/e3737b82d83b2cc44a354ea635fd9e6606c99839))
- **scanner:** address PR [#50](https://github.com/WeAreHausTech/haus-workflow/issues/50) review — chunked reads, typed bucket, hermetic test ([385de24](https://github.com/WeAreHausTech/haus-workflow/commit/385de2413ff55e2040b1a7fb16bb4543d0477e22))
- **workflow-config:** skip derive on existing-no-refill; npx --no-install ([5688f02](https://github.com/WeAreHausTech/haus-workflow/commit/5688f02e5664a9c3475158ea82d1b60837b5ed5a)), closes [#51](https://github.com/WeAreHausTech/haus-workflow/issues/51)

## [0.11.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.11.0...v0.11.1) (2026-06-01)

### Bug Fixes

- return null from writeWorkflowConfig when file exists ([9ad36c1](https://github.com/WeAreHausTech/haus-workflow/commit/9ad36c1800023737d4a65feaeca1dc10fb5f797b))

## [0.11.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.10.1...v0.11.0) (2026-06-01)

### Features

- add agentic workflow standard — replace haus-way-of-work ([a5d2fba](https://github.com/WeAreHausTech/haus-workflow/commit/a5d2fba7ff866403586a1d0f79885184458a3fe1))

### Bug Fixes

- **ci:** sync-catalog-fixture creates PR instead of pushing to main ([547e604](https://github.com/WeAreHausTech/haus-workflow/commit/547e60490b7dac6b3ce47ca6d862cb75d6e83b89))
- **lint:** correct import order in write-claude-files, write-workflow, doctor ([edff887](https://github.com/WeAreHausTech/haus-workflow/commit/edff8877675fa6c604f9707043659130b044fede))
- negate secret-scan grep in bundled template ([1b7e226](https://github.com/WeAreHausTech/haus-workflow/commit/1b7e22631ea7680ad54ee9675ca70f4fcef9e989))
- remove unused imports, add BLOCK_END assertion, use cache-precedence in doctor ([cc566d5](https://github.com/WeAreHausTech/haus-workflow/commit/cc566d51d816f3c65550b7f791b06d8b3318603f))
- **test:** remove no-op || true from warnings assertion ([9929d5c](https://github.com/WeAreHausTech/haus-workflow/commit/9929d5c2030e70b41a4c165bff87b3b45ca6753d))
- use CACHE_DIR from remote-catalog for template path resolution ([4d8b784](https://github.com/WeAreHausTech/haus-workflow/commit/4d8b784303ff8c76d4ef2d55bac3fbd6c77efd9a))

## [0.10.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.10.0...v0.10.1) (2026-05-29)

## [0.10.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.9.0...v0.10.0) (2026-05-29)

### Features

- Add config command to manage hooks ([1f2c7b4](https://github.com/WeAreHausTech/haus-workflow/commit/1f2c7b4ced3437ef4468759ec7bfc4d8adbf3efc))

### Bug Fixes

- address PR review — remove stale module refs, fix plugin-era wording in docs and commands ([6520321](https://github.com/WeAreHausTech/haus-workflow/commit/6520321e1790a304036984c387fdf59d4febe3dd))

## [0.9.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.8.0...v0.9.0) (2026-05-28)

### Features

- **scanner:** detect stripe, qliro, supabase (T26-T28) ([b2585b0](https://github.com/WeAreHausTech/haus-workflow/commit/b2585b027621be1442533d12255523f8361d967b))

## [0.8.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.7.0...v0.8.0) (2026-05-28)

### Features

- **scanner:** tooling detection (T19-T25) ([2ae293b](https://github.com/WeAreHausTech/haus-workflow/commit/2ae293b69cf97be15017021e16703e19aa3c2223))

## [0.7.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.6.0...v0.7.0) (2026-05-28)

### Features

- **scanner:** detect expo + react-native (T18) ([290a5ba](https://github.com/WeAreHausTech/haus-workflow/commit/290a5bac13faa8ec515d8dd9363caa2c00ce74cc))

## [0.6.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.5.0...v0.6.0) (2026-05-28)

### Features

- **scanner:** detect mysql, saml2, next-auth (T15-T17) ([13694e1](https://github.com/WeAreHausTech/haus-workflow/commit/13694e12895b2bb470c7a01adc10a3fc91bb3e42))

## [0.5.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.4.0...v0.5.0) (2026-05-28)

### Features

- **scanner:** detect sanity, strapi, prisma (T12-T14) ([d2f3235](https://github.com/WeAreHausTech/haus-workflow/commit/d2f32359de33f85176085dfcd5c68685b2d4a5fc))

## [0.4.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.3.0...v0.4.0) (2026-05-28)

### Features

- **scanner:** detect react-router-v7, tailwind, shadcn; rename typescript6 → typescript5 (T8-T11) ([d98d813](https://github.com/WeAreHausTech/haus-workflow/commit/d98d813c7e52df68ae7f55ceb23bd9016e2d8308))

## [0.3.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.2.2...v0.3.0) (2026-05-28)

### Features

- **catalog:** allow vitest, jest, and redis tags ([ea08ab6](https://github.com/WeAreHausTech/haus-workflow/commit/ea08ab6cbd66a80bbcb94ce99c5d338dbaefc184))
- **scanner:** detect elementor, ACF/JetEngine, redis (T5-T7) ([262925c](https://github.com/WeAreHausTech/haus-workflow/commit/262925c02e695e9469c9c1ee4e9c03c87f9e1478))
- **scanner:** detect vitest and jest (T3, T4) ([1b917af](https://github.com/WeAreHausTech/haus-workflow/commit/1b917af88d10c8ca443dd8d6c9b5fe3b27a850fa))

## [0.2.2](https://github.com/WeAreHausTech/haus-workflow/compare/v0.2.1...v0.2.2) (2026-05-28)

### Bug Fixes

- **apply:** require populated catalog cache; consistent manifest path resolution ([2afc4b3](https://github.com/WeAreHausTech/haus-workflow/commit/2afc4b365763470e427c457da189ff9a26d9c3e9))
- **release:** upgrade npm to enable OIDC trusted publishing ([eb01d78](https://github.com/WeAreHausTech/haus-workflow/commit/eb01d78d246e0490c9057d96c665f237f05ba556))

## [0.2.1](https://github.com/WeAreHausTech/haus-workflow/compare/v0.2.0...v0.2.1) (2026-05-28)

## [0.2.0](https://github.com/WeAreHausTech/haus-workflow/compare/v0.1.0...v0.2.0) (2026-05-28)

### Features

- **apply:** add --select flag for interactive catalog item picker ([9e0be06](https://github.com/WeAreHausTech/haus-workflow/commit/9e0be060b4c24436a457e4101fd058376af6bc20))
- **catalog:** support HAUS_CATALOG_REF env var and catalogRef in lock file [F4] ([5f3ad0e](https://github.com/WeAreHausTech/haus-workflow/commit/5f3ad0e7a14ed91c94e03645a467392e8c0ae058))
- full validate-catalog rules, catalogRef check, fixture sync workflow ([82a06b1](https://github.com/WeAreHausTech/haus-workflow/commit/82a06b12edd7647b8286fc6b5dbf10f6223bc963))
- handle template type in install pipeline, fix tailwind task intents [F4b+F7] ([0a030e8](https://github.com/WeAreHausTech/haus-workflow/commit/0a030e8b6bd7b8b2e5d136b9d29e1218267d3f41))
- **p11:** npm version check in haus update --check and haus doctor ([#38](https://github.com/WeAreHausTech/haus-workflow/issues/38)) ([74b3a1d](https://github.com/WeAreHausTech/haus-workflow/commit/74b3a1d444a0cf93683f1bd45c19620a5facd348))
- **types:** add template to CatalogItem type, link JSON Schema [F5] ([6230c2c](https://github.com/WeAreHausTech/haus-workflow/commit/6230c2c1a27efca0215b78b11921c7d4e24482e1))

### Bug Fixes

- **apply:** distinguish missing vs empty recommendation; test selectedIds via tsx ([a67f323](https://github.com/WeAreHausTech/haus-workflow/commit/a67f32387998cfdd0666750b8b9465478060d178))
- **apply:** restore items variable reference after refactor ([79695f2](https://github.com/WeAreHausTech/haus-workflow/commit/79695f2fefe30df3602f5dd276542479d151f38f))
- **tests:** remove unused helperScript and lockAll variables ([2daa57e](https://github.com/WeAreHausTech/haus-workflow/commit/2daa57ea6efb3c7e07533f3e99013b89c887918b))

## 0.1.0 (2026-05-27)

### Features

- add claude plugin and project file generation ([6760159](https://github.com/WeAreHausTech/haus-workflow/commit/6760159ff1f698e82ed11b16c0deaa547ceead08))
- add context-aware recommendation engine ([49ed440](https://github.com/WeAreHausTech/haus-workflow/commit/49ed440992ba0e096b63f53dc3c7fc985d1d79e7))
- add curated external source adapters ([6a5f9e6](https://github.com/WeAreHausTech/haus-workflow/commit/6a5f9e60216ad6dac5ef0e077df0e55ce8628602))
- add guided setup interview and approval gate ([266c9ad](https://github.com/WeAreHausTech/haus-workflow/commit/266c9add58babc862cb8f5638d3ef49261740f8a))
- add local verification script for build, tests, and CLI checks ([488c39a](https://github.com/WeAreHausTech/haus-workflow/commit/488c39a84deab8829fb2cb4696e26c9b59a23304))
- add lockfile-based update workflow ([590d4f3](https://github.com/WeAreHausTech/haus-workflow/commit/590d4f3e231ffead49529d8b9e7bafe4f2416413))
- add plugin install copy flow and full hooks ([ff84b9d](https://github.com/WeAreHausTech/haus-workflow/commit/ff84b9da54417530482b2f25bf39016d8097f466))
- add project memory management ([b1e1f34](https://github.com/WeAreHausTech/haus-workflow/commit/b1e1f34402f1c199c24570f0d79249c7aef7fe9c))
- add project scanner and catalog validation ([ab84f8f](https://github.com/WeAreHausTech/haus-workflow/commit/ab84f8f7a85ba9ec8a2d5496a0acbd68dc406b0a))
- add security guardrails for files and commands ([8eefb66](https://github.com/WeAreHausTech/haus-workflow/commit/8eefb667a07fb05383a0bd422bba9d6d50355f19))
- add semantic lockfile delta summaries in update flow ([fb94926](https://github.com/WeAreHausTech/haus-workflow/commit/fb949266363f06807a671014cdabd0fb6028ab98))
- **catalog:** add haus reviewer agents and review skills ([16a3c78](https://github.com/WeAreHausTech/haus-workflow/commit/16a3c78f5478cc1ccb7e26200fb36e057fcee9d7))
- **claude:** load hooks from plugin for apply and recommend ([ff62738](https://github.com/WeAreHausTech/haus-workflow/commit/ff62738083d968de510b2de5b198dd3c6a70ea5e))
- **cleanup:** add pre-release cleanup tracker (P1) ([4c6d127](https://github.com/WeAreHausTech/haus-workflow/commit/4c6d127369d0b5ea4ae107b7b6d48a49971f1dfd))
- **cli:** add explain-recommendation JSON output ([354ca5a](https://github.com/WeAreHausTech/haus-workflow/commit/354ca5acfd3bb3317ec437fae81cda82bd17ad3b))
- **cli:** add undo, pkg version, setup scan mode ([e29b25a](https://github.com/WeAreHausTech/haus-workflow/commit/e29b25a13166e3b0d04df60b73d5d52672eb9e1b))
- **cli:** Track B — dry-run diffs, haus init, context verbose ([67870d9](https://github.com/WeAreHausTech/haus-workflow/commit/67870d90adbba3d22dd584580335be847b76fc24))
- **context:** add deterministic task intent filtering ([1edbf53](https://github.com/WeAreHausTech/haus-workflow/commit/1edbf53d93e575848c69bc8f7586787e1ec54ebe))
- **context:** add task-scoped context payload ([70af3a0](https://github.com/WeAreHausTech/haus-workflow/commit/70af3a079e88b3d78124de1ed2d373728a0671fa))
- **curated:** populate source inventory and curation decisions (PR8) ([fdefec5](https://github.com/WeAreHausTech/haus-workflow/commit/fdefec5772c2b83259ada94fad5c4cd5c5167582))
- **curated:** schema foundation for curated external primitives layer ([7c2435f](https://github.com/WeAreHausTech/haus-workflow/commit/7c2435f6600624fc0a99594a37b2cba4ff1af23c))
- **curation:** PR5 source decisions and curation docs ([f342d35](https://github.com/WeAreHausTech/haus-workflow/commit/f342d359d6f2039a21814e75a9ad5c791c476a81))
- deepen scanner detection and confidence signals ([583c57a](https://github.com/WeAreHausTech/haus-workflow/commit/583c57a6cba57c284272c1e3b1d44fd592225212))
- expand apply output with rules and selected assets ([59a8e03](https://github.com/WeAreHausTech/haus-workflow/commit/59a8e033bce1d613209f1ac996c2cc5f02f3def6))
- expand catalog coverage docs and behavior tests ([e2a47ea](https://github.com/WeAreHausTech/haus-workflow/commit/e2a47eadd64f5f709d55a0fcd02eafe714afdf84))
- **explain:** polish CLI human output without changing JSON contracts ([9f6d41e](https://github.com/WeAreHausTech/haus-workflow/commit/9f6d41efebbca7ead950a9298f2d168a8cba77c7))
- extend recommendation scoring with trust and goals ([5d39c5a](https://github.com/WeAreHausTech/haus-workflow/commit/5d39c5a7e767447902e53019bf2004b339a44153))
- extend recommender outputs with hooks rules and file signals ([e0e8cbb](https://github.com/WeAreHausTech/haus-workflow/commit/e0e8cbb37faea7aa2e427318e9cda4ed6e59394d))
- harden curated source sync and audit policy ([3cd0e0f](https://github.com/WeAreHausTech/haus-workflow/commit/3cd0e0fcda5df10ed2b134d730329285ccf5c9b6))
- harden update flow with backup and override checks ([0192f79](https://github.com/WeAreHausTech/haus-workflow/commit/0192f7986128658e18db3082c59837a0731110c5))
- **hooks:** audit hook cost and gate non-load-bearing hooks default-off (P2) ([cdf675b](https://github.com/WeAreHausTech/haus-workflow/commit/cdf675befddae2ea96735c01012c1826d0670d04))
- implement workspace cross-repo scanning outputs ([a3ddeca](https://github.com/WeAreHausTech/haus-workflow/commit/a3ddeca4ee5a16f514a677162d9cb30359e071ce))
- improve plugin install path and scanner depth signals ([6c9ceef](https://github.com/WeAreHausTech/haus-workflow/commit/6c9ceefe73c022d0122609f03d39cdd4dbc8324c))
- **lockfile:** hash installed paths on apply and align update ([83decbf](https://github.com/WeAreHausTech/haus-workflow/commit/83decbf5c1295c20c5f4e6e943b85f8218df27f4))
- **p10:** add release-it with conventional-changelog, package.json release scripts ([a6d6296](https://github.com/WeAreHausTech/haus-workflow/commit/a6d629640c7440d92af049d6eefc64fd4c977d8e))
- **p10:** pre-publish gate + release machinery ([0e94af4](https://github.com/WeAreHausTech/haus-workflow/commit/0e94af422ed9de22389f229924030326e41bb7fb))
- **p5:** global install layout — haus install / uninstall + HAUS-MANAGED markers ([2cf017a](https://github.com/WeAreHausTech/haus-workflow/commit/2cf017aeda799f4874a775c9dd9248e9a8857afe))
- **p6:** minimal root CLAUDE.md generator with managed import block ([4b060ca](https://github.com/WeAreHausTech/haus-workflow/commit/4b060ca6e31bd82628f5020caffba060cbd66958))
- **p7:** catalog repo split — move skills/agents/templates to haus-workflow-catalog ([64ef755](https://github.com/WeAreHausTech/haus-workflow/commit/64ef755213a532c2c9446981bfdf8c22718bb210))
- **p8:** remote catalog fetch + haus update self-sync ([cdd6925](https://github.com/WeAreHausTech/haus-workflow/commit/cdd6925c3ccb702bb2ebf578ac0b428ad5fe836a))
- **p9a:** rename package to @haus-tech/haus-workflow, remove plugin/marketplace refs ([73de05b](https://github.com/WeAreHausTech/haus-workflow/commit/73de05b0628770f9deef64571bea1bba72481401))
- persist lockfile hashes and generated path metadata ([95baff1](https://github.com/WeAreHausTech/haus-workflow/commit/95baff17725757df669fa62eb81ab2e69d311476))
- **plugin:** rewrite haus-setup-project skill with conversational flow ([288b98b](https://github.com/WeAreHausTech/haus-workflow/commit/288b98bb852eca1167c4e785df199feddef4b227))
- **pr6:** identifier-aware source stack scan and library audit ([598e62e](https://github.com/WeAreHausTech/haus-workflow/commit/598e62e97315c554956195746177ccd7b91620bb))
- **pr6:** manifest-aware audit plus plugin skill and agent gates ([79a4f88](https://github.com/WeAreHausTech/haus-workflow/commit/79a4f88288e69c91dc4d84d978aa6f87f89ff091))
- **qa:** add validation harness and PR1 findings ([dbdfdaf](https://github.com/WeAreHausTech/haus-workflow/commit/dbdfdaf0eefc3bf796b92e66a8f0120ebb732f01))
- **recommend:** add baseline selection mode ([e331c55](https://github.com/WeAreHausTech/haus-workflow/commit/e331c55fbc5db2999d5f0ac373c4d9e49422aebf))
- **recommend:** add confidence bands and skip reasons ([a3ab911](https://github.com/WeAreHausTech/haus-workflow/commit/a3ab911808432f98fed9598242ad4edb4df38835))
- **recommend:** calibrate scoring and confidence ([b741d51](https://github.com/WeAreHausTech/haus-workflow/commit/b741d51d507b63480afd6f74f1c860fa1eb4f54b))
- **recommend:** surface scan security risks in warnings and scoring ([4bcf52a](https://github.com/WeAreHausTech/haus-workflow/commit/4bcf52abe4c4fea2f6bc3ce6c4e380519e0cf80d))
- **references:** add stack-specific official doc URLs to skill references ([bf89212](https://github.com/WeAreHausTech/haus-workflow/commit/bf892120cb0b57381fa7e3849f988c0c3f427879))
- rename cli command to haus and add command scaffold ([60b1f34](https://github.com/WeAreHausTech/haus-workflow/commit/60b1f34162ed64e588eb2d6686486fcfcb25bc0f))
- **skills:** add curation contract and core router skills ([a9420d5](https://github.com/WeAreHausTech/haus-workflow/commit/a9420d546c8b0ba8cb35cba95ad5089d1bf9492c))
- **skills:** de-alias stack catalog and concrete stack routers ([06bc592](https://github.com/WeAreHausTech/haus-workflow/commit/06bc592a35166dcea9fdef52028b6c19b4f7b221))
- **skills:** expand 27 stub reference files and add depth audit (PR9) ([d868f5f](https://github.com/WeAreHausTech/haus-workflow/commit/d868f5f816b54224d8797eaa3c4932cfd0e2908c))

### Bug Fixes

- **boundaries:** address Copilot review on setup-project ([e4f7b2c](https://github.com/WeAreHausTech/haus-workflow/commit/e4f7b2cb96ddedbb3c3513afde022ea9dc03eec3))
- **boundaries:** eliminate cross-command imports in src/commands/ ([8f80869](https://github.com/WeAreHausTech/haus-workflow/commit/8f808693a4755641a6db755ffa6ee6ec1a02a811))
- **ci:** pin workflows to Node 22 ([9718a95](https://github.com/WeAreHausTech/haus-workflow/commit/9718a95fe318e358882750006a2612d6fc771781))
- **ci:** restrict quality to pull_request, add permissions, expand source-check paths ([2263303](https://github.com/WeAreHausTech/haus-workflow/commit/226330365129ef7b5a17ec60c7dcdf7eccaec480))
- **cleanup:** tighten marker regex, dedupe by file, drop continue-on-error ([f2231be](https://github.com/WeAreHausTech/haus-workflow/commit/f2231be7a4760e49ca0d0ffb124d402d79289cb7))
- **context:** support legacy recommendation schema ([eb60ad4](https://github.com/WeAreHausTech/haus-workflow/commit/eb60ad46a1276bd0df82d9e930bafa0361692f3e))
- **curated:** address Copilot review comments on PR6 ([1909dc6](https://github.com/WeAreHausTech/haus-workflow/commit/1909dc66d9f03daded132e2a26128b4041c915b1))
- **curated:** align schema and add negative test for targetPath gate ([a71d6e5](https://github.com/WeAreHausTech/haus-workflow/commit/a71d6e5082c9b185e21518f903f2e5926a2c3217))
- **exec:** make commandExists return false on spawn errors ([335a4f1](https://github.com/WeAreHausTech/haus-workflow/commit/335a4f150b2dabaf1a188e696b6b271a040662db))
- **explain,test:** tighten golden intent equality and preserve skip-reason signal ([1047bb8](https://github.com/WeAreHausTech/haus-workflow/commit/1047bb8bee38f4552e81599ebe1cbd8747468103))
- harden guardrails and lock/source logic ([96e9bab](https://github.com/WeAreHausTech/haus-workflow/commit/96e9bab4254d560b07ff8ca46f2daaf5b0dfd353))
- **hooks:** address Copilot review on PR [#26](https://github.com/WeAreHausTech/haus-workflow/issues/26) ([56be0d9](https://github.com/WeAreHausTech/haus-workflow/commit/56be0d90d0361dbb7c665297639e1ecdea9aed7b))
- **install:** close 5 code-review findings ([3d4de13](https://github.com/WeAreHausTech/haus-workflow/commit/3d4de134abca2143ea3bed0337f37e30b9278d4e))
- **output:** print repo-relative paths in CLI ([b0fc2b6](https://github.com/WeAreHausTech/haus-workflow/commit/b0fc2b6da9d5348e9031d556fe58a28e9848aa7b))
- **p10:** address 4 Copilot review findings ([cd505ff](https://github.com/WeAreHausTech/haus-workflow/commit/cd505ff528215c608a2444e3b976a6698a4a6071))
- **p10:** address 4 Copilot review findings ([783ca4b](https://github.com/WeAreHausTech/haus-workflow/commit/783ca4b685e9cc87f3105eed11094c66a0d11d28))
- **p3:** address Copilot review on cleanup-status markers ([663adf6](https://github.com/WeAreHausTech/haus-workflow/commit/663adf64546d3eb25189d591c8fe7f2e47d1dbab))
- **p4:** address Copilot review — restore catalog-audit CI step and scrub stale doc references ([f5a4e69](https://github.com/WeAreHausTech/haus-workflow/commit/f5a4e69a50b82000af1d2217e3f93da5086f1ffa))
- **p5-p6:** close audit gaps before PR ([4fa8e3f](https://github.com/WeAreHausTech/haus-workflow/commit/4fa8e3f8686dff04682c983931ab849044cb7fbd))
- **p7:** address 3 Copilot review findings; add fixture stubs for apply test ([6f73b78](https://github.com/WeAreHausTech/haus-workflow/commit/6f73b786b9e8979f08c74288d21f74b8900eb106))
- **p8:** address 4 Copilot review findings ([fabb114](https://github.com/WeAreHausTech/haus-workflow/commit/fabb114ac1ab79f7a4dd1e6cd5d139a9002eaa99))
- **p8:** remove unused execaSync import from remote-catalog test ([46a7919](https://github.com/WeAreHausTech/haus-workflow/commit/46a791932246bbc383b092d4cedea8390c0232ca))
- **p9a:** address 2 Copilot review findings ([9d38600](https://github.com/WeAreHausTech/haus-workflow/commit/9d38600d24b80cfcfaf368cc79cf1da45b210475))
- **paths:** use os.homedir for display path shortening ([04543fd](https://github.com/WeAreHausTech/haus-workflow/commit/04543fdefa2983e03c42c09b5b560e3ba03c24b5))
- **plugin:** address Copilot review on install story PR ([4799b8a](https://github.com/WeAreHausTech/haus-workflow/commit/4799b8ab7d715b20d9d8d10e4e82b02d4b8c215a))
- **plugin:** correct install story and add marketplace registry ([a5b8f26](https://github.com/WeAreHausTech/haus-workflow/commit/a5b8f26f1e2c77c46f0a49e9c3de9b908d4c8bd8))
- **pr13:** address Copilot review comments ([28f80c4](https://github.com/WeAreHausTech/haus-workflow/commit/28f80c4ce00fdeeaa9aa861d69a7fdedced1a33d))
- **pre-commit:** add shebangs to hook files and fix lint-staged glob ([257108f](https://github.com/WeAreHausTech/haus-workflow/commit/257108f1236ef6410db8a7f6e6639160802be9a0))
- **recommend:** skip risk penalty for baselines ([6ee3317](https://github.com/WeAreHausTech/haus-workflow/commit/6ee331722ce68f1f58d6d446e90ce504d7f50d72))
- **recommend:** tighten relevance and explain scoring ([b2ed010](https://github.com/WeAreHausTech/haus-workflow/commit/b2ed0105e352423b29cb9c7bffd2f131b4f31ecd))
- **references:** address Copilot review comments on PR10 ([0498b22](https://github.com/WeAreHausTech/haus-workflow/commit/0498b22e38213c3e6dd16d9f565850ffb9b6eaed))
- **scanner:** refine wordpress role detection ([307eba9](https://github.com/WeAreHausTech/haus-workflow/commit/307eba929520adcbae41d3613d7c0cac98b364f6))
- scope lockfile paths to installed item files ([8e3d3cd](https://github.com/WeAreHausTech/haus-workflow/commit/8e3d3cdb95249dd022bd00e45b5e7885fa107bc0))
- **skills:** address Copilot review comments on PR9 ([e8a1355](https://github.com/WeAreHausTech/haus-workflow/commit/e8a1355913915d41f3ca2216f68c11f974a139d7))
- **sources:** add new source hosts to allowlist and remove python from voltagent containsStacks ([edf7061](https://github.com/WeAreHausTech/haus-workflow/commit/edf70618a0442ae34c144d0dbf5526b53d57ab96))
- stabilize ci smoke check and catalog fallback loading ([b47f15a](https://github.com/WeAreHausTech/haus-workflow/commit/b47f15aea777a6918491f23611737261896b4a9b))
- strict plugin hooks, post-apply self-check, doctor --hooks ([71253f5](https://github.com/WeAreHausTech/haus-workflow/commit/71253f59db1f56db9b41f282b16e1aec17392540))
- **task-intent:** normalize punctuation for keyword matching ([ea5db82](https://github.com/WeAreHausTech/haus-workflow/commit/ea5db82fbd223254e78f7eef8bba3cdcb3c6c74c))
- **task-intent:** scope graphql/database keywords to avoid frontend bleed ([e86d082](https://github.com/WeAreHausTech/haus-workflow/commit/e86d0824fcd1a00416b0241c0d93aeb4c3db7b73))
- tighten scanner apply update and plugin path handling ([5b79d3c](https://github.com/WeAreHausTech/haus-workflow/commit/5b79d3c346ae314ac0bc8fe9e43883f1800e027b))
- tighten scanner safety and PM detection ([6b3a0c3](https://github.com/WeAreHausTech/haus-workflow/commit/6b3a0c3fe6149082593162e2d23b355a288b9d5e))
- **tooling:** use directory args in lint/format scripts for cross-platform compat ([f6ef082](https://github.com/WeAreHausTech/haus-workflow/commit/f6ef0823927c7d47b94dcca05076cd9c9c6d2636))
- **track-b:** address Copilot review on dry-run, verbose context, init tests ([faf3bb6](https://github.com/WeAreHausTech/haus-workflow/commit/faf3bb6952ee9058a57872bdfdc22cf960329072))
- **types:** make CatalogItem.version optional ([684dd59](https://github.com/WeAreHausTech/haus-workflow/commit/684dd5928c3544c98181d9d1262bd2769fc450bf))
- update yarn.lock to exact pinned versions for release-it deps ([5cc4f63](https://github.com/WeAreHausTech/haus-workflow/commit/5cc4f638ed19fec6a1e712c0d583cacd74e31cab))
- **update:** preserve newline fidelity in lockfile diffs ([b9cb64d](https://github.com/WeAreHausTech/haus-workflow/commit/b9cb64d6ec61002591e0b7292fda02e2987335fc))
