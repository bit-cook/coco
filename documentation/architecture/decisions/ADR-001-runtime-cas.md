# ADR-001: Persistent Verified Runtime CAS

```text
Status: accepted
Date: 2026-08-16
```

## Context

Detached runner and Control processes must survive parent exit without depending on a mutable source checkout. Startup integrity must also reject runtime tampering without exposing prompts or secrets.

## Decision

Materialize a private content-addressed runtime keyed by manifest hash, Node ABI, platform, and architecture. Use private staging, completion-last publication, atomic rename, process-identity locks, leases, storage budgets, and garbage collection. Direct launcher invocation verifies itself; bootstrap may hand one same-process, immediately consumed verification capability to avoid duplicate scanning.

## Security Consequences

- No environment variable is a verification bypass.
- Metadata caches are trusted-local acceleration only; changes fall back to complete hashing.
- Critical launcher/policy/manifest entries remain content verified.
- Symlink, special-file, completion, and identity drift reject.

## Operational Consequences

- Runtime and compile cache require bounded GC and disk/inode diagnosis.
- Cold materialization is more expensive; warm startup is optimized without weakening fallback verification.

## Alternatives Rejected

- Execute directly from mutable package source.
- Environment nonce to skip verification.
- Rehash the same CAS repeatedly in bootstrap and launcher.

## Tests

Runtime integrity, CAS tamper/rebuild, lock identity, cache corruption, source race, direct launcher, storage budget, and detached lifecycle suites.
