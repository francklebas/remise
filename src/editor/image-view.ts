import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { resolveImageSource } from "@/editor/media";

type RetryImage = (src: string) => void;

class ImageView implements NodeView {
  dom: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly status: HTMLSpanElement;
  private readonly retryButton: HTMLButtonElement;
  private node: ProseMirrorNode;
  private objectUrl: string | undefined;
  private request = 0;
  private readonly retryImage?: RetryImage;

  constructor(node: ProseMirrorNode, retryImage?: RetryImage) {
    this.node = node;
    this.retryImage = retryImage;
    this.dom = document.createElement("span");
    this.dom.className = "remise-image-view";
    this.image = document.createElement("img");
    this.image.className = "remise-image";
    this.status = document.createElement("span");
    this.status.className = "remise-image__status";
    this.retryButton = document.createElement("button");
    this.retryButton.type = "button";
    this.retryButton.className = "remise-image__retry";
    this.retryButton.textContent = "Réessayer";
    this.retryButton.setAttribute("aria-label", "Réessayer le chargement de l’image");
    this.retryButton.addEventListener("click", () => this.retryImage ? this.retryImage(String(this.node.attrs.src)) : this.render());
    this.dom.append(this.image, this.status, this.retryButton);
    this.render();
  }

  update(node: ProseMirrorNode) {
    if (node.type.name !== "image") return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add("ProseMirror-selectednode"); }
  deselectNode() { this.dom.classList.remove("ProseMirror-selectednode"); }

  destroy() {
    this.request++;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }

  private render() {
    const node = this.node;
    const src = String(node.attrs.src);
    const temporary = src.startsWith("blob:");
    const request = ++this.request;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = undefined;
    }
    this.dom.dataset.state = "loading";
    this.status.textContent = temporary ? "Envoi…" : "Chargement…";
    this.retryButton.hidden = true;
    this.image.alt = String(node.attrs.alt ?? "");
    if (node.attrs.title) this.image.title = String(node.attrs.title); else this.image.removeAttribute("title");
    this.image.onload = () => {
      if (request !== this.request) return;
      if (temporary) { this.dom.dataset.state = "loading"; this.status.textContent = "Envoi…"; return; }
      this.dom.dataset.state = "loaded";
      this.status.textContent = "";
    };
    this.image.onerror = () => { if (request === this.request) this.showError(); };
    void resolveImageSource(src, node.attrs.storagePath ?? null).then((source) => {
      if (request !== this.request) { if (source.startsWith("blob:")) URL.revokeObjectURL(source); return; }
      this.image.src = source;
      if (source.startsWith("blob:")) this.objectUrl = source;
    }).catch(() => { if (request === this.request) this.showError(); });
  }

  private showError() {
    this.dom.dataset.state = "error";
    this.status.textContent = "Image indisponible";
    this.retryButton.hidden = false;
  }
}

export function createImageNodeView(retryImage?: RetryImage) {
  return (node: ProseMirrorNode, _view: EditorView) => new ImageView(node, retryImage);
}
