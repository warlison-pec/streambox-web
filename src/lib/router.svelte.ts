// Roteador por hash (#/caminho?x=1): funciona em qualquer servidor estático.
class Router {
  path = $state('/');
  query = $state<URLSearchParams>(new URLSearchParams());

  constructor() {
    this.read();
    addEventListener('hashchange', () => this.read());
  }

  private read() {
    const raw = location.hash.slice(1) || '/';
    const [p, q] = raw.split('?');
    this.path = p || '/';
    this.query = new URLSearchParams(q || '');
  }

  /** Extrai parâmetros: match('/item/:id') -> { id } ou null */
  match(pattern: string): Record<string, string> | null {
    const a = pattern.split('/'), b = this.path.split('/');
    if (a.length !== b.length) return null;
    const out: Record<string, string> = {};
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(':')) out[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) return null;
    }
    return out;
  }
}

export const router = new Router();
export const go = (path: string) => { location.hash = path; };
export const back = () => (history.length > 1 ? history.back() : go('/'));
