import assert from "node:assert/strict";
import test from "node:test";

import { findExactModelReferenceMatch } from "../resources/coco-model-reference-resolver.mjs";

const model = (provider, id) => ({ id, provider });

test("model resolver matches canonical and unique bare references case-insensitively", () => {
  const alpha = model("Provider", "alpha"); const slash = model("other", "id/with/slash"); const models = [alpha, slash];
  assert.equal(findExactModelReferenceMatch(" provider/ALPHA ", models), alpha); assert.equal(findExactModelReferenceMatch("alpha", models), alpha); assert.equal(findExactModelReferenceMatch("id/with/slash", models), slash); assert.equal(findExactModelReferenceMatch("", models), undefined);
});

test("model resolver rejects ambiguous canonical and bare references without fuzzy matching", () => {
  const models = [model("one", "same"), model("two", "same"), model("one", "partial")];
  assert.equal(findExactModelReferenceMatch("same", models), undefined); assert.equal(findExactModelReferenceMatch("sam", models), undefined); assert.equal(findExactModelReferenceMatch("one/same", [...models, model("one", "same")]), undefined);
  assert.throws(() => findExactModelReferenceMatch("one/same", [{ provider: "one" }]), /MODEL_REFERENCE_INPUT_INVALID/);
});
