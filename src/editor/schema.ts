import { Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  .append(tableNodes({ tableGroup: "block", cellContent: "block+", cellAttributes: {} }))
  .append({
    rich_link: {
      group: "block",
      atom: true,
      selectable: true,
      draggable: true,
      attrs: {
        url: { validate: "string" },
        domain: { default: "", validate: "string" },
        title: { default: "", validate: "string" },
        description: { default: "", validate: "string" },
        image: { default: "", validate: "string" },
        siteName: { default: "", validate: "string" },
      },
      toDOM: (node) => {
        const url = /^https?:\/\//i.test(node.attrs.url) ? node.attrs.url : "#";
        const title = node.attrs.title || node.attrs.url;
        const domain = node.attrs.siteName || node.attrs.domain;
        const content = [
          ...( /^https?:\/\//i.test(node.attrs.image) ? [["img", { class: "rich-link-card__image", src: node.attrs.image, alt: "" }]] : []),
          ["span", { class: "rich-link-card__domain" }, domain],
          ["span", { class: "rich-link-card__title" }, title],
          ...(node.attrs.description ? [["span", { class: "rich-link-card__description" }, node.attrs.description]] : []),
        ];
        return ["a", { class: "rich-link-card", href: url, target: "_blank", rel: "noopener noreferrer", title: node.attrs.url }, ...content];
      },
    },
  })
  .update("image", {
    inline: true,
    group: "inline",
    draggable: true,
    attrs: {
      src: { validate: "string" },
      storagePath: { default: null, validate: "string|null" },
      alt: { default: "", validate: "string" },
      title: { default: null, validate: "string|null" },
    },
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs: (element) => ({
          src: (element as HTMLImageElement).getAttribute("src") ?? "",
          storagePath: null,
          alt: (element as HTMLImageElement).getAttribute("alt") ?? "",
          title: (element as HTMLImageElement).getAttribute("title"),
        }),
      },
    ],
    toDOM: (node) => ["img", { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title, "data-storage-path": node.attrs.storagePath }],
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
        getAttrs: (element) => {
          const pre = element as HTMLElement;
          const code = pre.querySelector("code");
          const findLanguage = (className: string) => /(?:^|\s)(?:language|lang)-([^\s]+)/i.exec(className)?.[1] ?? "";
          return { language: pre.dataset.language || findLanguage(pre.className) || findLanguage(code?.className ?? "") };
        },
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
