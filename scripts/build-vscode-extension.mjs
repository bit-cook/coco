import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeZip } from "./build-offline-bundle.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function buildVscodeExtension({ outputDirectory = join(root, "release") } = {}) {
  const manifest = JSON.parse(await readFile(join(root, "vscode", "package.json"), "utf8"));
  const workspace = await mkdtemp(join(tmpdir(), "coco-vsix-"));
  const extension = join(workspace, "extension");
  const output = join(resolve(outputDirectory), `coco-agent-${manifest.version}.vsix`);
  try {
    await mkdir(extension, { recursive: true }); await mkdir(outputDirectory, { recursive: true });
    for (const name of ["extension.js", "package.json", "README.md"]) await writeFile(join(extension, name), await readFile(join(root, "vscode", name)));
    await writeFile(join(workspace, "[Content_Types].xml"), '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>\n');
    await writeFile(join(workspace, "extension.vsixmanifest"), `<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}"/><DisplayName>${manifest.displayName}</DisplayName><Description xml:space="preserve">${manifest.description}</Description><Tags>AI,coding agent,background tasks</Tags><Categories>Other</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${manifest.engines.vscode}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>\n`);
    await rm(output, { force: true });
    await writeZip(workspace, output);
    return { path: output, version: manifest.version };
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

if (process.argv[1] === new URL(import.meta.url).pathname) process.stdout.write(`${JSON.stringify(await buildVscodeExtension({ outputDirectory: process.argv[2] }))}\n`);
