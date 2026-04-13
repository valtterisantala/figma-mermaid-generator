type DirectionOverride = "auto" | "TD" | "LR";
type SpacingPreset = "compact" | "comfortable" | "spacious";

type PluginReadyMessage = {
  type: "plugin-ready";
  message: string;
};

type RenderPlaceholderMessage = {
  type: "render-placeholder";
  message: string;
  received: {
    characters: number;
    replacePrevious: boolean;
    direction: DirectionOverride;
    spacing: SpacingPreset;
  };
};

type RenderErrorMessage = {
  type: "render-error";
  message: string;
};

type PluginMessage = PluginReadyMessage | RenderPlaceholderMessage | RenderErrorMessage;

const statusElement = document.querySelector<HTMLParagraphElement>("#status");
const errorElement = document.querySelector<HTMLParagraphElement>("#error-message");
const mermaidInput = document.querySelector<HTMLTextAreaElement>("#mermaid-input");
const renderButton = document.querySelector<HTMLButtonElement>("#render-button");
const sampleButton = document.querySelector<HTMLButtonElement>("#sample-button");
const replacePreviousInput = document.querySelector<HTMLInputElement>("#replace-previous");
const directionSelect = document.querySelector<HTMLSelectElement>("#direction-select");
const spacingSelect = document.querySelector<HTMLSelectElement>("#spacing-select");

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

const postRenderMessage = () => {
  const mermaid = mermaidInput?.value.trim() ?? "";

  if (mermaid.length === 0) {
    setError("Paste Mermaid syntax before rendering.");
    setStatus("Waiting for input.");
    return;
  }

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
      },
    },
    "*",
  );
};

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

  if (message.type === "render-placeholder") {
    setError(null);
    setStatus(
      `${message.message} ${message.received.characters} characters queued with ${message.received.spacing} spacing.`,
    );
  }
};

export {};
