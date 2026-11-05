export const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR');
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const clock = (sec: number) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
};
export const initials = (t: string) =>
  t.split(/[\s\-:]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '•';
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
