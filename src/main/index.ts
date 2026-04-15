import "./polyfills";
import { layoutDiagram, MermaidParseError, parseMermaidFlowchart } from "../core";
import { defaultRenderSettings, renderNativeNodes, type RenderSettings } from "./render";
import { removePreviousRootAfterSuccessfulRender, resolveRenderTarget } from "./rerender";

type FontCatalogEntry = {
  family: string;
  styles: string[];
};

figma.showUI(__html__, {
  width: 420,
  height: 680,
  themeColors: true,
});

void postInitialUiState();

type DirectionOverride = "auto" | "TD" | "LR";
type SpacingPreset = "compact" | "comfortable" | "spacious";

type UiRenderSettings = {
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  strokeWidth?: number;
  cornerRadius?: number;
  lineCornerRadius?: number;
};

type RenderDiagramMessage = {
  type: "render-diagram";
  mermaid: string;
  replacePrevious: boolean;
  direction: DirectionOverride;
  spacing: SpacingPreset;
  settings?: UiRenderSettings;
};

type UiResizeMessage = {
  type: "ui-resize";
  height: number;
};

type UiMessage = RenderDiagramMessage | UiResizeMessage;

figma.ui.onmessage = async (message: UiMessage) => {
  if (message.type === "ui-resize") {
    figma.ui.resize(420, clampNumber(message.height, 680, 320, 10000));
    return;
  }

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
    const target = resolveRenderTarget(message.replacePrevious);
    const rootFrame = await renderNativeNodes(diagram, layout, {
      instanceId: target.instanceId,
      placement: target.placement,
      settings: getRenderSettings(message.settings),
    });
    removePreviousRootAfterSuccessfulRender(target);

    figma.ui.postMessage({
      type: "render-complete",
      message: `${target.mode === "replace" ? "Replaced" : "Rendered"} ${diagram.nodes.length} nodes, ${diagram.edges.length} edges, and ${diagram.subgraphs.length} subgraphs.`,
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

function getRenderSettings(settings: UiRenderSettings | undefined): RenderSettings {
  return {
    fontName: {
      family: sanitizeFontSegment(settings?.fontFamily, defaultRenderSettings.fontName.family),
      style: sanitizeFontSegment(settings?.fontStyle, defaultRenderSettings.fontName.style),
    },
    fontSize: clampNumber(settings?.fontSize, defaultRenderSettings.fontSize, 8, 24),
    strokeWidth: clampNumber(settings?.strokeWidth, defaultRenderSettings.strokeWidth, 0.5, 12),
    cornerRadius: clampNumber(settings?.cornerRadius, defaultRenderSettings.cornerRadius, 0, 32),
    lineCornerRadius: clampNumber(
      settings?.lineCornerRadius,
      defaultRenderSettings.lineCornerRadius,
      0,
      32,
    ),
  };
}

function sanitizeFontSegment(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 64 ? trimmed : fallback;
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
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

async function postInitialUiState(): Promise<void> {
  const fonts = await listLocalFonts();

  figma.ui.postMessage({
    type: "font-catalog",
    fonts,
  });
  figma.ui.postMessage({
    type: "plugin-ready",
    message: "Mermaid Native Generator is ready.",
  });
}

async function listLocalFonts(): Promise<FontCatalogEntry[]> {
  try {
    const availableFonts = await figma.listAvailableFontsAsync();
    const stylesByFamily = new Map<string, Set<string>>();

    for (const font of availableFonts) {
      const family = font.fontName.family.trim();
      const style = font.fontName.style.trim();

      if (!family || !style) {
        continue;
      }

      const styles = stylesByFamily.get(family) ?? new Set<string>();
      styles.add(style);
      stylesByFamily.set(family, styles);
    }

    return [...stylesByFamily.entries()]
      .sort(([leftFamily], [rightFamily]) => leftFamily.localeCompare(rightFamily))
      .map(([family, styles]) => ({
        family,
        styles: [...styles].sort((leftStyle, rightStyle) => leftStyle.localeCompare(rightStyle)),
      }));
  } catch {
    return [];
  }
}

export {};
