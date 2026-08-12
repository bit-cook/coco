import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readCanonicalJson } from "./canonical-json.mjs";

const defaultRoot = fileURLToPath(new URL("..", import.meta.url));
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const value = (input, path) => { let current = input; for (const key of path) current = current?.[key]; if (typeof current !== "string" || current.length === 0) fail("PRODUCT_MANIFEST_INVALID"); return current; };

export function productIdentitySource(manifest) {
  if (manifest?.schemaVersion !== 1) fail("PRODUCT_MANIFEST_INVALID");
  const fields = [
    ["PRODUCT_COMMAND", ["product", "command"]], ["PRODUCT_CONFIG_DIR", ["product", "configDir"]], ["PRODUCT_NAME", ["product", "name"]],
    ["PRODUCT_VERSION", ["product", "version"]], ["UPSTREAM_PACKAGE", ["upstream", "package"]], ["UPSTREAM_VERSION", ["upstream", "version"]],
  ];
  return `// Generated from resources/product-manifest.v1.json by scripts/generate-product-identity.mjs.\n// Do not edit directly.\n\n${fields.map(([name, path]) => `export const ${name} = ${JSON.stringify(value(manifest, path))};`).join("\n")}\n`;
}

export async function generateProductIdentity({ check = true, root = defaultRoot } = {}) {
  let parsed;
  try { ({ parsed } = await readCanonicalJson(join(root, "resources", "product-manifest.v1.json"), "PRODUCT_MANIFEST_INVALID")); }
  catch { fail("PRODUCT_MANIFEST_INVALID"); }
  const expected = productIdentitySource(parsed); const output = join(root, "scripts", "product-identity.generated.mjs");
  const current = await readFile(output, "utf8").catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (current === expected) return { changed: false, status: "approved" };
  if (check) fail("PRODUCT_IDENTITY_OUT_OF_DATE");
  await mkdir(join(root, "scripts"), { recursive: true }); const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, expected, { mode: 0o644 }); await rename(temporary, output); return { changed: true, status: "written" };
}

function cli(argv) { if (argv.length !== 1 || !["--check", "--write"].includes(argv[0])) fail("PRODUCT_IDENTITY_USAGE"); return argv[0] === "--check"; }
if (process.argv[1] === fileURLToPath(import.meta.url)) { let check; try { check = cli(process.argv.slice(2)); } catch (error) { console.error(error.code); process.exit(64); } generateProductIdentity({ check }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.code ?? error.message); process.exitCode = 1; }); }
