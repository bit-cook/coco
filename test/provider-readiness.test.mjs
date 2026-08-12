import assert from "node:assert/strict";
import test from "node:test";

import { projectProviderReadiness } from "../scripts/provider-readiness.mjs";

const base = { catalogStatus: "seeded", configurationStatus: "configured", credentialSource: "auth", credentialStatus: "available", modelId: "agnes-2.5-flash", modelStatus: "available", provider: "agnes" };

test("provider readiness distinguishes local readiness from network verification", () => {
  assert.deepEqual(projectProviderReadiness(base), {
    catalog: { status: "seeded" }, configuration: { status: "configured" }, credential: { rotationRequired: false, source: "auth", status: "available" },
    localStatus: "ready", model: { id: "agnes-2.5-flash", status: "available" }, provider: "agnes", schemaVersion: 1,
    verification: { scope: null, status: "not-checked" },
  });
  assert.equal(projectProviderReadiness({ ...base, verificationScope: "models-endpoint", verificationStatus: "verified" }).localStatus, "ready");
});

test("provider readiness applies conservative blocking precedence", () => {
  assert.equal(projectProviderReadiness({ ...base, credentialStatus: "missing", credentialSource: "none" }).localStatus, "credential-missing");
  assert.equal(projectProviderReadiness({ ...base, modelStatus: "missing" }).localStatus, "model-missing");
  assert.equal(projectProviderReadiness({ ...base, configurationStatus: "missing" }).localStatus, "provider-missing");
  assert.equal(projectProviderReadiness({ ...base, rotationRequired: true }).localStatus, "rotation-required");
  assert.equal(projectProviderReadiness({ ...base, credentialStatus: "unknown" }).localStatus, "unknown");
});

test("provider readiness rejects ambiguous verification and unknown vocabulary", () => {
  assert.throws(() => projectProviderReadiness({ ...base, verificationStatus: "verified" }), (error) => error.code === "PROVIDER_READINESS_INVALID");
  assert.throws(() => projectProviderReadiness({ ...base, verificationScope: "models-endpoint" }), (error) => error.code === "PROVIDER_READINESS_INVALID");
  assert.throws(() => projectProviderReadiness({ ...base, credentialStatus: "ready" }), (error) => error.code === "PROVIDER_READINESS_INVALID");
});
