<script lang="ts">
  import MediaCard from '../lib/components/MediaCard.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import { jf, img, progress, isSeries, friendly } from '../lib/api/jellyfin';
  import { indexer, seerr } from '../lib/api/extras';
  import { go, router } from '../lib/router.svelte';
  import { session } from '../lib/session.svelte';
  import type { IndexerItem, Item, SeerrResult } from '../lib/types';
  import { sleep } from '../lib/util';

  let q = $state(router.query.get('q') ?? '');
  let library = $state<Item[]>([]);
  let available = $state<IndexerItem[]>([]);
  let seerrList = $state<SeerrResult[]>([]);
  let loading = $state(false);
  let error = $state('');
  let seq = 0;

  $effect(() => {
    const term = q.trim();
    const run = ++seq;
    if (term.length < 2) { library = []; available = []; seerrList = []; loading = false; return; }
    const t = setTimeout(async () => {
      loading = true; error = '';
      history.replaceState(null, '', '#/search?q=' + encodeURIComponent(term));
      const [a, b, c] = await Promise.allSettled([
        jf.search(term),
        indexer.enabled() ? indexer.search(term) : Promise.resolve([]),
        seerr.configured() ? seerr.search(term) : Promise.resolve([]),
      ]);
      if (run !== seq) return;
      const av = b.status === 'fulfilled' ? b.value : [];
      const sl = c.status === 'fulfilled' ? c.value.filter((x) => x.mediaInfo?.status !== 5) : [];
      // Estado dos botões criado antes de exibir (não pode ser criado durante a renderização)
      for (const i of av) reqState[keyOf(i)] ??= { state: i.requested ? 'queued' : '', msg: '', season: -1 };
      for (const r of sl) seerrState[r.mediaType + r.id] ??= {
        state: r.mediaInfo?.status === 2 || r.mediaInfo?.status === 3 ? 'requested' : r.mediaInfo?.status === 4 ? 'partial' : '', msg: '', seasons: null, season: -1,
      };
      library = a.status === 'fulfilled' ? a.value : [];
      if (a.status === 'rejected') error = friendly(a.reason);
      available = av;
      seerrList = sl;
      loading = false;
    }, 350);
    return () => clearTimeout(t);
  });

  /* ---------- solicitações ao STRM Indexer ---------- */
  const reqState = $state<Record<string, { state: string; msg: string; season: number }>>({});
  const keyOf = (i: IndexerItem) => `${i.kind}|${i.title}|${i.catalog_year ?? ''}`;
  const st = (i: IndexerItem) => reqState[keyOf(i)];

  async function requestStrm(i: IndexerItem) {
    const s = st(i);
    s.state = 'queued'; s.msg = '';
    try {
      const season = i.kind === 'series' ? (s.season >= 0 ? i.seasons[s.season] : i.seasons.length === 1 ? i.seasons[0] : null) : null;
      const r = await indexer.request(i, season);
      for (;;) {
        await sleep(3000);
        const x = await indexer.status(r.id).catch(() => null);
        if (!x) continue;
        s.state = x.state; s.msg = x.message;
        if (!['queued', 'validating', 'importing'].includes(x.state)) break;
      }
    } catch (e) { s.state = ''; s.msg = friendly(e); }
  }
  const strmLabel: Record<string, string> = { '': 'Solicitar', queued: 'Na fila…', validating: 'Validando…', importing: 'Importando…', available: '✓ Adicionado', failed: 'Falhou', unavailable: 'Sem fonte agora' };

  /* ---------- pedidos ao Seerr ---------- */
  const seerrState = $state<Record<string, { state: string; msg: string; seasons: number[] | null; season: number }>>({});
  const sst = (r: SeerrResult) => seerrState[r.mediaType + r.id];
  async function cycleSeason(r: SeerrResult) {
    const s = sst(r);
    if (!s.seasons) { s.seasons = await seerr.seasons(r.id).catch(() => []); s.season = s.seasons.length ? 0 : -1; }
    else s.season = s.season + 1 >= s.seasons.length ? -1 : s.season + 1;
  }
  async function requestSeerr(r: SeerrResult) {
    const s = sst(r);
    s.state = 'sending'; s.msg = '';
    try {
      await seerr.request(r, r.mediaType === 'tv' && s.seasons && s.season >= 0 ? [s.seasons[s.season]] : null);
      s.state = 'requested'; s.msg = 'Pedido enviado ao Seerr.';
    } catch (e) { s.state = 'error'; s.msg = friendly(e); }
  }
</script>

