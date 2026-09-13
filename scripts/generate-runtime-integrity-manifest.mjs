import { generateRuntimeIntegrityManifest } from "./runtime-integrity.mjs";

await generateRuntimeIntegrityManifest({ root: process.cwd() });
