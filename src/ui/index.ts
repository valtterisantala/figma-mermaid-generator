type DirectionOverride = "auto" | "TD" | "LR";
type SpacingPreset = "compact" | "comfortable" | "spacious";
type LayoutTarget = "auto" | "slide-16-9" | "freeform";
type FitStrength = "balanced" | "compact" | "strict";
type TargetResolution = "hd" | "4k" | "custom";
type SlideMarginPreset = "default" | "compact" | "custom";

type RenderSettings = {
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  strokeWidth: number;
  cornerRadius: number;
  lineCornerRadius: number;
  fitStrength: FitStrength;
  layoutTarget: LayoutTarget;
  minReadableTextSize: number;
  slideMarginPreset: SlideMarginPreset;
  slideSafeMargin: number;
  targetAspectRatio: number;
  targetCanvasHeight: number;
  targetCanvasWidth: number;
  targetResolution: TargetResolution;
};

type FontCatalogEntry = {
  family: string;
  styles: string[];
};

type PluginReadyMessage = {
  type: "plugin-ready";
  message: string;
};

type RenderCompleteMessage = {
  type: "render-complete";
  message: string;
  nodeId: string;
};

type RenderErrorMessage = {
  type: "render-error";
  message: string;
};

type FontCatalogMessage = {
  type: "font-catalog";
  fonts: FontCatalogEntry[];
};

type PluginMessage =
  | PluginReadyMessage
  | RenderCompleteMessage
  | RenderErrorMessage
  | FontCatalogMessage;

const statusElement = document.querySelector<HTMLParagraphElement>("#status");
const errorElement = document.querySelector<HTMLParagraphElement>("#error-message");
const mermaidInput = document.querySelector<HTMLTextAreaElement>("#mermaid-input");
const renderButton = document.querySelector<HTMLButtonElement>("#render-button");
const sampleButton = document.querySelector<HTMLButtonElement>("#sample-button");
const replacePreviousInput = document.querySelector<HTMLInputElement>("#replace-previous");
const directionSelect = document.querySelector<HTMLSelectElement>("#direction-select");
const spacingSelect = document.querySelector<HTMLSelectElement>("#spacing-select");
const layoutTargetSelect = document.querySelector<HTMLSelectElement>("#layout-target-select");
const fitStrengthSelect = document.querySelector<HTMLSelectElement>("#fit-strength-select");
const targetResolutionSelect = document.querySelector<HTMLSelectElement>(
  "#target-resolution-select",
);
const targetCanvasWidthInput = document.querySelector<HTMLInputElement>(
  "#target-canvas-width-input",
);
const targetCanvasHeightInput = document.querySelector<HTMLInputElement>(
  "#target-canvas-height-input",
);
const slideMarginPresetSelect = document.querySelector<HTMLSelectElement>(
  "#slide-margin-preset-select",
);
const slideSafeMarginInput = document.querySelector<HTMLInputElement>("#slide-safe-margin-input");
const fontFamilySelect = document.querySelector<HTMLSelectElement>("#font-family-select");
const fontStyleSelect = document.querySelector<HTMLSelectElement>("#font-style-select");
const fontSizeInput = document.querySelector<HTMLInputElement>("#font-size-input");
const strokeWidthInput = document.querySelector<HTMLInputElement>("#stroke-width-input");
const cornerRadiusInput = document.querySelector<HTMLInputElement>("#corner-radius-input");
const lineCornerRadiusInput = document.querySelector<HTMLInputElement>("#line-corner-radius-input");

const settingsStorageKey = "mermaid-native-generator-render-settings";
const favoriteFontTokens = ["FK", "Aptos"];
const defaultRenderSettings: RenderSettings = {
  fontFamily: "FK Grotesk Neue Trial",
  fontStyle: "Regular",
  fontSize: 13,
  strokeWidth: 1,
  cornerRadius: 20,
  lineCornerRadius: 12,
  fitStrength: "balanced",
  layoutTarget: "auto",
  minReadableTextSize: 8,
  slideMarginPreset: "default",
  slideSafeMargin: 80,
  targetAspectRatio: 16 / 9,
  targetCanvasHeight: 1080,
  targetCanvasWidth: 1920,
  targetResolution: "hd",
};
const sampleMermaid = `flowchart TD
  Start[Start] --> Decision{Ready?}
  Decision -->|Yes| Render[Render native Figma nodes]
  Decision -->|No| Revise[Revise input]
  Revise --> Decision`;

