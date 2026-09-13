import { Node as ProseMirrorNode } from "prosemirror-model";
import { editorSchema } from "@/editor/schema";

export interface ProseMirrorDocumentJSON {
  type: "doc";
  content?: ProseMirrorNodeJSON[];
}

export interface ProseMirrorNodeJSON {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: ProseMirrorNodeJSON[];
}

/** Canonical, serializable content persisted by cards. */
export type CardDescription = ProseMirrorDocumentJSON;

export function emptyDocument(): ProseMirrorNode {
  return editorSchema.topNodeType.createAndFill()!;
}

export function plainTextToDocument(text: string): ProseMirrorNode {
  if (!text) return emptyDocument();

  const paragraphs = text.split(/\n{2,}/).map((paragraph) =>
    editorSchema.nodes.paragraph.create(
      null,
      paragraph ? editorSchema.text(paragraph.replace(/\n/g, " ")) : undefined,
    ),
  );
  return editorSchema.nodes.doc.create(null, paragraphs);
}

/**
 * Compatibility boundary for historic plain-text descriptions. Call this only
 * while hydrating data; application state must contain JSON afterwards.
 */
export function normalizeDescription(description: unknown): ProseMirrorNode {
  if (typeof description === "string") return plainTextToDocument(description);
  if (!description) return emptyDocument();

  try {
    return editorSchema.nodeFromJSON(description);
  } catch {
    // A malformed historic value must remain editable instead of crashing the card.
    return plainTextToDocument(JSON.stringify(description));
  }
}

export function documentFromDescription(description: CardDescription): ProseMirrorNode {
  return editorSchema.nodeFromJSON(description);
}

export function documentToJSON(document: ProseMirrorNode): ProseMirrorDocumentJSON {
  return document.toJSON() as ProseMirrorDocumentJSON;
}

export function descriptionToPlainText(description: CardDescription): string {
  const document = documentFromDescription(description);
  return document.textBetween(0, document.content.size, "\n");
}
