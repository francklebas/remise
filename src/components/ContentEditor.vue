<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorView } from "prosemirror-view";
import { setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { createCodeBlockCommand, createEditorState } from "@/editor/state";
import { documentFromDescription, documentToJSON, type CardDescription } from "@/editor/document";
import { documentToMarkdown, markdownToDocument, MarkdownConversionError } from "@/editor/markdown";
import { editorSchema } from "@/editor/schema";

const props = defineProps<{ modelValue: CardDescription }>();
const emit = defineEmits<{ "update:modelValue": [value: ReturnType<typeof documentToJSON>] }>();

const editorElement = ref<HTMLElement>();
const editingMode = ref<"rich" | "markdown">("rich");
const markdown = ref("");
const conversionError = ref("");
const selectedLanguage = ref("");
let view: EditorView | undefined;

const isRichText = computed(() => editingMode.value === "rich");

function publish() {
  if (view) emit("update:modelValue", documentToJSON(view.state.doc));
}

function dispatchCommand(command: (state: NonNullable<typeof view>["state"], dispatch?: NonNullable<typeof view>["dispatch"]) => boolean) {
  if (!view) return;
  command(view.state, view.dispatch);
  view.focus();
}

function setMode(mode: "rich" | "markdown") {
  if (mode === editingMode.value || !view) return;
  if (mode === "markdown") {
    markdown.value = documentToMarkdown(view.state.doc);
    conversionError.value = "";
    editingMode.value = "markdown";
    return;
  }

  try {
    const document = markdownToDocument(markdown.value);
    view.updateState(createEditorState(document));
    publish();
    conversionError.value = "";
    editingMode.value = "rich";
    void nextTick(() => view?.focus());
  } catch (error) {
    conversionError.value = error instanceof MarkdownConversionError ? error.message : "Impossible de convertir ce Markdown.";
  }
}

function setCodeBlockLanguage() {
  dispatchCommand(createCodeBlockCommand(selectedLanguage.value));
}

function setHeading(level: number) {
  dispatchCommand(setBlockType(editorSchema.nodes.heading, { level }));
}

function addLink() {
  const href = window.prompt("Adresse du lien");
  if (!href?.trim()) return;
  dispatchCommand(toggleMark(editorSchema.marks.link, { href: href.trim(), title: null }));
}

watch(
  () => props.modelValue,
  (value) => {
    if (!view || editingMode.value !== "rich") return;
    const nextDocument = documentFromDescription(value);
    if (!nextDocument.eq(view.state.doc)) view.updateState(createEditorState(nextDocument));
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
    },
  });
});

onBeforeUnmount(() => view?.destroy());
</script>

<template>
  <section class="content-editor rounded-box border border-base-300 bg-base-100">
    <div class="flex flex-wrap items-center gap-1 border-b border-base-300 p-2">
      <div class="join mr-2">
        <button class="btn btn-xs join-item" :class="{ 'btn-primary': isRichText }" type="button" @click="setMode('rich')">Rich Text</button>
        <button class="btn btn-xs join-item" :class="{ 'btn-primary': !isRichText }" type="button" @click="setMode('markdown')">Markdown</button>
      </div>
      <template v-if="isRichText">
        <button class="btn btn-ghost btn-xs font-bold" type="button" aria-label="Gras" title="Gras" @click="dispatchCommand(toggleMark(editorSchema.marks.strong))">B</button>
        <button class="btn btn-ghost btn-xs italic" type="button" aria-label="Italique" title="Italique" @click="dispatchCommand(toggleMark(editorSchema.marks.em))">I</button>
        <button class="btn btn-ghost btn-xs line-through" type="button" aria-label="Barré" title="Barré" @click="dispatchCommand(toggleMark(editorSchema.marks.strike))">S</button>
        <button class="btn btn-ghost btn-xs font-mono" type="button" aria-label="Code inline" title="Code inline" @click="dispatchCommand(toggleMark(editorSchema.marks.code))">&lt;/&gt;</button>
        <button class="btn btn-ghost btn-xs" type="button" title="Lien" @click="addLink">Lien</button>
        <button class="btn btn-ghost btn-xs" type="button" title="Titre niveau 2" @click="setHeading(2)">H2</button>
        <button class="btn btn-ghost btn-xs" type="button" title="Liste à puces" @click="dispatchCommand(wrapInList(editorSchema.nodes.bullet_list))">• Liste</button>
        <button class="btn btn-ghost btn-xs" type="button" title="Liste numérotée" @click="dispatchCommand(wrapInList(editorSchema.nodes.ordered_list))">1. Liste</button>
        <button class="btn btn-ghost btn-xs" type="button" title="Citation" @click="dispatchCommand(wrapIn(editorSchema.nodes.blockquote))">Citation</button>
        <select v-model="selectedLanguage" class="select select-ghost select-xs ml-auto max-w-36 font-mono" aria-label="Langage du bloc de code" @change="setCodeBlockLanguage">
          <option value="">Bloc de code</option>
          <option v-for="language in ['js', 'javascript', 'ts', 'typescript', 'json', 'html', 'css', 'scss', 'vue', 'sh', 'bash', 'shell', 'zsh', 'python', 'php', 'sql', 'yaml', 'markdown']" :key="language" :value="language">{{ language }}</option>
        </select>
      </template>
    </div>
    <div v-show="isRichText" ref="editorElement" class="content-editor__rich" />
    <textarea v-if="!isRichText" v-model="markdown" class="content-editor__markdown textarea w-full rounded-none border-0 bg-base-100 font-mono text-sm leading-relaxed focus:outline-none" aria-label="Markdown de la description" spellcheck="false" />
    <p v-if="conversionError" class="border-t border-error/25 bg-error/10 px-3 py-2 text-xs text-error" role="alert">{{ conversionError }}</p>
  </section>
</template>
