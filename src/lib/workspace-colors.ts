export const workspaceColorClasses: Record<string, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

export function workspaceColorClass(color: string | undefined): string {
  return workspaceColorClasses[color ?? ""] ?? workspaceColorClasses.primary!;
}
