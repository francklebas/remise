<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Bold, Code2, Italic, Link, List, ListOrdered, Plus, Quote, Strikethrough, Table2, Upload } from "@lucide/vue";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, isInTable } from "prosemirror-tables";
import { createCodeBlockCommand, createEditorState, createTable } from "@/editor/state";
import { documentFromDescription, documentToJSON, type CardDescription } from "@/editor/document";
import { documentToMarkdown, markdownToDocument, MarkdownConversionError } from "@/editor/markdown";
import { editorSchema } from "@/editor/schema";
import { sanitizePastedHTML } from "@/editor/clipboard";
import { handleSmartLinkPaste } from "@/editor/smart-links";
import { DocumentImportError, importDocumentFile, insertImportedDocument } from "@/editor/importers";
import { createCodeBlockNodeView } from "@/editor/code-block-view";

const props = defineProps<{ modelValue: CardDescription }>();
const emit = defineEmits<{ "update:modelValue": [value: ReturnType<typeof documentToJSON>] }>();

const editorElement = ref<HTMLElement>();
const editingMode = ref<"rich" | "markdown">("rich");
const markdown = ref("");
const conversionError = ref("");
const fileInput = ref<HTMLInputElement>();
const blockMenu = ref<HTMLDetailsElement>();
const tableMenu = ref<HTMLDetailsElement>();
const importError = ref("");
const isImporting = ref(false);
const isTableSelection = ref(false);
const floatingToolbar = ref({ visible: false, left: 0, top: 0 });
const activeMarks = ref({ strong: false, em: false, strike: false, code: false, link: false });
let view: EditorView | undefined;

const isRichText = computed(() => editingMode.value === "rich");

function publish() {
  if (view) emit("update:modelValue", documentToJSON(view.state.doc));
}

function dispatchCommand(command: (state: NonNullable<typeof view>["state"], dispatch?: NonNullable<typeof view>["dispatch"]) => boolean) {
  if (!view) return;
  command(view.state, view.dispatch);
  view.focus();
  updateEditorUI();
}

function isMarkActive(name: keyof typeof activeMarks.value) {
  if (!view) return false;
  const markType = editorSchema.marks[name];
  const { selection, doc, storedMarks } = view.state;
  if (selection.empty) return Boolean(markType.isInSet(storedMarks ?? selection.$from.marks()));

  let hasText = false;
  let active = true;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!node.isText) return;
    hasText = true;
    if (!markType.isInSet(node.marks)) active = false;
  });
  return hasText && active;
}

function updateEditorUI() {
  if (!view) return;
  const { selection } = view.state;
  isTableSelection.value = isInTable(view.state);
  activeMarks.value = {
    strong: isMarkActive("strong"),
    em: isMarkActive("em"),
    strike: isMarkActive("strike"),
    code: isMarkActive("code"),
    link: isMarkActive("link"),
  };

  if (!(selection instanceof TextSelection) || selection.empty) {
    floatingToolbar.value.visible = false;
    return;
  }

  const start = view.coordsAtPos(selection.from);
  const end = view.coordsAtPos(selection.to);
  const margin = 12;
  const toolbarHalfWidth = Math.min(92, Math.max(0, window.innerWidth / 2 - margin));
  floatingToolbar.value = {
    visible: true,
    left: Math.max(toolbarHalfWidth + margin, Math.min(window.innerWidth - toolbarHalfWidth - margin, (start.left + end.right) / 2)),
    top: Math.max(44, start.top - 8),
  };
}

function closeBlockMenu() {
  blockMenu.value?.removeAttribute("open");
}

function closeTableMenu() {
  tableMenu.value?.removeAttribute("open");
}

function dispatchTableCommand(command: Parameters<typeof dispatchCommand>[0]) {
  dispatchCommand(command);
  closeTableMenu();
}

function setMode(mode: "rich" | "markdown") {
  if (mode === editingMode.value || !view) return;
  if (mode === "markdown") {
    try {
      markdown.value = documentToMarkdown(view.state.doc);
      conversionError.value = "";
      editingMode.value = "markdown";
    } catch (error) {
      conversionError.value = error instanceof MarkdownConversionError ? error.message : "Impossible de convertir ce document en Markdown.";
    }
    return;
  }

  try {
    const document = markdownToDocument(markdown.value);
    view.updateState(createEditorState(document));
    publish();
    conversionError.value = "";
    editingMode.value = "rich";
    void nextTick(() => {
      view?.focus();
      updateEditorUI();
    });
  } catch (error) {
    conversionError.value = error instanceof MarkdownConversionError ? error.message : "Impossible de convertir ce Markdown.";
  }
}

function setParagraph() {
  dispatchCommand(setBlockType(editorSchema.nodes.paragraph));
  closeBlockMenu();
}

function setHeading(level: number) {
  dispatchCommand(setBlockType(editorSchema.nodes.heading, { level }));
  closeBlockMenu();
}

