# Epic — Mermaid to Figma Plugin v1

## Goal

Build a Figma plugin that converts Mermaid flowchart syntax into fully editable native Figma objects.

## Product principle

The production path must generate native Figma nodes directly.

The plugin should not rely on SVG import as the main rendering path.

## Success criteria

A user can:
1. paste Mermaid flowchart syntax into the plugin
2. click Render
3. receive a clean editable diagram in Figma
4. edit labels, nodes, containers, and edge styling manually
5. rerun the plugin and replace/update the diagram predictably

## v1 scope

Included:
- flowchart / graph TD / graph LR
- nodes
- edges
- labels
- subgraphs
- basic class/classDef styling
- rerender support

Excluded:
- sequence diagrams
- gantt
- ER diagrams
- state diagrams
- full Mermaid parity
- bidirectional sync back to Mermaid

## Child issues

- 01 Bootstrap plugin repo and build pipeline
- 02 Build plugin UI for Mermaid input and render actions
- 03 Define internal diagram model and parsing pipeline
- 04 Implement layout engine for flowcharts
- 05 Render native Figma nodes for nodes, labels, and subgraphs
- 06 Render editable native edges and edge labels
- 07 Add metadata and rerender / replace flow
- 08 Add styling support, fixtures, tests, and v1 polish

## Notes

The main failure mode to avoid is a superficial implementation that imports SVG-like output and calls it editable.

The correct bar is native, maintainable Figma output.