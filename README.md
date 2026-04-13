# Mermaid Native Generator

A Figma plugin for converting a focused subset of Mermaid flowcharts into editable native Figma objects.

The production render path does not import SVG. Mermaid source is parsed into an internal model, laid out with Dagre, and rendered as native Figma frames, groups, vectors, shapes, and editable text.

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
npm test
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
  main/       Figma plugin main-thread rendering, metadata, and rerender flow
  ui/         Plugin iframe UI code and styles
  core/       Parser, normalized model, and Dagre layout logic
  fixtures/   Sample Mermaid inputs used by tests
  tests/      Unit tests for parser, layout, fixtures, styling, and metadata
```

## Architecture

The pipeline is intentionally separated:

1. `src/ui` sends Mermaid source and lightweight render options to the plugin main thread.
2. `src/core/parser.ts` parses the supported Mermaid flowchart subset into a normalized `DiagramModel`.
3. `src/core/layout.ts` uses Dagre to produce node coordinates, subgraph bounds, edge points, and edge label anchors.
4. `src/main/render.ts` creates the root diagram frame, subgraph frames, node groups, native shape layers, and native text labels.
5. `src/main/render-edges.ts` creates native vector edge paths, arrowheads, and editable edge labels.
6. `src/main/metadata.ts` and `src/main/rerender.ts` store plugin data and support Render New / Replace Previous.

## Current v1 Scope

Supported:

- `flowchart TD`, `flowchart LR`, `graph TD`, and `graph LR`
- basic node labels and common v1 shapes
- edge labels
- basic subgraphs
- `classDef` and `class` for node styling
- style mapping for `fill`, `stroke`, `color`, and `stroke-width`
- Render New and Replace Previous
- native Figma output with editable text and shapes

Limitations:

- no SVG import path
- no sequence, state, gantt, ER, pie, or mindmap diagrams
- no full Mermaid syntax parity
- no bidirectional Figma to Mermaid sync
- no advanced styling, themes, or settings UI
- edges are simple straight native vectors for v1
- replacement preserves the generated diagram root placement, not manual edits inside the previous output
