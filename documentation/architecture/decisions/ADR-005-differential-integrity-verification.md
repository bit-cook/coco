# ADR-005: Differential Runtime Integrity Verification

```text
Status: proposed for 0.7.2
Date: 2026-08-24
Work items: post-0.7.1 maintenance (startup performance)
```

## Context

Every CoCo launch verifies the runtime tree against a content-addressed
manifest (21,369 files, 133 MB on a reference install). The original design
had two costs:

- The warm path re-statted every startup-closure file with a
  lstat/open/fstat/lstat chain (four syscalls per file) and allocated six
  snapshot objects per comparison.
- The cold path — any cache miss, any manifest change, any first run —
  re-read and re-hashed all 133 MB through an eight-syscall read helper and
  walked runtime roots with a sequential per-entry recursion.

Measured on the reference install: warm verification 2.8 s, cold
verification 6.8 s, interactive first paint about 4.5–5 s. A worker-thread
hashing experiment was measured at 8.7 s and rejected: the cold path is
syscall-bound (a sequential no-hash read of all manifest files already costs
2.8 s), not CPU-bound, so added concurrency only increased contention.

## Decision

1. **Differential cold verification.** When an approved cache for the exact
   manifest hash exists, an entry whose six-field stat (size, mtimeMs,
   ctimeMs, mode, dev, ino) still matches the cached snapshot is trusted
   unchanged and skips re-hashing; every other entry falls back to complete
   hashing. Any metadata drift, cache corruption, or manifest change disables
   reuse per file.
2. **Syscall diet for metadata-only checks.** The warm path never reads file
   contents, so its per-file check is a before/after lstat pair (two
   syscalls) instead of lstat/open/fstat/lstat; snapshot comparison is
   allocation-free field comparison.
3. **Slim verified reads.** Content reads use open(O_NOFOLLOW) plus pre/post
   fstat on the handle (five syscalls per file). Hashed bytes are attributed
   to the verified inode; a post-read path swap cannot retroactively alter
   that evidence, so path-level re-lstat is intentionally absent.
4. **Parallel metadata walks.** Runtime-root scans use readdir-only dirent
   walks, and directory/cache snapshot collection runs concurrently.

## Security Consequences

- No environment variable or forgeable property bypasses verification; the
  differential fast path is keyed to the manifest hash and lives in the same
  trusted-local trust level as the existing warm path.
- Any metadata change on any file falls back to complete hashing of that
  file; a deleted or corrupted cache forces full hashing.
- Symlink rejection is preserved everywhere: O_NOFOLLOW at open, dirent-type
  rejection during walks, and isFile checks on every stat.
- The snapshot CAS reuse contract (reject symlinks, corruption, identity
  drift by content hash) is intentionally untouched; the runtime snapshot
  store still re-hashes on reuse.

## Operational Consequences

Measured after implementation on the reference install: warm verification
1.3–1.5 s (FAST), cold verification 4.3 s, post-update differential
verification 3.5–4.0 s, interactive first paint about 2.5 s. Cache files
remain private, atomically replaced, and schema-versioned.

## Alternatives Rejected

- Worker-thread hashing (measured slower; syscall-bound workload).
- Relaxed snapshot-CAS reuse (violates the corruption-rejection invariant).
- Trusting directory topology without per-file metadata (loses per-file
  drift fallback).

## Tests

- test/task-3-runtime-integrity.test.mjs — full integrity suite 39/39, including warm-cache approval, metadata-drift fallback to complete hashing, symlink rejection, and tamper fail-closed recovery.
- Reference-install measurements recorded in the journal: warm FAST 1.3–1.5 s, cold 4.3 s, differential post-update 3.5–4.0 s, first paint 2.5 s; one-byte tamper rejected as RUNTIME_INTEGRITY_MISMATCH and re-approved after restore.
