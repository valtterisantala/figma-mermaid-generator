import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist");
const uiEntry = resolve(rootDir, "src/ui/index.ts");
const uiStyles = resolve(rootDir, "src/ui/styles.css");
const uiOutput = resolve(distDir, "ui.html");

const script = await esbuild.build({
  entryPoints: [uiEntry],
  bundle: true,
  format: "iife",
  target: "es2019",
  write: false,
});

const css = await readFile(uiStyles, "utf8");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mermaid Native Generator</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <main>
      <h1>Mermaid Native Generator</h1>
      <p id="status">Plugin UI is ready.</p>
    </main>
    <script>
${script.outputFiles[0].text}
    </script>
  </body>
</html>
`;

await mkdir(distDir, { recursive: true });
await writeFile(uiOutput, html);
