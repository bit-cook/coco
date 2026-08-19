# CoCo Backup and Restore

This is the canonical operator entry for complete project backup and recovery. The latest verified backup set is stored outside the repository so a damaged worktree cannot damage its own backup.

## Latest Backup Set

```text
backup ID: coco-full-20260817T190344Z
directory: /root/coco-tmp/coco-backups/coco-full-20260817T190344Z
source branch at capture: candidate/v0.6.2
source commit before documentation finalization: f66bb6be604317a13eafdc4b57ea6726f957c8cf
released version: 0.6.1
```

After this document is committed, the bundle and source archive are regenerated once more and `metadata/final-backup-facts.txt` records the final documentation commit. Always trust the backup's `SHA256SUMS` and final facts over prose copied elsewhere.

## What Is Included

| Layer | Artifact | Purpose |
|---|---|---|
| Complete Git history | `coco-all-refs.bundle` | All local branches, remote-tracking refs, tags, commits, trees, and blobs |
| Committed source | `coco-source-<commit>.tar.gz` | Fast source-only extraction without Git |
| Physical dependencies | `coco-node_modules-<commit>.tar.gz` | Exact local dependency tree including symlinks and patched bundled Pi |
| Published release | `release-v0.6.1/` | All nine GitHub Release assets and release checksums |
| Remote metadata | `metadata/github-*.json` | Repository, Actions, workflows, releases, Pages, environments, secret names, and variable metadata |
| Git metadata | `metadata/git-*.txt` | Refs, worktrees, remotes, local config, fsck, log, object counts, and file inventory |
| Restore evidence | `metadata/restore-drill.txt` | Commands and results from an isolated restore drill |
| Integrity | `SHA256SUMS` | SHA-256 for every regular backup file except the checksum file itself |

## What Is Intentionally Excluded

This unencrypted project backup does not copy:

- `/root/.coco` user state, because it may contain provider credentials, task prompts, logs, webhook secrets, and runtime artifacts.
- `/root/.config/opencode`, because it contains provider API keys and local tool configuration.
- GitHub secret values; GitHub exposes names and metadata but never values.
- Temporary test directories, caches, coverage, and generated local evidence outside Git.

Back up sensitive state only to encrypted media with a separately managed key. Do not place decrypted credentials beside this project backup.

## Verify Before Restore

```bash
BACKUP=/root/coco-tmp/coco-backups/coco-full-20260817T190344Z
cd "$BACKUP"
sha256sum --check SHA256SUMS
git bundle verify coco-all-refs.bundle
```

Release checks:

```bash
cd "$BACKUP/release-v0.6.1"
sha256sum --check SHA256SUMS
sha256sum --check coco-0.6.1.tgz.sha256
sha256sum --check coco-0.6.1-offline-linux-x64.zip.sha256
sha256sum --check coco-agent-0.6.1.vsix.sha256
```

Stop if any check fails. Do not restore from a partially verified set.

## Restore the Complete Repository

Restore into a new directory. Never reset or overwrite an existing worktree.

```bash
BACKUP=/root/coco-tmp/coco-backups/coco-full-20260817T190344Z
DEST=/root/coco-tmp/coco-restored

test ! -e "$DEST"
git clone "$BACKUP/coco-all-refs.bundle" "$DEST"
git -C "$DEST" fsck --full
git -C "$DEST" switch candidate/v0.6.2
```

Confirm the expected commit from `metadata/final-backup-facts.txt`:

```bash
git -C "$DEST" rev-parse HEAD
```

Configure a remote only after the offline restore has been verified:

```bash
git -C "$DEST" remote set-url origin https://github.com/bit-cook/coco.git
git -C "$DEST" remote -v
```

Do not fetch, pull, rebase, or push during initial recovery.

## Restore Physical Dependencies

The dependency archive is optional but lets recovery avoid a mutable registry install.

```bash
BACKUP=/root/coco-tmp/coco-backups/coco-full-20260817T190344Z
DEST=/root/coco-tmp/coco-restored

test ! -e "$DEST/node_modules"
tar -xzf "$BACKUP/coco-node_modules-f66bb6b.tar.gz" -C "$DEST"
cd "$DEST"
npm run verify:closure
```

If the filename changes in a later regenerated backup, use the exact name listed by `SHA256SUMS` and `metadata/final-backup-facts.txt`.

## Restore Source Without Git

Use this only for inspection or emergency source extraction. It does not restore branches or history.

```bash
BACKUP=/root/coco-tmp/coco-backups/coco-full-20260817T190344Z
DEST=/root/coco-tmp/coco-source-only

mkdir "$DEST"
tar -xzf "$BACKUP"/coco-source-*.tar.gz -C "$DEST"
```

Prefer the Git bundle for real development recovery.

