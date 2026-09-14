export type AppRoute = "/" | "/user" | "/reset-password";

export function passwordResetRedirectTo(): string {
  return `${window.location.origin}/reset-password`;
}

export function currentRoute(): AppRoute {
  if (window.location.pathname === "/user") return "/user";
  if (window.location.pathname === "/reset-password") return "/reset-password";
  return "/";
}

export function navigate(path: AppRoute) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
