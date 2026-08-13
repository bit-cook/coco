# Self-hosted runner policy

CoCo uses a dedicated self-hosted runner for GitHub Pages because the GitHub-hosted queue can delay static-site publication for an unbounded period.

## Pages runner

- Required labels: `self-hosted`, `linux`, `x64`, `coco-pages`.
- Scope: the `Pages` workflow only.
- Work directory: dedicated to CoCo Pages jobs.
- Permissions: repository read, Pages write, and OIDC only as declared by the workflow.
- Do not add the `coco-pages` label to general-purpose runners.
- Do not change CI or Release jobs to generic `self-hosted`; each workload needs an explicit dedicated label and reviewed trust boundary.

## Operating rule

Prefer the dedicated self-hosted path for Pages and other explicitly approved local publication jobs. Do not wait on GitHub-hosted runners when the same deterministic job can run on an online, dedicated CoCo runner.

Runner registration tokens are short-lived operational secrets. They must never be committed, logged in reports, or stored in repository configuration.

## CI runner

- Required labels: `self-hosted`, `Linux`, `X64`, `coco-ci`.
- Scope: CI verification and integrity jobs only.
- High-load jobs run serially on one dedicated runner.
- Fork pull requests must never execute on a self-hosted runner. They require maintainer review and a controlled branch run.
- `TMPDIR` and `COCO_SCANNER_TMPDIR` must use `/root/coco-tmp`; the shared `/tmp` tmpfs is not suitable for package extraction or integrity tests.
- Release publication remains on a separately reviewed runner boundary.

## Upstream compatibility runner

- Required labels: `self-hosted`, `Linux`, `X64`, `coco-upstream`.
- Scope: scheduled/manual public npm candidate compatibility probes only.
- It must not execute pull requests, publish releases, deploy Pages, or modify the repository.
- Candidate receipts are advisory and must always set `promotionAuthorized: false`.
