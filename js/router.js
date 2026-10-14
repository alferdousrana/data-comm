// Hash router: works on GitHub Pages project sub-paths without server rewrites.
const routes = [];
let current = null;
let notFound = null;

export function route(pattern, loader) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, (k) => { keys.push(k.slice(1)); return '([^/]+)'; })}$`);
  routes.push({ re, keys, loader });
}
export function setNotFound(fn) { notFound = fn; }
export const navigate = (path) => { if (location.hash !== `#${path}`) location.hash = path; else render(); };
export const currentPath = () => decodeURIComponent(location.hash.slice(1) || '/');

const cleanups = [];
export function onLeave(fn) { cleanups.push(fn); }

export async function render() {
  while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.error(e); } }
  const path = currentPath();
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      current = path;
      return r.loader(params);
    }
  }
  return notFound?.(path);
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  return render();
}
