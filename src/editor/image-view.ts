import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { resolveImageSource } from "@/editor/media";

class ImageView implements NodeView {
  dom: HTMLImageElement;
  private node: ProseMirrorNode;
  private objectUrl: string | undefined;
  private request = 0;

  constructor(node: ProseMirrorNode) {
    this.node = node;
    this.dom = document.createElement("img");
    this.dom.className = "remise-image";
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
    this.dom.alt = String(node.attrs.alt ?? "");
    if (node.attrs.title) this.dom.title = String(node.attrs.title);
    else this.dom.removeAttribute("title");
    const request = ++this.request;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = undefined;
    }
    void resolveImageSource(String(node.attrs.src), node.attrs.storagePath ?? null).then((source) => {
      if (request !== this.request) { if (source.startsWith("blob:")) URL.revokeObjectURL(source); return; }
      this.dom.src = source;
      if (source.startsWith("blob:")) this.objectUrl = source;
    }).catch(() => {
      // Keep the stable source as a useful fallback (and keep the node editable).
      if (request === this.request) this.dom.src = String(node.attrs.src);
    });
  }
}

export function createImageNodeView() {
  return (node: ProseMirrorNode, _view: EditorView) => new ImageView(node);
}
