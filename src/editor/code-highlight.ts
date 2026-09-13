import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("scss", scss);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);

const presentationAliases: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  html: "xml",
  vue: "xml",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  plain: "plaintext",
  text: "plaintext",
};

export interface HighlightToken {
  from: number;
  to: number;
  className: string;
}

export const codeHighlightPluginKey = new PluginKey<DecorationSet>("remise-code-highlight");

/** Resolves language aliases only for visual highlighting, never for the document. */
export function resolveHighlightLanguage(language: string): string | null {
  const candidate = presentationAliases[language.toLowerCase()] ?? language.toLowerCase();
  return hljs.getLanguage(candidate) ? candidate : null;
}

/**
 * Reads Highlight.js' inert output into offsets/classes. The returned HTML is
 * never mounted in the application; ProseMirror decorations render the result.
 */
export function highlightCode(language: string, text: string): HighlightToken[] {
  const resolvedLanguage = resolveHighlightLanguage(language);
  if (!resolvedLanguage || !text) return [];

  const output = hljs.highlight(text, { language: resolvedLanguage, ignoreIllegals: true }).value;
  const document = new DOMParser().parseFromString(output, "text/html");
  const tokens: HighlightToken[] = [];
  let offset = 0;

  const visit = (node: Node, inheritedClasses: string[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const content = node.textContent ?? "";
      if (inheritedClasses.length && content) {
        tokens.push({ from: offset, to: offset + content.length, className: inheritedClasses.join(" ") });
      }
      offset += content.length;
      return;
    }

    const element = node as HTMLElement;
    const ownClasses = element.classList ? Array.from(element.classList).filter((className) => className.startsWith("hljs-")) : [];
    for (const child of Array.from(node.childNodes)) visit(child, [...inheritedClasses, ...ownClasses]);
  };

  for (const node of Array.from(document.body.childNodes)) visit(node, []);
  return tokens;
}

function codeBlockDecorations(node: ProseMirrorNode, position: number): Decoration[] {
  if (node.type.name !== "code_block") return [];
  const start = position + 1;
  return highlightCode(String(node.attrs.language ?? ""), node.textContent)
    .filter((token) => token.from < token.to)
    .map((token) => Decoration.inline(start + token.from, start + token.to, { class: token.className }));
}

function allCodeBlockDecorations(document: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  document.descendants((node, position) => {
    decorations.push(...codeBlockDecorations(node, position));
  });
  return DecorationSet.create(document, decorations);
}

function affectedCodeBlocks(transaction: Transaction): Array<{ node: ProseMirrorNode; position: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  transaction.mapping.maps.forEach((map, index) => {
    map.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
      ranges.push({
        from: transaction.mapping.slice(index + 1).map(newFrom, -1),
        to: transaction.mapping.slice(index + 1).map(newTo, 1),
      });
    });
  });

  const blocks: Array<{ node: ProseMirrorNode; position: number }> = [];
  transaction.doc.descendants((node, position) => {
    if (node.type.name !== "code_block") return;
    const end = position + node.nodeSize;
    if (ranges.some((range) => range.from <= end && range.to >= position)) blocks.push({ node, position });
  });
  return blocks;
}

/** Presentation-only token decorations, recalculated only for changed code blocks. */
export function codeHighlightPlugin() {
  return new Plugin<DecorationSet>({
    key: codeHighlightPluginKey,
    state: {
      init: (_, state) => allCodeBlockDecorations(state.doc),
      apply(transaction, decorations) {
        if (!transaction.docChanged) return decorations.map(transaction.mapping, transaction.doc);

        const changedBlocks = affectedCodeBlocks(transaction);
        if (!changedBlocks.length) return decorations.map(transaction.mapping, transaction.doc);

        let next = decorations.map(transaction.mapping, transaction.doc);
        for (const { node, position } of changedBlocks) {
          next = next.remove(next.find(position, position + node.nodeSize));
          next = next.add(transaction.doc, codeBlockDecorations(node, position));
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        return codeHighlightPluginKey.getState(state);
      },
    },
  });
}
