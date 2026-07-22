import type { HttpMethod, Route } from "./http.js";

/**
 * Minimal path router with `:param` segments (doc 08 naming conventions).
 *
 * Kept deliberately small and dependency-free. In production this maps onto the framework's router;
 * the point of having our own is that route registration is where authorization is declared (http.ts),
 * so the kernel can guarantee every matched route carries an authorization decision.
 */
export interface RouteMatch {
  readonly route: Route;
  readonly params: Readonly<Record<string, string>>;
}

interface CompiledRoute {
  readonly method: HttpMethod;
  readonly regex: RegExp;
  readonly paramNames: readonly string[];
  readonly route: Route;
}

export class Router {
  private readonly compiled: CompiledRoute[] = [];

  register(route: Route): this {
    const paramNames: string[] = [];
    const pattern = route.path
      .split("/")
      .map((segment) => {
        if (segment.startsWith(":")) {
          paramNames.push(segment.slice(1));
          return "([^/]+)";
        }
        return escapeRegex(segment);
      })
      .join("/");
    this.compiled.push({
      method: route.method,
      regex: new RegExp(`^${pattern}/?$`),
      paramNames,
      route,
    });
    return this;
  }

  registerAll(routes: readonly Route[]): this {
    for (const route of routes) {
      this.register(route);
    }
    return this;
  }

  match(method: HttpMethod, path: string): RouteMatch | undefined {
    for (const candidate of this.compiled) {
      if (candidate.method !== method) {
        continue;
      }
      const result = candidate.regex.exec(path);
      if (!result) {
        continue;
      }
      const params: Record<string, string> = {};
      candidate.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(result[index + 1]!);
      });
      return { route: candidate.route, params };
    }
    return undefined;
  }
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