<div class="page">
  <label class="search">
    <Icon name="search" />
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={q} placeholder="Buscar filmes e séries…" autofocus />
    {#if loading}<span class="spinner"></span>{/if}
  </label>
  {#if error}<p class="bad">{error}</p>{/if}

  {#if library.length}
    <div class="section"><h2>Na sua biblioteca</h2>
      <div class="grid">
        {#each library as it (it.Id)}
          <MediaCard title={it.Name} subtitle={[isSeries(it) ? 'Série' : 'Filme', it.ProductionYear].filter(Boolean).join(' · ')}
            image={img.poster(it)} progress={progress(it)} onclick={() => go(`/item/${it.Id}`)} />
        {/each}
      </div>
    </div>
  {/if}

  {#if available.length}
    <div class="section"><h2>Disponível para solicitar</h2>
      <p class="note">Ainda fora da biblioteca · adicionado automaticamente se a fonte responder</p>
      <div class="grid">
        {#each available as it (keyOf(it))}
          {@const s = st(it)}
          <div class="req">
            <MediaCard title={it.title} badge="STRM" image={indexer.art(it.poster)}
              subtitle={it.kind === 'movie' ? ['Filme', it.year].filter(Boolean).join(' · ') : `Série · ${it.in_library ? `${it.in_library}/${it.episodes} ep.` : `${it.seasons.length} temp.`}`} />
            {#if it.kind === 'series' && it.seasons.length > 1 && !s.state}
              <button class="chip" onclick={() => (s.season = s.season + 1 >= it.seasons.length ? -1 : s.season + 1)}>Temporada: {s.season < 0 ? 'Todas' : 'T' + it.seasons[s.season]}</button>
            {/if}
            <button class="btn sm block" class:primary={!s.state || s.state === 'failed' || s.state === 'unavailable'}
              disabled={['queued', 'validating', 'importing', 'available'].includes(s.state)} onclick={() => requestStrm(it)}>{strmLabel[s.state] ?? 'Solicitar'}</button>
            {#if s.msg}<small class={s.state === 'available' ? 'ok' : s.state ? 'muted' : 'bad'}>{s.msg}</small>{/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if seerrList.length}
    <div class="section"><h2>Pedir no Seerr</h2>
      <p class="note">Não está nas listas? Peça para baixar · {session.settings.seerrUser}</p>
      <div class="grid">
        {#each seerrList as r (r.mediaType + r.id)}
          {@const s = sst(r)}
          <div class="req">
            <MediaCard title={r.title ?? r.name ?? ''} badge="SEERR" image={seerr.poster(r)}
              subtitle={[r.mediaType === 'tv' ? 'Série' : 'Filme', (r.releaseDate ?? r.firstAirDate ?? '').slice(0, 4)].filter(Boolean).join(' · ')} />
            {#if r.mediaType === 'tv' && (s.state === '' || s.state === 'partial')}
              <button class="chip" onclick={() => cycleSeason(r)}>Temporada: {!s.seasons || s.season < 0 ? 'Todas' : 'T' + s.seasons[s.season]}</button>
            {/if}
            <button class="btn sm block" class:primary={s.state !== 'requested'} disabled={s.state === 'sending' || s.state === 'requested'} onclick={() => requestSeerr(r)}>
              {s.state === 'requested' ? '✓ Solicitado' : s.state === 'sending' ? 'Enviando…' : s.state === 'partial' ? 'Pedir o restante' : s.state === 'error' ? 'Tentar de novo' : 'Pedir'}
            </button>
            {#if s.msg}<small class={s.state === 'requested' ? 'ok' : 'bad'}>{s.msg}</small>{/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if !loading && q.trim().length >= 2 && !library.length && !available.length && !seerrList.length && !error}
    <p class="muted" style="margin-top:30px">Nada encontrado para “{q.trim()}”.</p>
  {/if}
</div>

<style>
  .search{display:flex;align-items:center;gap:12px;height:56px;padding:0 18px;border-radius:14px;background:var(--surface);border:1px solid var(--surface3);max-width:760px}
  .search:focus-within{border-color:var(--orange);box-shadow:0 0 0 3px rgba(255,122,0,.18)}
  .search input{flex:1;background:none;border:0;outline:0;font-size:17px}
  .search .spinner{width:20px;height:20px;border-width:2px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:24px 18px;margin-top:12px}
  .req{display:flex;flex-direction:column;gap:8px}
  .req small{font-size:12px}
  @media (max-width:900px){.grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:18px 12px}}
</style>
