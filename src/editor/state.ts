import { baseKeymap, toggleMark, setBlockType } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { EditorState } from "prosemirror-state";
import { Node as ProseMirrorNode } from "prosemirror-model";
import { editorSchema } from "@/editor/schema";

export function createEditorState(document: ProseMirrorNode): EditorState {
  return EditorState.create({
    schema: editorSchema,
    doc: document,
    plugins: [
      history(),
      keymap({
        "Mod-z": undo,
        "Mod-y": redo,
        "Shift-Mod-z": redo,
        "Mod-b": toggleMark(editorSchema.marks.strong),
        "Mod-i": toggleMark(editorSchema.marks.em),
        "Mod-`": toggleMark(editorSchema.marks.code),
        Tab: sinkListItem(editorSchema.nodes.list_item),
        "Shift-Tab": liftListItem(editorSchema.nodes.list_item),
        Enter: splitListItem(editorSchema.nodes.list_item),
      }),
      keymap(baseKeymap),
    ],
  });
}

export function createCodeBlockCommand(language: string) {
  return setBlockType(editorSchema.nodes.code_block, { language });
}
