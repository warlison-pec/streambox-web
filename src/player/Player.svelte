<script lang="ts">
  import Hls from 'hls.js';
  import { untrack } from 'svelte';
  import Icon from '../lib/components/Icon.svelte';
  import { jf, img, media, friendly, episodeLabel, authHeader } from '../lib/api/jellyfin';
  import { indexer } from '../lib/api/extras';
  import { session, QUALITIES, SUB_SIZES, SUB_COLORS, SUB_BGS, CONFIG } from '../lib/session.svelte';
  import { back } from '../lib/router.svelte';
  import { toast } from '../lib/toast.svelte';
  import { clock, sleep, hhmm } from '../lib/util';
  import { liveQueue, numberOf, routeOf, saveLast } from '../lib/liveQueue.svelte';
  import type { Item, MediaSegment, MediaSource, MediaStream, RemoteSubtitle } from '../lib/types';

  type Mode = 'vod' | 'jf-live' | 'm3u';
  let { mode, id = '', url: m3uUrl = '', name = '', startTicks = null }: {
    mode: Mode; id?: string; url?: string; name?: string; startTicks?: number | null;
  } = $props();

  const live = mode !== 'vod';
  const playSession = (crypto.randomUUID?.() ?? String(Math.random())).replace(/-/g, '');

  let root: HTMLDivElement;
  let video: HTMLVideoElement;
  let hls: Hls | null = null;
  let mpeg: any = null;

  let title = $state(name);
  let subtitle = $state('');
  let playing = $state(false);
  let waiting = $state(true);
  let current = $state(0);
  let duration = $state(0);
  let buffered = $state(0);
  let volume = $state(Number(localStorage.getItem('sb_volume') ?? 1));
  let muted = $state(false);
  let fullscreen = $state(false);
  let showUi = $state(true);
  let menu = $state<null | 'subs' | 'audio' | 'quality' | 'look' | 'online'>(null);
  let error = $state('');

  let source = $state<MediaSource | null>(null);
  let isHls = $state(false);
  let triedHls = false;
  // TV ao vivo: reconecta sozinho quando o sinal cai (até 4 vezes seguidas)
  let reconnects = 0;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;           // player fechado: não reconecta mais
  let pendingRestart = false;   // já tem uma reconexão agendada
  let userPaused = false;       // pausa feita pelo usuário (a única que o player respeita no ao vivo)
  function restartLive() {
    if (mode === 'jf-live') return startJellyfinLive().catch((e) => fail(friendly(e)));
    return playRemote(m3uUrl);
  }
  let started = false;
  let method = 'DirectStream';
  let audioIndex = $state<number | null>(null);
  let quality = $state(Math.max(0, QUALITIES.findIndex((q) => q[1] === session.settings.quality)));
  let activeSub = $state(-1);            // Index da legenda do servidor; -1 = desligada
  let online = $state<RemoteSubtitle[]>([]);
  let liveStreamId: string | null = null;

  // Abertura / créditos / próximo episódio
  let item = $state<Item | null>(null);
  let segments = $state<MediaSegment[]>([]);
  let next = $state<Item | null>(null);
  let nextDismissed = $state(false);
  let nextLeft = $state(10);               // contagem regressiva do cartão
  let skipped = $state<MediaSegment | null>(null);
  let overlaySel = $state(0);

  // Episódios da série: ⏮/⏭ e a lista que abre com ↓
  let episodes = $state<Item[]>([]);
  let prevEp = $state<Item | null>(null);
  let epsOpen = $state(false);
  let epSel = $state(0);
  let epsBox = $state<HTMLDivElement>();
  const season = $derived.by(() => {
    if (!item) return [] as Item[];
    const same = episodes.filter((e) => e.SeasonId === item!.SeasonId);
    return same.length ? same : episodes;
  });
  // Aviso do avanço/recuo pelas setas
  let osd = $state('');
  let osdTimer: ReturnType<typeof setTimeout> | undefined;

  /* ---------- TV ao vivo com cara de TV a cabo ---------- */
  const chIndex = live ? liveQueue.entries.findIndex((e) => (mode === 'jf-live' ? e.jfId === id : e.url === m3uUrl)) : -1;
  if (chIndex >= 0) saveLast(liveQueue.entries[chIndex]);
  let infoIndex = $state(chIndex);          // canal mostrado na faixa de informação
  let infoOn = $state(false);
  let infoTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingIndex = -1;                    // zapping: sintoniza quando o usuário para de apertar
  let tuneTimer: ReturnType<typeof setTimeout> | undefined;
  let numberBuf = $state('');
  let numberTimer: ReturnType<typeof setTimeout> | undefined;
  let sideOpen = $state(false);
  let sideGroups = $state<string[]>(['Todos']);
  let sideGroup = $state(0);
  let sideSel = $state(0);                  // posição na lista do grupo
  let sideBox = $state<HTMLDivElement>();
  const sideIdx = $derived.by(() => {
    const g = sideGroups[sideGroup] ?? 'Todos';
    return liveQueue.entries.map((_, i) => i).filter((i) => g === 'Todos' || liveQueue.entries[i].group === g);
  });
  const info = $derived(liveQueue.entries[infoIndex] ?? (live ? { name: title } : null));
  let clockNow = $state(Date.now());

  function showInfo(i = chIndex, sticky = false) {
    infoIndex = i;
    infoOn = true;
    clockNow = Date.now();
    clearTimeout(infoTimer);
    if (!sticky) infoTimer = setTimeout(() => (infoOn = false), 4500);
  }
  function tune(i: number) {
    const e = liveQueue.entries[i];
    if (!e) return;
    if (i === chIndex) { showInfo(); return; }
    liveQueue.last = chIndex;
    closed = true;                          // este player vai sair; não reconecta mais
    location.replace('#' + routeOf(e));
  }
  function zap(delta: number) {
    const n = liveQueue.entries.length;
    if (n < 2) return;
    const base = pendingIndex >= 0 ? pendingIndex : Math.max(0, chIndex);
    pendingIndex = (((base + delta) % n) + n) % n;
    showInfo(pendingIndex, true);
    clearTimeout(tuneTimer);
    tuneTimer = setTimeout(() => tune(pendingIndex), 450);
  }
  function typeDigit(d: string) {
    numberBuf = (numberBuf + d).slice(-4);
    clearTimeout(numberTimer);
    numberTimer = setTimeout(() => {
      const typed = numberBuf.replace(/^0+/, '') || '0';
      numberBuf = '';
      const list = liveQueue.entries;
      let i = list.findIndex((e) => (e.number ?? '').replace(/^0+/, '') === typed);
      if (i < 0) i = Number(typed) - 1;     // lista sem números: posição
      if (i >= 0 && i < list.length) tune(i); else toast.show(`Canal ${typed} não encontrado`);
    }, 1500);
  }
  function openSide() {
    const list = liveQueue.entries;
    if (list.length < 2) { showInfo(); return; }
    const gs = [...new Set(list.map((e) => e.group).filter(Boolean) as string[])];
    sideGroups = gs.length > 1 ? ['Todos', ...gs] : ['Todos'];
    const cur = list[chIndex]?.group;
    sideGroup = sideGroups.length > 1 && cur ? Math.max(0, sideGroups.indexOf(cur)) : 0;
    sideSel = Math.max(0, sideIdx.indexOf(chIndex));
    sideOpen = true;
    menu = null;
    showInfo(chIndex, true);
  }
  function closeSide() { sideOpen = false; infoTimer = setTimeout(() => (infoOn = false), 1500); }
  $effect(() => {
    // mantém o canal destacado visível na lista lateral
    if (!sideOpen || !sideBox) return;
    sideBox.querySelectorAll('.srow')[sideSel]?.scrollIntoView({ block: 'nearest' });
    const i = sideIdx[sideSel];
    if (i !== undefined) untrack(() => showInfo(i, true));
  });
  const pctOf = (a?: number, b?: number) => (a && b && b > a ? Math.min(100, Math.max(0, ((clockNow - a) / (b - a)) * 100)) : 0);

  /** Teclas da TV ao vivo. Retorna true quando a tecla foi usada. */
  function liveKey(e: KeyboardEvent): boolean {
    // Enter em cima de um botão dos controles: deixa o botão agir
    if (!sideOpen && e.key === 'Enter' && (e.target as HTMLElement)?.tagName === 'BUTTON') return false;
    if (sideOpen) {
      const n = sideIdx.length;
      switch (e.key) {
        case 'ArrowUp': sideSel = Math.max(0, sideSel - 1); return true;
        case 'ArrowDown': sideSel = Math.min(n - 1, sideSel + 1); return true;
        case 'PageUp': sideSel = Math.max(0, sideSel - 10); return true;
        case 'PageDown': sideSel = Math.min(n - 1, sideSel + 10); return true;
        case 'ArrowLeft': case 'ArrowRight':
          if (sideGroups.length > 1) {
            sideGroup = (sideGroup + (e.key === 'ArrowRight' ? 1 : -1) + sideGroups.length) % sideGroups.length;
            sideSel = Math.max(0, sideIdx.indexOf(chIndex));
          }
          return true;
        case 'Enter': { const i = sideIdx[sideSel]; sideOpen = false; if (i !== undefined) tune(i); return true; }
        case 'Escape': case 'Backspace': closeSide(); return true;
      }
      return true;
    }
    switch (e.key) {
      case 'ArrowUp': case 'PageUp': case 'ChannelUp': zap(+1); return true;
      case 'ArrowDown': case 'PageDown': case 'ChannelDown': zap(-1); return true;
      case 'Enter': openSide(); return true;
      case 'i': case 'Info': showInfo(); return true;
      case 'g': case 'Guide': openSide(); return true;
      case 'Backspace': case 'LastChannel':
        if (liveQueue.last >= 0) { tune(liveQueue.last); toast.show('Canal anterior'); }
        return true;
    }
    if (/^[0-9]$/.test(e.key)) { typeDigit(e.key); return true; }
    return false;
  }
  const SKIP_LABEL: Record<string, string> = { Intro: 'Pular abertura', Recap: 'Pular resumo', Preview: 'Pular prévia', Commercial: 'Pular comercial', Outro: 'Pular créditos' };
  const T = 10_000_000;
  const outro = $derived(segments.find((s) => s.Type === 'Outro'));
  const showNext = $derived(!live && !!next && !nextDismissed && duration > 0 &&
    (outro ? current * T >= outro.StartTicks : duration - current <= 30 && duration > 300));
  const skipSeg = $derived(showNext ? undefined : segments.find((s) =>
    s.Type !== 'Unknown' && s !== skipped && current * T >= s.StartTicks && current * T < s.EndTicks - T &&
    (s.Type !== 'Outro' || !next || nextDismissed)));

  const subs = $derived((source?.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle' && (s.IsTextSubtitleStream || s.IsExternal)));
  const audios = $derived((source?.MediaStreams ?? []).filter((s) => s.Type === 'Audio'));
  const label = (s: MediaStream) => s.DisplayTitle || s.Title || s.Language || `Faixa ${s.Index}`;

  /* ------------------------------ motores ------------------------------ */

  function destroyEngines() {
    hls?.destroy(); hls = null;
    if (mpeg) { try { mpeg.destroy(); } catch { /* ignore */ } mpeg = null; }
    video.removeAttribute('src');
    video.load();
  }

  function loadHls(src: string, start: number) {
    destroyEngines();
    isHls = true;
    if (Hls.isSupported()) {
      hls = new Hls({
        startPosition: start || -1, maxBufferLength: 30, backBufferLength: 60, enableWorker: true, lowLatencyMode: false,
        // ao vivo: fica um pouco atrás do "ao vivo" para não travar e insiste mais antes de desistir
        ...(live ? { liveSyncDurationCount: 4, liveMaxLatencyDurationCount: 12, maxBufferLength: 20,
          manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 6, fragLoadingMaxRetry: 6, fragLoadingRetryDelay: 800 } : {}),
        // listas e pedaços do Jellyfin sem a chave na URL recebem o cabeçalho de autorização
        xhrSetup: (xhr, u) => {
          const same = u.startsWith(location.origin + CONFIG.jellyfin + '/') || u.startsWith(CONFIG.jellyfin + '/');
          if (same && !/[?&](api_key|ApiKey)=/i.test(u)) xhr.setRequestHeader('Authorization', authHeader(session.token));
        },
      });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { hls?.recoverMediaError(); return; }
        const code = (d.response as { code?: number } | undefined)?.code;
        fail('Falha no fluxo HLS (' + d.details + (code ? ' · HTTP ' + code : '') + ')');
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
      if (start) video.addEventListener('loadedmetadata', () => (video.currentTime = start), { once: true });
    }
    video.play().catch(() => (waiting = false));
  }

  function loadDirect(src: string, start: number) {
    destroyEngines();
    isHls = false;
    video.src = src;
    if (start) video.addEventListener('loadedmetadata', () => (video.currentTime = start), { once: true });
    video.play().catch(() => (waiting = false));
  }

  async function loadMpegTs(src: string): Promise<boolean> {
    const mod: any = await import('mpegts.js');
    const mpegts = mod.default ?? mod;
    if (!mpegts.getFeatureList().mseLivePlayback) return false;
    destroyEngines();
    isHls = false;
    mpeg = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: src }, { enableStashBuffer: false, liveBufferLatencyChasing: true });
    mpeg.on(mpegts.Events.ERROR, () => fail('O canal não respondeu'));
    mpeg.attachMediaElement(video);
    mpeg.load();
    video.play().catch(() => (waiting = false));
    return true;
  }

  function fail(msg: string) {
    // Vídeo do Jellyfin que o navegador não abriu: pede conversão HLS no mesmo ponto
    if (mode === 'vod' && !isHls && !triedHls) {
      triedHls = true;
      toast.show('Convertendo no servidor…');
      startVodHls(video.currentTime || 0);
      return;
    }
    // Ao vivo: nunca desiste sozinho. Reconecta com espera crescente (até 15 s entre tentativas)
    if (live && !closed) {
      if (pendingRestart) return;
      pendingRestart = true;
      reconnects++;
      error = '';
      waiting = true;
      toast.show(reconnects <= 3 ? 'Sinal perdido. Reconectando…' : `Sem sinal. Tentando de novo (${reconnects})…`);
      setTimeout(() => {
        pendingRestart = false;
        if (closed) return;
        userPaused = false;
        Promise.resolve(restartLive()).catch((e) => fail(friendly(e)));
      }, Math.min(1500 * reconnects, 15000));
      return;
    }
    error = msg;
    waiting = false;
  }

  /* ------------------------------ início ------------------------------ */

  function startVodHls(at: number) {
    method = 'Transcode';
    const q = QUALITIES[quality];
    // Qualidade original e áudio padrão: usa a URL de conversão que o próprio servidor montou
    if (q[1] === 0 && audioIndex === null && source?.TranscodingUrl) { loadHls(media.absolute(source.TranscodingUrl), at); return; }
    loadHls(media.hls(id, playSession, q[1] || 20_000_000, q[2], audioIndex, 0, source?.Id ?? id), at);
  }

  async function startVod() {
    const item = await jf.item(id);
    title = item.Type === 'Episode' ? item.SeriesName ?? item.Name : item.Name;
    subtitle = item.Type === 'Episode' ? episodeLabel(item) : item.ProductionYear ? String(item.ProductionYear) : '';
    const start = (startTicks ?? item.UserData?.PlaybackPositionTicks ?? 0) / 10_000_000;
    loadExtras(item);
    const info = await jf.playbackInfo(id).catch(() => null);
    source = info?.MediaSources?.[0] ?? null;
    // Com o perfil do navegador o servidor indica TranscodingUrl quando precisa converter
    if (quality === 0 && !source?.TranscodingUrl) { method = 'DirectStream'; loadDirect(media.direct(id, source?.Id ?? id), start); }
    else startVodHls(start);
  }

  async function loadExtras(it: Item) {
    item = it;
    segments = await jf.segments(it).catch(() => []);
    if (it.Type === 'Episode' && it.SeriesId) {
      episodes = await jf.seriesEpisodes(it.SeriesId).catch(() => []);
      const i = episodes.findIndex((e) => e.Id === it.Id);
      if (i >= 0) { prevEp = episodes[i - 1] ?? null; next = episodes[i + 1] ?? null; return; }
    }
    next = await jf.nextEpisode(it).catch(() => null);
  }

  function skip() {
    if (!skipSeg) return;
    const s = skipSeg;
    skipped = s;
    video.currentTime = s.EndTicks / T;
  }

  function playNext() {
    const n = next;
    if (!n) return;
    next = null;
    goEpisode(n, true);
  }

  /** Abre outro episódio (continua de onde parou, se estava pela metade). */
  function goEpisode(ep: Item, fromStart = false) {
    epsOpen = false;
    const played = ep.UserData?.Played;
    // troca a rota sem empilhar histórico: "Voltar" continua levando para a página da série
    location.replace(`#/play/${ep.Id}` + (fromStart || played ? '?start=0' : ''));
  }

  function openEpisodes() {
    if (!season.length) return;
    epSel = Math.max(0, season.findIndex((e) => e.Id === item?.Id));
    epsOpen = true;
    menu = null;
  }
  $effect(() => {
    // mantém o episódio destacado visível na fileira
    if (!epsOpen || !epsBox) return;
    epsBox.querySelectorAll('.ep')[epSel]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });

  /** ←/→: recua/avança 10 s (segurando a tecla, 30 s por vez), com aviso na tela. */
  let seekTarget = -1;
  let seekReset: ReturnType<typeof setTimeout> | undefined;
  function seekBy(forward: boolean, held: boolean) {
    if (live || !video) return;
    const step = held ? 30 : 10;
    const base = seekTarget >= 0 ? seekTarget : video.currentTime;
    seekTarget = Math.max(0, Math.min((duration || Infinity) - 1, base + (forward ? step : -step)));
    video.currentTime = seekTarget;
    osd = (forward ? '⏩  ' : '⏪  ') + clock(seekTarget) + (duration ? '  /  ' + clock(duration) : '');
    clearTimeout(osdTimer); osdTimer = setTimeout(() => (osd = ''), 1500);
    clearTimeout(seekReset); seekReset = setTimeout(() => (seekTarget = -1), 900);
  }

  // Contagem regressiva do próximo episódio (pausa junto com o vídeo)
  $effect(() => {
    if (!showNext) { nextLeft = 10; return; }
    overlaySel = 0;
    const t = setInterval(() => { if (playing) { nextLeft -= 1; if (nextLeft <= 0) playNext(); } }, 1000);
    return () => clearInterval(t);
  });
  $effect(() => { if (skipSeg) overlaySel = 0; });

  async function startJellyfinLive() {
    const info = await jf.playbackInfo(id, true);
    const src = info.MediaSources?.[0];
    if (!src) throw new Error('Canal sem fonte');
    source = src;
    liveStreamId = src.LiveStreamId ?? null;
    if (src.TranscodingUrl) return loadHls(media.absolute(src.TranscodingUrl), 0);
    if (src.IsRemote && src.Path?.startsWith('http')) return playRemote(src.Path);
    loadDirect(media.direct(id), 0);
  }

  async function playRemote(u: string) {
    const relayed = CONFIG.indexer ? indexer.relay(u) : u;
    if (/\.m3u8(\?|$)/i.test(u)) return loadHls(relayed, 0);
    if (await loadMpegTs(relayed).catch(() => false)) return;
    loadHls(relayed, 0);
  }

  $effect(() => untrack(() => {
    const run = mode === 'vod' ? startVod() : mode === 'jf-live' ? startJellyfinLive() : playRemote(m3uUrl);
    Promise.resolve(run).catch((e) => fail(friendly(e)));
    const t = setInterval(() => { if (started && !live) report('progress'); }, 10_000);
    const dog = live ? setInterval(liveWatchdog, 2000) : undefined;
    if (live) setTimeout(() => showInfo(), 400);
    const onFs = () => (fullscreen = !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    const onUnload = () => report('stopped');
    addEventListener('pagehide', onUnload);
    return () => {
      clearInterval(t);
      clearInterval(dog);
      document.removeEventListener('fullscreenchange', onFs);
      removeEventListener('pagehide', onUnload);
      report('stopped');
      if (liveStreamId) jf.closeLiveStream(liveStreamId).catch(() => {});
      clearTimeout(stallTimer);
      closed = true;            // fechou o player: não tenta reconectar
      destroyEngines();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }));

  function report(kind: 'start' | 'progress' | 'stopped') {
    if (mode !== 'vod' || (!started && kind !== 'start')) return;
    if (kind === 'stopped') started = false;
    jf.report(kind, {
      ItemId: id, MediaSourceId: id, PositionTicks: Math.floor((video?.currentTime ?? 0) * 10_000_000),
      IsPaused: video?.paused ?? true, CanSeek: true, PlayMethod: method, PlaySessionId: playSession,
    });
  }

  /* ------------------------------ legendas ------------------------------ */

  // Legendas desenhadas numa camada própria (sobem quando os controles aparecem)
  let cueLines = $state<string[]>([]);
  const subStyle = $derived.by(() => {
    const S = session.settings;
    const size = SUB_SIZES[S.subSize]?.[1] ?? 1;
    const shadow = S.subBg === 0 ? '0 0 4px #000,0 0 4px #000,0 0 4px #000' : S.subBg === 1 ? '2px 2px 5px #000' : 'none';
    const bg = S.subBg === 2 ? 'rgba(0,0,0,.6)' : S.subBg === 3 ? '#000' : 'transparent';
    return `color:${SUB_COLORS[S.subColor]?.[1] ?? '#fff'};background:${bg};text-shadow:${shadow};font-size:${(size * 3.4).toFixed(2)}vh`;
  });
  function onCue(this: TextTrack) {
    const list = this.activeCues ? Array.from(this.activeCues) as VTTCue[] : [];
    cueLines = list.flatMap((c) => c.text.replace(/<[^>]+>/g, '').split('\n')).filter((l) => l.trim());
  }

  function selectSub(index: number) {
    activeSub = index;
    cueLines = [];
    for (const t of Array.from(video.textTracks)) { t.removeEventListener('cuechange', onCue); t.mode = 'disabled'; }
    if (index < 0) return;
    const el = video.querySelector<HTMLTrackElement>(`track[data-index="${index}"]`);
    if (el) { el.track.mode = 'hidden'; el.track.addEventListener('cuechange', onCue); }
  }

  async function searchOnline() {
    menu = 'online'; online = [];
    try {
      online = (await jf.searchSubtitles(id, session.settings.subLang)).sort((a, b) => (b.DownloadCount ?? 0) - (a.DownloadCount ?? 0)).slice(0, 25);
      if (!online.length) toast.show('Nenhuma legenda encontrada.');
    } catch (e) { toast.show('Busca indisponível: ' + friendly(e) + '. Confira o plugin de legendas no Jellyfin.', 'bad', 6000); menu = 'subs'; }
  }

  async function download(sub: RemoteSubtitle) {
    menu = null;
    toast.show('Baixando legenda…');
    const before = new Set(subs.map((s) => s.Index));
    try {
      await jf.downloadSubtitle(id, sub.Id);
      for (let i = 0; i < 6; i++) {
        await sleep(2000);
        const info = await jf.playbackInfo(id).catch(() => null);
        const src = info?.MediaSources?.[0];
        if (!src) continue;
        const added = (src.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle' && !before.has(s.Index));
        if (added.length) {
          source = src;
          await sleep(50);
          selectSub(added[added.length - 1].Index);
          toast.show('Legenda aplicada.', 'ok');
          return;
        }
      }
      toast.show('Legenda baixada. Abra o menu de legendas em instantes.');
    } catch (e) { toast.show('Não foi possível baixar: ' + friendly(e), 'bad'); }
  }

  /* ------------------------------ áudio e qualidade ------------------------------ */

  function reloadAt(at = video.currentTime) {
    if (QUALITIES[quality][1] === 0 && !triedHls && audioIndex === null) { method = 'DirectStream'; loadDirect(media.direct(id, source?.Id ?? id), at); }
    else startVodHls(at);
    // as faixas <track> continuam no elemento; reativa a escolhida
    if (activeSub >= 0) video.addEventListener('loadeddata', () => selectSub(activeSub), { once: true });
  }
  function chooseQuality(i: number) {
    menu = null;
    if (i === quality) return;
    quality = i; session.set('quality', QUALITIES[i][1]);
    if (i === 0) triedHls = false;
    reloadAt();
  }
  function chooseAudio(index: number) { menu = null; audioIndex = index; reloadAt(); }

  /* ------------------------------ controles ------------------------------ */

  let hideTimer: ReturnType<typeof setTimeout>;
  function poke() {
    showUi = true;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (playing && !menu && !epsOpen) showUi = false; }, 3200);
  }
  const toggle = () => {
    if (video.paused) { userPaused = false; video.play().catch(() => {}); }
    else { userPaused = true; video.pause(); }
  };

  /* Ao vivo: o vídeo não pode ficar parado sem o usuário pedir.
     - pausou sozinho (fim do buffer, aba voltando, erro passageiro) → volta a tocar;
     - congelou com vídeo no buffer à frente → pula o buraco para perto do ao vivo;
     - congelou sem nada para tocar por ~20 s → reconecta a fonte. */
  let lastTime = -1;
  let frozen = 0;
  function liveWatchdog() {
    if (closed || error || pendingRestart || userPaused || !video) { frozen = 0; return; }
    if (video.paused && video.readyState >= 2) video.play().catch(() => {});
    const t = video.currentTime;
    frozen = t === lastTime ? frozen + 2 : 0;
    lastTime = t;
    if (frozen >= 4) {
      const b = video.buffered;
      const end = b.length ? b.end(b.length - 1) : 0;
      if (end - t > 1.5) { video.currentTime = end - 1; video.play().catch(() => {}); return; }
    }
    if (frozen >= 20) { frozen = 0; fail('O canal parou de responder'); }
  }
  const seek = (d: number) => { if (!live) video.currentTime = Math.max(0, Math.min(duration || Infinity, video.currentTime + d)); poke(); };
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.().catch(() => {});
  }
  function onKey(e: KeyboardEvent) {
    poke();
    // Lista de episódios aberta: ←/→ escolhe, Enter abre, ↑/Esc fecha
    if (epsOpen) {
      const n = season.length;
      if (e.key === 'ArrowLeft') { e.preventDefault(); epSel = Math.max(0, epSel - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); epSel = Math.min(n - 1, epSel + 1); }
      else if (e.key === 'Enter') { e.preventDefault(); const ep = season[epSel]; if (ep && ep.Id !== item?.Id) goEpisode(ep); else epsOpen = false; }
      else if (e.key === 'ArrowUp' || e.key === 'Escape' || e.key === 'ArrowDown') { e.preventDefault(); if (e.key !== 'ArrowDown') epsOpen = false; }
      return;
    }
    // TV ao vivo: ↑/↓ troca de canal, Enter abre a lista lateral, números, Backspace = último canal
    if (live && !menu && !(e.target as HTMLElement)?.closest?.('.menu') && liveKey(e)) { e.preventDefault(); return; }
    if (e.key === 'MediaTrackNext' && next) { e.preventDefault(); goEpisode(next); return; }
    if (e.key === 'MediaTrackPrevious' && prevEp) { e.preventDefault(); goEpisode(prevEp); return; }
    if (e.key === 'Escape') { if (menu) { menu = null; e.preventDefault(); } else if (!document.fullscreenElement) back(); return; }
    if ((e.target as HTMLElement)?.closest?.('.menu')) return;
    // Enter/OK aciona o botão de pular ou o cartão do próximo episódio; ←/→ escolhe no cartão
    if (!menu && (showNext || skipSeg)) {
      if (e.key === 'Enter') { e.preventDefault(); if (showNext) (overlaySel === 0 ? playNext() : (nextDismissed = true)); else skip(); return; }
      if (showNext && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); overlaySel = e.key === 'ArrowRight' ? 1 : 0; return; }
      if (e.key === 's' && skipSeg) { skip(); return; }
    }
    switch (e.key) {
      case ' ': case 'k': e.preventDefault(); toggle(); break;
      case 'ArrowLeft': case 'ArrowRight': {
        // em cima de um botão dos controles, as setas só navegam; no resto, avançam/recuam
        const t = e.target as HTMLElement;
        if (t?.tagName === 'INPUT') return;
        e.preventDefault(); seekBy(e.key === 'ArrowRight', e.repeat); break;
      }
      case 'ArrowUp': e.preventDefault(); volume = Math.min(1, volume + 0.1); break;
      case 'ArrowDown':
        e.preventDefault();
        if (season.length) openEpisodes();            // série: ↓ abre a lista de episódios
        else volume = Math.max(0, volume - 0.1);
        break;
      case 'f': toggleFs(); break;
      case 'm': muted = !muted; break;
      case 'c': menu = menu === 'subs' ? null : 'subs'; break;
    }
  }
  $effect(() => { if (video) { video.volume = volume; video.muted = muted; localStorage.setItem('sb_volume', String(volume)); } });
  $effect(() => { menu; poke(); });

  function onSeekInput(e: Event) { video.currentTime = Number((e.target as HTMLInputElement).value); }
