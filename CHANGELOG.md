# Changelog

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
