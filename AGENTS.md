# AGENTS.md

## Project overview

This repository is for a Figma plugin that converts Mermaid flowchart syntax into clean, editable, native Figma objects.

The core product principle is strict:
- do not rely on SVG import as the production render path
- parse Mermaid into an internal model
- compute layout from that model
- render native Figma nodes directly

The intended v1 outcome is:
- Mermaid flowcharts in
- understandable, editable Figma layers out

## Source of truth

The main planning and execution source of truth is in `docs/issues/`.

Use these files as the task queue and implementation contract.

Important files:
- `docs/IMPLEMENTATION_PLAN.md` — high-level product and architecture context
- `docs/issues/00-epic-mermaid-to-figma-plugin-v1.md` — epic and sequencing overview
- `docs/issues/01-bootstrap-plugin-repo.md` through `08-styling-tests-and-v1-polish.md` — implementation tasks

When working on a task:
1. read the task markdown file first
2. respect its scope and dependencies
3. do not silently expand the scope unless clearly necessary

## Working rules for agents

- implement one issue at a time unless explicitly told otherwise
- prefer small, reviewable diffs
- do not "helpfully" build future issues early unless required to complete the current one
- keep architectural seams clean so later issues can build on them
- do not overwrite or reformat planning docs unless the task explicitly concerns them
- do not delete files just to simplify implementation unless there is a clear reason

## Current recommended implementation order

1. `01-bootstrap-plugin-repo.md`
2. `02-plugin-ui-for-mermaid-input.md`
3. `03-internal-diagram-model-and-parser.md`
4. `04-layout-engine-for-flowcharts.md`
5. `05-render-native-figma-nodes.md`
6. `06-render-native-edges-and-labels.md`
7. `07-metadata-and-rerender-flow.md`
8. `08-styling-tests-and-v1-polish.md`

## Expected repository structure

Target structure may evolve, but the intended shape is roughly:

```text
src/
  main/
  ui/
  core/
  fixtures/
  tests/
docs/
  issues/
```

Suggested responsibilities:
- `src/main/` — Figma plugin main-thread entry and document mutation
- `src/ui/` — plugin UI and UI-to-main messaging
- `src/core/` — parser, normalization, layout, metadata, shared domain logic
- `src/fixtures/` — Mermaid sample inputs used for development and tests
- `src/tests/` — unit tests or test helpers for core logic

## Engineering constraints

### Native Figma output only

The production render path must generate native Figma objects.

Allowed:
- frames
- groups where appropriate
- text nodes
- vector-based geometry
- plugin data / shared plugin data for metadata

Not acceptable as the main output approach:
- importing SVG and treating that as final success
- flattening everything into opaque shapes that are technically editable but practically unusable

### Internal model boundary

Parser output must not be tightly coupled to Figma rendering code.

The desired pipeline is:
1. Mermaid input
2. parse and validate
3. normalize into internal graph model
4. layout
5. render to Figma

Keep those stages separable.

### Deterministic rerendering

Later rerender support depends on reasonably stable IDs and deterministic enough layout behavior.

Avoid implementation choices that make replacement or diffing unnecessarily chaotic.

## Code quality expectations

- keep code understandable and boring where possible
- use clear names over clever abstractions
- prefer explicit types for the internal model
- isolate Figma API-specific code from pure logic where practical
- ensure parser and layout logic are testable outside the Figma runtime
- avoid large files when a clean module boundary exists

## UX expectations

The plugin UI should be lightweight and practical.

Prioritize:
- fast paste → render loop
- clear error states
- minimal friction during development testing

Do not overdesign the UI in early tasks.

## Validation expectations

Before considering a task complete, run the relevant validation available in the repo.

At minimum, when configured, agents should try to run:
- install dependencies
- build
- typecheck
- lint
- tests relevant to changed areas

If validation commands are not yet set up, note that clearly in the final summary instead of pretending validation happened.

## Definition of done for agent tasks

A task is only done when:
- the requested scope is implemented
- acceptance criteria in the corresponding `docs/issues/*.md` file are satisfied
- code is coherent with the repository structure
- no obvious unrelated breakage is introduced
- any limitations or follow-up items are stated explicitly

## Final response format for coding tasks

When finishing a task, report:
- what was changed
- which files were added or edited
- what validation was run
- any known limitations or follow-ups

## Avoid these failure modes

- solving issue 05 or 06 by sneaking in SVG import
- mixing parsing, layout, and rendering into one hard-to-test blob
- overbuilding for Mermaid features that are out of v1 scope
- making the UI visually fancy while core architecture stays weak
- introducing hidden scope creep across multiple issues

## If something is ambiguous

Prefer the narrower interpretation that preserves the project’s stated v1 scope.

When forced to choose, bias toward:
- native Figma editability
- clean internal architecture
- predictable rerenderability
- smaller, more reviewable changes
