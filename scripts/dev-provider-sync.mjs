import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { StateError } from "./state-schema.mjs";
import { syncProviderModelsFromSourceFixture } from "./provider-sync.mjs";

const MARKER = ".coco-provider-sync-test-root";

function fail() { throw new StateError("TEST_SEAM_FORBIDDEN"); }

async function fixtureOrigin(origin, root) {
  if (process.env.NODE_ENV !== "test" || resolve(process.cwd()) !== resolve(root)) fail();
  const marker = `${root}/${MARKER}`;
  try {
    const info = await lstat(marker);
    if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0) || (await readFile(marker, "utf8")) !== "coco-source-test-root-v1\n") fail();
  } catch (error) { if (error instanceof StateError) throw error; fail(); }
  let url;
  try { url = new URL(origin); } catch { fail(); }
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]") || url.port === "" || !/^[1-9][0-9]{0,4}$/.test(url.port) || Number(url.port) > 65535 || url.pathname !== "/" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") fail();
  return url.origin;
}

export async function syncProviderModelsForTest({ agentDir, allowEmpty = false, origin, provider, root }) {
  const fixture = await fixtureOrigin(origin, root);
  return syncProviderModelsFromSourceFixture({ agentDir, allowEmpty, origin: fixture, provider, root });
}
