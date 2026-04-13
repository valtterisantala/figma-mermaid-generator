# Issue 04 — Implement layout engine for flowcharts

## Purpose

Calculate positions for nodes, subgraphs, and edges.

## Scope

- integrate Dagre for v1 layout
- support `LR` and `TD`
- output node coordinates
- output subgraph bounds
- output simple edge routing data
- output anchor points for edge labels

## Notes

Do not try to use Figma auto layout to solve graph layout.

Graph layout should be handled before rendering.

## Definition of done

- simple Mermaid graphs produce sensible layout coordinates
- subgraphs are bounded correctly
- layout output is deterministic enough for rerender
- works on the sample fixtures

## Dependencies

- 03 Define internal diagram model and parsing pipeline