</script>

<svelte:window onkeydown={onKey} />

<div class="player" class:hideui={!showUi} bind:this={root} onmousemove={poke} role="presentation">
  <video
    bind:this={video}
    crossorigin="anonymous"
    playsinline
    onclick={toggle}
    ondblclick={toggleFs}
    onplay={() => { playing = true; poke(); }}
    onpause={() => { playing = false; showUi = true; if (started) report('progress'); }}
    onplaying={() => { waiting = false; error = ''; reconnects = 0; clearTimeout(stallTimer); if (!started && mode === 'vod') { started = true; report('start'); } }}
    onwaiting={() => {
      waiting = true;
      // ao vivo travado por muito tempo: reconecta (a fonte pode ter mudado ou caído)
      clearTimeout(stallTimer);
      if (live) stallTimer = setTimeout(() => { if (waiting && !error) fail('O canal parou de responder'); }, 15000);
    }}
    ontimeupdate={() => { current = video.currentTime; const b = video.buffered; buffered = b.length ? b.end(b.length - 1) : 0; }}
    ondurationchange={() => (duration = Number.isFinite(video.duration) ? video.duration : 0)}
    onended={() => { if (live) { fail('A transmissão foi interrompida'); return; } if (!live) { if (next && !nextDismissed) playNext(); else { report('stopped'); back(); } } }}
    onerror={() => fail('O navegador não conseguiu abrir este vídeo')}
  >
    {#if source && mode === 'vod'}
      {#each subs as s (s.Index)}
        <track kind="subtitles" data-index={s.Index} src={media.subtitle(id, source.Id, s.Index)} label={label(s)} srclang={(s.Language ?? 'und').slice(0, 3)} />
      {/each}
    {/if}
  </video>

  {#if cueLines.length && activeSub >= 0}
    <div class="subs" class:lifted={showUi}>{#each cueLines as l}<span style={subStyle}>{l}</span>{/each}</div>
  {/if}

  {#if waiting && !error}<div class="center-spin"><div class="spinner"></div></div>{/if}
  {#if error}
    <div class="err"><p>{error}</p><button class="btn primary" onclick={back}>Voltar</button></div>
  {/if}

  {#if showNext && next}
    <div class="next" class:lifted={showUi}>
      <span class="eyebrow">Próximo episódio</span>
      <strong>{episodeLabel(next)}</strong>
      <small>{playing ? `Começa em ${nextLeft} s` : 'Pausado'}</small>
      <div class="next-row">
        <button class="pill primary" class:sel={overlaySel === 0} onclick={playNext}><Icon name="play" size={18} /> Assistir agora</button>
        <button class="pill" class:sel={overlaySel === 1} onclick={() => (nextDismissed = true)}>Cancelar</button>
      </div>
    </div>
  {:else if skipSeg}
    <button class="pill primary skip sel" class:lifted={showUi} onclick={skip}>{SKIP_LABEL[skipSeg.Type] ?? 'Pular'} <Icon name="right" size={18} /></button>
  {/if}

  {#if osd}<div class="osd">{osd}</div>{/if}
  {#if numberBuf}<div class="osd">Canal {numberBuf}–</div>{/if}

  {#if live && infoOn && info}
    {@const e = info as import('../lib/liveQueue.svelte').LiveEntry}
    <div class="infobar" class:withside={sideOpen}>
      {#if infoIndex >= 0}<span class="inum">{numberOf(infoIndex)}</span>{/if}
      {#if e.logo}<span class="ilogo"><img src={e.logo} alt="" referrerpolicy="no-referrer" /></span>{/if}
      <div class="itxt">
        <div class="irow"><strong>{e.name}</strong><span class="iclock">{hhmm(clockNow)}</span></div>
        <span class="inow">{e.now ? (e.nowStart && e.nowEnd ? `${hhmm(e.nowStart)} – ${hhmm(e.nowEnd)}   ${e.now}` : e.now) : 'Sem guia de programação'}</span>
        {#if e.nowStart && e.nowEnd}<i class="ibar"><b style={`width:${pctOf(e.nowStart, e.nowEnd)}%`}></b></i>{/if}
        {#if e.next}<small>A seguir: {e.next}</small>{/if}
      </div>
    </div>
  {/if}

  {#if sideOpen}
    <div class="side" role="dialog" aria-label="Canais">
      <div class="side-head">
        {#if sideGroups.length > 1}<button class="icon" aria-label="Grupo anterior" onclick={() => liveKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))}><Icon name="left" size={20} /></button>{/if}
        <strong>{sideGroups[sideGroup]} · {sideIdx.length}</strong>
        {#if sideGroups.length > 1}<button class="icon" aria-label="Próximo grupo" onclick={() => liveKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))}><Icon name="right" size={20} /></button>{/if}
        <span class="grow"></span>
        <button class="icon" aria-label="Fechar" onclick={closeSide}><Icon name="close" size={20} /></button>
      </div>
      <div class="side-list" bind:this={sideBox}>
        {#each sideIdx as i, k (i)}
          {@const c = liveQueue.entries[i]}
          <button class="srow" class:sel={k === sideSel} class:cur={i === chIndex} onmouseenter={() => (sideSel = k)} onclick={() => { sideOpen = false; tune(i); }}>
            <span class="snum">{numberOf(i)}</span>
            <span class="slogo">{#if c.logo}<img src={c.logo} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}</span>
            <span class="stxt">
              <strong>{c.name}</strong>
              {#if i === chIndex}<small class="on">▶ ASSISTINDO{c.now ? ` · ${c.now}` : ''}</small>{:else if c.now}<small>{c.now}</small>{/if}
              {#if c.next}<small class="nx">{c.next}</small>{/if}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if epsOpen}
    <div class="eps" role="dialog" aria-label="Episódios">
      <div class="eps-head">
        <strong>{item?.SeriesName}{item?.ParentIndexNumber != null ? ` · Temporada ${item.ParentIndexNumber}` : ''}</strong>
        <button class="icon" aria-label="Fechar" onclick={() => (epsOpen = false)}><Icon name="close" size={22} /></button>
      </div>
      <div class="eps-row" bind:this={epsBox}>
        {#each season as ep, i (ep.Id)}
          {@const cur = ep.Id === item?.Id}
          <button class="ep" class:sel={i === epSel} class:cur onmouseenter={() => (epSel = i)} onclick={() => (cur ? (epsOpen = false) : goEpisode(ep))}>
            <span class="thumb">{#if img.landscape(ep)}<img src={img.landscape(ep)} alt="" loading="lazy" />{/if}</span>
            <small>E{String(ep.IndexNumber ?? 0).padStart(2, '0')}{cur ? ' · ASSISTINDO' : ep.UserData?.Played ? ' · ✓ visto' : ''}</small>
            <span class="nm">{ep.Name}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <header class="top" class:under={sideOpen}>
    <button class="icon" aria-label="Voltar" onclick={back}><Icon name="back" size={26} /></button>
    <div class="ttl"><strong>{title}</strong>{#if subtitle}<span>{subtitle}</span>{/if}{#if live}<span class="live">● AO VIVO</span>{/if}</div>
  </header>

  {#if !playing && !waiting && !error}
    <button class="bigplay" aria-label="Reproduzir" onclick={toggle}><Icon name="play" size={46} /></button>
  {/if}

  <footer class="bottom" class:under={epsOpen || sideOpen}>
    {#if !live}
      <div class="seek">
        <div class="track"><i class="buf" style={`width:${duration ? (buffered / duration) * 100 : 0}%`}></i><i class="pos" style={`width:${duration ? (current / duration) * 100 : 0}%`}></i></div>
        <input type="range" min="0" max={duration || 0} step="1" value={current} oninput={onSeekInput} aria-label="Posição" />
      </div>
    {/if}
    <div class="ctrls">
      {#if prevEp}<button class="icon" aria-label="Episódio anterior" title="Episódio anterior" onclick={() => prevEp && goEpisode(prevEp)}><Icon name="prev" size={26} /></button>{/if}
      <button class="icon" aria-label={playing ? 'Pausar' : 'Reproduzir'} onclick={toggle}><Icon name={playing ? 'pause' : 'play'} size={30} /></button>
      {#if live && liveQueue.entries.length > 1}
        <button class="icon" aria-label="Canal anterior" title="Canal anterior (↓)" onclick={() => zap(-1)}><Icon name="prev" size={26} /></button>
        <button class="icon" aria-label="Próximo canal" title="Próximo canal (↑)" onclick={() => zap(+1)}><Icon name="next" size={26} /></button>
        <button class="icon" aria-label="Lista de canais" title="Canais (Enter)" onclick={openSide}><Icon name="list" /></button>
      {/if}
      {#if next && mode === 'vod'}<button class="icon" aria-label="Próximo episódio" title="Próximo episódio" onclick={() => next && goEpisode(next)}><Icon name="next" size={26} /></button>{/if}
      {#if !live}
        <button class="icon" aria-label="Voltar 10 segundos" onclick={() => seek(-10)}><Icon name="rew" size={26} /></button>
        <button class="icon" aria-label="Avançar 10 segundos" onclick={() => seek(10)}><Icon name="fwd" size={26} /></button>
        <span class="time">{clock(current)} / {clock(duration)}</span>
      {/if}
      <div class="vol">
        <button class="icon" aria-label="Som" onclick={() => (muted = !muted)}><Icon name={muted || volume === 0 ? 'mute' : 'volume'} /></button>
        <input type="range" min="0" max="1" step="0.05" bind:value={volume} aria-label="Volume" />
      </div>
      <span class="grow"></span>
      {#if season.length}<button class="icon" aria-label="Episódios" title="Episódios (↓)" onclick={openEpisodes}><Icon name="list" /></button>{/if}
      <button class="icon" class:on={activeSub >= 0} aria-label="Legendas" title="Legendas (C)" onclick={() => (menu = menu === 'subs' ? null : 'subs')}><Icon name="subtitles" /></button>
      {#if mode === 'vod'}
        <button class="icon" aria-label="Áudio" title="Áudio" onclick={() => (menu = menu === 'audio' ? null : 'audio')}><Icon name="audio" /></button>
        <button class="icon" class:on={quality > 0} aria-label="Qualidade" title="Qualidade" onclick={() => (menu = menu === 'quality' ? null : 'quality')}><Icon name="hd" /></button>
      {/if}
      <button class="icon" aria-label="Tela cheia" title="Tela cheia (F)" onclick={toggleFs}><Icon name={fullscreen ? 'exitfs' : 'fullscreen'} /></button>
    </div>
  </footer>

  {#if menu}
    <div class="menu" role="dialog">
      {#if menu === 'subs'}
        <h4>Legendas</h4>
        <button class:on={activeSub < 0} onclick={() => { selectSub(-1); menu = null; }}>Desligadas</button>
        {#each subs as s (s.Index)}
          <button class:on={activeSub === s.Index} onclick={() => { selectSub(s.Index); menu = null; }}>{label(s)}</button>
        {/each}
        {#if mode === 'vod' && !subs.length}<p class="note">Este vídeo não tem legendas no servidor.</p>{/if}
        {#if mode === 'vod'}<button class="act" onclick={searchOnline}>Baixar legenda da internet…</button>{/if}
        <button class="act" onclick={() => (menu = 'look')}>Aparência da legenda…</button>
      {:else if menu === 'online'}
        <h4>Legendas encontradas</h4>
        {#if !online.length}<div class="spinner small"></div>{/if}
        {#each online as o (o.Id)}<button onclick={() => download(o)}>{o.Name} <small>· {o.ProviderName}</small></button>{/each}
      {:else if menu === 'look'}
        <h4>Aparência da legenda</h4>
        <small class="lbl">Tamanho</small>
        <div class="row">{#each SUB_SIZES as s, i}<button class:on={session.settings.subSize === i} onclick={() => session.set('subSize', i)}>{s[0]}</button>{/each}</div>
        <small class="lbl">Cor</small>
        <div class="row">{#each SUB_COLORS as c, i}<button class:on={session.settings.subColor === i} onclick={() => session.set('subColor', i)}>{c[0]}</button>{/each}</div>
        <small class="lbl">Fundo</small>
        <div class="row">{#each SUB_BGS as b, i}<button class:on={session.settings.subBg === i} onclick={() => session.set('subBg', i)}>{b}</button>{/each}</div>
      {:else if menu === 'audio'}
        <h4>Áudio</h4>
        {#if audios.length <= 1}<p class="note">Só há uma faixa de áudio.</p>{/if}
        {#each audios as a (a.Index)}
          <button class:on={audioIndex === a.Index || (audioIndex === null && a.IsDefault)} onclick={() => chooseAudio(a.Index)}>{label(a)}</button>
        {/each}
      {:else if menu === 'quality'}
        <h4>Qualidade</h4>
        {#each QUALITIES as q, i}<button class:on={quality === i} onclick={() => chooseQuality(i)}>{q[0]}</button>{/each}
        <p class="note">{isHls ? 'Convertido pelo servidor' : 'Arquivo original'}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .player{position:fixed;inset:0;z-index:100;background:#000;color:#fff;overflow:hidden}
  .infobar{position:absolute;left:40px;right:40px;bottom:28px;z-index:6;display:flex;align-items:center;gap:16px;padding:14px 22px 14px 18px;border-radius:16px;background:rgba(16,16,16,.92);pointer-events:none}
  .inum{min-width:70px;text-align:center;color:var(--orange);font-size:34px;font-weight:800}
  .ilogo{width:112px;height:63px;flex:none;border-radius:8px;background:#1e1e1e;display:grid;place-items:center;padding:6px 8px}
  .ilogo img{max-width:100%;max-height:100%;object-fit:contain}
  .itxt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  .irow{display:flex;align-items:center;gap:12px}
  .irow strong{flex:1;font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .iclock{font-weight:700;font-size:18px}
  .inow{color:#ddd;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ibar{display:block;height:6px;border-radius:3px;background:rgba(255,255,255,.2);margin:5px 0;overflow:hidden}
  .ibar b{display:block;height:100%;background:var(--orange)}
  .itxt small{color:#9a9a9a;font-size:14px}
  .side{position:absolute;left:0;top:0;bottom:0;width:min(520px,92vw);z-index:7;display:flex;flex-direction:column;background:linear-gradient(90deg,rgba(0,0,0,.96),rgba(0,0,0,.9) 70%,rgba(0,0,0,0))}
  .side-head{display:flex;align-items:center;gap:6px;padding:24px 20px 12px}
  .side-head strong{font-size:18px}
  .side-list{flex:1;overflow-y:auto;padding:0 12px 24px;scrollbar-width:none}
  .side-list::-webkit-scrollbar{display:none}
  .srow{display:flex;align-items:center;gap:12px;width:100%;padding:8px 10px;margin-bottom:4px;border:2px solid transparent;border-radius:10px;background:transparent;color:#fff;text-align:left;cursor:pointer}
  .srow.cur{background:rgba(255,122,0,.15)}
  .srow.sel{border-color:var(--orange);background:rgba(255,255,255,.12)}
  .snum{min-width:46px;color:var(--orange);font-weight:800;font-size:16px}
  .slogo{width:72px;height:40px;flex:none;border-radius:6px;background:#1e1e1e;display:grid;place-items:center;padding:3px 4px}
  .slogo img{max-width:100%;max-height:100%;object-fit:contain}
  .stxt{flex:1;min-width:0;display:flex;flex-direction:column}
  .stxt strong{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .stxt small{font-size:13px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .stxt small.on{color:var(--orange)}
  .stxt small.nx{color:#8a8a8a;font-size:12px}
  .osd{position:absolute;top:40px;left:50%;transform:translateX(-50%);z-index:4;padding:10px 22px;border-radius:24px;background:rgba(0,0,0,.8);font-size:20px;font-weight:700;pointer-events:none}
  .eps{position:absolute;left:0;right:0;bottom:0;z-index:5;padding:60px 0 26px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.92) 30%,rgba(0,0,0,.97))}
  .eps-head{display:flex;align-items:center;justify-content:space-between;padding:0 40px 10px}
  .eps-head strong{font-size:18px}
  .eps-row{display:flex;gap:12px;overflow-x:auto;padding:6px 40px 10px;scrollbar-width:none}
  .eps-row::-webkit-scrollbar{display:none}
  .ep{flex:none;width:230px;padding:8px;border-radius:12px;border:3px solid transparent;background:transparent;color:#fff;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:6px}
  .ep.cur{background:rgba(255,122,0,.13)}
  .ep.sel{border-color:var(--orange);background:rgba(255,255,255,.12)}
  .ep .thumb{display:block;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#1e1e1e}
  .ep .thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .ep small{color:var(--orange);font-weight:700;font-size:12px;letter-spacing:.04em}
  .ep .nm{font-size:14px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .player.hideui{cursor:none}
  video{width:100%;height:100%;object-fit:contain;background:#000}
  .top,.bottom{position:absolute;left:0;right:0;transition:opacity .3s,transform .3s;z-index:2}
  .top{top:0;display:flex;align-items:center;gap:14px;padding:18px 24px 50px;background:linear-gradient(180deg,rgba(0,0,0,.75),transparent)}
  .bottom{bottom:0;padding:50px 24px 18px;background:linear-gradient(0deg,rgba(0,0,0,.85),transparent)}
  .hideui .top{opacity:0;transform:translateY(-10px);pointer-events:none}
  .bottom.under,.top.under{opacity:0;pointer-events:none}
  .infobar.withside{left:min(540px,50vw)}
  .hideui .bottom{opacity:0;transform:translateY(10px);pointer-events:none}
  .ttl{display:flex;flex-direction:column;line-height:1.25}
  .ttl strong{font-size:20px}
  .ttl span{color:#cfcfcf;font-size:14px}
  .ttl .live{color:#ff4d4d;font-weight:700;font-size:12px;letter-spacing:.08em}
  .icon{width:46px;height:46px;border-radius:50%;border:0;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer;transition:background .2s,color .2s}
  .icon:hover,.icon:focus-visible{background:rgba(255,122,0,.9);color:#000;outline:none}
  .icon.on{color:var(--orange)}
  .icon.on:hover{color:#000}
  .seek{position:relative;height:18px;margin-bottom:6px}
  .track{position:absolute;left:0;right:0;top:7px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}
  .seek:hover .track{height:6px;top:6px}
  .track i{position:absolute;left:0;top:0;bottom:0}
  .track .buf{background:rgba(255,255,255,.35)} .track .pos{background:var(--orange)}
  .seek input{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer;margin:0}
  .ctrls{display:flex;align-items:center;gap:6px}
  .time{font-variant-numeric:tabular-nums;font-size:14px;color:#ddd;margin-left:8px}
  .grow{flex:1}
  .vol{display:flex;align-items:center}
  .vol input{width:90px;accent-color:var(--orange)}
  .bigplay{position:absolute;left:50%;top:50%;width:92px;height:92px;margin:-46px;border-radius:50%;border:0;background:rgba(255,122,0,.92);color:#000;display:grid;place-items:center;cursor:pointer;z-index:2}
  .center-spin{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
  .err{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(0,0,0,.7);z-index:3;text-align:center;padding:20px}
  .menu{position:absolute;right:24px;bottom:96px;z-index:4;width:min(360px,calc(100vw - 32px));max-height:60vh;overflow:auto;background:rgba(20,20,20,.97);border:1px solid #2a2a2a;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:4px;box-shadow:0 20px 50px #000}
  .menu h4{margin:4px 8px 8px;font-size:15px}
  .menu button{text-align:left;border:0;background:transparent;color:#eee;padding:10px 12px;border-radius:9px;cursor:pointer;font-size:14px}
  .menu button:hover,.menu button:focus-visible{background:#2a2a2a;outline:none}
  .menu button.on{color:var(--orange);font-weight:700}
  .menu button.on::before{content:'✓ '}
  .menu .act{color:var(--orange-soft)}
  .menu .row{display:flex;flex-wrap:wrap;gap:6px;padding:0 6px 6px}
  .menu .row button{background:#2a2a2a;padding:7px 12px;border-radius:99px}
  .menu .row button.on{background:var(--orange);color:#000}
  .menu .row button.on::before{content:''}
  .lbl{color:#999;margin:6px 10px 2px}
  .note{color:#999;font-size:13px;margin:4px 10px}
  .spinner.small{width:22px;height:22px;border-width:2px;margin:10px}
  @media (max-width:700px){.time{display:none}.vol input{display:none}.top{padding:12px 12px 40px}.bottom{padding:40px 10px 10px}.icon{width:42px;height:42px}}
  .subs{position:absolute;left:0;right:0;bottom:6vh;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;transition:bottom .25s ease;z-index:2;padding:0 6vw;text-align:center}
  .subs.lifted{bottom:max(15vh,130px)}
  .subs span{font-weight:600;line-height:1.3;padding:0 .3em;border-radius:4px;white-space:pre-wrap}
  .pill{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.3);background:rgba(24,24,24,.85);color:#fff;font:inherit;font-weight:700;font-size:15px;padding:11px 18px;border-radius:10px;cursor:pointer;backdrop-filter:blur(6px);transition:background .2s,color .2s}
  .pill.primary{border:2px solid var(--orange)}
  .pill.sel,.pill:hover{background:var(--orange);color:#000;border-color:var(--orange)}
  .skip{position:absolute;right:32px;bottom:40px;z-index:3;transition:bottom .25s ease,background .2s}
  .next{position:absolute;right:32px;bottom:40px;z-index:3;width:min(380px,calc(100vw - 32px));display:flex;flex-direction:column;gap:4px;padding:16px 18px;border-radius:16px;background:rgba(18,18,18,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 18px 50px rgba(0,0,0,.6);transition:bottom .25s ease}
  .skip.lifted,.next.lifted{bottom:120px}
  .next .eyebrow{color:var(--orange);font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}
  .next strong{font-size:17px}
  .next small{color:#bdbdbd}
  .next-row{display:flex;gap:10px;margin-top:10px}
  @media (max-width:600px){.skip,.next{right:16px}.skip.lifted,.next.lifted{bottom:130px}}
</style>
