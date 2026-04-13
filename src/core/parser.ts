import type {
  DiagramDirection,
  DiagramEdge,
  DiagramModel,
  DiagramNode,
  DiagramStyle,
  DiagramSubgraph,
  EdgeKind,
  NodeShape,
} from "./model";

export class MermaidParseError extends Error {
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(line === undefined ? message : `Line ${line}: ${message}`);
    this.name = "MermaidParseError";
    this.line = line;
  }
}

type ParseContext = {
  source: string;
  direction: DiagramDirection;
  nodes: Map<string, DiagramNode>;
  edges: DiagramEdge[];
  subgraphs: Map<string, DiagramSubgraph>;
  styles: Map<string, DiagramStyle>;
  classAssignments: Map<string, Set<string>>;
  subgraphStack: string[];
};

type ParsedNodeReference = {
  sourceId: string;
  label?: string;
  shape?: NodeShape;
};

const directionPattern = /^(?:flowchart|graph)\s+(TD|LR)$/i;
const supportedHeaderPattern = /^(?:flowchart|graph)\b/i;
const edgePattern = /^(.+?)\s*(-{2,3}>?|==+>?)\s*(?:\|([^|]+)\|\s*)?(.+)$/;

export function parseMermaidFlowchart(source: string): DiagramModel {
  const lines = source.split(/\r?\n/);
  const header = findHeader(lines);

  const context: ParseContext = {
    source,
    direction: header.direction,
    nodes: new Map(),
    edges: [],
    subgraphs: new Map(),
    styles: new Map(),
    classAssignments: new Map(),
    subgraphStack: [],
  };

  for (let index = header.index + 1; index < lines.length; index += 1) {
    parseStatement(lines[index], index + 1, context);
  }

  if (context.subgraphStack.length > 0) {
    throw new MermaidParseError("Subgraph is missing a closing end statement.");
  }

  applyClassAssignments(context);

  return {
    id: "diagram",
    direction: context.direction,
    nodes: [...context.nodes.values()],
    edges: context.edges,
    subgraphs: [...context.subgraphs.values()],
    styles: [...context.styles.values()],
    metadata: {
      sourceHash: stableHash(source),
      generatorVersion: "0.1.0",
    },
  };
}

function findHeader(lines: string[]): { index: number; direction: DiagramDirection } {
  for (let index = 0; index < lines.length; index += 1) {
    const statement = cleanLine(lines[index]);

    if (statement.length === 0) {
      continue;
    }

    const match = statement.match(directionPattern);
    if (match) {
      return {
        index,
        direction: match[1].toUpperCase() as DiagramDirection,
      };
    }

    if (supportedHeaderPattern.test(statement)) {
      throw new MermaidParseError("Only TD and LR flowchart directions are supported.", index + 1);
    }

    throw new MermaidParseError(
      "Expected Mermaid flowchart header, such as flowchart TD.",
      index + 1,
    );
  }

  throw new MermaidParseError("Expected Mermaid flowchart header, such as flowchart TD.");
}

function parseStatement(rawLine: string, lineNumber: number, context: ParseContext): void {
  const statement = cleanLine(rawLine);

  if (statement.length === 0) {
    return;
  }

  if (statement.toLowerCase() === "end") {
    closeSubgraph(lineNumber, context);
    return;
  }

  if (statement.toLowerCase().startsWith("subgraph ")) {
    parseSubgraph(statement, lineNumber, context);
    return;
  }

  if (statement.startsWith("classDef ")) {
    parseClassDef(statement, lineNumber, context);
    return;
  }

  if (statement.startsWith("class ")) {
    parseClassAssignment(statement, lineNumber, context);
    return;
  }

  const edgeMatch = statement.match(edgePattern);
  if (edgeMatch) {
    parseEdge(edgeMatch, lineNumber, context);
    return;
  }

  parseNodeStatement(statement, lineNumber, context);
}

