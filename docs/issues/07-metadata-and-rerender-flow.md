# Issue 07 — Add metadata and rerender / replace flow

## Purpose

Make generated diagrams maintainable rather than one-shot output dumps.

## Scope

- store plugin metadata on generated diagram root and children
- add source hash and stable instance ID
- support `Render New`
- support `Replace Previous`
- replace existing generated content safely without duplicates

## Metadata should include

- generator name
- generator version
- diagram instance ID
- source hash
- node source IDs
- edge source IDs

## Definition of done

- plugin can detect its own previously generated diagram
- Replace Previous works predictably
- no duplicate pileup on rerender
- existing placement is preserved reasonably well

## Dependencies

- 05 Render native Figma nodes for nodes, labels, and subgraphs
- 06 Render editable native edges and edge labels