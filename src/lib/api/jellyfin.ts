// Cliente da API REST do Jellyfin (rotas 10.9+ / 12) — mesmas chamadas do app Android.
import { CONFIG, session } from '../session.svelte';
import { BROWSER_PROFILE, HLS, LIVE_BITRATE, LIVE_PROFILE, ORIGINAL_BITRATE } from '../capabilities';
import type { AuthResult, Item, ItemsResult, MediaSegment, PlaybackInfo, QuickConnect, RemoteSubtitle } from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const FIELDS = 'Overview,Genres,ProductionYear,ChildCount,CommunityRating,OfficialRating,PrimaryImageAspectRatio';
const VERSION = '0.1.0';

export function authHeader(token = session.token) {
  const device = navigator.userAgent.includes('Mobile') ? 'Navegador (celular)' : 'Navegador';
  const base = `MediaBrowser Client="StreamBox Web", Device="${device}", DeviceId="${session.deviceId}", Version="${VERSION}"`;
  return token ? `${base}, Token="${token}"` : base;
}

export function url(path: string, query: Record<string, unknown> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return CONFIG.jellyfin + path + (s ? '?' + s : '');
}

/** Para comparar títulos: sem acento, sem pontuação e em minúsculas. */
export const normalizeTitle = (t: string) => t.normalize('NFD').replace(/[^\p{L}\p{Nd}]/gu, '').toLowerCase();

/** Endereço do WebSocket do Jellyfin (mensagens do painel, biblioteca alterada). */
export function socketUrl() {
  const base = new URL(CONFIG.jellyfin + '/socket', location.href);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.searchParams.set('ApiKey', session.token);      // Jellyfin 12
  base.searchParams.set('api_key', session.token);     // 10.x
  base.searchParams.set('deviceId', session.deviceId);
  return base.toString();
}

export function friendly(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return 'Não foi possível conectar ao servidor.';
  return e instanceof Error ? e.message : String(e);
}

async function call<T>(path: string, opts: { method?: string; query?: Record<string, unknown>; body?: unknown; token?: string; text?: boolean; keepalive?: boolean } = {}): Promise<T> {
  const res = await fetch(url(path, opts.query), {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: authHeader(opts.token ?? session.token),
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    keepalive: opts.keepalive,
  });
  if (res.status === 401 && session.token && (opts.token === undefined)) {
    session.logout();
    throw new ApiError(401, 'Sessão expirada. Entre novamente.');
  }
  if (!res.ok) {
    let msg = `Erro HTTP ${res.status}`;
    if (res.status === 401) msg = 'Usuário ou senha inválidos';
    else if (res.status === 404) msg = 'Não encontrado';
    else if (res.status >= 500) msg = `Servidor indisponível (HTTP ${res.status})`;
    throw new ApiError(res.status, msg);
  }
  if (opts.text) return (await res.text()) as T;
  if (res.status === 204) return undefined as T;
  const t = await res.text();
  return (t ? JSON.parse(t) : undefined) as T;
}

const uid = () => session.userId;
const items = (path: string, query: Record<string, unknown>) => call<ItemsResult>(path, { query });

/** Tela inicial com "ocultar assistidos" ligado: o Jellyfin já devolve só o que falta ver. */
const unplayedOnly = () => (session.settings.hideWatched ? { isPlayed: false } : {});

