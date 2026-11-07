<script lang="ts">
  import Icon from '../lib/components/Icon.svelte';
  import MediaCard from '../lib/components/MediaCard.svelte';
  import { jf, img, runtime, progress, isSeries, isEpisode, episodeLabel, friendly } from '../lib/api/jellyfin';
  import { go } from '../lib/router.svelte';
  import type { Item } from '../lib/types';
  import { initials } from '../lib/util';
  import { watched } from '../lib/watched.svelte';
  import { favorites } from '../lib/favorites.svelte';

  let { id }: { id: string } = $props();
  let item = $state<Item | null>(null);
  let error = $state('');
  let seasons = $state<Item[]>([]);
  let season = $state<string | null>(null);
  let episodes = $state<Item[]>([]);
  let children = $state<Item[]>([]);
  let next = $state<Item | null>(null);

  $effect(() => {
    item = null; error = ''; seasons = []; episodes = []; children = []; next = null; season = null;
    jf.item(id).then(async (it) => {
      item = it;
      if (it.Type === 'Series') {
        seasons = await jf.seasons(it.Id).catch(() => []);
        next = (await jf.nextUpFor(it.Id).catch(() => undefined)) ?? null;
        const unwatched = seasons.find((s) => (s.UserData?.UnplayedItemCount ?? 0) > 0);
        season = (unwatched ?? seasons[0])?.Id ?? null;
      } else if (it.Type === 'BoxSet') {
        children = await jf.children(it.Id).catch(() => []);
      }
    }).catch((e) => (error = friendly(e)));
  });
  $effect(() => {
    const s = season, it = item;
    if (!s || !it) return;
    jf.episodes(it.Id, s).then((r) => {
      episodes = r;
      if (!next) next = r.find((e) => !watched.isPlayed(e)) ?? r[0] ?? null;
    }).catch(() => (episodes = []));
  });
  const seasonItem = $derived(seasons.find((s) => s.Id === season) ?? null);
  const seasonSeen = $derived(episodes.length > 0 && episodes.every((e) => watched.isPlayed(e)));
  async function toggleSeason() {
    if (!seasonItem) return;
    if (await watched.set(seasonItem, !seasonSeen, episodes)) next = episodes.find((e) => !watched.isPlayed(e)) ?? episodes[0] ?? null;
  }
  async function toggleItem() {
    if (!item) return;
    await watched.toggle(item, isSeries(item) ? episodes : []);
  }
  const pos = $derived(item?.UserData?.PlaybackPositionTicks ?? 0);
</script>

