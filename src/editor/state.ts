import { baseKeymap, toggleMark, setBlockType } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { inputRules, textblockTypeInputRule, wrappingInputRule } from "prosemirror-inputrules";
import { EditorState } from "prosemirror-state";
import { Node as ProseMirrorNode } from "prosemirror-model";
import { Fragment } from "prosemirror-model";
import { goToNextCell, tableEditing } from "prosemirror-tables";
import { editorSchema } from "@/editor/schema";
import { codeHighlightPlugin } from "@/editor/code-highlight";

function isCodeBlockSelection(state: EditorState) {
  return state.selection.$from.parent.type === editorSchema.nodes.code_block;
}

function indentCodeBlock(state: EditorState, dispatch?: (transaction: import("prosemirror-state").Transaction) => void) {
  if (!isCodeBlockSelection(state)) return false;
  const { from, to } = state.selection;
  if (dispatch) dispatch(state.tr.insertText("\t", from, to));
  return true;
}

function outdentCodeBlock(state: EditorState, dispatch?: (transaction: import("prosemirror-state").Transaction) => void) {
  if (!isCodeBlockSelection(state)) return false;
  const { $from } = state.selection;
  const text = $from.parent.textContent;
  const lineStart = text.lastIndexOf("\n", $from.parentOffset - 1) + 1;
  const indentation = text.slice(lineStart).match(/^(?:\t| {1,2})/);
  if (!indentation) return false;
  if (dispatch) {
    const from = $from.start() + lineStart;
    dispatch(state.tr.delete(from, from + indentation[0].length));
  }
  return true;
}

export function createEditorState(document: ProseMirrorNode): EditorState {
  return EditorState.create({
    schema: editorSchema,
    doc: document,
    plugins: [
      history(),
      codeHighlightPlugin(),
      inputRules({
        rules: [
          textblockTypeInputRule(/^(#{1,3})\s$/, editorSchema.nodes.heading, (match) => ({ level: match[1].length })),
          textblockTypeInputRule(/^```([^\s`]*)\s$/, editorSchema.nodes.code_block, (match) => ({ language: match[1] ?? "" })),
          wrappingInputRule(/^\s*([-+*])\s$/, editorSchema.nodes.bullet_list),
          wrappingInputRule(/^\s*(\d+)\.\s$/, editorSchema.nodes.ordered_list, (match) => ({ order: Number(match[1]) })),
          wrappingInputRule(/^>\s$/, editorSchema.nodes.blockquote),
        ],
      }),
      keymap({
        Tab: indentCodeBlock,
        "Shift-Tab": outdentCodeBlock,
      }),
      keymap({
        Tab: goToNextCell(1),
        "Shift-Tab": goToNextCell(-1),
      }),
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
      tableEditing(),
    ],
  });
}

export function createCodeBlockCommand(language: string) {
  return setBlockType(editorSchema.nodes.code_block, { language });
}

export function createTable(rows = 3, columns = 3): ProseMirrorNode {
  const paragraph = () => editorSchema.nodes.paragraph.createAndFill()!;
  const cell = (type: "table_header" | "table_cell") => editorSchema.nodes[type].createAndFill(null, paragraph())!;
  const tableRows = Array.from({ length: rows }, (_, rowIndex) =>
    editorSchema.nodes.table_row.create(null, Fragment.fromArray(
      Array.from({ length: columns }, () => cell(rowIndex === 0 ? "table_header" : "table_cell")),
    )),
  );
  return editorSchema.nodes.table.create(null, Fragment.fromArray(tableRows));
}
