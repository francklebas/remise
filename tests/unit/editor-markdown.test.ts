import { describe, expect, it } from "vitest";
import { documentToJSON, emptyDocument, normalizeDescription } from "@/editor/document";
import { documentToMarkdown, markdownToDocument, MarkdownConversionError } from "@/editor/markdown";
import { editorSchema } from "@/editor/schema";

function roundTripMarkdown(markdown: string) {
  return markdownToDocument(documentToMarkdown(markdownToDocument(markdown)));
}

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
