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

type EdgeEndpoint = {
  id: string;
};

type MermaidStatement = {
  text: string;
  lineNumber: number;
};

type EdgeParts = {
  left: string;
  marker: string;
  label?: string;
  right: string;
};

type ScanState = {
  quote: '"' | "'" | null;
  squareDepth: number;
  parenDepth: number;
  braceDepth: number;
};

const directionPattern = /^(?:flowchart|graph)\s+(TD|TB|LR)$/i;
const subgraphDirectionPattern = /^direction\s+(TD|TB|LR)$/i;
const anyDirectionPattern = /^direction\b/i;
const supportedHeaderPattern = /^(?:flowchart|graph)\b/i;
const unsupportedDiagramPattern =
  /^(sequenceDiagram|stateDiagram(?:-v2)?|gantt|mindmap|erDiagram|classDiagram|journey|pie)\b/i;

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

  for (const statement of collectStatements(lines, header.index + 1)) {
    parseStatement(statement.text, statement.lineNumber, context);
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
        direction: normalizeDirection(match[1]),
      };
    }

    if (supportedHeaderPattern.test(statement)) {
      throw new MermaidParseError(
        "Only TD, TB, and LR flowchart directions are supported.",
        index + 1,
      );
    }

    const unsupportedDiagram = statement.match(unsupportedDiagramPattern);
    if (unsupportedDiagram) {
      throw new MermaidParseError(
        `Unsupported Mermaid diagram type "${unsupportedDiagram[1]}". This plugin currently supports flowchart TD, TB, and LR only.`,
        index + 1,
      );
    }

    throw new MermaidParseError(
      "Expected Mermaid flowchart header, such as flowchart TD.",
      index + 1,
    );
  }

  throw new MermaidParseError("Expected Mermaid flowchart header, such as flowchart TD.");
}

