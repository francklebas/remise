export type ThemePreference = "dark" | "light" | "system";

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "dark" || value === "light" || value === "system"
    ? value
    : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): "bumblebee" | "dark" {
  if (preference === "system") return prefersDark ? "dark" : "bumblebee";
  return preference === "dark" ? "dark" : "bumblebee";
}

export function applyTheme(preference: ThemePreference): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolveTheme(preference, prefersDark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "dark" ? "dark" : "light";
}