export const jf = {
  /* login */
  publicInfo: () => call<{ ServerName: string; Version: string }>('/System/Info/Public', { token: '' }),
  login: (Username: string, Pw: string) => call<AuthResult>('/Users/AuthenticateByName', { method: 'POST', body: { Username, Pw }, token: '' }),
  qcEnabled: async () => {
    try { return String(await call<string>('/QuickConnect/Enabled', { token: '', text: true })).trim() === 'true'; }
    catch { return false; }
  },
  qcInitiate: async () => {
    try { return await call<QuickConnect>('/QuickConnect/Initiate', { method: 'POST', token: '' }); }
    catch (e) {
      if (e instanceof ApiError && (e.status === 405 || e.status === 404)) return call<QuickConnect>('/QuickConnect/Initiate', { token: '' });
      throw e;
    }
  },
  qcState: (secret: string) => call<QuickConnect>('/QuickConnect/Connect', { query: { secret }, token: '' }),
  qcLogin: (Secret: string) => call<AuthResult>('/Users/AuthenticateWithQuickConnect', { method: 'POST', body: { Secret }, token: '' }),

  /* catálogo */
  views: async () => (await items('/UserViews', { userId: uid() })).Items,
  resume: async () => (await items('/UserItems/Resume', { userId: uid(), limit: 20, mediaTypes: 'Video', fields: FIELDS, enableTotalRecordCount: false })).Items,
  nextUp: async () => (await items('/Shows/NextUp', { userId: uid(), limit: 20, fields: FIELDS, enableTotalRecordCount: false })).Items,
  featured: async (types: string, limit: number) => (await items('/Items', {
    userId: uid(), recursive: true, includeItemTypes: types, sortBy: 'Random', imageTypes: 'Backdrop', limit, fields: FIELDS, enableTotalRecordCount: false,
    ...unplayedOnly(),
  })).Items,
  latest: async (parentId: string, types: string) => (await items('/Items', {
    userId: uid(), parentId, recursive: true, includeItemTypes: types, sortBy: 'DateCreated', sortOrder: 'Descending', limit: 20, fields: FIELDS, enableTotalRecordCount: false,
    ...unplayedOnly(),
  })).Items,
  library: (parentId: string, types: string, start: number, limit: number, sortBy: string, desc: boolean,
    genreId?: string, years?: string, studioId?: string) => items('/Items', {
    userId: uid(), parentId, recursive: true, includeItemTypes: types, sortBy, sortOrder: desc ? 'Descending' : 'Ascending', startIndex: start, limit, fields: FIELDS,
    ...(genreId ? { genreIds: genreId } : {}), ...(years ? { years } : {}), ...(studioId ? { studioIds: studioId } : {}),
  }),
  /** Estúdios/produtoras que existem na biblioteca. */
  studios: async (parentId: string, types: string) => (await items('/Studios', {
    userId: uid(), parentId, includeItemTypes: types, sortBy: 'SortName', sortOrder: 'Ascending', enableImages: false,
  })).Items,
  /** Gêneros que existem na biblioteca (vêm do TMDB, no idioma configurado no Jellyfin). */
  genres: async (parentId: string, types: string) => (await items('/Genres', {
    userId: uid(), parentId, includeItemTypes: types, sortBy: 'SortName', sortOrder: 'Ascending', enableImages: false,
  })).Items,
  /** Biblioteca inteira com país de produção e tags (filtros Anime e Dorama, que não são gênero no TMDB). */
  libraryAll: async (parentId: string, types: string, sortBy: string, desc: boolean, years?: string, studioId?: string) => (await items('/Items', {
    userId: uid(), parentId, recursive: true, includeItemTypes: types, sortBy, sortOrder: desc ? 'Descending' : 'Ascending',
    fields: 'Genres,ProductionYear,ProductionLocations,Tags,PrimaryImageAspectRatio,CommunityRating', enableTotalRecordCount: false,
    ...(years ? { years } : {}), ...(studioId ? { studioIds: studioId } : {}),
  })).Items,
  item: (id: string) => call<Item>(`/Items/${id}`, { query: { userId: uid() } }),

  /** Trechos para pular: segmentos do servidor ou, na falta, capítulos "Abertura"/"Créditos". */
  async segments(item: Item): Promise<MediaSegment[]> {
    const fromServer = await call<{ Items: MediaSegment[] }>(`/MediaSegments/${item.Id}`).then((r) => r.Items ?? []).catch(() => []);
    const ok = fromServer.filter((s) => s.EndTicks > s.StartTicks);
    if (ok.length) return ok;
    const intro = /intro|opening|abertura|recap|resumo|^op\b/i, outro = /credit|cr[eé]dito|ending|encerramento|outro|^ed\b/i;
    const ch = [...(item.Chapters ?? [])].sort((a, b) => a.StartPositionTicks - b.StartPositionTicks);
    const out: MediaSegment[] = [];
    ch.forEach((c, i) => {
      const end = ch[i + 1]?.StartPositionTicks ?? item.RunTimeTicks;
      if (!end) return;
      const n = c.Name ?? '';
      if (outro.test(n)) out.push({ Type: 'Outro', StartTicks: c.StartPositionTicks, EndTicks: item.RunTimeTicks ?? end });
      else if (intro.test(n)) out.push({ Type: 'Intro', StartTicks: c.StartPositionTicks, EndTicks: end });
    });
    return out;
  },
  /** Todos os episódios da série, em ordem (temporadas e episódios). */
  seriesEpisodes: async (seriesId: string) => (await items(`/Shows/${seriesId}/Episodes`, { userId: uid(), fields: FIELDS })).Items,
  /** Episódio seguinte (passa para a próxima temporada quando acaba a atual). */
  async nextEpisode(ep: Item): Promise<Item | null> {
    if (ep.Type !== 'Episode' || !ep.SeriesId) return null;
    const r = await items(`/Shows/${ep.SeriesId}/Episodes`, { userId: uid(), startItemId: ep.Id, limit: 2, fields: FIELDS });
    return r.Items.find((x) => x.Id !== ep.Id) ?? null;
  },
  /** Marca/desmarca como assistido (em séries e temporadas vale para todos os episódios). */
  /** "Minha lista": filmes e séries favoritos no Jellyfin. */
  favorites: async () => (await items('/Items', {
    userId: uid(), recursive: true, filters: 'IsFavorite', includeItemTypes: 'Movie,Series',
    sortBy: 'SortName', sortOrder: 'Ascending', limit: 40, fields: FIELDS, enableTotalRecordCount: false,
    ...unplayedOnly(),
  })).Items,
  setFavorite: (id: string, fav: boolean) => call<unknown>(`/UserFavoriteItems/${id}`, { method: fav ? 'POST' : 'DELETE', query: { userId: uid() } }),
  setPlayed: (id: string, played: boolean) => call<unknown>(`/UserPlayedItems/${id}`, { method: played ? 'POST' : 'DELETE', query: { userId: uid() } }),
  children: async (parentId: string) => (await items('/Items', { userId: uid(), parentId, sortBy: 'ProductionYear,SortName', fields: FIELDS })).Items,
  seasons: async (seriesId: string) => (await items(`/Shows/${seriesId}/Seasons`, { userId: uid(), fields: FIELDS })).Items,
  episodes: async (seriesId: string, seasonId: string) => (await items(`/Shows/${seriesId}/Episodes`, { userId: uid(), seasonId, fields: FIELDS })).Items,
  /** Procura um filme ou série pelo código do TMDB (não depende do nome que o Jellyfin deu). */
  findByTmdb: async (tmdbId: number, kind: 'movie' | 'series') => (await items('/Items', {
    userId: uid(), recursive: true, includeItemTypes: kind === 'series' ? 'Series' : 'Movie',
    anyProviderIdEquals: `Tmdb.${tmdbId}`, limit: 5, fields: FIELDS + ',ProviderIds',
  })).Items.find((i) => i.ProviderIds?.Tmdb === String(tmdbId)) ?? null,
  /** Lançamentos recentes mais bem avaliados do catálogo (nota do TMDB/IMDb que o Jellyfin guarda). */
  topRatedRecent: async (sinceYear: number, limit = 40) => {
    const years: number[] = [];
    for (let y = sinceYear; y <= new Date().getFullYear(); y++) years.push(y);
    return (await items('/Items', {
      userId: uid(), recursive: true, includeItemTypes: 'Movie,Series', years: years.join(','),
      minCommunityRating: 6.5, sortBy: 'CommunityRating,DateCreated', sortOrder: 'Descending',
      isPlayed: false, limit, fields: FIELDS, enableTotalRecordCount: false,
    })).Items;
  },
  nextUpFor: async (seriesId: string) => (await items('/Shows/NextUp', { userId: uid(), seriesId, limit: 1, fields: FIELDS })).Items[0],
  search: async (searchTerm: string) => (await items('/Items', {
    userId: uid(), searchTerm, recursive: true, includeItemTypes: 'Movie,Series', limit: 40, fields: FIELDS,
  })).Items,
  /* recomendações e novidades (mesmas chamadas do app Android) */
  /** Filmes e episódios já assistidos, do mais recente para o mais antigo. */
  recentlyPlayed: async (limit = 40) => (await items('/Items', {
    userId: uid(), recursive: true, includeItemTypes: 'Movie,Episode', filters: 'IsPlayed', sortBy: 'DatePlayed',
    sortOrder: 'Descending', limit, fields: 'Genres', enableTotalRecordCount: false, enableImages: false,
  })).Items,
  /** Títulos parecidos segundo o Jellyfin (gêneros, tags, estúdios e elenco). */
  similar: async (id: string, limit = 24) => (await items(`/Items/${id}/Similar`, { userId: uid(), limit, fields: FIELDS })).Items,
  /** Títulos ainda não vistos com algum destes gêneros. */
  byGenres: async (genres: string[], types: string, limit = 24) => (await items('/Items', {
    userId: uid(), recursive: true, includeItemTypes: types, genres: genres.join('|'), isPlayed: false, sortBy: 'Random',
    limit, fields: FIELDS, enableTotalRecordCount: false,
  })).Items,
  /** Procura um filme/série pelo nome (para saber se um pedido já chegou). */
  async findTitle(title: string, kind: 'movie' | 'series', year?: number | null): Promise<Item | null> {
    const wanted = normalizeTitle(title);
    const list = (await items('/Items', {
      userId: uid(), searchTerm: title, recursive: true, includeItemTypes: kind === 'series' ? 'Series' : 'Movie', limit: 20, fields: FIELDS,
    })).Items.filter((i) => normalizeTitle(i.Name) === wanted);
    const dist = (i: Item) => (year == null || i.ProductionYear == null ? 1 : Math.abs(i.ProductionYear - year) * 2);
    const best = list.sort((a, b) => dist(a) - dist(b))[0];
    return best && (year == null || best.ProductionYear == null || Math.abs(best.ProductionYear - year) <= 1) ? best : null;
  },
  /** Filmes e episódios mais recentes do catálogo (para avisar o que chegou). */
  recentlyAdded: async (limit = 100) => (await items('/Items', {
    userId: uid(), recursive: true, includeItemTypes: 'Movie,Episode', sortBy: 'DateCreated', sortOrder: 'Descending', limit,
    fields: 'DateCreated,ProviderIds,ParentId', enableTotalRecordCount: false,
  })).Items,
  /** Anuncia ao servidor que esta sessão aceita "Enviar mensagem" do painel. */
  reportCapabilities: () => call<void>('/Sessions/Capabilities/Full', { method: 'POST', body: {
    PlayableMediaTypes: ['Video'], SupportedCommands: ['DisplayMessage'], SupportsMediaControl: true, SupportsPersistentIdentifier: true,
  } }),
  liveChannels: async () => (await items('/LiveTv/Channels', { userId: uid(), addCurrentProgram: true, enableImages: true, limit: 1000 })).Items,

  /* reprodução */
  playbackInfo: (id: string, live = false) => call<PlaybackInfo>(`/Items/${id}/PlaybackInfo`, {
    method: 'POST',
    query: { userId: uid(), autoOpenLiveStream: live },
    body: {
      UserId: uid(), MaxStreamingBitrate: live ? LIVE_BITRATE : ORIGINAL_BITRATE, AutoOpenLiveStream: live,
      EnableDirectPlay: true, EnableDirectStream: true, EnableTranscoding: true,
      DeviceProfile: live ? LIVE_PROFILE : BROWSER_PROFILE,
    },
  }),
  searchSubtitles: (id: string, lang: string) => call<RemoteSubtitle[]>(`/Items/${id}/RemoteSearch/Subtitles/${lang}`),
  downloadSubtitle: (id: string, subId: string) => call<void>(`/Items/${id}/RemoteSearch/Subtitles/${encodeURIComponent(subId)}`, { method: 'POST' }),
  closeLiveStream: (liveStreamId: string) => call<void>('/LiveStreams/Close', { method: 'POST', query: { liveStreamId }, keepalive: true }),
  report: (kind: 'start' | 'progress' | 'stopped', body: Record<string, unknown>) =>
    call<void>(kind === 'start' ? '/Sessions/Playing' : kind === 'progress' ? '/Sessions/Playing/Progress' : '/Sessions/Playing/Stopped', {
      method: 'POST', body, keepalive: kind === 'stopped',
    }).catch(() => undefined),
};


