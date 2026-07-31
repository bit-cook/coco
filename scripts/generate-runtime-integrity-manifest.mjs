import { generateRuntimeIntegrityManifest } from "./runtime-integrity.mjs";

await generateRuntimeIntegrityManifest({ root: new URL("..", import.meta.url).pathname });
