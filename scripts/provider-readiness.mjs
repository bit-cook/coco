const credentialStatuses = new Set(["available", "missing", "unknown"]);
const configurationStatuses = new Set(["configured", "missing", "unknown"]);
const modelStatuses = new Set(["available", "missing", "unknown"]);
const catalogStatuses = new Set(["synced", "seeded", "missing", "unknown"]);
const verificationStatuses = new Set(["verified", "rejected", "inconclusive", "not-checked"]);
const credentialSources = new Set(["auth", "environment", "legacy", "runtime", "none", "unknown"]);
const verificationScopes = new Set(["models-endpoint", "inference-endpoint"]);

function fail() { const error = new Error("PROVIDER_READINESS_INVALID"); error.code = "PROVIDER_READINESS_INVALID"; throw error; }

export function projectProviderReadiness({ catalogStatus = "unknown", configurationStatus = "unknown", credentialSource = "unknown", credentialStatus = "unknown", modelId = null, modelStatus = "unknown", provider, rotationRequired = false, verificationScope = null, verificationStatus = "not-checked" } = {}) {
  if (typeof provider !== "string" || provider.length === 0 || !credentialStatuses.has(credentialStatus) || !credentialSources.has(credentialSource) || typeof rotationRequired !== "boolean" || !configurationStatuses.has(configurationStatus) || !modelStatuses.has(modelStatus) || !(modelId === null || typeof modelId === "string" && modelId.length > 0) || !catalogStatuses.has(catalogStatus) || !verificationStatuses.has(verificationStatus) || !(verificationScope === null || verificationScopes.has(verificationScope))) fail();
  if ((verificationStatus === "not-checked") !== (verificationScope === null)) fail();
  let localStatus = "unknown";
  if (rotationRequired) localStatus = "rotation-required";
  else if (configurationStatus === "missing") localStatus = "provider-missing";
  else if (modelStatus === "missing") localStatus = "model-missing";
  else if (credentialStatus === "missing") localStatus = "credential-missing";
  else if (configurationStatus === "configured" && modelStatus === "available" && credentialStatus === "available") localStatus = "ready";
  return Object.freeze({
    catalog: Object.freeze({ status: catalogStatus }),
    configuration: Object.freeze({ status: configurationStatus }),
    credential: Object.freeze({ rotationRequired, source: credentialSource, status: credentialStatus }),
    localStatus,
    model: Object.freeze({ id: modelId, status: modelStatus }),
    provider,
    schemaVersion: 1,
    verification: Object.freeze({ scope: verificationScope, status: verificationStatus }),
  });
}
