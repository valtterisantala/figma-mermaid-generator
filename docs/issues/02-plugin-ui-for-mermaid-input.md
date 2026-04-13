# Issue 02 — Build plugin UI for Mermaid input and render actions

## Purpose

Create the first usable plugin UI.

## Scope

- add Mermaid textarea
- add Render button
- add Sample input button
- add Replace Previous toggle
- add direction override setting
- add spacing preset setting
- add status and error area
- wire UI ↔ plugin main thread messaging

## UX notes

The UI should be lightweight and practical, not overdesigned.

The main thing is fast iteration:
- paste Mermaid
- click Render
- see output or error

## Definition of done

- user can paste Mermaid text into the UI
- clicking Render sends payload to main plugin code
- validation and render errors are shown clearly
- UI is usable enough for development testing

## Dependencies

- 01 Bootstrap plugin repo and build pipeline
