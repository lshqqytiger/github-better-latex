interface ReactFiber {
  memoizedProps?: unknown;
  return?: ReactFiber | null;
  alternate?: ReactFiber | null;
  stateNode?: unknown;
}

export interface CopilotMarkdown {
  id: string;
  content: string;
}

function getCommittedFiber(fiber: ReactFiber): ReactFiber | null {
  let ancestor = fiber;
  const visited = new Set<ReactFiber>();
  while (ancestor.return && !visited.has(ancestor)) {
    visited.add(ancestor);
    ancestor = ancestor.return;
  }
  const state = ancestor.stateNode;
  if (typeof state !== "object" || state === null || !("current" in state)) {
    return fiber;
  }
  if (state.current === ancestor) {
    return fiber;
  }
  if (state.current === ancestor.alternate) {
    return fiber.alternate ?? null;
  }
  return null;
}

function readMessage(props: unknown): CopilotMarkdown | null {
  if (typeof props !== "object" || props === null || !("message" in props)) {
    return null;
  }
  const message = props.message;
  if (typeof message !== "object" || message === null) {
    return null;
  }
  if (
    !("role" in message) ||
    message.role !== "assistant" ||
    !("id" in message) ||
    typeof message.id !== "string" ||
    !("content" in message) ||
    typeof message.content !== "string"
  ) {
    return null;
  }
  return { id: message.id, content: message.content };
}

export function getCopilotMarkdown(root: HTMLElement): CopilotMarkdown | null {
  const container = root.closest(".message-container");
  if (!container) {
    return null;
  }
  const key = Object.keys(root).find((name) =>
    name.startsWith("__reactFiber$"),
  );
  if (!key) {
    return null;
  }
  const fields = root as unknown as Record<string, unknown>;
  const attached = fields[key] as ReactFiber | null;
  let fiber = attached ? getCommittedFiber(attached) : null;
  const visited = new Set<ReactFiber>();
  while (fiber && !visited.has(fiber)) {
    visited.add(fiber);
    if (
      fiber.stateNode instanceof Element &&
      !container.contains(fiber.stateNode)
    ) {
      break;
    }
    const source = readMessage(fiber.memoizedProps);
    if (source) {
      return source;
    }
    fiber = fiber.return ?? null;
  }
  return null;
}

const renderedMessages = new Map<
  HTMLElement,
  {
    source: string;
    output: HTMLElement;
    hiddenAttribute: string | null;
    display: string;
    displayPriority: string;
  }
>();

export function restoreCopilotMarkdown(root: HTMLElement): void {
  const previous = renderedMessages.get(root);
  if (!previous) {
    return;
  }
  previous.output.remove();
  if (previous.hiddenAttribute === null) {
    root.removeAttribute("hidden");
  } else {
    root.setAttribute("hidden", previous.hiddenAttribute);
  }
  if (previous.display) {
    root.style.setProperty(
      "display",
      previous.display,
      previous.displayPriority,
    );
  } else {
    root.style.removeProperty("display");
  }
  renderedMessages.delete(root);
}

export function cleanupCopilotMarkdown(): void {
  renderedMessages.forEach((value, root) => {
    if (!root.isConnected || !root.matches('[data-copilot-markdown="true"]')) {
      restoreCopilotMarkdown(root);
    } else if (root.nextElementSibling !== value.output) {
      root.after(value.output);
    }
  });
}

export function renderCopilotMarkdown(
  root: HTMLElement,
  source: string,
  render: (source: string) => string,
): HTMLElement {
  const previous = renderedMessages.get(root);
  const output = previous?.output ?? root.ownerDocument.createElement("div");
  if (!previous || previous.source !== source) {
    output.innerHTML = render(source);
  }
  output.className = root.className;
  output.dataset.githubLatexCopilotOutput = "true";
  if (root.nextElementSibling !== output) {
    root.after(output);
  }
  renderedMessages.set(root, {
    source,
    output,
    hiddenAttribute: previous
      ? previous.hiddenAttribute
      : root.getAttribute("hidden"),
    display: previous?.display ?? root.style.getPropertyValue("display"),
    displayPriority:
      previous?.displayPriority ?? root.style.getPropertyPriority("display"),
  });
  root.hidden = true;
  root.style.setProperty("display", "none", "important");
  return output;
}
