export interface Toast { id: number; text: string; kind: 'ok' | 'bad' | 'info'; }
class Toasts {
  list = $state<Toast[]>([]);
  private n = 0;
  show(text: string, kind: Toast['kind'] = 'info', ms = 4200) {
    const t = { id: ++this.n, text, kind };
    this.list.push(t);
    setTimeout(() => { this.list = this.list.filter((x) => x.id !== t.id); }, ms);
  }
}
export const toast = new Toasts();
