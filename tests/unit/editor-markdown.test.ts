// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DOMParser as ProseMirrorDOMParser } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable } from "prosemirror-tables";
import JSZip from "jszip";
import { documentToJSON, emptyDocument, normalizeDescription } from "@/editor/document";
import { documentToMarkdown, markdownToDocument, MarkdownConversionError } from "@/editor/markdown";
import { editorSchema } from "@/editor/schema";
import { sanitizePastedHTML } from "@/editor/clipboard";
import { createTable } from "@/editor/state";
import { createEditorState } from "@/editor/state";
import { fallbackRichLinkMetadata, resolveLinkMetadata } from "@/editor/rich-links";
import { handleSmartLinkPaste } from "@/editor/smart-links";
import { detectDocumentFormat, DocumentImportError, importDocumentFile, insertImportedDocument } from "@/editor/importers";
import { codeHighlightPluginKey, highlightCode, resolveHighlightLanguage } from "@/editor/code-highlight";
import { copyCodeBlockText } from "@/editor/code-block-view";

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

function typeIntoEditor(view: EditorView, text: string) {
  for (const character of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, character));
    if (!handled) view.dispatch(view.state.tr.insertText(character, from, to));
  }
}

function selectFirstTableCell(view: EditorView) {
  let cellPosition: number | undefined;
  view.state.doc.descendants((node, position) => {
    if (node.type.name === "table_cell" && cellPosition === undefined) cellPosition = position;
  });
  if (cellPosition === undefined) throw new Error("Expected a table cell");
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cellPosition + 2)));
}

const documentGlobal = document;

