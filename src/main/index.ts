import "./polyfills";
import { layoutDiagram, MermaidParseError, parseMermaidFlowchart } from "../core";
import {
  defaultPresentationLayoutSettings,
  defaultRenderSettings,
  renderNativeNodes,
  type FitStrength,
  type LayoutTarget,
  type PresentationLayoutSettings,
  type RenderSettings,
} from "./render";
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

type UiLayoutSettings = {
  layoutTarget?: LayoutTarget;
  fitStrength?: FitStrength;
  targetCanvasWidth?: number;
  targetCanvasHeight?: number;
  slideSafeMargin?: number;
  targetAspectRatio?: number;
  minReadableTextSize?: number;
};

type RenderDiagramMessage = {
  type: "render-diagram";
  mermaid: string;
  replacePrevious: boolean;
  direction: DirectionOverride;
  spacing: SpacingPreset;
  layoutSettings?: UiLayoutSettings;
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
    const layoutSettings = getPresentationLayoutSettings(message.layoutSettings);
    const layout = layoutDiagram(diagram, getLayoutSpacing(message.spacing, layoutSettings));
    const target = resolveRenderTarget(message.replacePrevious);
    const rootFrame = await renderNativeNodes(diagram, layout, {
      instanceId: target.instanceId,
      layoutSettings,
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

function getLayoutSpacing(
  spacing: SpacingPreset,
  layoutSettings: PresentationLayoutSettings,
): Parameters<typeof layoutDiagram>[1] {
  if (layoutSettings.layoutTarget !== "freeform") {
    const safeWidth = Math.max(
      1,
      layoutSettings.targetCanvasWidth - layoutSettings.slideSafeMargin * 2,
    );
    const safeHeight = Math.max(
      1,
      layoutSettings.targetCanvasHeight - layoutSettings.slideSafeMargin * 2,
    );
    const slideScale = Math.min(safeWidth / 1920, safeHeight / 1080);

    if (layoutSettings.fitStrength === "strict") {
      return {
        edgeSep: 12,
        nodeSep: Math.max(28, Math.round(32 * slideScale)),
        rankSep: Math.max(56, Math.round(64 * slideScale)),
        subgraphPadding: 20,
      };
    }

    if (layoutSettings.fitStrength === "compact") {
      return {
        edgeSep: 16,
        nodeSep: Math.max(34, Math.round(40 * slideScale)),
        rankSep: Math.max(68, Math.round(76 * slideScale)),
        subgraphPadding: 24,
      };
    }
  }

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

function getPresentationLayoutSettings(
  settings: UiLayoutSettings | undefined,
): PresentationLayoutSettings {
  return {
    fitStrength: isFitStrength(settings?.fitStrength)
      ? settings.fitStrength
      : defaultPresentationLayoutSettings.fitStrength,
    layoutTarget: isLayoutTarget(settings?.layoutTarget)
      ? settings.layoutTarget
      : defaultPresentationLayoutSettings.layoutTarget,
    minReadableTextSize: clampNumber(
      settings?.minReadableTextSize,
      defaultPresentationLayoutSettings.minReadableTextSize,
      8,
      24,
    ),
    slideSafeMargin: clampNumber(
      settings?.slideSafeMargin,
      defaultPresentationLayoutSettings.slideSafeMargin,
      0,
      400,
    ),
    targetAspectRatio: clampNumber(
      settings?.targetAspectRatio,
      defaultPresentationLayoutSettings.targetAspectRatio,
      0.5,
      4,
    ),
    targetCanvasHeight: clampNumber(
      settings?.targetCanvasHeight,
      defaultPresentationLayoutSettings.targetCanvasHeight,
      240,
      10000,
    ),
    targetCanvasWidth: clampNumber(
      settings?.targetCanvasWidth,
      defaultPresentationLayoutSettings.targetCanvasWidth,
      320,
      10000,
    ),
  };
}

function isLayoutTarget(value: unknown): value is LayoutTarget {
  return value === "auto" || value === "slide-16-9" || value === "freeform";
}

function isFitStrength(value: unknown): value is FitStrength {
  return value === "balanced" || value === "compact" || value === "strict";
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
