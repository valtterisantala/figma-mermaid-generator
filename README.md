# Mermaid Native Generator

A Figma plugin foundation for converting Mermaid flowcharts into editable native Figma objects.

This repository is intentionally starting small. The production render path will parse Mermaid into an internal model, calculate layout, and render native Figma layers directly.

## Local Setup

Install dependencies:

```sh
npm install
```

Build the plugin:

```sh
npm run build
```

Run validation:

```sh
npm run typecheck
npm run lint
npm run format:check
```

## Run In Figma

1. Build the plugin with `npm run build`.
2. Open Figma.
3. Go to `Plugins` > `Development` > `Import plugin from manifest...`.
4. Select `manifest.json` from this repository.
5. Run `Mermaid Native Generator` from the development plugins menu.

## Project Structure

```text
src/
  main/      Figma plugin main-thread code
  ui/        Plugin iframe UI code and styles
  core/      Shared parser, model, layout, and rendering-independent logic
  fixtures/  Sample Mermaid inputs for development and tests
  tests/     Test files and helpers
```

The current implementation only provides placeholder entry points and build tooling. Mermaid parsing, layout, and native Figma rendering are intentionally left for later issues.