let resizeRafId: number | null = null;
let availableFonts: FontCatalogEntry[] = [];
const persistedSettings = loadRenderSettings();

const postUiResize = () => {
  const nextHeight = Math.ceil(document.documentElement.scrollHeight);
  parent.postMessage(
    {
      pluginMessage: {
        type: "ui-resize",
        height: nextHeight,
      },
    },
    "*",
  );
};

const scheduleUiResize = () => {
  if (resizeRafId !== null) {
    return;
  }

  resizeRafId = window.requestAnimationFrame(() => {
    resizeRafId = null;
    postUiResize();
  });
};

const setStatus = (message: string) => {
  if (statusElement) {
    statusElement.textContent = message;
  }
};

const setError = (message: string | null) => {
  if (!errorElement) {
    return;
  }

  if (message) {
    errorElement.textContent = message;
    errorElement.hidden = false;
    return;
  }

  errorElement.textContent = "";
  errorElement.hidden = true;
};

const getDirection = (): DirectionOverride => {
  const value = directionSelect?.value;
  return value === "TD" || value === "LR" ? value : "auto";
};

const getSpacing = (): SpacingPreset => {
  const value = spacingSelect?.value;
  if (value === "compact" || value === "spacious") {
    return value;
  }

  return "comfortable";
};

const getLayoutTarget = (): LayoutTarget => {
  const value = layoutTargetSelect?.value;
  if (value === "slide-16-9" || value === "freeform") {
    return value;
  }

  return "auto";
};

const getFitStrength = (): FitStrength => {
  const value = fitStrengthSelect?.value;
  if (value === "compact" || value === "strict") {
    return value;
  }

  return "balanced";
};

const getTargetResolution = (): TargetResolution => {
  const value = targetResolutionSelect?.value;
  if (value === "4k" || value === "custom") {
    return value;
  }

  return "hd";
};

const getSlideMarginPreset = (): SlideMarginPreset => {
  const value = slideMarginPresetSelect?.value;
  if (value === "compact" || value === "custom") {
    return value;
  }

  return "default";
};

const clampNumber = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number.parseFloat(value ?? "");

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
};

const getRenderSettings = (): RenderSettings => {
  const targetResolution = getTargetResolution();
  const targetCanvasWidth =
    targetResolution === "4k"
      ? 3840
      : targetResolution === "custom"
        ? clampNumber(
            targetCanvasWidthInput?.value,
            defaultRenderSettings.targetCanvasWidth,
            320,
            10000,
          )
        : 1920;
  const targetCanvasHeight =
    targetResolution === "4k"
      ? 2160
      : targetResolution === "custom"
        ? clampNumber(
            targetCanvasHeightInput?.value,
            defaultRenderSettings.targetCanvasHeight,
            240,
            10000,
          )
        : 1080;
  const slideMarginPreset = getSlideMarginPreset();
  const resolutionScale = targetCanvasWidth >= 3000 || targetCanvasHeight >= 1700 ? 2 : 1;
  const slideSafeMargin =
    slideMarginPreset === "custom"
      ? clampNumber(slideSafeMarginInput?.value, defaultRenderSettings.slideSafeMargin, 0, 400)
      : slideMarginPreset === "compact"
        ? 40 * resolutionScale
        : 80 * resolutionScale;

  return {
    fontFamily: fontFamilySelect?.value || defaultRenderSettings.fontFamily,
    fontStyle: fontStyleSelect?.value || defaultRenderSettings.fontStyle,
    fontSize: clampNumber(fontSizeInput?.value, defaultRenderSettings.fontSize, 8, 24),
    strokeWidth: clampNumber(strokeWidthInput?.value, defaultRenderSettings.strokeWidth, 0.5, 12),
    cornerRadius: clampNumber(cornerRadiusInput?.value, defaultRenderSettings.cornerRadius, 0, 32),
    lineCornerRadius: clampNumber(
      lineCornerRadiusInput?.value,
      defaultRenderSettings.lineCornerRadius,
      0,
      32,
    ),
    fitStrength: getFitStrength(),
    layoutTarget: getLayoutTarget(),
    minReadableTextSize: defaultRenderSettings.minReadableTextSize,
    slideMarginPreset,
    slideSafeMargin,
    targetAspectRatio: 16 / 9,
    targetCanvasHeight,
    targetCanvasWidth,
    targetResolution,
  };
};

