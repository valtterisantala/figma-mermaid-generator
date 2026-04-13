type PluginReadyMessage = {
  type: "plugin-ready";
  message: string;
};

const statusElement = document.querySelector<HTMLParagraphElement>("#status");

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginReadyMessage }>) => {
  const message = event.data.pluginMessage;

  if (message?.type === "plugin-ready" && statusElement) {
    statusElement.textContent = message.message;
  }
};