function setCodeBlock() {
  dispatchCommand(createCodeBlockCommand(""));
  closeBlockMenu();
}

function addLink() {
  const href = window.prompt("Adresse du lien");
  if (!href?.trim()) return;
  dispatchCommand(toggleMark(editorSchema.marks.link, { href: href.trim(), title: null }));
}

function insertTable() {
  if (!view) return;
  view.dispatch(view.state.tr.replaceSelectionWith(createTable()).scrollIntoView());
  view.focus();
  closeBlockMenu();
  updateEditorUI();
}

async function importFile(file: File, position?: number) {
  if (!view) return;
  isImporting.value = true;
  importError.value = "";
  try {
    insertImportedDocument(view, await importDocumentFile(file), position);
    publish();
  } catch (error) {
    importError.value = error instanceof DocumentImportError ? error.message : "Import impossible.";
  } finally {
    isImporting.value = false;
  }
}

function openFilePicker() {
  closeBlockMenu();
  fileInput.value?.click();
}

function handleFilePicker(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void importFile(file);
  (event.target as HTMLInputElement).value = "";
}

function handleEditorDragOver(event: DragEvent) {
  if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) event.preventDefault();
}

function handleEditorDrop(event: DragEvent) {
  const file = event.dataTransfer?.files[0];
  if (!file) return;
  event.preventDefault();
  const position = view?.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
  void importFile(file, position);
}

function handleEditorPaste(editorView: EditorView, event: ClipboardEvent) {
  if (editorView.state.selection.$from.parent.type === editorSchema.nodes.code_block) return false;
  const file = event.clipboardData?.files[0];
  if (file) {
    void importFile(file);
    return true;
  }
  return handleSmartLinkPaste(editorView, event);
}

function handleEditorKeyDown(_editorView: EditorView, event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    addLink();
    return true;
  }
  return false;
}

watch(
  () => props.modelValue,
  (value) => {
    if (!view || editingMode.value !== "rich") return;
    const nextDocument = documentFromDescription(value);
    if (!nextDocument.eq(view.state.doc)) {
      view.updateState(createEditorState(nextDocument));
      updateEditorUI();
    }
  },
  { deep: true },
);

onMounted(() => {
  if (!editorElement.value) return;
  view = new EditorView(editorElement.value, {
    state: createEditorState(documentFromDescription(props.modelValue)),
    dispatchTransaction(transaction) {
      if (!view) return;
      view.updateState(view.state.apply(transaction));
      if (transaction.docChanged) publish();
      updateEditorUI();
    },
    transformPastedHTML: sanitizePastedHTML,
    handlePaste: handleEditorPaste,
    handleKeyDown: handleEditorKeyDown,
    nodeViews: { code_block: createCodeBlockNodeView() },
  });
  updateEditorUI();
  window.addEventListener("resize", updateEditorUI);
  window.addEventListener("scroll", updateEditorUI, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateEditorUI);
  window.removeEventListener("scroll", updateEditorUI, true);
  view?.destroy();
});
</script>

