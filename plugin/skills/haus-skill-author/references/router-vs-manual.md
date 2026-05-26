<!-- HAUS-PRERELEASE-CLEANUP: P4e — plugin/ directory removed; surviving skill content relocates to library/global/skills/ in P5. -->
# Router vs Manual

Router skill should:

- decide if skill applies
- point to exact references
- keep token footprint low

Manual content should live in references and be loaded only when needed.