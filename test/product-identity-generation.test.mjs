import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { generateProductIdentity, productIdentitySource } from "../scripts/generate-product-identity.mjs";
import { MANAGED_PROVIDER_IDS, PROVIDER_CREDENTIAL_ENV } from "../scripts/product-identity.generated.mjs";

const project = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(await readFile(join(project, "resources", "product-manifest.v1.json"), "utf8"));

test("committed product identity is the deterministic projection of the product manifest", async () => {
  const output = await readFile(join(project, "scripts", "product-identity.generated.mjs"), "utf8");
  assert.equal(output, productIdentitySource(manifest));
  const before = await stat(join(project, "scripts", "product-identity.generated.mjs"));
  assert.deepEqual(await generateProductIdentity({ check: true, root: project }), { changed: false, status: "approved" });
  const after = await stat(join(project, "scripts", "product-identity.generated.mjs"));
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.deepEqual(MANAGED_PROVIDER_IDS, Object.keys(manifest.providers));
  assert.deepEqual(PROVIDER_CREDENTIAL_ENV, Object.fromEntries(Object.entries(manifest.providers).map(([id, provider]) => [id, provider.credentialEnv])));
});

test("check rejects stale output and write repairs it without rewriting current bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-product-identity-"));
  try {
    await Promise.all([mkdir(join(root, "resources")), mkdir(join(root, "scripts"))]);
    await writeFile(join(root, "resources", "product-manifest.v1.json"), canonicalJson(manifest));
    await writeFile(join(root, "scripts", "product-identity.generated.mjs"), "stale\n");
    await assert.rejects(() => generateProductIdentity({ check: true, root }), (error) => error.code === "PRODUCT_IDENTITY_OUT_OF_DATE");
    assert.deepEqual(await generateProductIdentity({ check: false, root }), { changed: true, status: "written" });
    assert.equal(await readFile(join(root, "scripts", "product-identity.generated.mjs"), "utf8"), productIdentitySource(manifest));
    const before = await stat(join(root, "scripts", "product-identity.generated.mjs"));
    assert.deepEqual(await generateProductIdentity({ check: false, root }), { changed: false, status: "approved" });
    const after = await stat(join(root, "scripts", "product-identity.generated.mjs")); assert.equal(after.mtimeMs, before.mtimeMs);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("generator rejects noncanonical or incomplete product manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-product-invalid-"));
  try {
    await Promise.all([mkdir(join(root, "resources")), mkdir(join(root, "scripts"))]);
    await writeFile(join(root, "resources", "product-manifest.v1.json"), JSON.stringify(manifest, null, 2));
    await assert.rejects(() => generateProductIdentity({ check: true, root }), (error) => error.code === "PRODUCT_MANIFEST_INVALID");
    const incomplete = structuredClone(manifest); delete incomplete.product.command;
    await writeFile(join(root, "resources", "product-manifest.v1.json"), canonicalJson(incomplete));
    await assert.rejects(() => generateProductIdentity({ check: true, root }), (error) => error.code === "PRODUCT_MANIFEST_INVALID");
    const invalidEnvironment = structuredClone(manifest); invalidEnvironment.providers.achai.credentialEnv = "not-valid";
    await writeFile(join(root, "resources", "product-manifest.v1.json"), canonicalJson(invalidEnvironment));
    await assert.rejects(() => generateProductIdentity({ check: true, root }), (error) => error.code === "PRODUCT_MANIFEST_INVALID");
  } finally { await rm(root, { force: true, recursive: true }); }
});
