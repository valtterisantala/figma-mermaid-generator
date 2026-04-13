export type DiagramDirection = "TD" | "LR";

export type NodeShape = "rectangle" | "rounded" | "stadium" | "circle" | "diamond" | "asymmetric";

export type EdgeKind = "arrow" | "line";

export type DiagramStyle = {
  id: string;
  properties: Record<string, string>;
};

export type DiagramNode = {
  id: string;
  sourceId: string;
  label: string;
  shape: NodeShape;
  classIds: string[];
  subgraphId?: string;
};

export type DiagramEdge = {
  id: string;
  sourceId: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  classIds: string[];
  subgraphId?: string;
};

export type DiagramSubgraph = {
  id: string;
  sourceId: string;
  label: string;
  parentId?: string;
  nodeIds: string[];
  edgeIds: string[];
};

export type DiagramLayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DiagramLayoutEdgePoint = {
  x: number;
  y: number;
};

export type DiagramLayoutEdge = {
  id: string;
  points: DiagramLayoutEdgePoint[];
  labelPosition?: DiagramLayoutEdgePoint;
};

export type DiagramLayoutResult = {
  nodes: DiagramLayoutNode[];
  edges: DiagramLayoutEdge[];
  subgraphs: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};

export type DiagramMetadata = {
  sourceHash: string;
  generatorVersion: string;
};

export type DiagramModel = {
  id: string;
  direction: DiagramDirection;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  subgraphs: DiagramSubgraph[];
  styles: DiagramStyle[];
  metadata: DiagramMetadata;
};