/* imagens (públicas, com cache por tag) */
export const img = {
  primary(i: Item, h = 450): string | null {
    const tag = i.ImageTags?.Primary;
    if (tag) return url(`/Items/${i.Id}/Images/Primary`, { fillHeight: h, quality: 85, tag });
    if (i.SeriesId && i.SeriesPrimaryImageTag) return url(`/Items/${i.SeriesId}/Images/Primary`, { fillHeight: h, quality: 85, tag: i.SeriesPrimaryImageTag });
    return null;
  },
  poster(i: Item, h = 450): string | null {
    if (i.Type === 'Episode' && i.SeriesId && i.SeriesPrimaryImageTag)
      return url(`/Items/${i.SeriesId}/Images/Primary`, { fillHeight: h, quality: 85, tag: i.SeriesPrimaryImageTag });
    return img.primary(i, h);
  },
  backdrop(i: Item, w = 1280): string | null {
    if (i.BackdropImageTags?.length) return url(`/Items/${i.Id}/Images/Backdrop/0`, { fillWidth: w, quality: 80, tag: i.BackdropImageTags[0] });
    if (i.ParentBackdropItemId && i.ParentBackdropImageTags?.length)
      return url(`/Items/${i.ParentBackdropItemId}/Images/Backdrop/0`, { fillWidth: w, quality: 80, tag: i.ParentBackdropImageTags[0] });
    return null;
  },
  landscape(i: Item): string | null {
    if (i.Type === 'Episode' && i.ImageTags?.Primary) return img.primary(i, 360);
    return img.backdrop(i, 720) ?? img.primary(i, 360);
  },
  library(v: Item): string | null {
    const tag = v.ImageTags?.Primary;
    return tag ? url(`/Items/${v.Id}/Images/Primary`, { fillWidth: 480, quality: 85, tag }) : null;
  },
  channel(c: Item): string | null {
    const tag = c.ImageTags?.Primary;
    return tag ? url(`/Items/${c.Id}/Images/Primary`, { fillHeight: 120, quality: 90, tag }) : null;
  },
};