function parseStatement(rawLine: string, lineNumber: number, context: ParseContext): void {
  const statement = rawLine.trim();

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

  if (anyDirectionPattern.test(statement)) {
    parseSubgraphDirection(statement, lineNumber, context);
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

  const edgeParts = splitEdgeStatement(statement, lineNumber);
  if (edgeParts.length > 0) {
    for (const edgePart of edgeParts) {
      parseEdge(edgePart, lineNumber, context);
    }
    return;
  }

  parseNodeStatement(statement, lineNumber, context);
}

function parseSubgraph(statement: string, lineNumber: number, context: ParseContext): void {
  const declaration = statement.slice("subgraph ".length).trim();
  const parsed = parseSubgraphDeclaration(declaration, lineNumber);
  const label = parsed.label;
  const id = normalizeScopedId(parsed.sourceId);

  if (context.subgraphs.has(id)) {
    throw new MermaidParseError(`Duplicate subgraph id "${parsed.sourceId}".`, lineNumber);
  }

  removePlainPlaceholderNode(id, context);

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

function removePlainPlaceholderNode(id: string, context: ParseContext): void {
  const existingNode = context.nodes.get(id);

  if (
    !existingNode ||
    existingNode.label !== existingNode.sourceId ||
    existingNode.shape !== "rectangle" ||
    existingNode.classIds.length > 0
  ) {
    return;
  }

  context.nodes.delete(id);

  for (const subgraph of context.subgraphs.values()) {
    subgraph.nodeIds = subgraph.nodeIds.filter((nodeId) => nodeId !== id);
  }
}

function closeSubgraph(lineNumber: number, context: ParseContext): void {
  if (context.subgraphStack.length === 0) {
    throw new MermaidParseError("Unexpected end statement without an open subgraph.", lineNumber);
  }

  context.subgraphStack.pop();
}

function parseSubgraphDirection(
  statement: string,
  lineNumber: number,
  context: ParseContext,
): void {
  const match = statement.match(subgraphDirectionPattern);

  if (!match) {
    throw new MermaidParseError(
      "Only TD, TB, and LR subgraph directions are supported.",
      lineNumber,
    );
  }

  const subgraphId = getCurrentSubgraphId(context);

  if (!subgraphId) {
    throw new MermaidParseError(
      "direction statements are only supported inside subgraphs.",
      lineNumber,
    );
  }

  const subgraph = context.subgraphs.get(subgraphId);
  if (!subgraph) {
    throw new MermaidParseError(`Unknown subgraph "${subgraphId}".`, lineNumber);
  }

  subgraph.direction = normalizeDirection(match[1]);
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

function parseEdge(edgeParts: EdgeParts, lineNumber: number, context: ParseContext): void {
  const leftReferences = splitNodeReferences(edgeParts.left, lineNumber);
  const rightReferences = splitNodeReferences(edgeParts.right, lineNumber);
  const label = edgeParts.label?.trim();

  for (const leftReference of leftReferences) {
    const from = resolveEdgeEndpoint(leftReference, lineNumber, context);

    for (const rightReference of rightReferences) {
      const to = resolveEdgeEndpoint(rightReference, lineNumber, context);
      const edgeIndex = context.edges.length + 1;
      const id = createEdgeId(from.id, to.id, label, edgeIndex);
      const edge: DiagramEdge = {
        id,
        sourceId: id,
        from: from.id,
        to: to.id,
        kind: edgeParts.marker.includes(">") ? "arrow" : ("line" satisfies EdgeKind),
        label: label && label.length > 0 ? label : undefined,
        classIds: [],
        subgraphId: getCurrentSubgraphId(context),
      };

      context.edges.push(edge);
      addEdgeToCurrentSubgraph(edge.id, context);
    }
  }
}

function resolveEdgeEndpoint(
  parsed: ParsedNodeReference,
  lineNumber: number,
  context: ParseContext,
): EdgeEndpoint {
  const id = normalizeScopedId(parsed.sourceId);

  if (!parsed.label && !parsed.shape && context.subgraphs.has(id)) {
    return {
      id,
    };
  }

  return upsertNode(parsed, lineNumber, context);
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

  if (isQuoted(trimmed)) {
    const label = unquote(trimmed);
    return {
      sourceId: label,
      label,
    };
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
    [/^([A-Za-z_][\w-]*)\s*\(\(([\s\S]+)\)\)$/, "circle"],
    [/^([A-Za-z_][\w-]*)\s*\(\[([\s\S]+)\]\)$/, "stadium"],
    [/^([A-Za-z_][\w-]*)\s*\[([\s\S]+)\]$/, "rectangle"],
    [/^([A-Za-z_][\w-]*)\s*\(([\s\S]+)\)$/, "rounded"],
    [/^([A-Za-z_][\w-]*)\s*\{([\s\S]+)\}$/, "diamond"],
    [/^([A-Za-z_][\w-]*)\s*>([\s\S]+)\]$/, "asymmetric"],
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

function parseSubgraphDeclaration(
  declaration: string,
  lineNumber: number,
): { sourceId: string; label: string } {
  if (isQuoted(declaration)) {
    const label = unquote(declaration);
    return {
      sourceId: normalizeScopedId(label),
      label,
    };
  }

  if (!hasNodeShapeSyntax(declaration) && !isValidSourceId(declaration)) {
    return {
      sourceId: normalizeScopedId(declaration),
      label: declaration,
    };
  }

  const parsed = parseNodeReference(declaration, lineNumber);

  if (parsed.label) {
    return {
      sourceId: parsed.sourceId,
      label: parsed.label,
    };
  }

  if (isValidSourceId(parsed.sourceId)) {
    return {
      sourceId: parsed.sourceId,
      label: parsed.sourceId,
    };
  }

  const label = parsed.sourceId;
  return {
    sourceId: normalizeScopedId(label),
    label,
  };
}

function collectStatements(lines: string[], startIndex: number): MermaidStatement[] {
  const statements: MermaidStatement[] = [];
  let buffer = "";
  let startLine = startIndex + 1;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = stripComment(lines[index]);

    if (buffer.length === 0 && line.trim().length === 0) {
      continue;
    }

    if (buffer.length === 0) {
      startLine = index + 1;
      buffer = line.trim();
    } else {
      buffer = `${buffer}\n${line.trimEnd()}`;
    }

    if (!isOpenStatement(buffer)) {
      statements.push({
        text: buffer.trim(),
        lineNumber: startLine,
      });
      buffer = "";
    }
  }

  if (buffer.trim().length > 0) {
    statements.push({
      text: buffer.trim(),
      lineNumber: startLine,
    });
  }

  return statements;
}

function splitEdgeStatement(statement: string, lineNumber: number): EdgeParts[] {
  const marker = findTopLevelEdgeMarker(statement);

  if (!marker) {
    return [];
  }

  const parts: EdgeParts[] = [];
  let left = statement.slice(0, marker.index).trim();
  let currentMarker = marker.value;
  let rest = statement.slice(marker.index + marker.value.length).trim();

  while (true) {
    const label = extractEdgeLabel(rest);
    const nextMarker = findTopLevelEdgeMarker(label.right);
    const right = (nextMarker ? label.right.slice(0, nextMarker.index) : label.right).trim();

    if (!left || !right) {
      throw new MermaidParseError(
        "Expected node references on both sides of the edge statement.",
        lineNumber,
      );
    }

    parts.push({
      left,
      marker: currentMarker,
      label: label.label,
      right,
    });

    if (!nextMarker) {
      return parts;
    }

    left = right;
    currentMarker = nextMarker.value;
    rest = label.right.slice(nextMarker.index + nextMarker.value.length).trim();
  }
}

function findTopLevelEdgeMarker(statement: string): { index: number; value: string } | null {
  const state = createScanState();

  for (let index = 0; index < statement.length; index += 1) {
    updateScanState(state, statement[index], statement[index - 1]);

    if (!isTopLevel(state)) {
      continue;
    }

    const rest = statement.slice(index);
    const marker = ["-->", "---", "--", "==>", "==="].find((candidate) =>
      rest.startsWith(candidate),
    );

    if (marker) {
      return {
        index,
        value: marker,
      };
    }
  }

  return null;
}

function extractEdgeLabel(source: string): { label?: string; right: string } {
  const trimmed = source.trim();

  if (!trimmed.startsWith("|")) {
    return {
      right: trimmed,
    };
  }

  const closingIndex = findClosingEdgeLabel(trimmed);

  if (closingIndex === -1) {
    return {
      right: trimmed,
    };
  }

  return {
    label: trimmed.slice(1, closingIndex).trim(),
    right: trimmed.slice(closingIndex + 1).trim(),
  };
}

function findClosingEdgeLabel(source: string): number {
  let quote: '"' | "'" | null = null;

  for (let index = 1; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];

    if ((character === '"' || character === "'") && previous !== "\\") {
      quote = quote === character ? null : (quote ?? character);
      continue;
    }

    if (character === "|" && !quote) {
      return index;
    }
  }

  return -1;
}

function splitNodeReferences(source: string, lineNumber: number): ParsedNodeReference[] {
  const references = splitTopLevel(source, "&").map((part) => part.trim());

  if (references.some((reference) => reference.length === 0)) {
    throw new MermaidParseError("Fan-out edge list contains an empty node reference.", lineNumber);
  }

  if (references.length === 0) {
    throw new MermaidParseError("Expected at least one node reference.", lineNumber);
  }

  return references.map((reference) => {
    if (findTopLevelEdgeMarker(reference)) {
      throw new MermaidParseError(
        `Unsupported edge marker inside node reference "${reference}".`,
        lineNumber,
      );
    }

    return parseNodeReference(reference, lineNumber);
  });
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  const state = createScanState();
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    updateScanState(state, source[index], source[index - 1]);

    if (source[index] === separator && isTopLevel(state)) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(source.slice(start));
  return parts;
}

function normalizeDirection(direction: string): DiagramDirection {
  const normalized = direction.toUpperCase();
  return normalized === "LR" ? "LR" : "TD";
}

function createScanState(): ScanState {
  return {
    quote: null,
    squareDepth: 0,
    parenDepth: 0,
    braceDepth: 0,
  };
}

function updateScanState(state: ScanState, character: string, previous: string | undefined): void {
  if ((character === '"' || character === "'") && previous !== "\\") {
    state.quote = state.quote === character ? null : (state.quote ?? character);
    return;
  }

  if (state.quote) {
    return;
  }

  if (character === "[") {
    state.squareDepth += 1;
    return;
  }

  if (character === "]") {
    state.squareDepth = Math.max(0, state.squareDepth - 1);
    return;
  }

  if (character === "(") {
    state.parenDepth += 1;
    return;
  }

  if (character === ")") {
    state.parenDepth = Math.max(0, state.parenDepth - 1);
    return;
  }

  if (character === "{") {
    state.braceDepth += 1;
    return;
  }

  if (character === "}") {
    state.braceDepth = Math.max(0, state.braceDepth - 1);
  }
}

function isTopLevel(state: ScanState): boolean {
  return (
    !state.quote && state.squareDepth === 0 && state.parenDepth === 0 && state.braceDepth === 0
  );
}

function isOpenStatement(statement: string): boolean {
  const state = createScanState();

  for (let index = 0; index < statement.length; index += 1) {
    updateScanState(state, statement[index], statement[index - 1]);
  }

  return !isTopLevel(state);
}

function stripComment(line: string): string {
  const state = createScanState();

  for (let index = 0; index < line.length; index += 1) {
    updateScanState(state, line[index], line[index - 1]);

    if (line[index] === "%" && line[index + 1] === "%" && isTopLevel(state)) {
      return line.slice(0, index);
    }
  }

  return line;
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
  return stripComment(line).trim();
}

function normalizeScopedId(sourceId: string): string {
  const normalized = sourceId
    .trim()
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "item";
}

function createEdgeId(from: string, to: string, label: string | undefined, index: number): string {
  const labelSegment = label ? `_${normalizeScopedId(label)}` : "";
  return `edge_${index}_${from}_to_${to}${labelSegment}`;
}

function isValidSourceId(sourceId: string): boolean {
  return /^[A-Za-z_][\w-]*$/.test(sourceId);
}

function hasNodeShapeSyntax(source: string): boolean {
  return /^[A-Za-z_][\w-]*\s*(?:\(\(|\(\[|\[|\(|\{|>)/.test(source.trim());
}

function isQuoted(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  );
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (isQuoted(trimmed)) {
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
