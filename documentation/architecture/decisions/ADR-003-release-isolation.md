# ADR-003: Isolated Build and Atomic Publication

```text
Status: proposed for 0.6.2
Date: 2026-08-16
Work items: REL-001, REL-002, REL-003, REL-004, REL-005
```

## Context

The current release job executes repository and dependency code while holding write credentials, creates a public release before final validation, permits asset clobbering, and independently repacks the offline package.

## Decision

Adopt a four-stage model:

1. Read-only build-and-verify with no persisted checkout credential.
2. Minimal-write draft creation/upload with no checkout or code execution.
3. Read-only draft download and online/offline/VSIX lifecycle verification.
4. Minimal-write publish after revalidating the draft, exact artifact contract, verification receipt, run attempt, tag, and commit.

Publication is draft-first and immutable. The offline bundle consumes the exact verified public tarball. Remote verification completes before the draft becomes public.

## Security Consequences

- Compromised build code cannot use a repository write token.
- Failed validation cannot expose a public partial release.
- Same-version assets cannot be replaced.
- Online and offline users receive the same CoCo package bytes.

## Operational Consequences

Workflow artifacts need exact inventory, digest retention, and a disposable-tag dry-run procedure.

## Alternatives Rejected

- One write-enabled job.
- Public-first release with post-upload validation.
- `--clobber` retries.
- A second offline `npm pack`.

## Tests

Workflow permissions/contracts, draft failure injection, exact remote asset inventory, package digest equality, online/offline install, uninstall, and VSIX verification.
