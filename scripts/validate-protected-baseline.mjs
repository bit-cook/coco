import { resolve } from "node:path";

import { verifyBaseline } from "./verify-protected-baseline.mjs";

function parse(argv) {
  if (argv.length !== 2 || argv[0] !== "--baseline") throw new Error("BASELINE_VALIDATOR_USAGE");
  return resolve(argv[1]);
}

async function main() {
  const result = await verifyBaseline({ baselinePath: parse(process.argv.slice(2)) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "approved" ? 0 : 1;
}

void main();
