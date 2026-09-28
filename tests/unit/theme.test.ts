// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, normalizeThemePreference, resolveTheme } from "@/theme";

describe("theme preference", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
  });

  it("normalizes unknown saved values to system", () => {
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("sepia")).toBe("system");
    expect(normalizeThemePreference(undefined)).toBe("system");
  });

  it("resolves system preference against the device color scheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("bumblebee");
    expect(resolveTheme("light", true)).toBe("bumblebee");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("applies the selected DaisyUI theme to the document", () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as typeof window.matchMedia;
    try {
      applyTheme("system");
      expect(document.documentElement.dataset.theme).toBe("dark");
      applyTheme("light");
      expect(document.documentElement.dataset.theme).toBe("bumblebee");
      expect(document.documentElement.style.colorScheme).toBe("light");
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});
