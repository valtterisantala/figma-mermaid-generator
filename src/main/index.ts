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

figma.ui.onmessage = (message: UiMessage) => {
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

  figma.ui.postMessage({
    type: "render-placeholder",
    message:
      "Render request received. Parsing, layout, and native Figma rendering are coming next.",
    received: {
      characters: source.length,
      replacePrevious: message.replacePrevious,
      direction: message.direction,
      spacing: message.spacing,
    },
  });
};

export {};
