import type { DiagramEdge, DiagramModel, DiagramNode, DiagramSubgraph } from "../core";

export const generatorName = "mermaid-native-generator";
export const generatorVersion = "0.1.0";

const metadataKeys = {
  generator: "generator",
  instanceId: "instanceId",
  kind: "kind",
  sourceHash: "sourceHash",
  sourceId: "sourceId",
  version: "version",
} as const;

type GeneratedKind = "diagram-root" | "subgraph" | "node" | "edge";

export function createInstanceId(): string {
  return `diagram_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isGeneratedDiagramRoot(node: SceneNode): node is FrameNode {
  return (
    node.type === "FRAME" &&
    node.getPluginData(metadataKeys.generator) === generatorName &&
    node.getPluginData(metadataKeys.kind) === "diagram-root"
  );
}

export function getInstanceId(node: SceneNode): string | null {
  const instanceId = node.getPluginData(metadataKeys.instanceId);
  return instanceId.length > 0 ? instanceId : null;
}

export function setDiagramRootMetadata(
  rootFrame: FrameNode,
  diagram: DiagramModel,
  instanceId: string,
): void {
  setCommonMetadata(rootFrame, "diagram-root", instanceId);
  rootFrame.setPluginData(metadataKeys.sourceHash, diagram.metadata.sourceHash);
}

export function setSubgraphMetadata(
  frame: FrameNode,
  subgraph: DiagramSubgraph,
  instanceId: string,
): void {
  setCommonMetadata(frame, "subgraph", instanceId);
  frame.setPluginData(metadataKeys.sourceId, subgraph.sourceId);
}

export function setNodeMetadata(group: GroupNode, node: DiagramNode, instanceId: string): void {
  setCommonMetadata(group, "node", instanceId);
  group.setPluginData(metadataKeys.sourceId, node.sourceId);
}

export function setEdgeMetadata(group: GroupNode, edge: DiagramEdge, instanceId: string): void {
  setCommonMetadata(group, "edge", instanceId);
  group.setPluginData(metadataKeys.sourceId, edge.sourceId);
}

function setCommonMetadata(node: SceneNode, kind: GeneratedKind, instanceId: string): void {
  node.setPluginData(metadataKeys.generator, generatorName);
  node.setPluginData(metadataKeys.version, generatorVersion);
  node.setPluginData(metadataKeys.kind, kind);
  node.setPluginData(metadataKeys.instanceId, instanceId);
}
