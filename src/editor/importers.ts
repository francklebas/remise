import mammoth from "mammoth";
import { DOMParser as ProseMirrorDOMParser, Slice, type Node as ProseMirrorNode } from "prosemirror-model";
import { Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { plainTextToDocument } from "@/editor/document";
import { MarkdownConversionError, markdownToDocument } from "@/editor/markdown";
import { sanitizePastedHTML } from "@/editor/clipboard";
import { editorSchema } from "@/editor/schema";

export type DocumentFormat = "text" | "markdown" | "html" | "docx";

export class DocumentImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentImportError";
  }
}

const extensionFormats: Record<string, DocumentFormat> = {
  txt: "text",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  docx: "docx",
};

const mimeFormats: Record<string, DocumentFormat> = {
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function extensionFor(file: File): string {
  const match = /\.([^.]+)$/.exec(file.name.toLowerCase());
  return match?.[1] ?? "";
}

/** MIME is used for specific types; extension resolves generic browser MIME values. */
export function detectDocumentFormat(file: File): DocumentFormat | null {
  const mimeFormat = mimeFormats[file.type.toLowerCase()];
  if (mimeFormat) return mimeFormat;
  const extensionFormat = extensionFormats[extensionFor(file)];
  if (extensionFormat) return extensionFormat;
  return file.type.toLowerCase() === "text/plain" ? "text" : null;
}

export function htmlToDocument(html: string): ProseMirrorNode {
  const container = document.createElement("div");
  container.innerHTML = sanitizePastedHTML(html);
  return ProseMirrorDOMParser.fromSchema(editorSchema).parse(container);
}

async function docxToDocument(file: File): Promise<ProseMirrorNode> {
  const arrayBuffer = await file.arrayBuffer();
  // Mammoth's Node build expects Buffer; Vite resolves its browser unzipper,
  // which accepts ArrayBuffer. This also lets the same importer use a real
  // DOCX fixture in the Node-based test runner.
  const runtime = globalThis as typeof globalThis & {
    process?: { versions?: { node?: string } };
    Buffer?: { from: (value: ArrayBuffer) => unknown };
  };
  const buffer = runtime.Buffer?.from(arrayBuffer);
  const input = runtime.process?.versions?.node && buffer ? { buffer } : { arrayBuffer };
  const result = await mammoth.convertToHtml(input as Parameters<typeof mammoth.convertToHtml>[0]);
  if (!result.value.trim()) throw new DocumentImportError("Ce document DOCX ne contient aucun contenu importable.");
  return htmlToDocument(result.value);
}

export async function importDocumentFile(file: File): Promise<ProseMirrorNode> {
  const format = detectDocumentFormat(file);
  if (!format) throw new DocumentImportError("Format non pris en charge. Utilisez TXT, Markdown, HTML ou DOCX.");

  try {
    if (format === "docx") return await docxToDocument(file);
    const content = await file.text();
    if (format === "markdown") return markdownToDocument(content);
    if (format === "html") return htmlToDocument(content);
    return plainTextToDocument(content);
  } catch (error) {
    if (error instanceof DocumentImportError) throw error;
    if (error instanceof MarkdownConversionError) throw new DocumentImportError(error.message);
    throw new DocumentImportError(error instanceof Error ? `Import impossible : ${error.message}` : "Import impossible.");
  }
}

export function insertImportedDocument(view: EditorView, document: ProseMirrorNode, position?: number) {
  let transaction = view.state.tr;
  if (position !== undefined) {
    const safePosition = Math.max(0, Math.min(position, view.state.doc.content.size));
    transaction = transaction.setSelection(Selection.near(view.state.doc.resolve(safePosition)));
  }
  view.dispatch(transaction.replaceSelection(new Slice(document.content, 0, 0)).scrollIntoView());
}
