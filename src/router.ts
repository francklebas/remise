import { isLegalRoute, type LegalRoute } from "@/legal";

export type AppRoute = "/" | "/user" | "/reset-password" | LegalRoute;

const boardPathPattern = /^\/b\/([0-9a-f-]{36})\/?$/i;

export function passwordResetRedirectTo(): string {
  return `${window.location.origin}/reset-password`;
}

export function currentRoute(): AppRoute {
  if (window.location.pathname === "/user") return "/user";
  if (window.location.pathname === "/reset-password") return "/reset-password";
  if (isLegalRoute(window.location.pathname)) return window.location.pathname;
  return "/";
}

export function boardPath(boardId: string): string {
  return `/b/${boardId}`;
}

export function currentBoardId(): string | null {
  return boardPathPattern.exec(window.location.pathname)?.[1]?.toLowerCase() ?? null;
}

// Records the active board in the address bar without triggering a route change.
export function setBoardUrl(boardId: string, { replace = false } = {}) {
  const path = replace ? `${boardPath(boardId)}${window.location.search}` : boardPath(boardId);
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}

export function navigate(path: string, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