function parseSubgraph(statement: string, lineNumber: number, context: ParseContext): void {
  const declaration = statement.slice("subgraph ".length).trim();
  const parsed = parseNodeReference(declaration, lineNumber);
  const label = parsed.label ?? parsed.sourceId;
  const id = normalizeScopedId(parsed.sourceId);

  if (context.subgraphs.has(id)) {
    throw new MermaidParseError(`Duplicate subgraph id "${parsed.sourceId}".`, lineNumber);
  }

  context.subgraphs.set(id, {
    id,
    sourceId: parsed.sourceId,
    label,
    parentId: getCurrentSubgraphId(context),
    nodeIds: [],
    edgeIds: [],
  });
  context.subgraphStack.push(id);
}

function closeSubgraph(lineNumber: number, context: ParseContext): void {
  if (context.subgraphStack.length === 0) {
    throw new MermaidParseError("Unexpected end statement without an open subgraph.", lineNumber);
  }

  context.subgraphStack.pop();
}

function parseClassDef(statement: string, lineNumber: number, context: ParseContext): void {
  const match = statement.match(/^classDef\s+([A-Za-z_][\w-]*)\s+(.+)$/);

  if (!match) {
    throw new MermaidParseError(
      "Expected classDef name followed by style declarations.",
      lineNumber,
    );
  }

  const [, sourceId, declaration] = match;
  context.styles.set(sourceId, {
    id: sourceId,
    properties: parseStyleDeclaration(declaration),
  });
}

function parseClassAssignment(statement: string, lineNumber: number, context: ParseContext): void {
  const match = statement.match(/^class\s+(.+?)\s+([A-Za-z_][\w-]*)\s*;?$/);

  if (!match) {
    throw new MermaidParseError(
      "Expected class statement in the form: class nodeId className.",
      lineNumber,
    );
  }

  const [, targetList, classId] = match;
  const targets = targetList
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);

  if (targets.length === 0) {
    throw new MermaidParseError("Class statement must include at least one node id.", lineNumber);
  }

  for (const target of targets) {
    const nodeId = normalizeScopedId(target);
    const assignments = context.classAssignments.get(nodeId) ?? new Set<string>();
    assignments.add(classId);
    context.classAssignments.set(nodeId, assignments);
  }
}

function parseEdge(match: RegExpMatchArray, lineNumber: number, context: ParseContext): void {
  const [, leftRaw, marker, labelRaw, rightRaw] = match;
  const left = parseNodeReference(leftRaw.trim(), lineNumber);
  const right = parseNodeReference(rightRaw.trim(), lineNumber);
  const from = upsertNode(left, lineNumber, context);
  const to = upsertNode(right, lineNumber, context);
  const label = labelRaw?.trim();
  const edgeIndex = context.edges.length + 1;
  const id = createEdgeId(from.id, to.id, label, edgeIndex);
  const edge: DiagramEdge = {
    id,
    sourceId: id,
    from: from.id,
    to: to.id,
    kind: marker.includes(">") ? "arrow" : ("line" satisfies EdgeKind),
    label: label && label.length > 0 ? label : undefined,
    classIds: [],
    subgraphId: getCurrentSubgraphId(context),
  };

  context.edges.push(edge);
  addEdgeToCurrentSubgraph(edge.id, context);
}

function parseNodeStatement(statement: string, lineNumber: number, context: ParseContext): void {
  const node = parseNodeReference(statement, lineNumber);
  upsertNode(node, lineNumber, context);
}

function upsertNode(
  parsed: ParsedNodeReference,
  lineNumber: number,
  context: ParseContext,
): DiagramNode {
  const id = normalizeScopedId(parsed.sourceId);
  const existing = context.nodes.get(id);

  if (existing) {
    if (parsed.label && existing.label !== parsed.label) {
      existing.label = parsed.label;
    }

    if (parsed.shape) {
      existing.shape = parsed.shape;
    }

    return existing;
  }

  const node: DiagramNode = {
    id,
    sourceId: parsed.sourceId,
    label: parsed.label ?? parsed.sourceId,
    shape: parsed.shape ?? "rectangle",
    classIds: [],
    subgraphId: getCurrentSubgraphId(context),
  };

  context.nodes.set(id, node);
  addNodeToCurrentSubgraph(id, lineNumber, context);
  return node;
}

