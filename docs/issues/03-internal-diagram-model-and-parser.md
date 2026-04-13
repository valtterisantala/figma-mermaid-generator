# Issue 03 — Define internal diagram model and parsing pipeline

## Purpose

Create the stable internal representation between Mermaid input and Figma output.

## Scope

- define types for:
  - diagram
  - node
  - edge
  - subgraph
  - styles
  - layout result
  - metadata
- implement Mermaid parsing/validation path
- normalize parsed data into a clean internal graph model
- resolve:
  - direction
  - labels
  - classes
  - stable IDs
  - shape types for supported v1 nodes

## Design rule

Parser output should not leak directly into rendering.

There must be a stable intermediate model so parser changes do not destabilize the renderer.

## Definition of done

- Mermaid flowchart input is converted into a normalized internal model
- model is independent from rendering
- invalid Mermaid produces useful errors
- parser logic is testable outside Figma runtime

## Dependencies

- 01 Bootstrap plugin repo and build pipeline
- 02 Build plugin UI for Mermaid input and render actions