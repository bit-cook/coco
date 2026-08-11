import { preflightExecutionRequest } from "./execution-provider.mjs";

const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function evaluateExecutionMatrix(provider, cases = []) {
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > 256) fail("EXECUTION_MATRIX_INVALID");
  return Object.freeze(cases.map((request, index) => {
    try {
      const result = preflightExecutionRequest(provider, request);
      return Object.freeze({ index, status: "approved", requestSha256: result.requestSha256 });
    } catch (error) {
      return Object.freeze({ code: error?.code ?? "EXECUTION_PREFLIGHT_FAILED", index, status: "rejected" });
    }
  }));
}
