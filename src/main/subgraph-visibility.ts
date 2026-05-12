import type { DiagramModel, DiagramSubgraph } from "../core";

const helperColumnIdPattern = /col\d+$/i;

export function isLayoutHelperSubgraph(subgraph: Pick<DiagramSubgraph, "id" | "label">): boolean {
  const label = subgraph.label.trim();

  return (
    label.length === 0 ||
    helperColumnIdPattern.test(subgraph.id) ||
    helperColumnIdPattern.test(label)
  );
}

export function getVisibleAncestorSubgraphId(
  diagram: DiagramModel,
  subgraphId: string | undefined,
): string | undefined {
  const subgraphById = new Map(diagram.subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  let currentId = subgraphId;

  while (currentId) {
    const subgraph = subgraphById.get(currentId);

    if (!subgraph) {
      return undefined;
    }

    if (!isLayoutHelperSubgraph(subgraph)) {
      return subgraph.id;
    }

    currentId = subgraph.parentId;
  }

  return undefined;
}
