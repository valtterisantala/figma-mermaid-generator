import "./polyfills";
import { layoutDiagram, MermaidParseError, parseMermaidFlowchart } from "../core";
import { renderNativeNodes } from "./render";

figma.showUI(__html__, {
  width: 420,
  height: 520,
  themeColors: true,
});

figma.ui.postMessage({
  type: "plugin-ready",
  message: "Mermaid Native Generator is ready.",
});

type DirectionOverride = "auto" | "TD" | "LR";
type SpacingPreset = "compact" | "comfortable" | "spacious";

type RenderDiagramMessage = {
  type: "render-diagram";
  mermaid: string;
  replacePrevious: boolean;
  direction: DirectionOverride;
  spacing: SpacingPreset;
};

type UiMessage = RenderDiagramMessage;

figma.ui.onmessage = async (message: UiMessage) => {
  if (message.type !== "render-diagram") {
    return;
  }

  const source = message.mermaid.trim();

  if (source.length === 0) {
    figma.ui.postMessage({
      type: "render-error",
      message: "Paste Mermaid syntax before rendering.",
    });
    return;
  }

  try {
    const diagram = parseMermaidFlowchart(applyDirectionOverride(source, message.direction));
    const layout = layoutDiagram(diagram, getLayoutSpacing(message.spacing));
    const rootFrame = await renderNativeNodes(diagram, layout);

    figma.ui.postMessage({
      type: "render-complete",
      message: `Rendered ${diagram.nodes.length} nodes and ${diagram.subgraphs.length} subgraphs. Edges are not rendered yet.`,
      nodeId: rootFrame.id,
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "render-error",
      message: getErrorMessage(error),
    });
  }
};

function applyDirectionOverride(source: string, direction: DirectionOverride): string {
  if (direction === "auto") {
    return source;
  }

  return source.replace(/^(\s*(?:flowchart|graph)\s+)([A-Za-z]+)/i, `$1${direction}`);
}

function getLayoutSpacing(spacing: SpacingPreset): Parameters<typeof layoutDiagram>[1] {
  if (spacing === "compact") {
    return {
      edgeSep: 16,
      nodeSep: 36,
      rankSep: 72,
      subgraphPadding: 24,
    };
  }

  if (spacing === "spacious") {
    return {
      edgeSep: 32,
      nodeSep: 80,
      rankSep: 128,
      subgraphPadding: 40,
    };
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof MermaidParseError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to render diagram.";
}

export {};
