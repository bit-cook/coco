import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MANAGED_PROVIDER_IDS, PRODUCT_COMMAND, PRODUCT_CONFIG_DIR, PRODUCT_NAME, PRODUCT_VERSION, PROVIDER_CREDENTIAL_ENV, UPSTREAM_PACKAGE, UPSTREAM_VERSION } from "./product-identity.generated.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const fail = (code, details = {}) => { const error = new Error(code); error.code = code; error.details = details; throw error; };
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const includes = (source, value, code) => { if (!source.includes(value)) fail(code, { value }); };

export function verifyPatchInventory(source, inventory) {
  const implemented = [...source.matchAll(/^async function (patch[A-Z][A-Za-z0-9]+)\(/gm)].map((match) => match[1]).sort();
  const registered = [...inventory.implementationFunctions].filter((name) => name.startsWith("patch")).sort();
  if (JSON.stringify(implemented) !== JSON.stringify(registered)) fail("UNREGISTERED_PATCH_FUNCTION", { implemented, registered });
  const domainFunctions = new Set(inventory.domains.flatMap((domain) => domain.functions));
  for (const name of inventory.implementationFunctions) if (!domainFunctions.has(name)) fail("PATCH_DOMAIN_MISSING", { name });
  for (const domain of inventory.domains) for (const field of inventory.policy.requiredFields) if (!domain[field] || (Array.isArray(domain[field]) && domain[field].length === 0)) fail("PATCH_FIELD_MISSING", { domain: domain.id, field });
  return implemented;
}

export function verifyUpstreamSource(baseline) {
  if (!/^[a-f0-9]{40}$/.test(baseline.source.commitSha ?? "") || baseline.source.tag !== `v${baseline.package.version}` || baseline.source.tagObjectSha !== baseline.source.commitSha || baseline.source.provenance !== "npm-gitHead-and-github-lightweight-tag") fail("UPSTREAM_SOURCE_PROVENANCE_INVALID");
}

export async function verifyArchitectureContracts() {
  const [manifest, inventory, matrix, baseline, pkg, lock, vscode, registry, seeds, patcher, bootstrap, installer] = await Promise.all([
    readJson("resources/product-manifest.v1.json"), readJson("resources/patch-inventory.v1.json"), readJson("resources/capability-matrix.v1.json"), readJson("resources/upstream-baseline.v1.json"),
    readJson("package.json"), readJson("package-lock.json"), readJson("vscode/package.json"), readJson("resources/provider-registry.v1.json"), readJson("resources/provider-model-seeds.v1.json"),
    readFile(join(root, "scripts/apply-coco-identity-patch.mjs"), "utf8"), readFile(join(root, "scripts/bootstrap-state.mjs"), "utf8"), readFile(join(root, "install.sh"), "utf8"),
  ]);
  if (manifest.schemaVersion !== 1 || inventory.schemaVersion !== 1 || matrix.schemaVersion !== 1 || baseline.schemaVersion !== 1) fail("ARCHITECTURE_SCHEMA_INVALID");
  verifyUpstreamSource(baseline);

  const version = manifest.product.version;
  for (const [name, actual] of [["package", pkg.version], ["lock", lock.version], ["lock-root", lock.packages?.[""]?.version], ["vscode", vscode.version], ["matrix", matrix.version]]) if (actual !== version) fail("PRODUCT_VERSION_DRIFT", { actual, name, version });
  if (PRODUCT_COMMAND !== manifest.product.command || PRODUCT_CONFIG_DIR !== manifest.product.configDir || PRODUCT_NAME !== manifest.product.name || PRODUCT_VERSION !== version || UPSTREAM_PACKAGE !== manifest.upstream.package || UPSTREAM_VERSION !== manifest.upstream.version) fail("GENERATED_IDENTITY_DRIFT");
  includes(installer, `COCO_VERSION="\${COCO_VERSION:-${version}}"`, "INSTALLER_VERSION_DRIFT");

  const upstream = manifest.upstream;
  if (![upstream.version, baseline.package.resolved].includes(pkg.dependencies?.[upstream.package]) || baseline.package.name !== upstream.package || baseline.package.version !== upstream.version || inventory.upstreamVersion !== upstream.version) fail("UPSTREAM_VERSION_DRIFT");
  const locked = lock.packages?.[`node_modules/${upstream.package}`];
  if (locked?.version !== upstream.version || locked?.integrity !== baseline.package.integrity || locked?.resolved !== baseline.package.resolved) fail("UPSTREAM_LOCK_DRIFT");
  includes(patcher, `expectedVersion = "${upstream.version}"`, "PATCHER_VERSION_DRIFT");

  const providerIds = Object.keys(manifest.providers).sort();
  if (JSON.stringify(MANAGED_PROVIDER_IDS) !== JSON.stringify(providerIds) || JSON.stringify(PROVIDER_CREDENTIAL_ENV) !== JSON.stringify(Object.fromEntries(providerIds.map((id) => [id, manifest.providers[id].credentialEnv])))) fail("GENERATED_PROVIDER_DRIFT");
  for (const [name, ids] of [["registry", Object.keys(registry.providers).sort()], ["seeds", Object.keys(seeds.providers).sort()]]) if (JSON.stringify(ids) !== JSON.stringify(providerIds)) fail("PROVIDER_SET_DRIFT", { ids, name, providerIds });
  const defaultSeed = seeds.providers[manifest.defaults.provider]?.some((model) => model.id === manifest.defaults.model);
  if (!defaultSeed) fail("DEFAULT_MODEL_NOT_SEEDED");
  const automaticTheme = `${manifest.defaults.theme.light}/${manifest.defaults.theme.dark}`;
  for (const value of [manifest.defaults.provider, manifest.defaults.model, manifest.defaults.thinkingLevel, automaticTheme]) includes(bootstrap, JSON.stringify(value), "BOOTSTRAP_DEFAULT_DRIFT");
  for (const value of [manifest.defaults.provider, manifest.defaults.model, manifest.defaults.thinkingLevel, automaticTheme]) includes(installer, JSON.stringify(value), "INSTALLER_DEFAULT_DRIFT");

  const implemented = verifyPatchInventory(patcher, inventory);

  const statuses = new Set(matrix.statuses);
  const ids = new Set();
  for (const capability of matrix.capabilities) {
    if (ids.has(capability.id) || !statuses.has(capability.status) || !capability.evidence?.length) fail("CAPABILITY_INVALID", { id: capability.id });
    ids.add(capability.id);
    for (const path of capability.evidence) await readFile(join(root, path)).catch(() => fail("CAPABILITY_EVIDENCE_MISSING", { id: capability.id, path }));
  }
  return { capabilities: matrix.capabilities.length, patches: implemented.length, providers: providerIds.length, status: "approved", upstream: upstream.version, version };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) verifyArchitectureContracts().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.code ?? error.message); process.exitCode = 1; });