const applyNumericRenderSettings = (settings: RenderSettings) => {
  if (fontSizeInput) {
    fontSizeInput.value = String(settings.fontSize);
  }

  if (strokeWidthInput) {
    strokeWidthInput.value = String(settings.strokeWidth);
  }

  if (cornerRadiusInput) {
    cornerRadiusInput.value = String(settings.cornerRadius);
  }

  if (lineCornerRadiusInput) {
    lineCornerRadiusInput.value = String(settings.lineCornerRadius);
  }

  if (layoutTargetSelect) {
    layoutTargetSelect.value = settings.layoutTarget;
  }

  if (fitStrengthSelect) {
    fitStrengthSelect.value = settings.fitStrength;
  }

  if (targetResolutionSelect) {
    targetResolutionSelect.value = settings.targetResolution;
  }

  if (targetCanvasWidthInput) {
    targetCanvasWidthInput.value = String(settings.targetCanvasWidth);
  }

  if (targetCanvasHeightInput) {
    targetCanvasHeightInput.value = String(settings.targetCanvasHeight);
  }

  if (slideMarginPresetSelect) {
    slideMarginPresetSelect.value = settings.slideMarginPreset;
  }

  if (slideSafeMarginInput) {
    slideSafeMarginInput.value = String(settings.slideSafeMargin);
  }

  syncPresentationControlState();
};

function loadRenderSettings(): RenderSettings {
  try {
    const rawSettings = window.localStorage.getItem(settingsStorageKey);

    if (!rawSettings) {
      return defaultRenderSettings;
    }

    const parsed = JSON.parse(rawSettings) as Partial<RenderSettings>;
    return {
      fontFamily: parsed.fontFamily ?? defaultRenderSettings.fontFamily,
      fontStyle: parsed.fontStyle ?? defaultRenderSettings.fontStyle,
      fontSize: clampNumber(String(parsed.fontSize), defaultRenderSettings.fontSize, 8, 24),
      strokeWidth: clampNumber(
        String(parsed.strokeWidth),
        defaultRenderSettings.strokeWidth,
        0.5,
        12,
      ),
      cornerRadius: clampNumber(
        String(parsed.cornerRadius),
        defaultRenderSettings.cornerRadius,
        0,
        32,
      ),
      lineCornerRadius: clampNumber(
        String(parsed.lineCornerRadius),
        defaultRenderSettings.lineCornerRadius,
        0,
        32,
      ),
      fitStrength:
        parsed.fitStrength === "compact" || parsed.fitStrength === "strict"
          ? parsed.fitStrength
          : defaultRenderSettings.fitStrength,
      layoutTarget:
        parsed.layoutTarget === "slide-16-9" || parsed.layoutTarget === "freeform"
          ? parsed.layoutTarget
          : defaultRenderSettings.layoutTarget,
      minReadableTextSize: defaultRenderSettings.minReadableTextSize,
      slideMarginPreset:
        parsed.slideMarginPreset === "compact" || parsed.slideMarginPreset === "custom"
          ? parsed.slideMarginPreset
          : defaultRenderSettings.slideMarginPreset,
      slideSafeMargin: clampNumber(
        String(parsed.slideSafeMargin),
        defaultRenderSettings.slideSafeMargin,
        0,
        400,
      ),
      targetAspectRatio: 16 / 9,
      targetCanvasHeight: clampNumber(
        String(parsed.targetCanvasHeight),
        defaultRenderSettings.targetCanvasHeight,
        240,
        10000,
      ),
      targetCanvasWidth: clampNumber(
        String(parsed.targetCanvasWidth),
        defaultRenderSettings.targetCanvasWidth,
        320,
        10000,
      ),
      targetResolution:
        parsed.targetResolution === "4k" || parsed.targetResolution === "custom"
          ? parsed.targetResolution
          : defaultRenderSettings.targetResolution,
    };
  } catch {
    return defaultRenderSettings;
  }
}

const saveRenderSettings = (settings: RenderSettings) => {
  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // Rendering should still work if plugin UI storage is unavailable.
  }
};

