# Tests and Validation

Default validation sequence:

1. targeted test for changed behavior
2. `yarn build`
3. `yarn test`
4. `yarn catalog:audit`
5. `yarn sources:audit`

Include `yarn sources:decisions` when curation files change.
