import { readFile } from "node:fs/promises";

import { readCredentialObservations } from "./auth-management.mjs";
import { MANAGED_PROVIDER_IDS } from "./product-identity.generated.mjs";
import { projectProviderReadiness } from "./provider-readiness.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { inspectRegular, statePaths } from "./state-paths.mjs";

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(code) { throw new StateError(code); }
async function optional(path, code, fallback) { if (await inspectRegular(path) === null) return fallback; return parseStrictJson(await readFile(path), code); }

export async function providerStatus({ agentDir, provider } = {}) {
  if (provider !== undefined && !MANAGED_PROVIDER_IDS.includes(provider)) fail("PROVIDER_INVALID");
  const paths = statePaths(agentDir);
  const settings = await optional(paths.settings, "SETTINGS_SCHEMA_INVALID", {}); if (!object(settings)) fail("SETTINGS_SCHEMA_INVALID");
  const models = await optional(paths.models, "MODELS_SCHEMA_INVALID", { providers: {} }); if (!object(models) || !object(models.providers)) fail("MODELS_SCHEMA_INVALID");
  for (const id of MANAGED_PROVIDER_IDS) if (id in models.providers && (!object(models.providers[id]) || !Array.isArray(models.providers[id].models))) fail("MODELS_SCHEMA_INVALID");
  const credentials = new Map((await readCredentialObservations({ agentDir })).providers.map((entry) => [entry.provider, entry.credential]));
  const defaultProvider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : null;
  const defaultModel = typeof settings.defaultModel === "string" ? settings.defaultModel : null;
  const ids = provider === undefined ? MANAGED_PROVIDER_IDS : [provider];
  const providers = ids.map((id) => {
    const definition = models.providers[id]; const configured = object(definition); const isDefault = id === defaultProvider; const modelId = isDefault ? defaultModel : null;
    const available = configured && (modelId === null ? definition.models.length > 0 : definition.models.some((model) => model?.id === modelId)); const credential = credentials.get(id);
    return projectProviderReadiness({ configurationStatus: configured ? "configured" : "missing", credentialSource: credential.source, credentialStatus: credential.status, modelId, modelStatus: available ? "available" : "missing", provider: id, rotationRequired: credential.rotationRequired });
  });
  return { command: "manage providers status", defaultModel: { id: defaultModel, provider: defaultProvider }, providers, schemaVersion: 1, scope: provider === undefined ? "all-managed" : "provider" };
}

export function formatProviderStatus(result) {
  const width = Math.max(...result.providers.map(({ provider }) => provider.length)); const value = (input) => input ?? "none";
  const lines = [`coco providers status: ${result.scope === "provider" ? result.providers[0].provider : result.scope}`, `default: provider=${value(result.defaultModel.provider)} model=${value(result.defaultModel.id)}`];
  for (const entry of result.providers) { const model = entry.model.id === null ? "any" : `default:${entry.model.id}`; const rotation = entry.credential.rotationRequired === null ? "unknown" : entry.credential.rotationRequired ? "yes" : "no"; lines.push(`${entry.provider.padEnd(width)} local=${entry.localStatus} configuration=${entry.configuration.status} model(${model})=${entry.model.status} credential=${entry.credential.status} source=${entry.credential.source} rotation=${rotation} catalog=${entry.catalog.status} verification=${entry.verification.status}`); }
  return `${lines.join("\n")}\n`;
}
