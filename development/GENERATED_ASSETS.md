# Generated Assets and Evidence Freshness

Read this file before running `npm run build` or editing generated JSON.

## Canonical Build Order

```text
1. Freeze governed source and packaged documentation.
2. npm run build
3. focused tests
4. typechecks and git diff --check
5. complete integrity/core/package/lifecycle gates
6. commit generated outputs with their source changes
```

## Generators

| Source category | Command | Outputs |
|---|---|---|
| Product version/manifest | `node scripts/generate-product-identity.mjs --write` | `scripts/product-identity.generated.mjs` and identity projections |
| Package inventory | `node scripts/generate-asset-map.mjs` | `scripts/package-asset-map.v1.json` |
| Runtime integrity | `node scripts/generate-runtime-integrity-manifest.mjs` | `resources/runtime-integrity-manifest.v1.json` and `.sha256` |
| Full generated batch | `npm run build` | all applicable outputs above plus identity patching |

## Freshness Rules

- `scripts/coco-bootstrap.cjs`, launcher, runtime integrity/store, resources, bundled dependencies, or packaged scripts make runtime integrity, core, integrity, and package evidence stale.
- Packaged documentation changes make package asset map and package evidence stale; run the documented build to determine runtime-manifest impact.
- `site/**` changes affect Pages contracts and deployment, not runtime integrity.
- `test/**` changes affect test evidence but are not published runtime inputs unless a package contract explicitly says otherwise.
- `.opencode/**` is local execution evidence and is excluded from npm and runtime roots.
- Release workflow changes make release-contract evidence stale but do not by themselves change runtime assets.

## Prohibitions

- Do not use a generated hash to conceal unreviewed source changes.
- Do not run build repeatedly during active parallel edits.
- Do not call old green evidence current after generation or governed edits.
- Do not hand-edit sidecar hashes.

## Required Record

Every generation checkpoint records source files, command, changed outputs, tests run, commit binding, and which prior evidence became stale.
