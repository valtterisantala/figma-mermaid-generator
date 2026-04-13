# Issue 05 — Render native Figma nodes for nodes, labels, and subgraphs

## Purpose

Turn the internal model into editable native Figma layers.

## Scope

- render root diagram frame
- render node containers as native shapes/frames
- render node labels as native text
- render subgraphs as frames with titles
- add layer naming conventions
- ensure fonts are loaded before text mutation
- support initial v1 node shape set

## Important constraint

Do not use SVG import as the production rendering path.

## Definition of done

- rendered output is clean in the Layers panel
- all text is editable
- nodes are editable native objects
- subgraphs are editable frames
- no SVG-imported output structure is used

## Dependencies

- 04 Implement layout engine for flowcharts