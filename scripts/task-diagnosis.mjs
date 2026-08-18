const STATES = new Set(["healthy", "waiting", "stuck", "unknown"]);

function age(now, value) {
  if (typeof value !== "string") return null;
  const milliseconds = now - Date.parse(value);
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

function newer(first, second) {
  const firstTime = typeof first === "string" ? Date.parse(first) : NaN;
  const secondTime = typeof second === "string" ? Date.parse(second) : NaN;
  if (!Number.isFinite(firstTime)) return Number.isFinite(secondTime) ? second : null;
  return Number.isFinite(secondTime) && secondTime > firstTime ? second : first;
}

export function diagnoseTask({ task, latestHeartbeatAt = null, latestLogAt = null, now = Date.now(), heartbeatTimeoutMs = 90000, activityTimeoutMs = 120000, processAlive = false } = {}) {
  if (!task || task.status !== "running" || !task.activeRunId) return { schemaVersion: 1, state: "unknown", reason: "NOT_RUNNING", signals: {} };
  if (!Number.isFinite(now) || !Number.isFinite(heartbeatTimeoutMs) || heartbeatTimeoutMs <= 0 || !Number.isFinite(activityTimeoutMs) || activityTimeoutMs <= 0) return { schemaVersion: 1, state: "unknown", reason: "DIAGNOSIS_CONFIGURATION_INVALID", signals: {} };
  const heartbeatAgeMs = age(now, newer(task.heartbeatAt, latestHeartbeatAt));
  const logAgeMs = age(now, latestLogAt);
  const signals = { heartbeatAgeMs, logAgeMs, processAlive: processAlive === true, runId: task.activeRunId };
  if (!processAlive) return { schemaVersion: 1, state: "unknown", reason: "PROCESS_NOT_OBSERVED", signals };
  if (heartbeatAgeMs === null) return { schemaVersion: 1, state: "waiting", reason: "NO_HEARTBEAT_YET", signals };
  if (heartbeatAgeMs <= heartbeatTimeoutMs) return { schemaVersion: 1, state: "healthy", reason: "HEARTBEAT_RECENT", signals };
  if (logAgeMs !== null && logAgeMs <= activityTimeoutMs) return { schemaVersion: 1, state: "waiting", reason: "OUTPUT_RECENT_HEARTBEAT_STALE", signals };
  return { schemaVersion: 1, state: "stuck", reason: "HEARTBEAT_AND_OUTPUT_STALE", signals };
}

export { STATES as taskDiagnosisStates };
