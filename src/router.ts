export type AppRoute = "/" | "/user" | "/reset-password";

export function passwordResetRedirectTo(): string {
  return import.meta.env.PROD
    ? "https://boardly.francklebas.com/reset-password"
    : "http://localhost:5173/reset-password";
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
