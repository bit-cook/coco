# CoCo Agent for VS Code

Install the `coco-agent-0.7.1.vsix` asset from the CoCo `v0.7.1` release, start the local service with `coco control start`, and obtain its token with `coco control token`. Verify it first with the release `coco-agent-0.7.1.vsix.sha256` sidecar.

Commands:

- `Create Background Task`
- `Show Task History`
- `Open Control Dashboard`
- `Compare Active File with Git`

The extension stores the control token in VS Code SecretStorage. It sends selection and open-tab context only when you explicitly create a task.
