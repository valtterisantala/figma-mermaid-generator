type DirectionOverride = "auto" | "TD" | "LR";
type SpacingPreset = "compact" | "comfortable" | "spacious";

type RenderSettings = {
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  strokeWidth: number;
  cornerRadius: number;
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

type PluginMessage = PluginReadyMessage | RenderCompleteMessage | RenderErrorMessage;

const statusElement = document.querySelector<HTMLParagraphElement>("#status");
const errorElement = document.querySelector<HTMLParagraphElement>("#error-message");
const mermaidInput = document.querySelector<HTMLTextAreaElement>("#mermaid-input");
const renderButton = document.querySelector<HTMLButtonElement>("#render-button");
const sampleButton = document.querySelector<HTMLButtonElement>("#sample-button");
const replacePreviousInput = document.querySelector<HTMLInputElement>("#replace-previous");
const directionSelect = document.querySelector<HTMLSelectElement>("#direction-select");
const spacingSelect = document.querySelector<HTMLSelectElement>("#spacing-select");
const fontFamilySelect = document.querySelector<HTMLSelectElement>("#font-family-select");
const fontStyleSelect = document.querySelector<HTMLSelectElement>("#font-style-select");
const fontSizeInput = document.querySelector<HTMLInputElement>("#font-size-input");
const strokeWidthInput = document.querySelector<HTMLInputElement>("#stroke-width-input");
const cornerRadiusInput = document.querySelector<HTMLInputElement>("#corner-radius-input");

const settingsStorageKey = "mermaid-native-generator-render-settings";

const defaultRenderSettings: RenderSettings = {
  fontFamily: "FK Grotesk Neue Trial",
  fontStyle: "Regular",
  fontSize: 13,
  strokeWidth: 1,
  cornerRadius: 8,
};

const sampleMermaid = `flowchart TD
  Start[Start] --> Decision{Ready?}
  Decision -->|Yes| Render[Render native Figma nodes]
  Decision -->|No| Revise[Revise input]
  Revise --> Decision`;

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

const clampNumber = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number.parseFloat(value ?? "");

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
};

const getRenderSettings = (): RenderSettings => ({
  fontFamily: fontFamilySelect?.value || defaultRenderSettings.fontFamily,
  fontStyle: fontStyleSelect?.value || defaultRenderSettings.fontStyle,
  fontSize: clampNumber(fontSizeInput?.value, defaultRenderSettings.fontSize, 8, 24),
  strokeWidth: clampNumber(strokeWidthInput?.value, defaultRenderSettings.strokeWidth, 0.5, 12),
  cornerRadius: clampNumber(cornerRadiusInput?.value, defaultRenderSettings.cornerRadius, 0, 32),
});

const applyRenderSettings = (settings: RenderSettings) => {
  if (fontFamilySelect) {
    fontFamilySelect.value = settings.fontFamily;
  }

  if (fontStyleSelect) {
    fontStyleSelect.value = settings.fontStyle;
  }

  if (fontSizeInput) {
    fontSizeInput.value = String(settings.fontSize);
  }

  if (strokeWidthInput) {
    strokeWidthInput.value = String(settings.strokeWidth);
  }

  if (cornerRadiusInput) {
    cornerRadiusInput.value = String(settings.cornerRadius);
  }
};

const loadRenderSettings = () => {
  try {
    const rawSettings = window.localStorage.getItem(settingsStorageKey);

    if (!rawSettings) {
      return;
    }

    const parsed = JSON.parse(rawSettings) as Partial<RenderSettings>;
    applyRenderSettings({
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
    });
  } catch {
    applyRenderSettings(defaultRenderSettings);
  }
};

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
        settings: renderSettings,
      },
    },
    "*",
  );
};

loadRenderSettings();
renderButton?.addEventListener("click", postRenderMessage);

sampleButton?.addEventListener("click", () => {
  if (mermaidInput) {
    mermaidInput.value = sampleMermaid;
    mermaidInput.focus();
  }

  setError(null);
  setStatus("Sample input ready.");
});

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
  const message = event.data.pluginMessage;

  if (!message) {
    return;
  }

  if (message.type === "plugin-ready") {
    setStatus(message.message);
    return;
  }

  if (message.type === "render-error") {
    setError(message.message);
    setStatus("Render failed.");
    return;
  }

  if (message.type === "render-complete") {
    setError(null);
    setStatus(message.message);
  }
};

export {};