const postRenderMessage = () => {
  const mermaid = mermaidInput?.value.trim() ?? "";
  const renderSettings = getRenderSettings();

  if (mermaid.length === 0) {
    setError("Paste Mermaid syntax before rendering.");
    setStatus("Waiting for input.");
    return;
  }

  if (!renderSettings.fontFamily || !renderSettings.fontStyle) {
    setError("Select a font family and style before rendering.");
    setStatus("Waiting for font selection.");
    return;
  }

  saveRenderSettings(renderSettings);
  setError(null);
  setStatus("Sending render request...");

  parent.postMessage(
    {
      pluginMessage: {
        type: "render-diagram",
        mermaid,
        replacePrevious: replacePreviousInput?.checked ?? true,
        direction: getDirection(),
        spacing: getSpacing(),
        layoutSettings: {
          fitStrength: renderSettings.fitStrength,
          layoutTarget: renderSettings.layoutTarget,
          minReadableTextSize: renderSettings.minReadableTextSize,
          slideSafeMargin: renderSettings.slideSafeMargin,
          targetAspectRatio: renderSettings.targetAspectRatio,
          targetCanvasHeight: renderSettings.targetCanvasHeight,
          targetCanvasWidth: renderSettings.targetCanvasWidth,
        },
        settings: renderSettings,
      },
    },
    "*",
  );
};

function syncPresentationControlState(): void {
  const targetResolution = getTargetResolution();
  const isCustomResolution = targetResolution === "custom";

  if (targetCanvasWidthInput) {
    targetCanvasWidthInput.disabled = !isCustomResolution;
  }

  if (targetCanvasHeightInput) {
    targetCanvasHeightInput.disabled = !isCustomResolution;
  }

  const isCustomMargin = getSlideMarginPreset() === "custom";

  if (slideSafeMarginInput) {
    slideSafeMarginInput.disabled = !isCustomMargin;
  }
}

function installSelectTypeahead(select: HTMLSelectElement | null): void {
  if (!select) {
    return;
  }

  let query = "";
  let lastInputAt = 0;
  const queryWindowMs = 700;

  select.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === "Backspace") {
      if (query.length > 0) {
        query = query.slice(0, -1);
        event.preventDefault();
      }
      return;
    }

    if (event.key.length !== 1 || /\s/.test(event.key)) {
      return;
    }

    const now = Date.now();
    query = now - lastInputAt > queryWindowMs ? event.key : `${query}${event.key}`;
    lastInputAt = now;
    const loweredQuery = query.toLowerCase();
    const candidate = [...select.options].find((option) => {
      if (option.disabled || !option.value) {
        return false;
      }

      return option.text.toLowerCase().startsWith(loweredQuery);
    });

    if (!candidate) {
      return;
    }

    select.value = candidate.value;
    select.dispatchEvent(new Event("change"));
    event.preventDefault();
  });
}

function isFavoriteFamily(family: string): boolean {
  const loweredFamily = family.toLowerCase();
  return favoriteFontTokens.some((token) => loweredFamily.startsWith(token.toLowerCase()));
}

function getStyleFallback(styles: string[], preferredStyle: string): string {
  if (styles.includes(preferredStyle)) {
    return preferredStyle;
  }

  if (styles.includes("Regular")) {
    return "Regular";
  }

  return styles[0] ?? "";
}

