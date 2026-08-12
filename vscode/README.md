# CoCo Agent for VS Code

Install the `coco-agent-0.3.5.vsix` asset from the CoCo `v0.3.5` release, start the local service with `coco control start`, and obtain its token with `coco control token`. Verify it first with the release `coco-agent-0.3.5.vsix.sha256` sidecar.

Commands:

- `CoCo: Create Background Task`
- `CoCo: Show Task History`
- `CoCo: Open Control Dashboard`
- `CoCo: Compare Active File with Git`

The extension stores the control token in VS Code SecretStorage. It sends selection and open-tab context only when you explicitly create a task.
