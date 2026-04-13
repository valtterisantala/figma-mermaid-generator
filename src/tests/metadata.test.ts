import { describe, expect, it } from "vitest";
import { parseMermaidFlowchart } from "../core";
import {
  getInstanceId,
  generatorName,
  generatorVersion,
  isGeneratedDiagramRoot,
  setDiagramRootMetadata,
  setNodeMetadata,
} from "../main/metadata";

type MockSceneNode = {
  type: string;
  data: Map<string, string>;
  getPluginData: (key: string) => string;
  setPluginData: (key: string, value: string) => void;
};

function createMockSceneNode(type: string): MockSceneNode {
  const data = new Map<string, string>();

  return {
    type,
    data,
    getPluginData: (key: string) => data.get(key) ?? "",
    setPluginData: (key: string, value: string) => data.set(key, value),
  };
}

describe("metadata helpers", () => {
  it("marks generated diagram roots with source hash and stable instance id", () => {
    const diagram = parseMermaidFlowchart("flowchart TD\nA[Start] --> B[Done]");
    const root = createMockSceneNode("FRAME") as unknown as FrameNode;

    setDiagramRootMetadata(root, diagram, "instance-1");

    expect(isGeneratedDiagramRoot(root)).toBe(true);
    expect(getInstanceId(root)).toBe("instance-1");
    expect(root.getPluginData("generator")).toBe(generatorName);
    expect(root.getPluginData("version")).toBe(generatorVersion);
    expect(root.getPluginData("sourceHash")).toBe(diagram.metadata.sourceHash);
  });

  it("stores source ids on generated node groups", () => {
    const diagram = parseMermaidFlowchart("flowchart TD\nA[Start]");
    const nodeGroup = createMockSceneNode("GROUP") as unknown as GroupNode;

    setNodeMetadata(nodeGroup, diagram.nodes[0], "instance-1");

    expect(nodeGroup.getPluginData("kind")).toBe("node");
    expect(nodeGroup.getPluginData("instanceId")).toBe("instance-1");
    expect(nodeGroup.getPluginData("sourceId")).toBe("A");
  });
});
