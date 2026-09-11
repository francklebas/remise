export type AppRoute = "/" | "/user";

export function currentRoute(): AppRoute {
  return window.location.pathname === "/user" ? "/user" : "/";
}

export function navigate(path: AppRoute) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
