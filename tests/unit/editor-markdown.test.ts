// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DOMParser as ProseMirrorDOMParser } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { documentToJSON, emptyDocument, normalizeDescription } from "@/editor/document";
import { documentToMarkdown, markdownToDocument, MarkdownConversionError } from "@/editor/markdown";
import { editorSchema } from "@/editor/schema";
import { sanitizePastedHTML } from "@/editor/clipboard";
import { createTable } from "@/editor/state";
import { createEditorState } from "@/editor/state";
import { fallbackRichLinkMetadata, resolveLinkMetadata } from "@/editor/rich-links";
import { handleSmartLinkPaste } from "@/editor/smart-links";

function roundTripMarkdown(markdown: string) {
  return markdownToDocument(documentToMarkdown(markdownToDocument(markdown)));
}

function parsePastedHTML(html: string) {
  const container = document.createElement("div");
  container.innerHTML = sanitizePastedHTML(html);
  return ProseMirrorDOMParser.fromSchema(editorSchema).parse(container);
}

function createPasteEvent(url: string): ClipboardEvent {
  return { clipboardData: { getData: (type: string) => type === "text/plain" ? url : "" } } as unknown as ClipboardEvent;
}

function createEditorView(document: ReturnType<typeof emptyDocument>, selection?: TextSelection) {
  const mount = documentGlobal.createElement("div");
  const state = createEditorState(document);
  const view = new EditorView(mount, { state });
  if (selection) view.dispatch(view.state.tr.setSelection(selection));
  return view;
}

const documentGlobal = document;

