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
      <header>
        <h1>Mermaid Native Generator</h1>
        <p id="status" role="status">Ready.</p>
      </header>

      <label class="field">
        <span>Mermaid</span>
        <textarea id="mermaid-input" spellcheck="false"></textarea>
      </label>

      <div class="controls">
        <label class="field">
          <span>Direction</span>
          <select id="direction-select">
            <option value="auto">Auto</option>
            <option value="TD">Top down</option>
            <option value="LR">Left to right</option>
          </select>
        </label>

        <label class="field">
          <span>Spacing</span>
          <select id="spacing-select">
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
            <option value="spacious">Spacious</option>
          </select>
        </label>
      </div>

      <div class="controls">
        <label class="field">
          <span>Layout type</span>
          <select id="layout-type-select">
            <option value="auto">Auto</option>
            <option value="process-flow">Process flow</option>
            <option value="comparison">Comparison</option>
            <option value="layered-architecture">Layered architecture</option>
            <option value="freeform">Freeform</option>
          </select>
        </label>

        <label class="field">
          <span>Layout target</span>
          <select id="layout-target-select">
            <option value="auto">Auto</option>
            <option value="slide-16-9">Slide 16:9</option>
            <option value="freeform">Freeform</option>
          </select>
        </label>

      </div>

      <label class="field">
        <span>Fit strength</span>
        <select id="fit-strength-select">
          <option value="balanced">Balanced</option>
          <option value="compact">Compact</option>
          <option value="strict">Strict</option>
        </select>
      </label>

      <div class="controls">
        <label class="field">
          <span>Target resolution</span>
          <select id="target-resolution-select">
            <option value="hd">HD 1920 × 1080</option>
            <option value="4k">4K 3840 × 2160</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label class="field">
          <span>Slide-safe margin</span>
          <select id="slide-margin-preset-select">
            <option value="default">Default margin</option>
            <option value="compact">Compact margin</option>
            <option value="custom">Custom margin</option>
          </select>
        </label>
      </div>

      <div class="controls">
        <label class="field">
          <span>Custom width</span>
          <input id="target-canvas-width-input" type="number" min="320" max="10000" step="10" value="1920" />
        </label>

        <label class="field">
          <span>Custom height</span>
          <input id="target-canvas-height-input" type="number" min="240" max="10000" step="10" value="1080" />
        </label>
      </div>

      <label class="field">
        <span>Custom slide-safe margin</span>
        <input id="slide-safe-margin-input" type="number" min="0" max="400" step="4" value="80" />
      </label>

      <div class="controls">
        <label class="field">
          <span>Font family</span>
          <select id="font-family-select">
            <option value="" disabled selected>Loading local fonts...</option>
          </select>
        </label>

        <label class="field">
          <span>Font style</span>
          <select id="font-style-select">
            <option value="" disabled selected>Select a family</option>
          </select>
        </label>
      </div>

      <div class="controls">
        <label class="field">
          <span>Font size</span>
          <input id="font-size-input" type="number" min="8" max="24" step="1" value="13" />
        </label>

        <label class="field">
          <span>Stroke width</span>
          <input id="stroke-width-input" type="number" min="0.5" max="12" step="0.5" value="1" />
        </label>
      </div>

      <label class="field">
        <span>Corner radius</span>
        <input id="corner-radius-input" type="number" min="0" max="32" step="1" value="20" />
      </label>

      <label class="field">
        <span>Line corner radius</span>
        <input id="line-corner-radius-input" type="number" min="0" max="32" step="1" value="12" />
      </label>

      <label class="toggle">
        <input id="replace-previous" type="checkbox" checked />
        <span>Replace previous</span>
      </label>

      <label class="toggle">
        <input id="collapse-return-edges" type="checkbox" checked />
        <span>Collapse return edges</span>
      </label>

      <div class="actions">
        <button id="render-button" type="button">Render</button>
        <button id="sample-button" type="button" class="secondary">Sample input</button>
      </div>

      <p id="error-message" class="error" role="alert" hidden></p>
    </main>
    <script>
${script.outputFiles[0].text}
    </script>
  </body>
</html>
`;

await mkdir(distDir, { recursive: true });
await writeFile(uiOutput, html);
