// STRM Indexer (solicitações, TV ao vivo da lista M3U) e Seerr/Jellyseerr.
import { CONFIG, session } from '../session.svelte';
import type { IndexerItem, LiveChannel, RequestStatus, SeerrResult } from '../types';
import { ApiError } from './jellyfin';

async function json<T>(res: Response): Promise<T> {
  const t = await res.text();
  let data: any = {};
  try { data = t ? JSON.parse(t) : {}; } catch { /* texto */ }
  if (!res.ok) throw new ApiError(res.status, data.error || data.message || `Erro HTTP ${res.status}`);
  return data as T;
}

/* ---------------- STRM Indexer ---------------- */

const ix = (path: string, init: RequestInit = {}) =>
  fetch(CONFIG.indexer + path, { ...init, headers: { 'X-Emby-Token': session.token, ...(init.headers || {}) } });

export const indexer = {
  enabled: () => !!CONFIG.indexer,
  search: async (q: string) => (await json<{ items: IndexerItem[] }>(await ix('/search?q=' + encodeURIComponent(q)))).items,
  request: async (item: IndexerItem, season: number | null) => json<{ id: string; state: string }>(await ix('/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: item.kind, title: item.title, year: item.kind === 'movie' ? item.catalog_year ?? undefined : undefined, season: season ?? undefined }),
  })),
  status: async (id: string) => json<RequestStatus>(await ix('/status?id=' + id)),
  art: (p?: string | null) => (p ? `${CONFIG.indexer}/${p}` : null),

  /** Lista M3U + EPG processados no servidor (cache de 6 h). */
  liveTv: async (m3u: string, epg: string, force = false) => json<{ channels: LiveChannel[]; updated: number }>(
    await ix(`/livetv?m3u=${encodeURIComponent(m3u)}&epg=${encodeURIComponent(epg)}${force ? '&force=1' : ''}`)),
  /** Repasse do canal pelo servidor (resolve http:// e bloqueio de outros domínios). */
  relay: (u: string) => `${CONFIG.indexer}/relay?t=${encodeURIComponent(session.token)}&u=${encodeURIComponent(u)}`,
};

/* ---------------- Seerr / Jellyseerr ---------------- */

const sr = (path: string, init: RequestInit = {}) =>
  fetch(CONFIG.seerr + '/api/v1' + path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(session.settings.seerrKey ? { 'X-Api-Key': session.settings.seerrKey } : {}),
      ...(init.headers || {}),
    },
  });

export const seerr = {
  configured: () => !!CONFIG.seerr && !!session.settings.seerrUser,
  login: async (username: string, password: string) => {
    const r = await sr('/auth/jellyfin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (r.status === 401 || r.status === 403) throw new ApiError(r.status, 'Usuário ou senha inválidos no Seerr');
    const u = await json<any>(r);
    return u.displayName || u.jellyfinUsername || u.username || username;
  },
  me: async () => {
    const u = await json<any>(await sr('/auth/me'));
    return u.displayName || u.jellyfinUsername || u.username || u.email || 'usuário';
  },
  logout: () => sr('/auth/logout', { method: 'POST' }).catch(() => undefined),
  search: async (q: string) => {
    const r = await json<{ results: SeerrResult[] }>(await sr(`/search?query=${encodeURIComponent(q)}&page=1&language=pt-BR`));
    return r.results.filter((x) => x.mediaType === 'movie' || x.mediaType === 'tv');
  },
  seasons: async (id: number) => {
    const r = await json<{ seasons: { seasonNumber: number }[] }>(await sr(`/tv/${id}?language=pt-BR`));
    return r.seasons.map((s) => s.seasonNumber).filter((n) => n > 0);
  },
  request: async (item: SeerrResult, seasons: number[] | null) => json<unknown>(await sr('/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaType: item.mediaType, mediaId: item.id, ...(item.mediaType === 'tv' ? { seasons: seasons ?? 'all' } : {}) }),
  })),
  poster: (r: SeerrResult) => (r.posterPath ? `https://image.tmdb.org/t/p/w342${r.posterPath}` : null),
};
