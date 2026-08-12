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