<template>
  <section class="content-editor rounded-box border border-base-300 bg-base-100">
    <div class="flex items-center gap-2 border-b border-base-300 p-2">
      <input ref="fileInput" type="file" class="hidden" accept=".txt,.md,.markdown,.html,.htm,.docx,text/plain,text/markdown,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="handleFilePicker" />
      <div class="join">
        <button class="btn btn-xs join-item" :class="{ 'btn-primary': isRichText }" type="button" @click="setMode('rich')">Rich Text</button>
        <button class="btn btn-xs join-item" :class="{ 'btn-primary': !isRichText }" type="button" @click="setMode('markdown')">Markdown</button>
      </div>
      <template v-if="isRichText">
        <details ref="blockMenu" class="dropdown">
          <summary class="btn btn-ghost btn-xs btn-square" aria-label="Ajouter ou transformer un bloc" title="Ajouter ou transformer un bloc"><Plus :size="16" /></summary>
          <div class="dropdown-content z-30 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
            <p class="px-2 pb-1 pt-2 text-xs font-medium text-base-content/55">Transformer</p>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="setParagraph">Paragraphe</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="setHeading(1)">H1</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="setHeading(2)">H2</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="setHeading(3)">H3</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="dispatchCommand(wrapIn(editorSchema.nodes.blockquote)); closeBlockMenu()"><Quote :size="15" /> Citation</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="setCodeBlock"><Code2 :size="15" /> Bloc de code</button>
            <div class="my-1 border-t border-base-200" />
            <p class="px-2 pb-1 pt-1 text-xs font-medium text-base-content/55">Insérer / structurer</p>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="dispatchCommand(wrapInList(editorSchema.nodes.bullet_list)); closeBlockMenu()"><List :size="15" /> Liste à puces</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="dispatchCommand(wrapInList(editorSchema.nodes.ordered_list)); closeBlockMenu()"><ListOrdered :size="15" /> Liste numérotée</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="insertTable"><Table2 :size="15" /> Tableau</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" :disabled="isImporting" @click="openFilePicker"><Upload :size="15" /> {{ isImporting ? "Import…" : "Importer" }}</button>
          </div>
        </details>
        <details v-if="isTableSelection" ref="tableMenu" class="dropdown dropdown-end">
          <summary class="btn btn-ghost btn-xs" aria-label="Actions du tableau" title="Actions du tableau"><Table2 :size="15" /> Tableau</summary>
          <div class="dropdown-content z-30 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
            <p class="px-2 pb-1 pt-2 text-xs font-medium text-base-content/55">Ligne</p>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="dispatchTableCommand(addRowBefore)">Ajouter avant</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="dispatchTableCommand(addRowAfter)">Ajouter après</button>
            <button class="btn btn-ghost btn-sm w-full justify-start text-error" type="button" @click="dispatchTableCommand(deleteRow)">Supprimer la ligne</button>
            <div class="my-1 border-t border-base-200" />
            <p class="px-2 pb-1 pt-1 text-xs font-medium text-base-content/55">Colonne</p>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="dispatchTableCommand(addColumnBefore)">Ajouter avant</button>
            <button class="btn btn-ghost btn-sm w-full justify-start" type="button" @click="dispatchTableCommand(addColumnAfter)">Ajouter après</button>
            <button class="btn btn-ghost btn-sm w-full justify-start text-error" type="button" @click="dispatchTableCommand(deleteColumn)">Supprimer la colonne</button>
            <div class="my-1 border-t border-base-200" />
            <button class="btn btn-ghost btn-sm w-full justify-start text-error" type="button" @click="dispatchTableCommand(deleteTable)">Supprimer le tableau</button>
          </div>
        </details>
      </template>
    </div>
    <div
      v-if="isRichText && floatingToolbar.visible"
      class="content-editor__floating-toolbar"
      :style="{ left: `${floatingToolbar.left}px`, top: `${floatingToolbar.top}px` }"
      role="toolbar"
      aria-label="Mise en forme de la sélection"
    >
      <button class="btn btn-ghost btn-xs btn-square" :class="{ 'btn-active': activeMarks.strong }" type="button" aria-label="Gras" title="Gras (Ctrl/Cmd+B)" @mousedown.prevent @click="dispatchCommand(toggleMark(editorSchema.marks.strong))"><Bold :size="16" /></button>
      <button class="btn btn-ghost btn-xs btn-square" :class="{ 'btn-active': activeMarks.em }" type="button" aria-label="Italique" title="Italique (Ctrl/Cmd+I)" @mousedown.prevent @click="dispatchCommand(toggleMark(editorSchema.marks.em))"><Italic :size="16" /></button>
      <button class="btn btn-ghost btn-xs btn-square" :class="{ 'btn-active': activeMarks.strike }" type="button" aria-label="Barré" title="Barré" @mousedown.prevent @click="dispatchCommand(toggleMark(editorSchema.marks.strike))"><Strikethrough :size="16" /></button>
      <button class="btn btn-ghost btn-xs btn-square" :class="{ 'btn-active': activeMarks.code }" type="button" aria-label="Code inline" title="Code inline (Ctrl/Cmd+`)" @mousedown.prevent @click="dispatchCommand(toggleMark(editorSchema.marks.code))"><Code2 :size="16" /></button>
      <button class="btn btn-ghost btn-xs btn-square" :class="{ 'btn-active': activeMarks.link }" type="button" aria-label="Ajouter ou modifier un lien" title="Lien (Ctrl/Cmd+K)" @mousedown.prevent @click="addLink"><Link :size="16" /></button>
    </div>
    <div v-show="isRichText" ref="editorElement" class="content-editor__rich" @dragover="handleEditorDragOver" @drop="handleEditorDrop" />
    <textarea v-if="!isRichText" v-model="markdown" class="content-editor__markdown textarea w-full rounded-none border-0 bg-base-100 font-mono text-sm leading-relaxed focus:outline-none" aria-label="Markdown de la description" spellcheck="false" />
    <p v-if="conversionError" class="border-t border-error/25 bg-error/10 px-3 py-2 text-xs text-error" role="alert">{{ conversionError }}</p>
    <p v-if="importError" class="border-t border-error/25 bg-error/10 px-3 py-2 text-xs text-error" role="alert">{{ importError }}</p>
  </section>
</template>

<style scoped>
.content-editor__floating-toolbar {
  position: fixed;
  z-index: 50;
  display: flex;
  gap: 0.125rem;
  max-width: calc(100vw - 1.5rem);
  transform: translate(-50%, -100%);
  padding: 0.25rem;
  border: 1px solid color-mix(in oklab, var(--color-base-content) 15%, transparent);
  border-radius: 0.5rem;
  background: var(--color-base-100);
  box-shadow: 0 8px 20px color-mix(in oklab, var(--color-base-content) 16%, transparent);
}
</style>
