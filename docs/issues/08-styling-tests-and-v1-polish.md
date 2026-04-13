# Issue 08 — Add styling support, fixtures, tests, and v1 polish

## Purpose

Finish the plugin into a credible v1 rather than a raw prototype.

## Scope

- support basic `classDef` and `class`
- map:
  - fill
  - stroke
  - text color
  - stroke width
- add Mermaid fixtures:
  - simple graph
  - subgraph
  - class styling
- add tests for:
  - parser
  - normalization
  - layout
  - metadata
- improve README with architecture and limitations
- final cleanup and error handling

## Definition of done

- basic Mermaid styling works
- fixture set passes
- core logic has tests
- README documents scope and limitations
- plugin is presentable as v1

## Dependencies

- 03 Define internal diagram model and parsing pipeline
- 04 Implement layout engine for flowcharts
- 07 Add metadata and rerender / replace flow