function parseNodeReference(source: string, lineNumber: number): ParsedNodeReference {
  const trimmed = source.trim().replace(/;$/, "").trim();

  if (trimmed.length === 0) {
    throw new MermaidParseError("Expected node id.", lineNumber);
  }

  const shape = parseShapedNode(trimmed);
  if (shape) {
    return shape;
  }

  if (!isValidSourceId(trimmed)) {
    throw new MermaidParseError(`Unsupported node reference "${trimmed}".`, lineNumber);
  }

  return {
    sourceId: trimmed,
  };
}

function parseShapedNode(source: string): ParsedNodeReference | null {
  const shapePatterns: Array<[RegExp, NodeShape]> = [
    [/^([A-Za-z_][\w-]*)\s*\(\((.+)\)\)$/, "circle"],
    [/^([A-Za-z_][\w-]*)\s*\(\[(.+)\]\)$/, "stadium"],
    [/^([A-Za-z_][\w-]*)\s*\[(.+)\]$/, "rectangle"],
    [/^([A-Za-z_][\w-]*)\s*\((.+)\)$/, "rounded"],
    [/^([A-Za-z_][\w-]*)\s*\{(.+)\}$/, "diamond"],
    [/^([A-Za-z_][\w-]*)\s*>(.+)\]$/, "asymmetric"],
  ];

  for (const [pattern, shape] of shapePatterns) {
    const match = source.match(pattern);
    if (match) {
      return {
        sourceId: match[1],
        label: unquote(match[2].trim()),
        shape,
      };
    }
  }

  return null;
}

function parseStyleDeclaration(declaration: string): Record<string, string> {
  return declaration
    .replace(/;$/, "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((properties, pair) => {
      const separator = pair.indexOf(":");
      if (separator === -1) {
        properties[pair] = "";
        return properties;
      }

      properties[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
      return properties;
    }, {});
}

function applyClassAssignments(context: ParseContext): void {
  for (const [nodeId, classIds] of context.classAssignments) {
    const node = context.nodes.get(nodeId);

    if (!node) {
      throw new MermaidParseError(`Class assignment references unknown node "${nodeId}".`);
    }

    node.classIds = [...classIds];
  }
}

function addNodeToCurrentSubgraph(nodeId: string, lineNumber: number, context: ParseContext): void {
  const subgraphId = getCurrentSubgraphId(context);

  if (!subgraphId) {
    return;
  }

  const subgraph = context.subgraphs.get(subgraphId);
  if (!subgraph) {
    throw new MermaidParseError(`Unknown subgraph "${subgraphId}".`, lineNumber);
  }

  if (!subgraph.nodeIds.includes(nodeId)) {
    subgraph.nodeIds.push(nodeId);
  }
}

function addEdgeToCurrentSubgraph(edgeId: string, context: ParseContext): void {
  const subgraphId = getCurrentSubgraphId(context);

  if (!subgraphId) {
    return;
  }

  const subgraph = context.subgraphs.get(subgraphId);
  subgraph?.edgeIds.push(edgeId);
}

function getCurrentSubgraphId(context: ParseContext): string | undefined {
  return context.subgraphStack[context.subgraphStack.length - 1];
}

function cleanLine(line: string): string {
  return line.replace(/%%.*$/, "").trim();
}

function normalizeScopedId(sourceId: string): string {
  return sourceId.trim().replace(/[^\w-]+/g, "_");
}

function createEdgeId(from: string, to: string, label: string | undefined, index: number): string {
  const labelSegment = label ? `_${normalizeScopedId(label)}` : "";
  return `edge_${index}_${from}_to_${to}${labelSegment}`;
}

function isValidSourceId(sourceId: string): boolean {
  return /^[A-Za-z_][\w-]*$/.test(sourceId);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function stableHash(source: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
