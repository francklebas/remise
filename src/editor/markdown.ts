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

const markdownTokenizer = new MarkdownIt("commonmark", { html: false }).enable(["strikethrough", "table"]);

markdownTokenizer.core.ruler.after("inline", "table_cell_paragraphs", (state) => {
  const tokens = [];
  const paragraphToken = (type: "paragraph_open" | "paragraph_close", nesting: 1 | -1) => ({ type, tag: "p", nesting }) as (typeof state.tokens)[number];
  for (const token of state.tokens) {
    if (token.type === "th_close" || token.type === "td_close") tokens.push(paragraphToken("paragraph_close", -1));
    tokens.push(token);
    if (token.type === "th_open" || token.type === "td_open") tokens.push(paragraphToken("paragraph_open", 1));
  }
  state.tokens = tokens;
  return true;
});

const parser = new MarkdownParser(editorSchema, markdownTokenizer, {
  blockquote: { block: "blockquote" },
  paragraph: { block: "paragraph" },
  list_item: { block: "list_item" },
  bullet_list: { block: "bullet_list" },
  ordered_list: { block: "ordered_list", getAttrs: (token) => ({ order: Number(token.attrGet("start")) || 1 }) },
  heading: { block: "heading", getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
  table: { block: "table" },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: "table_row" },
  th: { block: "table_header" },
  td: { block: "table_cell" },
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
    table(state, node) {
      const rows = Array.from({ length: node.childCount }, (_, index) => node.child(index));
      const header = rows[0];
      if (!header || !Array.from({ length: header.childCount }, (_, index) => header.child(index)).every((cell) => cell.type.name === "table_header")) {
        throw new MarkdownConversionError("Un tableau sans ligne d’en-tête ne peut pas être représenté sans perte en Markdown standard.");
      }
      if (rows.slice(1).some((row) => Array.from({ length: row.childCount }, (_, index) => row.child(index)).some((cell) => cell.type.name !== "table_cell"))) {
        throw new MarkdownConversionError("Les en-têtes de tableau doivent être regroupés sur la première ligne pour être représentés en Markdown standard.");
      }
      const columnCount = header.childCount;
      if (rows.some((row) => row.childCount !== columnCount)) throw new MarkdownConversionError("Les lignes du tableau n’ont pas le même nombre de cellules.");

      const renderCell = (cell: ProseMirrorNode) => {
        if (cell.childCount !== 1 || cell.firstChild?.type.name !== "paragraph") {
          throw new MarkdownConversionError("Les cellules contenant plusieurs blocs ne peuvent pas être représentées sans perte en Markdown standard.");
        }
        const cellDocument = editorSchema.nodes.doc.create(null, cell.content);
        const markdown = serializer.serialize(cellDocument).replace(/\n+$/, "");
        if (markdown.includes("|")) throw new MarkdownConversionError("Les cellules contenant le caractère | ne peuvent pas être représentées sans perte en Markdown standard.");
        return markdown;
      };
      const renderRow = (row: ProseMirrorNode) => `| ${Array.from({ length: row.childCount }, (_, index) => renderCell(row.child(index))).join(" | ")} |`;
      state.write(renderRow(header));
      state.write(`\n| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`);
      for (const row of rows.slice(1)) state.write(`\n${renderRow(row)}`);
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
