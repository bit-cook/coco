const conflict = { body: { error: "IDEMPOTENCY_KEY_CONFLICT" }, status: 409 };
const inProgress = { body: { error: "COMMAND_IN_PROGRESS", status: "executing" }, status: 409 };
const uncertain = { body: { error: "COMMAND_OUTCOME_UNCERTAIN", status: "uncertain" }, status: 409 };

function responseFor(record) {
  if (record?.status === "result") return record.response;
  if (record?.status === "executing") return inProgress;
  if (record?.status === "uncertain") return uncertain;
  return null;
}

export async function runControlCommandMutation({
  commandId,
  effect,
  effectGeneration = 1,
  journal,
  operationId,
  request,
}) {
  let record;
  try {
    record = await journal.receive({ commandId, effectGeneration, operationId, request });
  } catch (error) {
    if (error?.message === "COMMAND_DIGEST_CONFLICT") return structuredClone(conflict);
    throw error;
  }

  const replay = responseFor(record);
  if (replay) return structuredClone(replay);

  try {
    record = await journal.beginExecution(commandId);
  } catch (error) {
    if (error?.message !== "COMMAND_STATE_INVALID") throw error;
    record = await journal.read(commandId);
    return structuredClone(responseFor(record) ?? inProgress);
  }

  const raced = responseFor(record);
  if (raced && record.status !== "executing") return structuredClone(raced);

  try {
    const response = await effect();
    const result = await journal.recordResult(commandId, response);
    return structuredClone(responseFor(result));
  } catch {
    const result = await journal.markUncertain(commandId);
    return structuredClone(responseFor(result) ?? uncertain);
  }
}
