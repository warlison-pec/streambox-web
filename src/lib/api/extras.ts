// STRM Indexer (solicitações, TV ao vivo da lista M3U) e Seerr/Jellyseerr.
import { CONFIG, session } from '../session.svelte';
import type { IndexerItem, IndexerRequest, LiveChannel, RequestStatus, SeerrResult } from '../types';
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
  /** Pedidos deste usuário do Jellyfin (de qualquer aparelho), mais recentes primeiro. */
  mine: async () => (await json<{ items: IndexerRequest[] }>(await ix('/mine'))).items ?? [],
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
  /** Só dá para saber quem pediu quando o login é com a conta do Jellyfin (com a chave, tudo sai como administrador). */
  identifiesUser: () => !!CONFIG.seerr && !!session.settings.seerrUser && !session.settings.seerrKey,
  /** Pedidos deste usuário no Seerr (mais recentes primeiro). */
  myRequests: async (take = 100): Promise<SeerrRequest[]> => {
    if (!seerr.identifiesUser()) return [];
    const me = await json<{ id: number }>(await sr('/auth/me'));
    const r = await json<{ results: SeerrRequest[] }>(await sr(`/request?take=${take}&sort=added&requestedBy=${me.id}`));
    return r.results.filter((x) => x.requestedBy?.id === me.id);
  },
  /** O que está em alta no TMDB agora (filmes e séries), pela página "Descobrir" do Seerr. */
  trending: async (page = 1) => {
    const r = await json<{ results: SeerrResult[] }>(await sr(`/discover/trending?page=${page}&language=pt-BR`));
    return r.results.filter((x) => x.mediaType === 'movie' || x.mediaType === 'tv');
  },
  details: async (type: 'movie' | 'tv', tmdbId: number) => json<SeerrResult>(await sr(`/${type}/${tmdbId}?language=pt-BR`)),
  poster: (r: SeerrResult) => (r.posterPath ? `https://image.tmdb.org/t/p/w342${r.posterPath}` : null),
};

export interface SeerrRequest {
  id: number;
  status: number;                 // 1 pendente, 2 aprovado, 3 recusado
  type?: 'movie' | 'tv';
  createdAt?: string;
  requestedBy?: { id: number };
  media?: { tmdbId?: number; mediaType?: string; status?: number; jellyfinMediaId?: string | null };
}
