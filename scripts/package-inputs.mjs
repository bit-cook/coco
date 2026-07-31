import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("./package-input-helper.py", import.meta.url));

function rejected(code) { return { code, status: "rejected" }; }

function canonical(value) { return `${JSON.stringify(value)}\n`; }

export async function snapshotPackageInputs({ globalRoot, onCheckpoint, root }) {
  return new Promise((resolve) => {
    const process = spawn("python3", [helper], { stdio: ["pipe", "pipe", "pipe"] });
    const requestId = randomUUID();
    let buffer = "";
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
    const fail = () => finish(rejected("PACKAGE_INPUT_INVALID"));
    process.once("error", fail);
    process.stderr.resume();
    process.stdout.setEncoding("utf8");
    process.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { process.kill(); fail(); return; }
        if (message.kind === "checkpoint" && message.id === requestId && typeof message.name === "string") {
          Promise.resolve(onCheckpoint?.(message.name)).then(
            () => process.stdin.write(canonical({ id: requestId, kind: "continue" }), (error) => { if (error) fail(); }),
            () => { process.kill(); fail(); },
          );
        } else if (message.kind === "result" && message.id === requestId && typeof message.result === "object" && message.result !== null) {
          finish(message.result);
        } else { process.kill(); fail(); }
      }
    });
    process.once("close", () => { if (!settled) fail(); });
    process.stdin.write(canonical({ globalRoot, id: requestId, kind: "snapshot", root }));
  });
}