describe("ProseMirror editorial document", () => {
  it("creates an empty canonical document and normalizes legacy plain text at the read boundary", () => {
    expect(documentToJSON(emptyDocument())).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(documentToJSON(normalizeDescription("Texte historique"))).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Texte historique" }] }],
    });
  });

  it("serializes and restores a ProseMirror JSON document", () => {
    const original = editorSchema.nodeFromJSON({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Titre" }] }],
    });
    expect(editorSchema.nodeFromJSON(documentToJSON(original)).eq(original)).toBe(true);
  });

  it("round-trips paragraphs, marks and links through Markdown", () => {
    const markdown = "Un texte **gras**, *italique*, ~~barré~~, [lié](https://example.test) et `inline`.";
    const restored = roundTripMarkdown(markdown);
    expect(documentToMarkdown(restored)).toContain("**gras**");
    expect(documentToMarkdown(restored)).toContain("*italique*");
    expect(documentToMarkdown(restored)).toContain("~~barré~~");
    expect(documentToMarkdown(restored)).toContain("[lié](https://example.test)");
    expect(documentToMarkdown(restored)).toContain("`inline`");
  });

  it("serializes a Rich Card as portable Markdown and restores only a normal link", () => {
    const url = "https://example.test/article";
    const card = editorSchema.nodes.rich_link.create({ ...fallbackRichLinkMetadata(url), title: "Article utile" });
    const richDocument = editorSchema.nodes.doc.create(null, [card]);
    expect(documentToMarkdown(richDocument)).toBe("[Article utile](https://example.test/article)");

    const restored = markdownToDocument(documentToMarkdown(richDocument));
    expect(restored.firstChild!.type.name).toBe("paragraph");
    expect(restored.firstChild!.firstChild!.marks[0]!.type.name).toBe("link");
    expect(restored.firstChild!.firstChild!.marks[0]!.attrs.href).toBe(url);
  });

  it("serializes a metadata-free Rich Card as its URL", () => {
    const url = "https://example.test/no-metadata";
    const richDocument = editorSchema.nodes.doc.create(null, [editorSchema.nodes.rich_link.create(fallbackRichLinkMetadata(url))]);
    expect(documentToMarkdown(richDocument)).toBe(url);
    expect(markdownToDocument(documentToMarkdown(richDocument)).textContent).toBe(url);
  });

  it("creates a Rich Card only when a single URL is pasted into an empty block", async () => {
    const view = createEditorView(emptyDocument());
    const url = "https://notion.so/example-page";
    expect(handleSmartLinkPaste(view, createPasteEvent(url))).toBe(true);
    expect(view.state.doc.firstChild!.type.name).toBe("rich_link");
    expect(view.state.doc.firstChild!.attrs).toMatchObject({ url, domain: "notion.so" });
    expect(await resolveLinkMetadata(url)).toEqual(fallbackRichLinkMetadata(url));
    view.destroy();
  });

  it("pastes a URL into existing text as an inline link", () => {
    const initial = editorSchema.nodes.doc.create(null, [editorSchema.nodes.paragraph.create(null, editorSchema.text("Avant "))]);
    const view = createEditorView(initial, TextSelection.create(initial, 7));
    const url = "https://example.test/guide";
    expect(handleSmartLinkPaste(view, createPasteEvent(url))).toBe(true);
    const inserted = view.state.doc.firstChild!.lastChild!;
    expect(inserted.text).toBe(url);
    expect(inserted.marks[0]!.attrs.href).toBe(url);
    view.destroy();
  });

  it("turns selected text into a link instead of replacing it with a card", () => {
    const initial = editorSchema.nodes.doc.create(null, [editorSchema.nodes.paragraph.create(null, editorSchema.text("Titre"))]);
    const view = createEditorView(initial, TextSelection.create(initial, 1, 6));
    const url = "https://github.com/example/project";
    expect(handleSmartLinkPaste(view, createPasteEvent(url))).toBe(true);
    expect(view.state.doc.textContent).toBe("Titre");
    expect(view.state.doc.firstChild!.firstChild!.marks[0]!.attrs.href).toBe(url);
    view.destroy();
  });

  it("round-trips nested lists and blockquotes", () => {
    const markdown = "> Une citation\n>\n> - premier\n>   - imbriqué\n> - second\n\n1. un\n   1. imbriqué";
    expect(documentToMarkdown(roundTripMarkdown(markdown))).toContain("> Une citation");
    const restored = roundTripMarkdown(markdown);
    let hasNestedList = false;
    restored.descendants((node) => {
      if (node.type.name !== "bullet_list") return;
      node.descendants((child) => {
        if (child.type.name === "bullet_list") hasNestedList = true;
      });
    });
    expect(hasNestedList).toBe(true);
  });

  it("parses, serializes and restores a Markdown table with marks in cells", () => {
    const markdown = "| Nom | Détail |\n| --- | --- |\n| **Alpha** | [Lien](https://example.test) et `code` |\n| Bravo | ~~archivé~~ |";
    const document = markdownToDocument(markdown);
    const table = document.firstChild!;
    expect(table.type.name).toBe("table");
    expect(table.firstChild!.firstChild!.type.name).toBe("table_header");
    expect(table.child(1).firstChild!.type.name).toBe("table_cell");
    expect(table.child(1).firstChild!.firstChild!.textContent).toBe("Alpha");

    const serialized = documentToMarkdown(document);
    expect(serialized).toBe(markdown);
    const restored = markdownToDocument(serialized);
    expect(documentToJSON(restored)).toEqual(documentToJSON(document));
  });

  it("preserves a pasted HTML table structure after clipboard cleanup", () => {
    const parsed = parsePastedHTML('<table class="docs-table" style="width:100%"><thead><tr><th data-column="name">Nom</th><th>Détail</th></tr></thead><tbody><tr><td><strong>Alpha</strong></td><td><a href="/guide">Lien</a></td></tr></tbody></table>');
    const table = parsed.firstChild!;
    expect(table.type.name).toBe("table");
    expect(table.firstChild!.firstChild!.type.name).toBe("table_header");
    expect(table.child(1).firstChild!.type.name).toBe("table_cell");
    expect(table.child(1).firstChild!.firstChild!.firstChild!.marks.map((mark) => mark.type.name)).toEqual(["strong"]);
    expect(table.child(1).child(1).firstChild!.firstChild!.marks[0]!.attrs.href).toBe("/guide");
  });

  it("creates an editable table with an explicit header row", () => {
    const table = createTable();
    expect(table.type.name).toBe("table");
    expect(table.childCount).toBe(3);
    expect(table.firstChild!.childCount).toBe(3);
    expect(table.firstChild!.firstChild!.type.name).toBe("table_header");
    expect(table.child(1).firstChild!.type.name).toBe("table_cell");
    expect(table.firstChild!.firstChild!.firstChild!.type.name).toBe("paragraph");
  });

  it("refuses a headerless table Markdown conversion instead of changing cell semantics", () => {
    const paragraph = editorSchema.nodes.paragraph.createAndFill()!;
    const cell = editorSchema.nodes.table_cell.createAndFill(null, paragraph)!;
    const row = editorSchema.nodes.table_row.createAndFill(null, [cell, cell])!;
    const table = editorSchema.nodes.table.createAndFill(null, [row])!;
    const document = editorSchema.nodes.doc.create(null, [table]);
    expect(() => documentToMarkdown(document)).toThrow(MarkdownConversionError);
  });

  it.each(["sh", "bash", "shell", "zsh", "js", "javascript", "ts", "typescript", "json", "html", "css", "scss", "vue", "python", "php", "sql", "yaml", "markdown", "whatever"])(
    "round-trips canonical JSON and Markdown with the exact code-block language %s",
    (language) => {
      const parsedFromMarkdown = markdownToDocument(`\`\`\`${language}\necho "hello"\n\`\`\``);
      expect(parsedFromMarkdown.firstChild!.attrs.language).toBe(language);
      const original = editorSchema.nodeFromJSON({
        type: "doc",
        content: [{ type: "code_block", attrs: { language }, content: [{ type: "text", text: 'echo "hello"\n  indented' }] }],
      });
      const markdown = documentToMarkdown(original);
      expect(markdown).toContain(`\`\`\`${language}`);
      const restored = markdownToDocument(markdown);
      const codeBlock = restored.firstChild!;
      expect(codeBlock.type.name).toBe("code_block");
      expect(codeBlock.attrs.language).toBe(language);
      expect(codeBlock.textContent).toBe('echo "hello"\n  indented');
      expect(documentToJSON(restored)).toEqual(documentToJSON(original));
    },
  );

  it("uses a fence longer than backticks in multiline code and preserves indentation", () => {
    const original = editorSchema.nodeFromJSON({
      type: "doc",
      content: [{ type: "code_block", attrs: { language: "typescript" }, content: [{ type: "text", text: "const template = `value with ``` backticks`;\n  indented();" }] }],
    });
    const serialized = documentToMarkdown(original);
    expect(serialized).toMatch(/^````typescript/m);
    const restored = markdownToDocument(serialized);
    expect(restored.firstChild!.attrs.language).toBe("typescript");
    expect(restored.firstChild!.textContent).toBe("const template = `value with ``` backticks`;\n  indented();");
    expect(documentToJSON(restored)).toEqual(documentToJSON(original));
  });

  it("cleans decorative rich HTML while keeping its expected ProseMirror structure", () => {
    const html = [
      '<h2 class="docs-heading" style="color: blue" onclick="alert(1)">Titre</h2>',
      '<p class="MsoNormal" data-source="word" style="mso-margin-top-alt:auto">Un <span class="c4" style="font-weight: 700">texte</span> <a href="https://example.test/page" title="Page" data-track="x">lié</a> <img src="/images/logo.png" alt="Logo" title="Marque" data-id="42"></p>',
      "<script>window.evil = true</script>",
    ].join("");

    const sanitized = sanitizePastedHTML(html);
    expect(sanitized).not.toMatch(/script|onclick|class=|data-source|mso-|data-track/i);
    const parsed = parsePastedHTML(html);
    expect(documentToJSON(parsed)).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Titre" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Un " },
            { type: "text", marks: [{ type: "strong" }], text: "texte" },
            { type: "text", text: " " },
            { type: "text", marks: [{ type: "link", attrs: { href: "https://example.test/page", title: "Page" } }], text: "lié" },
            { type: "text", text: " " },
            { type: "image", attrs: { src: "/images/logo.png", alt: "Logo", title: "Marque" } },
          ],
        },
      ],
    });
  });

  it.each(["sh", "bash", "ts", "typescript", "js", "javascript"])("keeps code language %s exactly when pasting HTML", (language) => {
    const html = `<pre class="ignored"><code class="language-${language}">echo "hello"\n  indented</code></pre>`;
    const sanitized = sanitizePastedHTML(html);
    expect(sanitized).toContain(`data-language="${language}"`);
    const parsed = parsePastedHTML(html);
    expect(parsed.firstChild!.attrs.language).toBe(language);
    expect(parsed.firstChild!.textContent).toBe('echo "hello"\n  indented');
  });

  it("preserves schema attributes and removes unsafe clipboard URLs", () => {
    const sanitized = sanitizePastedHTML('<p><a href="javascript:alert(1)">dangereux</a><a href="/guide" title="Guide">sûr</a><img src="data:image/png;base64,abc" alt="Temporaire"><img src="https://example.test/image.png" alt="Image" title="Titre"></p>');
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("data:image");
    const parsed = parsePastedHTML(sanitized);
    expect(documentToJSON(parsed)).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "dangereux" },
            { type: "text", marks: [{ type: "link", attrs: { href: "/guide", title: "Guide" } }], text: "sûr" },
            { type: "text", text: "[Image: Temporaire]" },
            { type: "image", attrs: { src: "https://example.test/image.png", alt: "Image", title: "Titre" } },
          ],
        },
      ],
    });
  });

  it.each([
    ["image simple", "![Logo](https://example.com/image.png)", "https://example.com/image.png", "Logo", null],
    ["alt vide", "![](https://example.com/image.png)", "https://example.com/image.png", "", null],
    ["titre", '![Logo](https://example.com/image.png "Image de démonstration")', "https://example.com/image.png", "Logo", "Image de démonstration"],
    ["URL relative", "![Illustration](images/cover.png)", "images/cover.png", "Illustration", null],
    ["URL avec caractères spéciaux", "![Étoile](https://example.com/images/%C3%A9toile.png?size=320&theme=light)", "https://example.com/images/%C3%A9toile.png?size=320&theme=light", "Étoile", null],
  ])("round-trips Markdown %s without changing image attributes", (_label, markdown, src, alt, title) => {
    const document = markdownToDocument(markdown);
    const image = document.firstChild!.firstChild!;
    expect(image.type.name).toBe("image");
    expect(image.attrs).toEqual({ src, alt, title });

    const serialized = documentToMarkdown(document);
    const restored = markdownToDocument(serialized);
    expect(restored.firstChild!.firstChild!.attrs).toEqual({ src, alt, title });
    expect(serialized).toBe(markdown);
  });

  it("does not silently convert unsupported Markdown", () => {
    const currentDocument = markdownToDocument("Contenu sûr");
    expect(() => markdownToDocument("---")).toThrow(MarkdownConversionError);
    // A failed conversion leaves the current canonical document available to the caller.
    expect(currentDocument.textContent).toBe("Contenu sûr");
  });
});
