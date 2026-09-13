import MarkdownIt from "markdown-it";
import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer } from "prosemirror-markdown";
import { Node as ProseMirrorNode } from "prosemirror-model";
import { editorSchema } from "@/editor/schema";

export class MarkdownConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownConversionError";
  }
}

const markdownTokenizer = new MarkdownIt("commonmark", { html: false }).enable("strikethrough");

const parser = new MarkdownParser(editorSchema, markdownTokenizer, {
  blockquote: { block: "blockquote" },
  paragraph: { block: "paragraph" },
  list_item: { block: "list_item" },
  bullet_list: { block: "bullet_list" },
  ordered_list: { block: "ordered_list", getAttrs: (token) => ({ order: Number(token.attrGet("start")) || 1 }) },
  heading: { block: "heading", getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
  code_block: { block: "code_block", getAttrs: () => ({ language: "" }), noCloseToken: true },
  fence: { block: "code_block", getAttrs: (token) => ({ language: token.info.trim() }), noCloseToken: true },
  image: { node: "image", getAttrs: (token) => ({ src: token.attrGet("src") ?? "", alt: token.content, title: token.attrGet("title") }) },
  em: { mark: "em" },
  strong: { mark: "strong" },
  s: { mark: "strike" },
  link: { mark: "link", getAttrs: (token) => ({ href: token.attrGet("href"), title: token.attrGet("title") || null }) },
  code_inline: { mark: "code", noCloseToken: true },
});

const serializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    code_block(state, node) {
      const longestBacktickRun = Math.max(0, ...Array.from(node.textContent.matchAll(/`+/g), (match) => match[0].length));
      const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
      state.write(`${fence}${node.attrs.language || ""}\n`);
      state.text(node.textContent, false);
      state.write("\n");
      state.write(fence);
      state.closeBlock(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strike: { open: "~~", close: "~~", mixable: true },
  },
);

function assertRepresentable(markdown: string) {
  const unsupported = markdownTokenizer.parse(markdown, {}).find((token) => token.type === "hr");
  if (unsupported) {
    throw new MarkdownConversionError(
      "Les séparateurs horizontaux ne sont pas encore pris en charge par l’éditeur.",
    );
  }
}

export function markdownToDocument(markdown: string): ProseMirrorNode {
  assertRepresentable(markdown);
  try {
    return parser.parse(markdown);
  } catch (error) {
    throw new MarkdownConversionError(
      error instanceof Error ? `Impossible de lire ce Markdown : ${error.message}` : "Impossible de lire ce Markdown.",
    );
  }
}

export function documentToMarkdown(document: ProseMirrorNode): string {
  return serializer.serialize(document);
}
