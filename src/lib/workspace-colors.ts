// Fixed palette so a workspace keeps its color in every theme.
// Keep in sync with the workspaces_color_known constraint.
export const workspaceColors = [
  { id: "primary", label: "Couleur principale", className: "bg-primary" },
  { id: "orange", label: "Orange", className: "bg-orange-500" },
  { id: "red", label: "Rouge", className: "bg-red-500" },
  { id: "pink", label: "Rose", className: "bg-pink-500" },
  { id: "violet", label: "Violet", className: "bg-violet-500" },
  { id: "blue", label: "Bleu", className: "bg-blue-500" },
  { id: "green", label: "Vert", className: "bg-emerald-500" },
] as const;

export function workspaceColorClass(color: string | undefined): string {
  return (workspaceColors.find(({ id }) => id === color) ?? workspaceColors[0]).className;
}
