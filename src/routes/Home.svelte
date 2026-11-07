<script lang="ts">
  import { fade } from 'svelte/transition';
  import { untrack } from 'svelte';
  import Hero from '../lib/components/Hero.svelte';
  import Row from '../lib/components/Row.svelte';
  import MediaCard from '../lib/components/MediaCard.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import { jf, img, episodeLabel, progress, itemTypesFor, isEpisode, isSeries, runtime, friendly } from '../lib/api/jellyfin';
  import { go } from '../lib/router.svelte';
  import { watched } from '../lib/watched.svelte';
  import { favorites } from '../lib/favorites.svelte';
  import type { Item } from '../lib/types';

  let data = $state<Data | null>(cache.home ?? null);
  let error = $state('');

  async function load() {
    try {
      const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
      const [m, s, resume, next, favs, views] = await Promise.all([
        safe(jf.featured('Movie', 6)), safe(jf.featured('Series', 6)), safe(jf.resume()), safe(jf.nextUp()), safe(jf.favorites()), jf.views(),
      ]);
      const libs = views.filter((v) => itemTypesFor(v.CollectionType) && v.CollectionType !== 'boxsets');
      const latest = await Promise.all(libs.map(async (v) => [v.Name, await safe(jf.latest(v.Id, itemTypesFor(v.CollectionType)!))] as [string, Item[]]));
      const featured: Item[] = [];
      for (let i = 0; i < Math.max(m.length, s.length); i++) { if (m[i]) featured.push(m[i]); if (s[i]) featured.push(s[i]); }
      data = cache.home = { featured, resume, next, favs, latest };
    } catch (e) { if (!data) error = friendly(e); }
  }
  // recarrega ao abrir e sempre que algo for marcado como visto/não visto
  $effect(() => { watched.version; favorites.version; untrack(load); });

  /* ---------- layout: spotlight (tela larga) ou carrossel (celular) ---------- */
  const mq = matchMedia('(min-width: 901px) and (min-height: 600px)');
  let wide = $state(mq.matches);
  $effect(() => {
    const on = () => (wide = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  /* ---------- spotlight: acompanha o cartão em foco / sob o mouse ---------- */
  let focused = $state<Item | null>(null);
  let slide = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function spot(it: Item) {
    clearTimeout(timer);
    timer = setTimeout(() => (focused = it), 220);
  }
  const slides = $derived(data?.featured.length ? data.featured : (data?.resume ?? []).filter((x) => img.backdrop(x)));
  // gira os destaques até o usuário escolher um cartão
  $effect(() => {
    if (focused || slides.length < 2 || !wide) return;
    const t = setInterval(() => (slide = (slide + 1) % slides.length), 8000);
    return () => clearInterval(t);
  });
  const current = $derived(focused ?? slides[slide % Math.max(slides.length, 1)] ?? null);
  const bg = $derived(current ? img.backdrop(current, 1920) : null);
  const curTitle = $derived(current ? (isEpisode(current) ? current.SeriesName ?? current.Name : current.Name) : '');
  const kind = (it: Item) => (isSeries(it) ? 'Série' : isEpisode(it) ? 'Episódio' : it.Type === 'BoxSet' ? 'Coleção' : 'Filme');

  function playOrOpen(it: Item) {
    if (isSeries(it) || it.Type === 'BoxSet') go(`/item/${it.Id}`); else go(`/play/${it.Id}`);
  }
  const detailsOf = (it: Item) => go(`/item/${isEpisode(it) ? it.SeriesId ?? it.Id : it.Id}`);
</script>

<script lang="ts" module>
  import type { Item as ModItem } from '../lib/types';
  export type Data = { featured: ModItem[]; resume: ModItem[]; next: ModItem[]; favs: ModItem[]; latest: [string, ModItem[]][] };
  export const cache: { home?: Data } = {};
</script>

{#snippet rows(d: Data, onspot: ((it: Item) => void) | null)}
  {#if d.resume.length}
    <Row title="Continuar assistindo">
      {#each d.resume as it (it.Id)}
        <MediaCard landscape width={280} title={isEpisode(it) ? it.SeriesName ?? it.Name : it.Name}
          subtitle={isEpisode(it) ? episodeLabel(it) : String(it.ProductionYear ?? '')}
          image={img.landscape(it)} progress={progress(it)} onspot={onspot ? () => onspot(it) : undefined}
          onclick={() => go(`/play/${it.Id}`)} />
      {/each}
    </Row>
  {/if}
  {#if d.next.length}
    <Row title="Próximos episódios">
      {#each d.next as it (it.Id)}
        <MediaCard landscape width={280} title={it.SeriesName ?? it.Name} subtitle={episodeLabel(it)} image={img.landscape(it)}
          played={watched.isPlayed(it)} onspot={onspot ? () => onspot(it) : undefined} onclick={() => go(`/item/${it.Id}`)} />
      {/each}
    </Row>
  {/if}
  {#if d.favs.some((it) => favorites.isFavorite(it))}
    <Row title="Minha lista">
      {#each d.favs.filter((it) => favorites.isFavorite(it)) as it (it.Id)}
        <MediaCard width={160} title={it.Name} subtitle={String(it.ProductionYear ?? '')} image={img.poster(it)}
          played={watched.isPlayed(it)}
          badge={(it.UserData?.UnplayedItemCount ?? 0) > 0 && !watched.isPlayed(it) ? String(it.UserData?.UnplayedItemCount) : ''}
          onspot={onspot ? () => onspot(it) : undefined} onclick={() => go(`/item/${it.Id}`)} />
      {/each}
    </Row>
  {/if}
  {#each d.latest as [name, list] (name)}
    {#if list.length}
      <Row title={`Adicionados em ${name}`}>
        {#each list as it (it.Id)}
          <MediaCard width={160} title={it.Name} subtitle={String(it.ProductionYear ?? '')} image={img.poster(it)}
            played={watched.isPlayed(it)}
            badge={(it.UserData?.UnplayedItemCount ?? 0) > 0 && !watched.isPlayed(it) ? String(it.UserData?.UnplayedItemCount) : ''}
            onspot={onspot ? () => onspot(it) : undefined} onclick={() => go(`/item/${it.Id}`)} />
        {/each}
      </Row>
    {/if}
  {/each}
  <div style="height:48px"></div>
{/snippet}

{#if data && wide}
  <div class="stage">
    <div class="bgwrap" aria-hidden="true">
      {#key bg}
        {#if bg}<div class="bg" style={`background-image:url("${bg}")`} transition:fade={{ duration: 650 }}></div>{/if}
      {/key}
      <div class="shade"></div>
    </div>

    {#if current}
      <section class="spot">
        <div class="eyebrow">{kind(current)}</div>
        <h1>{curTitle}</h1>
        {#if isEpisode(current)}<h3>{episodeLabel(current)}</h3>{/if}
        <div class="meta">
          {#if current.ProductionYear}<span>{current.ProductionYear}</span>{/if}
          {#if runtime(current)}<span>{runtime(current)}</span>{/if}
          {#if current.OfficialRating}<span class="tag">{current.OfficialRating}</span>{/if}
          {#if current.CommunityRating}<span><b class="star">★</b> {current.CommunityRating.toFixed(1)}</span>{/if}
          {#if current.Genres?.length}<span>{current.Genres.slice(0, 3).join(' · ')}</span>{/if}
          {#if watched.isPlayed(current)}<span class="ok">✓ Assistido</span>{/if}
        </div>
        <p class:ep={isEpisode(current)}>{current.Overview ?? ''}</p>
        <div class="actions">
          <button class="btn primary" onclick={() => playOrOpen(current!)}>
            <Icon name="play" />{isSeries(current) ? 'Ver episódios' : (current.UserData?.PlaybackPositionTicks ?? 0) > 0 ? 'Continuar' : 'Assistir'}
          </button>
          <button class="btn" onclick={() => detailsOf(current!)}><Icon name="info" />Detalhes</button>
          <button class="btn" class:seen={favorites.isFavorite(current)} onclick={() => favorites.toggle(current!)}>
            <Icon name={favorites.isFavorite(current) ? 'bookmark' : 'bookmarkAdd'} />{favorites.isFavorite(current) ? 'Na Minha lista' : 'Minha lista'}
          </button>
          <button class="btn" class:seen={watched.isPlayed(current)} onclick={() => watched.toggle(current!)}>
            <Icon name="check" />{watched.isPlayed(current) ? 'Assistido' : 'Marcar como visto'}
          </button>
        </div>
        {#if !focused && slides.length > 1}
          <div class="dots">{#each slides as _, n}<button class:on={n === slide % slides.length} aria-label={`Destaque ${n + 1}`} onclick={() => (slide = n)}></button>{/each}</div>
        {/if}
      </section>
    {/if}

    <div class="rows">{@render rows(data, spot)}</div>
  </div>
{:else if data}
  <Hero slides={data.featured} />
  {@render rows(data, null)}
{:else if error}
  <div class="center"><p>{error}</p><button class="btn primary" onclick={load}>Tentar de novo</button></div>
{:else}
  <div class="center"><div class="spinner"></div></div>
{/if}

<style>
  /* Tela larga: informações em cima, fileiras rolando embaixo (estilo Wholphin) */
  .stage{position:relative;height:100vh;margin-bottom:-20px;display:flex;flex-direction:column;overflow:hidden}
  .bgwrap{position:absolute;inset:0;pointer-events:none}
  .bg{position:absolute;top:0;right:0;width:76%;height:76%;background-size:cover;background-position:center 22%}
  .shade{position:absolute;inset:0;background:
    linear-gradient(90deg,var(--black) 0%,rgba(10,10,10,.94) 26%,rgba(10,10,10,.35) 58%,transparent 100%),
    linear-gradient(180deg,transparent 0%,rgba(10,10,10,.45) 40%,var(--black) 70%)}
  .spot{position:relative;flex:none;height:min(48vh,420px);padding:clamp(24px,5vh,56px) var(--pad) 10px;max-width:760px;display:flex;flex-direction:column;gap:9px;justify-content:flex-end}
  .eyebrow{color:var(--orange);font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase}
  h1{font-size:clamp(28px,3.6vw,48px);font-weight:800;line-height:1.05;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  h3{font-size:18px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .meta{display:flex;gap:14px;flex-wrap:wrap;color:#cfcfcf;font-size:14px;align-items:center}
  .tag{border:1px solid #666;border-radius:5px;padding:0 6px;font-size:13px}
  .star{color:var(--orange)}
  .ok{color:#34c77b;font-weight:600}
  p{margin:0;color:#cfcfcf;min-height:4.5em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  p.ep{-webkit-line-clamp:2;min-height:3em}
  .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:4px}
  .btn.seen{color:#34c77b}
  .dots{display:flex;gap:6px;margin-top:4px}
  .dots button{width:8px;height:4px;border-radius:2px;border:0;padding:0;background:rgba(255,255,255,.35);cursor:pointer;transition:width .3s}
  .dots button.on{width:24px;background:var(--orange)}
  .rows{position:relative;flex:1;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#333 transparent;
    mask-image:linear-gradient(180deg,transparent 0,#000 22px)}
</style>