async function createDocxWithEmbeddedImage(alt: string): Promise<File> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
    </Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:body>
        <w:p><w:r><w:t>Avant l’image</w:t></w:r></w:p>
        <w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="image" descr="${alt}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rIdImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
        <w:sectPr/>
      </w:body>
    </w:document>`);
  zip.file("word/media/image1.png", Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WQAAAABJRU5ErkJggg=="), (character) => character.charCodeAt(0)));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new File([bytes], "illustration.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

describe("ProseMirror editorial document", () => {
  it("applies compact Markdown input rules while keeping the ProseMirror document canonical", () => {
    const cases = [
      { input: "# ", node: "heading", attrs: { level: 1 } },
      { input: "## ", node: "heading", attrs: { level: 2 } },
      { input: "### ", node: "heading", attrs: { level: 3 } },
      { input: "> ", node: "blockquote" },
      { input: "- ", node: "bullet_list" },
      { input: "1. ", node: "ordered_list" },
      { input: "```sh ", node: "code_block", attrs: { language: "sh" } },
    ];

    for (const testCase of cases) {
      const view = createEditorView(emptyDocument());
      typeIntoEditor(view, testCase.input);
      const node = view.state.doc.firstChild!;
      expect(node.type.name).toBe(testCase.node);
      if (testCase.attrs) expect(node.attrs).toMatchObject(testCase.attrs);
      view.destroy();
    }
  });

  it("creates an empty canonical document and normalizes legacy plain text at the read boundary", () => {
    expect(documentToJSON(emptyDocument())).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(documentToJSON(normalizeDescription("Texte historique"))).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Texte historique" }] }],
    });
  });

  it("detects supported document formats using MIME and extension", () => {
    expect(detectDocumentFormat(new File(["x"], "notes.markdown", { type: "" }))).toBe("markdown");
    expect(detectDocumentFormat(new File(["x"], "page", { type: "text/html" }))).toBe("html");
    expect(detectDocumentFormat(new File(["x"], "legacy.doc", { type: "application/msword" }))).toBeNull();
  });

  it("imports TXT, Markdown and HTML through their existing content pipelines", async () => {
    const text = await importDocumentFile(new File(["Une ligne\n\nDeuxième paragraphe"], "notes.txt", { type: "text/plain" }));
    expect(text.childCount).toBe(2);
    const markdown = await importDocumentFile(new File(["# Titre\n\n**important**"], "notes.md", { type: "text/plain" }));
    expect(markdown.firstChild!.type.name).toBe("heading");
    const html = await importDocumentFile(new File(["<h2>HTML</h2><p><strong>riche</strong></p>"], "notes.html", { type: "text/html" }));
    expect(html.firstChild!.type.name).toBe("heading");
    expect(html.lastChild!.firstChild!.marks[0]!.type.name).toBe("strong");
  });

  it("rejects unknown document formats without changing the editor document", async () => {
    await expect(importDocumentFile(new File(["x"], "archive.pdf", { type: "application/pdf" }))).rejects.toBeInstanceOf(DocumentImportError);
  });

  it("imports a real DOCX fixture and preserves embedded image alt text without persisting a Data URL", async () => {
    const document = await importDocumentFile(await createDocxWithEmbeddedImage("Diagramme de flux"));
    expect(document.textContent).toContain("Avant l’image");
    expect(document.textContent).toContain("[Image: Diagramme de flux]");
    let hasImageNode = false;
    document.descendants((node) => { if (node.type.name === "image") hasImageNode = true; });
    expect(hasImageNode).toBe(false);
  });

  it("inserts imported content at an explicit drop position", () => {
    const initial = editorSchema.nodes.doc.create(null, [
      editorSchema.nodes.paragraph.create(null, editorSchema.text("Premier")),
      editorSchema.nodes.paragraph.create(null, editorSchema.text("Second")),
    ]);
    const imported = editorSchema.nodes.doc.create(null, [editorSchema.nodes.paragraph.create(null, editorSchema.text("Importé"))]);
    const view = createEditorView(initial);
    // Position 9 is the start of the second paragraph in this document.
    insertImportedDocument(view, imported, 9);
    expect(view.state.doc.textBetween(0, view.state.doc.content.size, "|")).toBe("Premier|Importé|Second");
    view.destroy();
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

  it("applies the official table structure commands from a cell selection", () => {
    const createTableView = () => {
      const document = editorSchema.nodes.doc.create(null, [createTable()]);
      const view = createEditorView(document);
      selectFirstTableCell(view);
      return view;
    };

    const rowBefore = createTableView();
    expect(addRowBefore(rowBefore.state, rowBefore.dispatch)).toBe(true);
    expect(rowBefore.state.doc.firstChild!.childCount).toBe(4);
    rowBefore.destroy();

    const rowAfter = createTableView();
    expect(addRowAfter(rowAfter.state, rowAfter.dispatch)).toBe(true);
    expect(rowAfter.state.doc.firstChild!.childCount).toBe(4);
    rowAfter.destroy();

    const rowDeletion = createTableView();
    expect(deleteRow(rowDeletion.state, rowDeletion.dispatch)).toBe(true);
    expect(rowDeletion.state.doc.firstChild!.childCount).toBe(2);
    rowDeletion.destroy();

    const columnBefore = createTableView();
    expect(addColumnBefore(columnBefore.state, columnBefore.dispatch)).toBe(true);
    expect(columnBefore.state.doc.firstChild!.firstChild!.childCount).toBe(4);
    columnBefore.destroy();

    const columnAfter = createTableView();
    expect(addColumnAfter(columnAfter.state, columnAfter.dispatch)).toBe(true);
    expect(columnAfter.state.doc.firstChild!.firstChild!.childCount).toBe(4);
    columnAfter.destroy();

    const columnDeletion = createTableView();
    expect(deleteColumn(columnDeletion.state, columnDeletion.dispatch)).toBe(true);
    expect(columnDeletion.state.doc.firstChild!.firstChild!.childCount).toBe(2);
    columnDeletion.destroy();

    const tableDeletion = createTableView();
    expect(deleteTable(tableDeletion.state, tableDeletion.dispatch)).toBe(true);
    expect(tableDeletion.state.doc.firstChild!.type.name).toBe("paragraph");
    tableDeletion.destroy();
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

  it("resolves aliases for presentation only and falls back cleanly for unknown languages", () => {
    expect(resolveHighlightLanguage("ts")).toBe("typescript");
    expect(resolveHighlightLanguage("typescript")).toBe("typescript");
    expect(resolveHighlightLanguage("sh")).toBe("bash");
    expect(resolveHighlightLanguage("bash")).toBe("bash");
    expect(resolveHighlightLanguage("foobar")).toBeNull();
    expect(highlightCode("ts", "const value: number = 42").some((token) => token.className.includes("hljs-"))).toBe(true);
    expect(highlightCode("foobar", "do something")).toEqual([]);
  });

  it("updates presentation decorations without adding highlighting data to the canonical JSON", () => {
    const document = editorSchema.nodeFromJSON({
      type: "doc",
      content: [{ type: "code_block", attrs: { language: "ts" }, content: [{ type: "text", text: 'const value = "hello"' }] }],
    });
    const view = createEditorView(document);
    const highlighted = codeHighlightPluginKey.getState(view.state)!.find();
    expect(highlighted.length).toBeGreaterThan(0);
    expect(documentToJSON(view.state.doc)).toEqual(documentToJSON(document));
    expect(JSON.stringify(documentToJSON(view.state.doc))).not.toContain("hljs-");

    view.dispatch(view.state.tr.insertText("\n// edited", view.state.doc.content.size - 1));
    expect(view.state.doc.textContent).toContain("// edited");
    expect(codeHighlightPluginKey.getState(view.state)!.find().length).toBeGreaterThan(highlighted.length);

    view.dispatch(view.state.tr.setNodeMarkup(0, undefined, { language: "sh" }));
    expect(codeHighlightPluginKey.getState(view.state)!.find().length).toBeGreaterThan(0);
    expect(view.state.doc.firstChild!.attrs.language).toBe("sh");

    view.dispatch(view.state.tr.setNodeMarkup(0, undefined, { language: "foobar" }));
    expect(codeHighlightPluginKey.getState(view.state)!.find()).toEqual([]);
    expect(view.state.doc.firstChild!.attrs.language).toBe("foobar");
    view.destroy();
  });

  it("copies only the raw code text", async () => {
    const copied: string[] = [];
    await expect(copyCodeBlockText('const value: number = 42', { writeText: async (text) => { copied.push(text); } })).resolves.toBe(true);
    expect(copied).toEqual(["const value: number = 42"]);
    expect(copied[0]).not.toContain("```");
    expect(copied[0]).not.toContain("ts");
  });

  it("keeps script-like code as text rather than executable highlighted DOM", () => {
    const source = '<script>alert("hello")</script>';
    const document = editorSchema.nodeFromJSON({
      type: "doc",
      content: [{ type: "code_block", attrs: { language: "html" }, content: [{ type: "text", text: source }] }],
    });
    expect(document.textContent).toBe(source);
    expect(JSON.stringify(documentToJSON(document))).not.toContain("<span");
    expect(highlightCode("html", source).length).toBeGreaterThan(0);
  });

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