/* URLs de vídeo (token na query: o <video> não envia cabeçalhos) */
export const media = {
  // Jellyfin 12 não aceita mais "api_key"; o parâmetro atual é "ApiKey"
  direct: (id: string, sourceId = id) => url(`/Videos/${id}/stream`, { static: true, mediaSourceId: sourceId, deviceId: session.deviceId, ApiKey: session.token }),
  /**
   * Conversão pedida pelo player. maxBitrate 0 = qualidade original: o servidor copia vídeo e áudio que o
   * navegador toca e só converte o resto. safe: só H.264/AAC em .ts; full: recodifica tudo (último recurso).
   */
  hls: (id: string, playSessionId: string, o: {
    maxBitrate?: number; maxHeight?: number | null; audioIndex?: number | null; sourceId?: string;
    safe?: boolean; full?: boolean; audioOnlyAac?: boolean;
  } = {}) => {
    const original = !o.maxBitrate;
    const safe = o.safe || o.full || !original;
    return url(`/Videos/${id}/master.m3u8`, {
      mediaSourceId: o.sourceId ?? id, deviceId: session.deviceId, ApiKey: session.token, playSessionId,
      videoCodec: safe ? 'h264' : HLS.video,
      audioCodec: o.audioOnlyAac || o.full ? 'aac' : safe ? 'aac,mp3' : HLS.audio,
      segmentContainer: safe ? 'ts' : HLS.container,
      maxStreamingBitrate: original ? ORIGINAL_BITRATE : o.maxBitrate,
      videoBitRate: original ? null : Math.max(o.maxBitrate! - 192_000, 300_000),
      audioBitRate: 192_000,
      maxHeight: o.maxHeight ?? null, audioStreamIndex: o.audioIndex ?? null,
      transcodingMaxAudioChannels: safe ? 2 : HLS.maxChannels,
      allowVideoStreamCopy: !o.full, allowAudioStreamCopy: !o.full && !o.audioOnlyAac,
      breakOnNonKeyFrames: true,
    });
  },
  subtitle: (id: string, sourceId: string, index: number) =>
    url(`/Videos/${id}/${sourceId}/Subtitles/${index}/0/Stream.vtt`, { ApiKey: session.token }),
  absolute(path: string) {
    if (/^https?:/.test(path)) return path;
    // o servidor devolve caminhos como /videos/... ; aqui o Jellyfin fica em CONFIG.jellyfin (/api)
    const p = path.startsWith('/') ? path : '/' + path;
    const full = CONFIG.jellyfin + p;
    return /[?&](api_key|ApiKey)=/i.test(full) ? full : full + (full.includes('?') ? '&' : '?') + 'ApiKey=' + session.token;
  },
};

/* utilidades de exibição */
export const isSeries = (i: Item) => i.Type === 'Series';
export const isEpisode = (i: Item) => i.Type === 'Episode';
export const episodeLabel = (i: Item) =>
  i.Type === 'Episode' ? `S${String(i.ParentIndexNumber ?? 0).padStart(2, '0')}E${String(i.IndexNumber ?? 0).padStart(2, '0')} · ${i.Name}` : i.Name;
export const progress = (i: Item) => Math.min(1, Math.max(0, (i.UserData?.PlayedPercentage ?? 0) / 100));
export function runtime(i: Item): string | null {
  const m = Math.floor((i.RunTimeTicks ?? 0) / 600_000_000);
  if (m <= 0) return null;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`;
}
export function itemTypesFor(collectionType?: string): string | null {
  switch (collectionType) {
    case 'movies': return 'Movie';
    case 'tvshows': return 'Series';
    case 'boxsets': return 'BoxSet';
    case 'homevideos': case 'mixed': case undefined: case '': return 'Movie,Series,Video';
    default: return null;
  }
}
