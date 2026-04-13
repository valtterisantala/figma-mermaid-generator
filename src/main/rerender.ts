import { createInstanceId, getInstanceId, isGeneratedDiagramRoot } from "./metadata";

export type RenderPlacement = {
  x: number;
  y: number;
  pageIndex?: number;
};

export type RenderTarget = {
  instanceId: string;
  placement?: RenderPlacement;
  previousRoot?: FrameNode;
  mode: "new" | "replace";
};

export function resolveRenderTarget(replacePrevious: boolean): RenderTarget {
  if (!replacePrevious) {
    return {
      instanceId: createInstanceId(),
      mode: "new",
    };
  }

  const previousRoot = findPreviousGeneratedRoot();

  if (!previousRoot) {
    return {
      instanceId: createInstanceId(),
      mode: "new",
    };
  }

  return {
    instanceId: getInstanceId(previousRoot) ?? createInstanceId(),
    mode: "replace",
    placement: {
      x: previousRoot.x,
      y: previousRoot.y,
      pageIndex: figma.currentPage.children.indexOf(previousRoot),
    },
    previousRoot,
  };
}

export function removePreviousRootAfterSuccessfulRender(target: RenderTarget): void {
  if (target.mode === "replace" && target.previousRoot && !target.previousRoot.removed) {
    target.previousRoot.remove();
  }
}

function findPreviousGeneratedRoot(): FrameNode | null {
  for (const selectedNode of figma.currentPage.selection) {
    const selectedRoot = findGeneratedRootForNode(selectedNode);

    if (selectedRoot) {
      return selectedRoot;
    }
  }

  return findLatestTopLevelGeneratedRoot();
}

function findGeneratedRootForNode(node: SceneNode): FrameNode | null {
  let current: BaseNode | null = node;

  while (current && current.type !== "PAGE") {
    if (isSceneNode(current) && isGeneratedDiagramRoot(current)) {
      return current;
    }

    current = current.parent;
  }

  return null;
}

function findLatestTopLevelGeneratedRoot(): FrameNode | null {
  for (let index = figma.currentPage.children.length - 1; index >= 0; index -= 1) {
    const node = figma.currentPage.children[index];

    if (isGeneratedDiagramRoot(node)) {
      return node;
    }
  }

  return null;
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return "visible" in node;
}