function applyFontCatalog(catalog: FontCatalogEntry[], persisted: RenderSettings): void {
  availableFonts = catalog
    .filter((entry) => entry.family.trim().length > 0 && entry.styles.length > 0)
    .map((entry) => ({
      family: entry.family,
      styles: [...new Set(entry.styles.map((style) => style.trim()))].filter(
        (style) => style.length > 0,
      ),
    }))
    .filter((entry) => entry.styles.length > 0)
    .sort((left, right) => left.family.localeCompare(right.family));

  if (!fontFamilySelect || !fontStyleSelect) {
    return;
  }

  fontFamilySelect.innerHTML = "";
  const favoriteFamilies = availableFonts.filter((entry) => isFavoriteFamily(entry.family));
  const allFamilies = availableFonts.map((entry) => entry.family);
  const selectedFamily = allFamilies.includes(persisted.fontFamily)
    ? persisted.fontFamily
    : (favoriteFamilies[0]?.family ?? allFamilies[0] ?? "");

  if (favoriteFamilies.length > 0 || favoriteFontTokens.length > 0) {
    const favoriteGroup = document.createElement("optgroup");
    favoriteGroup.label = "Favorites";

    for (const entry of favoriteFamilies) {
      const option = document.createElement("option");
      option.value = entry.family;
      option.textContent = entry.family;
      favoriteGroup.appendChild(option);
    }

    for (const token of favoriteFontTokens) {
      const tokenExists = favoriteFamilies.some((entry) =>
        entry.family.toLowerCase().startsWith(token.toLowerCase()),
      );

      if (tokenExists) {
        continue;
      }

      const unavailable = document.createElement("option");
      unavailable.value = "";
      unavailable.textContent = `${token} (Not available)`;
      unavailable.disabled = true;
      favoriteGroup.appendChild(unavailable);
    }

    fontFamilySelect.appendChild(favoriteGroup);
  }

  if (allFamilies.length > 0) {
    const allFontsGroup = document.createElement("optgroup");
    allFontsGroup.label = "All Fonts";

    for (const family of allFamilies) {
      const option = document.createElement("option");
      option.value = family;
      option.textContent = family;
      allFontsGroup.appendChild(option);
    }

    fontFamilySelect.appendChild(allFontsGroup);
  }

  if (!selectedFamily) {
    fontStyleSelect.innerHTML = "";
    const unavailable = document.createElement("option");
    unavailable.value = "";
    unavailable.textContent = "No local fonts found";
    unavailable.disabled = true;
    unavailable.selected = true;
    fontStyleSelect.appendChild(unavailable);
    fontStyleSelect.disabled = true;
    fontFamilySelect.disabled = true;
    setError("No local fonts were detected in this environment.");
    scheduleUiResize();
    return;
  }

  fontFamilySelect.disabled = false;
  fontFamilySelect.value = selectedFamily;
  syncStylesForFamily(selectedFamily, persisted.fontStyle);
  scheduleUiResize();
}

function syncStylesForFamily(family: string, preferredStyle: string): void {
  if (!fontStyleSelect) {
    return;
  }

  const familyEntry = availableFonts.find((entry) => entry.family === family);
  const styles = familyEntry?.styles ?? [];
  fontStyleSelect.innerHTML = "";

  if (styles.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No styles available";
    option.disabled = true;
    option.selected = true;
    fontStyleSelect.appendChild(option);
    fontStyleSelect.disabled = true;
    return;
  }

  const selectedStyle = getStyleFallback(styles, preferredStyle);

  for (const style of styles) {
    const option = document.createElement("option");
    option.value = style;
    option.textContent = style;
    option.selected = style === selectedStyle;
    fontStyleSelect.appendChild(option);
  }

  fontStyleSelect.disabled = false;
}

applyNumericRenderSettings(persistedSettings);
installSelectTypeahead(fontFamilySelect);
installSelectTypeahead(fontStyleSelect);
renderButton?.addEventListener("click", postRenderMessage);
window.addEventListener("load", scheduleUiResize);
window.addEventListener("resize", scheduleUiResize);
mermaidInput?.addEventListener("input", scheduleUiResize);
fontFamilySelect?.addEventListener("change", () => {
  const family = fontFamilySelect.value;
  syncStylesForFamily(family, fontStyleSelect?.value ?? defaultRenderSettings.fontStyle);
  scheduleUiResize();
});
for (const control of [
  layoutTargetSelect,
  fitStrengthSelect,
  targetResolutionSelect,
  targetCanvasWidthInput,
  targetCanvasHeightInput,
  slideMarginPresetSelect,
  slideSafeMarginInput,
]) {
  control?.addEventListener("change", () => {
    syncPresentationControlState();
    scheduleUiResize();
  });
}
if ("ResizeObserver" in window) {
  const observer = new ResizeObserver(() => {
    scheduleUiResize();
  });
  observer.observe(document.body);
}
scheduleUiResize();

sampleButton?.addEventListener("click", () => {
  if (mermaidInput) {
    mermaidInput.value = sampleMermaid;
    mermaidInput.focus();
  }

  setError(null);
  setStatus("Sample input ready.");
  scheduleUiResize();
});

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
  const message = event.data.pluginMessage;

  if (!message) {
    return;
  }

  if (message.type === "font-catalog") {
    applyFontCatalog(message.fonts, persistedSettings);
    return;
  }

  if (message.type === "plugin-ready") {
    setStatus(message.message);
    scheduleUiResize();
    return;
  }

  if (message.type === "render-error") {
    setError(message.message);
    setStatus("Render failed.");
    scheduleUiResize();
    return;
  }

  if (message.type === "render-complete") {
    setError(null);
    setStatus(message.message);
    scheduleUiResize();
  }
};

export {};
