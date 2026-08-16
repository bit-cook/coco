import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { homedir } from "node:os";

const root = fileURLToPath(new URL("..", import.meta.url));
const agentDir = process.env.COCO_CODING_AGENT_DIR || resolve(homedir(), ".coco", "agent");
const { verifyRuntimeIntegrity } = await import("./runtime-integrity.mjs");
const integrity = await verifyRuntimeIntegrity({ root, cachePath: resolve(process.env.COCO_RUNTIME_INTEGRITY_CACHE_PATH || resolve(agentDir, ".runtime-integrity-cache.json")) });
if (integrity.status !== "approved") {
  process.stderr.write(`coco: ${integrity.code}\n`);
  process.exitCode = 1;
} else {
  const { applyCocoIdentity, resolveCocoRuntime } = await import("./coco-runtime-identity.mjs");
  const runtime = await resolveCocoRuntime({ root });
  if (runtime.status !== "approved") {
    process.stderr.write(`coco: ${runtime.code}\n`);
    process.exitCode = 1;
  } else {
    applyCocoIdentity(runtime);
    // runtime.root is realpath(resolve(root)): when it resolves to the same
    // directory, the verification above already covered it. Skipping the
    // duplicate scan cuts cold-start cost roughly in half.
    const finalIntegrity = resolve(root) === runtime.root
      ? integrity
      : await verifyRuntimeIntegrity({ root: runtime.root });
    if (finalIntegrity.status !== "approved") {
      process.stderr.write(`coco: ${finalIntegrity.code}\n`);
      process.exitCode = 1;
    } else {
      let preflight;
      const { ProjectResourcePreflightError } = await import("./project-resource-preflight.mjs");
      try {
        const { preflightProjectResources } = await import("./project-resource-preflight.mjs");
        preflight = await preflightProjectResources({ root: runtime.root });
        const { dispatchCoco } = await import("./coco-dispatcher.mjs");
        const dispatch = await dispatchCoco({ root: runtime.root });
        if (dispatch.kind === "native") process.exitCode = dispatch.exitCode;
        else {
          await import(pathToFileURL(`${runtime.root}/resources/coco-runtime-resource.mjs`).href);
          await import(pathToFileURL(runtime.piCli).href);
        }
      } catch (error) {
        process.stderr.write(`coco: ${error instanceof ProjectResourcePreflightError ? error.code : "PROJECT_RESOURCE_PREFLIGHT_FAILED"}\n`);
        process.exitCode = 1;
      } finally { await preflight?.close(); }
    }
  }
}
