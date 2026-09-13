import { Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  .update("image", {
    inline: true,
    group: "inline",
    draggable: true,
    attrs: {
      src: { validate: "string" },
      alt: { default: "", validate: "string" },
      title: { default: null, validate: "string|null" },
    },
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs: (element) => ({
          src: (element as HTMLImageElement).getAttribute("src") ?? "",
          alt: (element as HTMLImageElement).getAttribute("alt") ?? "",
          title: (element as HTMLImageElement).getAttribute("title"),
        }),
      },
    ],
    toDOM: (node) => ["img", { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }],
  })
  .update("code_block", {
  attrs: { language: { default: "" } },
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full",
      getAttrs: (element) => ({ language: (element as HTMLElement).dataset.language ?? "" }),
    },
  ],
  toDOM: (node) => ["pre", { "data-language": node.attrs.language || null }, ["code", 0]],
  });

const marks = basicSchema.spec.marks.addToEnd("strike", {
  parseDOM: [{ tag: "s" }, { tag: "del" }, { style: "text-decoration=line-through" }],
  toDOM: () => ["s", 0],
});

/** The single schema used by both the rich-text and Markdown views. */
export const editorSchema = new Schema({ nodes, marks });
