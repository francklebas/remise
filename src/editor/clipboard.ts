const blockedTags = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "meta", "link", "base", "svg", "math"]);
const transparentTags = new Set(["span", "font", "u", "small", "big", "mark", "sub", "sup"]);

function isSafeUrl(value: string | null): value is string {
  if (!value) return false;
  const protocol = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  return !protocol.startsWith("javascript:") && !protocol.startsWith("vbscript:") && !protocol.startsWith("data:");
}

function languageFromClassName(className: string): string {
  const match = /(?:^|\s)(?:language|lang)-([^\s]+)/i.exec(className);
  return match?.[1] ?? "";
}

function replaceWithChildren(element: HTMLElement) {
  element.replaceWith(...Array.from(element.childNodes));
}

function wrapChildrenInSemanticMarks(element: HTMLElement, style: string) {
  const marks: string[] = [];
  if (/(?:font-weight\s*:\s*(?:bold|[6-9]00))/.test(style)) marks.push("strong");
  if (/(?:font-style\s*:\s*italic)/.test(style)) marks.push("em");
  if (/(?:text-decoration(?:-line)?\s*:[^;]*line-through)/.test(style)) marks.push("s");

  if (!marks.length) return;
  let container: HTMLElement = element.ownerDocument.createElement(marks[0]!);
  const root = container;
  for (const mark of marks.slice(1)) {
    const nested = element.ownerDocument.createElement(mark);
    container.append(nested);
    container = nested;
  }
  root.append(...Array.from(element.childNodes));
  element.append(root);
}

function sanitizeElement(element: HTMLElement) {
  const tagName = element.tagName.toLowerCase();
  if (blockedTags.has(tagName)) {
    element.remove();
    return;
  }

  const style = element.getAttribute("style")?.toLowerCase() ?? "";
  const codeElement = tagName === "pre" ? element.querySelector("code") : null;
  const language = tagName === "pre"
    ? element.dataset.language || languageFromClassName(element.className) || languageFromClassName(codeElement?.className ?? "")
    : "";

  for (const child of Array.from(element.children)) sanitizeElement(child as HTMLElement);

  if (tagName === "img") {
    const src = element.getAttribute("src");
    if (!isSafeUrl(src)) {
      const alt = element.getAttribute("alt") ?? "";
      element.replaceWith(element.ownerDocument.createTextNode(alt ? `[Image: ${alt}]` : "[Image]"));
      return;
    }
    const alt = element.getAttribute("alt") ?? "";
    const title = element.getAttribute("title");
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    element.setAttribute("src", src);
    element.setAttribute("alt", alt);
    if (title) element.setAttribute("title", title);
    return;
  }

  if (tagName === "a") {
    const href = element.getAttribute("href");
    if (!isSafeUrl(href)) {
      replaceWithChildren(element);
      return;
    }
    const title = element.getAttribute("title");
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    element.setAttribute("href", href);
    if (title) element.setAttribute("title", title);
  } else {
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
  }

  if (tagName === "pre" && language) element.dataset.language = language;

  if (style) wrapChildrenInSemanticMarks(element, style);
  if (transparentTags.has(tagName)) replaceWithChildren(element);
}

/**
 * Produces a semantic, inert HTML fragment for ProseMirror's native clipboard
 * parser. It intentionally keeps URLs unchanged, but rejects executable and
 * data URLs because this step has no upload or storage policy.
 */
export function sanitizePastedHTML(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const node of Array.from(parsed.body.children)) sanitizeElement(node as HTMLElement);
  return parsed.body.innerHTML;
}
