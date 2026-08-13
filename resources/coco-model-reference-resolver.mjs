export const COCO_MODEL_REFERENCE_RESOLVER_VERSION = 1;

function valid(model) {
  return model !== null && typeof model === "object" && typeof model.provider === "string" && typeof model.id === "string";
}

function unique(matches) {
  return matches.length === 1 ? matches[0] : undefined;
}

export function findExactModelReferenceMatch(query, models) {
  if (typeof query !== "string" || !Array.isArray(models) || models.some((model) => !valid(model))) throw new Error("MODEL_REFERENCE_INPUT_INVALID");
  const value = query.trim();
  if (value === "") return undefined;
  const lower = value.toLowerCase();
  const canonical = models.filter((model) => `${model.provider}/${model.id}`.toLowerCase() === lower);
  if (canonical.length > 0) return unique(canonical);
  const slash = value.indexOf("/");
  if (slash >= 0) {
    const provider = value.slice(0, slash).trim().toLowerCase();
    const id = value.slice(slash + 1).trim().toLowerCase();
    const parsed = models.filter((model) => model.provider.toLowerCase() === provider && model.id.toLowerCase() === id);
    if (parsed.length > 0) return unique(parsed);
  }
  return unique(models.filter((model) => model.id.toLowerCase() === lower));
}
