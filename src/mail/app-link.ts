/**
 * Absolute link to a frontend page. The base may carry a sub-path and a hash
 * (GitHub Pages + HashRouter: https://user.github.io/app/#), so this joins
 * strings instead of resolving with `new URL`, which would drop both.
 */
export function appLink(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
