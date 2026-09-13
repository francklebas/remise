import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { fallbackRichLinkMetadata, isWebUrl } from "@/editor/rich-links";
import { editorSchema } from "@/editor/schema";

/** Handles a single web URL only, leaving all other clipboard data to ProseMirror. */
export function handleSmartLinkPaste(view: EditorView, event: ClipboardEvent): boolean {
  const pastedText = event.clipboardData?.getData("text/plain");
  if (!pastedText || pastedText.trim() !== pastedText || !isWebUrl(pastedText)) return false;

  const { selection } = view.state;
  if (!(selection instanceof TextSelection)) return false;

  if (!selection.empty) {
    const link = editorSchema.marks.link.create({ href: pastedText, title: null });
    view.dispatch(view.state.tr.addMark(selection.from, selection.to, link).scrollIntoView());
    return true;
  }

  if (selection.$from.parent.isTextblock && selection.$from.parent.content.size === 0) {
    const card = editorSchema.nodes.rich_link.create(fallbackRichLinkMetadata(pastedText));
    view.dispatch(view.state.tr.replaceSelectionWith(card).scrollIntoView());
    return true;
  }

  const link = editorSchema.marks.link.create({ href: pastedText, title: null });
  view.dispatch(view.state.tr.replaceWith(selection.from, selection.to, editorSchema.text(pastedText, [link])).scrollIntoView());
  return true;
}
