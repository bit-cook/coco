# ADR-004: Explicit Platform Support Policy

```text
Status: proposed; decision required before 0.8.0
Date: 2026-08-16
```

## Context

Published installers support Linux and macOS, the release publishes only a Linux x64 offline bundle, CI is Ubuntu-only, and Windows has partial runtime code but no complete installation or lifecycle path.

## Decision Required

Choose one policy:

- Linux and macOS are supported; Windows is explicitly unsupported in npm preflight and documentation.
- Windows becomes supported only after PowerShell install/uninstall, offline delivery, Job Object containment, and full lifecycle CI exist.

For all supported platforms, CI must cover minimum Node, installer-pinned Node, and current LTS.

## Security Consequences

Unsupported platforms cannot silently receive weaker containment or lifecycle guarantees.

## Operational Consequences

macOS requires real install, upgrade, Control, task cancellation, and uninstall smoke. Windows support materially expands installer and containment scope.

## Alternatives Rejected

- Imply support because the npm bin can execute.
- Claim process-tree termination without a platform containment mechanism.

## Tests

Platform-native clean install, upgrade, offline install, Control lifecycle, cancellation, cleanup, and uninstall matrices.
