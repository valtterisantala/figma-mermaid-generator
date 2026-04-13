# Mermaid to Figma Plugin v1 — Implementation Plan

## Goal

Build a Figma plugin that takes Mermaid flowchart syntax and renders it into Figma as fully editable native objects.

The output should be editable object-by-object:
- labels as native text layers
- nodes as native shapes/frames
- subgraphs as editable frames
- edges as editable vector-based geometry
- styles editable directly in Figma

## Core product principle

This plugin is not an SVG importer.

The production render path must not rely on SVG import as the main output method. The plugin should parse Mermaid, normalize it into an internal scene model, calculate layout, and generate native Figma nodes directly.

## Why this matters

There are two possible directions:

### Option A — looks like Mermaid
Advantages:
- easier first implementation
- faster to get a visible result

Disadvantages:
- poor layer structure
- weak semantic editability
- harder to maintain in Figma

### Option B — feels native in Figma
Advantages:
- cleaner output
- better manual editing
- more maintainable plugin output
- more useful as a real design tool

Disadvantages:
- more engineering effort
- tighter v1 scope required

This project intentionally chooses Option B.

## v1 scope

### Supported in v1
- `flowchart`
- `graph TD`
- `graph LR`
- `flowchart TD`
- `flowchart LR`
- basic node labels
- edge labels
- common node shapes
- basic subgraphs
- basic `class` / `classDef` support
- render new
- replace previous render

### Out of scope in v1
- sequence diagrams
- gantt
- state diagrams
- ER diagrams
- pie charts
- mindmaps
- bidirectional Figma ↔ Mermaid sync
- full Mermaid syntax parity
- pixel-perfect Mermaid renderer parity

## Proposed architecture

### 1. Plugin UI
A small UI for:
- Mermaid input
- render action
- sample input
- replace previous toggle
- direction override
- spacing preset
- status/error feedback

### 2. Parsing and normalization
Pipeline:
1. accept Mermaid text
2. validate syntax
3. parse relevant flowchart constructs
4. normalize into internal graph model

Internal model should include:
- diagram
- nodes
- edges
- subgraphs
- labels
- classes
- direction
- style tokens

### 3. Layout
Use a graph layout engine for v1.

Recommended:
- Dagre for v1

Layout output should include:
- node positions
- subgraph bounds
- edge routing hints
- edge label anchors

### 4. Rendering
Render native Figma nodes:
- root diagram frame
- subgraph frames
- node shapes/frames
- text labels
- vector-based edges
- arrowheads
- edge labels

### 5. Metadata and rerender
Generated output should store metadata for:
- source hash
- instance ID
- node IDs
- edge IDs
- generator version

Rerender modes:
- Render New
- Replace Previous

## Output structure in Figma

Recommended layer naming:

- `Mermaid Diagram / <name>`
  - `Subgraph / <name>`
  - `Node / <id>`
    - `Node Shape`
    - `Node Label`
  - `Edge / <from> -> <to>`
    - `Edge Path`
    - `Edge Arrowhead`
    - `Edge Label`

## Engineering principles

- native object generation only
- no fake success through SVG import
- internal model must be separate from rendering
- layout should be deterministic enough for rerender
- plugin output should be understandable in the Layers panel
- keep v1 narrow and credible

## Delivery order

1. bootstrap plugin repo
2. build plugin UI
3. define internal model and parser
4. implement layout engine
5. render native nodes and subgraphs
6. render native edges and edge labels
7. add metadata and rerender flow
8. add styling support, tests, and v1 polish

## Acceptance bar for v1

A user should be able to:
1. paste Mermaid flowchart syntax into the plugin
2. click Render
3. receive a diagram in Figma
4. edit every label as text
5. edit every node/container as native objects
6. restyle fills, strokes, and typography directly in Figma
7. rerender without duplicate mess

## Non-goals for now

This project should resist the temptation to become:
- a general Mermaid compatibility project
- an SVG import wrapper
- a full diagram IDE
- a bidirectional sync system

The correct v1 goal is narrower:
**Mermaid flowcharts into clean, editable, native Figma diagrams.**