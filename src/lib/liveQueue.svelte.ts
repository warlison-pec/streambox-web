/**
 * Fila de canais da TV ao vivo: a lista que estava na tela quando o usuário abriu um canal.
 * O player usa para trocar de canal como numa TV a cabo (↑/↓, números, lista lateral, último canal).
 */
export interface LiveEntry {
  name: string;
  logo?: string | null;
  number?: string | null;
  group?: string | null;
  now?: string | null;
  nowStart?: number;
  nowEnd?: number;
  next?: string | null;
  jfId?: string;     // canal do Jellyfin
  url?: string;      // canal da lista M3U
}

const KEY = 'sb_live_queue';
const LAST = 'sb_last_channel';

function load(): LiveEntry[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

export const liveQueue = $state({
  entries: load(),
  last: -1,          // canal anterior (Backspace alterna)
});

export function setQueue(entries: LiveEntry[]) {
  liveQueue.entries = entries;
  liveQueue.last = -1;
  try { sessionStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* lista grande demais: fica só na memória */ }
}

/** Número exibido: o da lista ou a posição na fila. */
export const numberOf = (i: number) => liveQueue.entries[i]?.number || String(i + 1);

export function routeOf(e: LiveEntry): string {
  return e.jfId
    ? `/live/jf/${e.jfId}?name=${encodeURIComponent(e.name)}`
    : `/live/m3u?u=${encodeURIComponent(e.url ?? '')}&name=${encodeURIComponent(e.name)}`;
}

export function saveLast(e: LiveEntry) {
  try { localStorage.setItem(LAST, JSON.stringify({ name: e.name, logo: e.logo, number: e.number, group: e.group, jfId: e.jfId, url: e.url })); } catch { /* sem armazenamento */ }
}

export function loadLast(): LiveEntry | null {
  try {
    const e = JSON.parse(localStorage.getItem(LAST) ?? 'null');
    return e && (e.jfId || e.url) ? e : null;
  } catch { return null; }
}
