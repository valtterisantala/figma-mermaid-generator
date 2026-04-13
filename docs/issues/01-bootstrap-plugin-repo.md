# Issue 01 — Bootstrap plugin repo and build pipeline

## Purpose

Create the base Figma plugin repository and local development setup for a TypeScript-based Figma plugin.

This task should establish the minimum credible foundation for all later work.

## Scope

- add `manifest.json`
- add `package.json`
- add TypeScript configuration
- add build setup for plugin main code and UI code
- add linting and formatting configuration
- add base folder structure for:
  - `main`
  - `ui`
  - `core`
  - `fixtures`
  - `tests`
- add a minimal README with local setup and build instructions
- add placeholder entry files so the project builds cleanly

## Out of scope

- full plugin UI implementation
- Mermaid parsing
- layout engine integration
- rendering logic beyond the minimum placeholder needed to validate the setup
- advanced test coverage

## Deliverables

Suggested structure:

```text
src/
  main/
  ui/
  core/
  fixtures/
  tests/
docs/
```

Minimum expected files may include:

```text
manifest.json
package.json
tsconfig.json
README.md
src/main/index.ts
src/ui/index.tsx
```

Exact filenames may differ if the structure is coherent and documented.

## Constraints

- keep the setup simple and conventional
- prefer boring, maintainable defaults over clever tooling
- choose a build setup that is easy for later Codex tasks to extend
- do not overengineer for future Mermaid features in this task

## Acceptance criteria

- repository dependencies install successfully
- the project builds locally without errors
- `manifest.json` is valid for a Figma plugin
- main-thread and UI entry points exist
- TypeScript compiles cleanly
- linting and formatting are configured
- the base folder structure is present
- the README explains how to install, build, and run the plugin locally

## Validation

When possible, validate with the actual project commands created in this task, such as:

- install dependencies
- build
- typecheck
- lint

If any of these are not implemented yet, state that clearly in the final summary.

## Notes for implementation

This task should optimize for a clean starting point, not for feature completeness.

A small, reliable foundation is better than an ambitious setup that creates friction for later tasks.

## Dependencies

- none
