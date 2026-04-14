# Mermaid plugin guardrails

When I ask for Mermaid diagrams, generate them in a plugin-safe flowchart subset for my Figma Mermaid plugin.

## Use only Mermaid flowcharts

- `flowchart TD`
- `flowchart TB`
- `flowchart LR`

## Prefer

- quoted labels for long text
- `<br/>` for intentional line breaks
- simple, parse-safe syntax for process diagrams, architecture diagrams, phase diagrams, and knowledge maps
- ordinary nodes and explicit edges when layout predictability matters
- one final last main node in process diagrams so the preceding subnodes always have outgoing connectors
- main-node / detail-node / next-main-node patterns as a preferred structure for process flows
- vertical ordering to imply reading order when useful

## Allowed

- chained edges like `A --> B --> C`
- fan-out with `&`
- subgraph-local direction statements like `direction LR` when useful
- `<b>...</b>` and `<br/>` inside labels

## Use with caution

- subgraphs, only when clearly needed and known to render correctly in the plugin
- edges to subgraph IDs, only when structure is simple and plugin behavior is known to be stable
- large `LR` diagrams whose readability depends on exact auto-layout behavior

## Avoid unless explicitly requested

- non-flowchart Mermaid types
- exotic Mermaid shorthand
- complex styling syntax beyond what is clearly useful
- constructs that depend on full Mermaid parity
- relying on Mermaid auto-layout for precise visual composition
- chaining detail nodes together when the intended meaning is fan-out / fan-in between main phases
- parser-valid constructs that are known to produce unstable or misleading layout in the plugin

## For process diagrams with phase details

- when the intended structure is `main phase -> vertically stacked detail nodes -> next main phase`, prefer normal nodes with explicit edges from the previous main node and to the next main node
- do not assume Mermaid will preserve the intended composition unless the structure itself enforces it

Prioritize reliability and plugin compatibility over cleverness.
