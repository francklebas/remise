import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

const languages = ["", "js", "javascript", "ts", "typescript", "json", "html", "css", "scss", "vue", "sh", "bash", "shell", "zsh", "python", "php", "sql", "yaml", "markdown"];

export async function copyCodeBlockText(text: string, clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard): Promise<boolean> {
  try {
    if (clipboard) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the local, text-only fallback below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand?.("copy") ?? false;
  textarea.remove();
  return copied;
}

class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: ProseMirrorNode;
  private readonly view: EditorView;
  private readonly getPos: () => number | undefined;
  private readonly toolbar: HTMLElement;
  private readonly languageSelect: HTMLSelectElement;
  private readonly copyButton: HTMLButtonElement;
  private copiedTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement("div");
    this.dom.className = "remise-code-block";

    this.toolbar = document.createElement("div");
    this.toolbar.className = "remise-code-block__toolbar";
    this.toolbar.contentEditable = "false";

    this.languageSelect = document.createElement("select");
    this.languageSelect.className = "remise-code-block__language";
    this.languageSelect.setAttribute("aria-label", "Langage du bloc de code");
    this.languageSelect.addEventListener("change", () => this.updateLanguage());

    this.copyButton = document.createElement("button");
    this.copyButton.type = "button";
    this.copyButton.className = "remise-code-block__copy";
    this.copyButton.textContent = "Copier";
    this.copyButton.setAttribute("aria-label", "Copier le code");
    this.copyButton.addEventListener("click", () => void this.copy());

    this.toolbar.append(this.languageSelect, this.copyButton);
    const pre = document.createElement("pre");
    this.contentDOM = document.createElement("code");
    pre.append(this.contentDOM);
    this.dom.append(this.toolbar, pre);
    this.renderLanguage();
  }

  update(node: ProseMirrorNode) {
    if (node.type.name !== "code_block") return false;
    this.node = node;
    this.renderLanguage();
    return true;
  }

  stopEvent(event: Event) {
    return this.toolbar.contains(event.target as Node);
  }

  destroy() {
    if (this.copiedTimeout) clearTimeout(this.copiedTimeout);
  }

  private renderLanguage() {
    const language = String(this.node.attrs.language ?? "");
    const options = languages.includes(language) ? languages : [...languages, language];
    this.languageSelect.replaceChildren(...options.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value || "Texte brut";
      option.selected = value === language;
      return option;
    }));
  }

  private updateLanguage() {
    const position = this.getPos();
    if (position === undefined) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(position, undefined, { ...this.node.attrs, language: this.languageSelect.value }));
    this.view.focus();
  }

  private async copy() {
    const copied = await copyCodeBlockText(this.node.textContent);
    if (!copied) return;
    this.copyButton.textContent = "Copié";
    if (this.copiedTimeout) clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => { this.copyButton.textContent = "Copier"; }, 1500);
  }
}

export function createCodeBlockNodeView() {
  return (node: ProseMirrorNode, view: EditorView, getPos: boolean | (() => number | undefined)) => new CodeBlockView(node, view, typeof getPos === "function" ? getPos : () => undefined);
}