{#if item}
  {@const title = isEpisode(item) ? item.SeriesName ?? item.Name : item.Name}
  <div class="hero" style={`background-image:url("${img.backdrop(item, 1920) ?? ''}")`}>
    <div class="shade"></div>
    <div class="inner">
      <div class="poster">
        <span>{initials(title)}</span>
        {#if img.poster(item)}<img src={img.poster(item)} alt="" />{/if}
      </div>
      <div class="info">
        <div class="eyebrow">{item.Type === 'BoxSet' ? 'Coleção' : isSeries(item) ? 'Série' : isEpisode(item) ? 'Episódio' : 'Filme'}</div>
        <h1>{title}</h1>
        {#if isEpisode(item)}<h3>{episodeLabel(item)}</h3>{/if}
        <div class="meta">
          {#if item.ProductionYear}<span>{item.ProductionYear}</span>{/if}
          {#if runtime(item)}<span>{runtime(item)}</span>{/if}
          {#if item.OfficialRating}<span class="tag">{item.OfficialRating}</span>{/if}
          {#if item.CommunityRating}<span><b class="star">★</b> {item.CommunityRating.toFixed(1)}</span>{/if}
          {#if watched.isPlayed(item)}<span class="ok">✓ Assistido</span>{/if}
        </div>
        <div class="actions">
          {#if isSeries(item)}
            <button class="btn primary" disabled={!next} onclick={() => next && go(`/play/${next.Id}`)}><Icon name="play" />Assistir {next ? episodeLabel(next).split(' ·')[0] : ''}</button>
          {:else if item.Type === 'BoxSet'}
            <span class="muted">{children.length} títulos nesta coleção</span>
          {:else if pos > 0}
            <button class="btn primary" onclick={() => go(`/play/${item!.Id}`)}><Icon name="play" />Continuar</button>
            <button class="btn" onclick={() => go(`/play/${item!.Id}?start=0`)}><Icon name="replay" />Do início</button>
          {:else}
            <button class="btn primary" onclick={() => go(`/play/${item!.Id}`)}><Icon name="play" />Assistir</button>
          {/if}
          {#if item.Type !== 'BoxSet'}
            <button class="btn" class:seen={watched.isPlayed(item)} onclick={toggleItem}>
              <Icon name="check" />{watched.isPlayed(item) ? (isSeries(item) ? 'Série assistida' : 'Assistido') : isSeries(item) ? 'Marcar série como vista' : 'Marcar como visto'}
            </button>
            <button class="btn" class:seen={favorites.isFavorite(item)} onclick={() => favorites.toggle(item!)}>
              <Icon name={favorites.isFavorite(item) ? 'bookmark' : 'bookmarkAdd'} />{favorites.isFavorite(item) ? 'Na Minha lista' : 'Minha lista'}
            </button>
          {/if}
        </div>
        {#if item.Overview}<p>{item.Overview}</p>{/if}
        {#if item.Genres?.length}<div class="genres">{item.Genres.join(' · ')}</div>{/if}
      </div>
    </div>
  </div>

  <div class="page" style="padding-top:8px">
    {#if children.length}
      <div class="grid">
        {#each children as c (c.Id)}
          <MediaCard title={c.Name} subtitle={String(c.ProductionYear ?? '')} image={img.poster(c)} rating={c.CommunityRating} progress={progress(c)} played={watched.isPlayed(c)} onclick={() => go(`/item/${c.Id}`)} />
        {/each}
      </div>
    {/if}
    {#if seasons.length}
      <div class="chips" style="margin-bottom:16px">
        {#each seasons as s (s.Id)}<button class="chip" class:on={s.Id === season} onclick={() => (season = s.Id)}>{s.Name}</button>{/each}
        {#if seasonItem && episodes.length}
          <button class="chip mark" class:seen={seasonSeen} onclick={toggleSeason}><Icon name="check" size={16} />{seasonSeen ? `Desmarcar ${seasonItem.Name}` : `Marcar ${seasonItem.Name} como vista`}</button>
        {/if}
      </div>
      <div class="eps">
        {#each episodes as ep (ep.Id)}
          <div class="eprow">
          <button class="ep" onclick={() => go(`/play/${ep.Id}`)}>
            <span class="thumb">
              <span class="n">{ep.IndexNumber ?? ''}</span>
              {#if img.primary(ep, 300)}<img src={img.primary(ep, 300)} alt="" loading="lazy" />{/if}
              {#if progress(ep) > 0}<span class="prog"><i style={`width:${progress(ep) * 100}%`}></i></span>{/if}
              <span class="playic"><Icon name="play" size={30} /></span>
            </span>
            <span class="txt">
              <strong>{ep.IndexNumber ?? '?'}. {ep.Name}</strong>
              <small>{[runtime(ep), watched.isPlayed(ep) ? '✓ Assistido' : null].filter(Boolean).join('  ·  ')}</small>
              {#if ep.Overview}<span class="ov">{ep.Overview}</span>{/if}
            </span>
          </button>
          <button class="tick" class:seen={watched.isPlayed(ep)} title={watched.isPlayed(ep) ? 'Desmarcar episódio' : 'Marcar episódio como visto'}
            aria-label={watched.isPlayed(ep) ? 'Desmarcar episódio' : 'Marcar episódio como visto'} onclick={() => watched.toggle(ep)}><Icon name="check" /></button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else if error}
  <div class="center"><p>{error}</p></div>
{:else}
  <div class="center"><div class="spinner"></div></div>
{/if}

<style>
  .hero{position:relative;min-height:min(70vh,620px);background-size:cover;background-position:center 20%;display:flex;align-items:flex-end}
  .shade{position:absolute;inset:0;background:linear-gradient(0deg,var(--black) 2%,rgba(10,10,10,.55) 55%,rgba(10,10,10,.35)),linear-gradient(90deg,var(--black),transparent 70%)}
  .inner{position:relative;display:flex;gap:32px;align-items:flex-end;padding:120px var(--pad) 30px;width:100%}
  .poster{position:relative;width:220px;flex:none;aspect-ratio:2/3;border-radius:14px;overflow:hidden;background:var(--surface2);box-shadow:0 30px 60px -20px #000;display:grid;place-items:center}
  .poster span{font-size:40px;font-weight:800;color:rgba(255,122,0,.7)}
  .poster img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .info{display:flex;flex-direction:column;gap:10px;max-width:820px}
  h1{font-size:clamp(28px,4vw,50px);font-weight:800;line-height:1.05}
  h3{font-size:18px;font-weight:600}
  .meta{display:flex;gap:16px;flex-wrap:wrap;color:#cfcfcf;align-items:center}
  .tag{border:1px solid #666;border-radius:5px;padding:0 6px;font-size:13px}
  .star{color:var(--orange)}
  .actions{display:flex;gap:12px;flex-wrap:wrap;margin:6px 0}
  p{margin:0;color:#d6d6d6;max-width:760px}
  .genres{font-weight:600;font-size:14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:24px 18px}
  .eps{display:flex;flex-direction:column;gap:10px}
  .ep{display:flex;gap:18px;text-align:left;background:var(--surface);border:0;border-radius:12px;padding:10px;cursor:pointer;transition:background .2s,box-shadow .2s}
  .ep:hover,.ep:focus-visible{background:var(--surface2);box-shadow:0 0 0 2px var(--orange);outline:none}
  .thumb{position:relative;width:240px;flex:none;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:var(--surface3);display:grid;place-items:center}
  .thumb .n{font-size:26px;font-weight:800;color:rgba(255,122,0,.6)}
  .thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .playic{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.35);opacity:0;transition:opacity .2s}
  .ep:hover .playic{opacity:1}
  .prog{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(0,0,0,.6)} .prog i{display:block;height:100%;background:var(--orange)}
  .txt{display:flex;flex-direction:column;gap:4px;min-width:0}
  .txt strong{font-size:16px}
  .txt small{color:var(--muted)}
  .ov{color:var(--muted);font-size:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  @media (max-width:900px){
    .inner{flex-direction:column;align-items:flex-start;gap:16px;padding-top:160px}
    .poster{width:120px}
    .thumb{width:140px}
    .ov{-webkit-line-clamp:3}
  }
  .eprow{display:flex;gap:10px;align-items:stretch}
  .eprow .ep{flex:1;min-width:0}
  .tick{flex:none;width:52px;border:0;border-radius:12px;background:var(--surface);color:var(--muted);display:grid;place-items:center;cursor:pointer;transition:background .2s,color .2s,box-shadow .2s}
  .tick:hover,.tick:focus-visible{box-shadow:0 0 0 2px var(--orange);outline:none;color:#fff}
  .tick.seen{color:#34c77b;background:rgba(52,199,123,.12)}
  .btn.seen{color:#34c77b}
  .chip.mark{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
  .chip.mark.seen{color:#34c77b}
</style>