## Restore or Inspect the Published Release

The release directory is a byte-for-byte downloaded copy of GitHub Release `v0.6.1`.

```bash
BACKUP=/root/coco-tmp/coco-backups/coco-full-20260817T190344Z
ls -l "$BACKUP/release-v0.6.1"
```

It contains:

```text
coco-0.6.1.tgz
coco-0.6.1.tgz.sha256
coco-0.6.1-offline-linux-x64.zip
coco-0.6.1-offline-linux-x64.zip.sha256
coco-agent-0.6.1.vsix
coco-agent-0.6.1.vsix.sha256
install.sh
uninstall.sh
SHA256SUMS
```

These assets are for release recovery and verification. They do not contain the uncommitted `0.6.2` candidate.

## Restore Sensitive User State Separately

If an encrypted backup of `/root/.coco` exists:

1. Restore it only after the project and executable have been verified.
2. Restore into a private temporary directory first.
3. Verify ownership and modes; directories should normally be `0700`, private files `0600`.
4. Scan for symlinks and unexpected special files.
5. Start with network disabled and run local status/doctor checks.
6. Rotate provider and webhook credentials after disaster recovery.

Never restore OpenCode or CoCo credentials from an unencrypted archive.

## Post-Restore Validation

Minimum validation:

```bash
cd /root/coco-tmp/coco-restored
git status --short --branch
git diff --check
node -p "require('./package.json').version"
npm run verify:closure
node --test test/development-plan-contract.test.mjs test/external-agent-research-contract.test.mjs
COCO_SCANNER_TMPDIR=/root/coco-tmp npm run verify:secrets
```

Before publishing or resuming P0 implementation, also run the current focused tests and complete gates defined in `DEVELOPMENT_PLAN.md` and `development/GENERATED_ASSETS.md`.

## Off-Host Rotation for 0.6.3

Mount an independently administered NFS, SSHFS, or object-storage filesystem at a private path. CoCo treats that mount as a credential-free store; mount credentials remain in the operating system and are never passed to CoCo.

Provide the authentication and state-encryption keys through the process environment, preferably from the service manager or a secret manager:

```bash
export COCO_BACKUP_AUTH_KEY='<base64 HMAC key>'
export COCO_BACKUP_STATE_KEY='<base64 32-byte AES key>'
```

Create the authenticated backup set locally, then publish the completed set atomically to the mounted off-host store:

```bash
coco backup create \
  --source-dir /root/coco-tmp/coco-backups/current \
  --offsite-dir /root/coco-tmp/coco-backups/rotation \
  --retention-days 30

coco backup store-publish \
  --store-root /mnt/coco-offsite \
  --id backup-20260818T230000Z \
  --source-dir /root/coco-tmp/coco-backups/rotation/backup-20260818T230000Z
```

List and fetch a set for an isolated restore drill:

```bash
coco backup store-list --store-root /mnt/coco-offsite
coco backup store-fetch \
  --store-root /mnt/coco-offsite \
  --id backup-20260818T230000Z \
  --destination-dir /root/coco-tmp/coco-offsite-restore

coco backup restore-drill \
  --backup-dir /root/coco-tmp/coco-offsite-restore \
  --destination-dir /root/coco-tmp/coco-restore-drill
```

The store publishes through an incomplete private directory and exposes the final backup ID only after the copy is complete. It rejects overwrite, symlink, special-file, traversal, and partial-object cases. Do not mount the off-host store inside the source tree.

The manual `Backup Drill` workflow performs the same authentication and restore check across two isolated GitHub-hosted jobs. The first job uploads a one-day Actions artifact; the second downloads and verifies it before restoring the Git bundle. Its two repository secrets are drill-only keys and should be removed after the run.

## Recovery Decision Tree

- Deleted or damaged worktree, Git history intact elsewhere: clone the bundle.
- Git objects damaged: verify the bundle, then clone into a new directory.
- Registry unavailable: restore the physical dependency archive and verify closure.
- GitHub Release unavailable: use the verified release directory.
- Only source inspection required: extract the source archive.
- Credentials or user tasks lost: restore only from a separate encrypted state backup; this project backup intentionally cannot recover secrets.

## Never Do This

- Do not run `git reset --hard` against a damaged or dirty worktree as a recovery method.
- Do not extract this backup over `/root/coco` or another user worktree.
- Do not skip SHA-256 or bundle verification.
- Do not copy API keys into recovery documentation or metadata.
- Do not push restored refs until local fsck, closure, tests, and operator review pass.

## Backup Maintenance

Create a new timestamped backup after every release and before schema, supervisor, containment, or publication changes. Never overwrite a previously verified backup set. Record every set in `HISTORICAL_DOCUMENTS.md` and perform an isolated restore drill.
