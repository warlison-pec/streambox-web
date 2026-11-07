<script lang="ts">
  import MediaCard from '../lib/components/MediaCard.svelte';
  import { jf, img, progress, itemTypesFor, friendly } from '../lib/api/jellyfin';
  import { go } from '../lib/router.svelte';
  import type { Item } from '../lib/types';
  import { fmt } from '../lib/util';
  import { untrack } from 'svelte';
  import { ANIME, DORAMA, matches } from '../lib/categories';
  import FilterBar from '../lib/components/FilterBar.svelte';
  import FilterMenu from '../lib/components/FilterMenu.svelte';

  let { id, libs }: { id: string; libs: Item[] } = $props();
  const SORTS: [string, string, boolean][] = [
    ['A–Z', 'SortName', false], ['Adicionados', 'DateCreated', true], ['Lançamento', 'PremiereDate,ProductionYear', true], ['Avaliação', 'CommunityRating', true],
  ];
  // Filtro de ano: chave → anos para o Jellyfin
  const NOW = new Date().getFullYear();
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i).join(',');
  const decade = (d: number) => `Anos ${d >= 2000 ? d : d % 100}`;
  const DEC = Math.floor(NOW / 10) * 10;
  const YEARS: [string, string, string][] = [
    ['', 'Todos', ''], ...[0, 1, 2].map((k): [string, string, string] => [String(NOW - k), String(NOW - k), String(NOW - k)]),
    [`d${DEC}`, decade(DEC), span(DEC, NOW)],
    ...Array.from({ length: (DEC - 1950) / 10 }, (_, k) => DEC - 10 * (k + 1)).map((d): [string, string, string] => [`d${d}`, decade(d), span(d, d + 9)]),
    ['old', 'Antes de 1950', span(1900, 1949)],
  ];
  let yearKey = $state('');
  let studio = $state('');
  let studios = $state<Item[]>([]);
  const years = $derived(YEARS.find(([k]) => k === yearKey)?.[2] || undefined);
  const view = $derived(libs.find((l) => l.Id === id));
  let sort = $state(0);
  // '' = todos, ANIME / DORAMA, ou o id de um gênero do Jellyfin
  let filter = $state('');
  let genres = $state<Item[]>([]);
  const types = $derived(itemTypesFor(view?.CollectionType) ?? 'Movie,Series');
  const cats = $derived([
    ['', 'Todos'], [ANIME, 'Anime'], ...(types.includes('Series') ? [[DORAMA, 'Dorama']] : []),
    ...genres.filter((g) => g.Name.toLowerCase() !== 'anime').map((g) => [g.Id, g.Name]),
  ] as [string, string][]);
  let items = $state<Item[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state('');
  let sentinel: HTMLDivElement | undefined = $state();

  let req = 0;          // descarta respostas de uma ordenação/biblioteca anterior
  let done = false;     // já carregou tudo

  async function more(reset = false) {
    if (reset) { req++; done = false; loading = false; }
    if (loading || done) return;
    const my = req;
    loading = true;
    try {
      const [, field, desc] = SORTS[sort];
      if (filter === ANIME || filter === DORAMA) {
        const all = (await jf.libraryAll(id, types, field, desc, years, studio || undefined)).filter((it) => matches(filter, it));
        if (my !== req) return;
        items = all; total = all.length; done = true;
        return;
      }
      const r = await jf.library(id, types, reset ? 0 : items.length, 60, field, desc, filter || undefined, years, studio || undefined);
      if (my !== req) return;
      items = reset ? r.Items : [...items, ...r.Items];
      total = r.TotalRecordCount;
      done = !r.Items.length || items.length >= total;
    } catch (e) { if (my === req) { error = friendly(e); done = true; } }
    finally { if (my === req) loading = false; }
  }

  // Recarrega só quando muda a biblioteca, a ordenação ou o tipo dela
  $effect(() => {
    id; sort; filter; yearKey; studio; view?.CollectionType;
    untrack(() => { items = []; total = 0; error = ''; more(true); });
  });
  // Gêneros da biblioteca (troca de biblioteca volta para "Todos")
  $effect(() => {
    const lib = id, t = types;
    untrack(() => { filter = ''; yearKey = ''; studio = ''; genres = []; studios = []; });
    jf.genres(lib, t).then((g) => { if (lib === id) genres = g; }).catch(() => {});
    jf.studios(lib, t).then((s) => { if (lib === id) studios = s; }).catch(() => {});
  });
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) untrack(() => more()); }, { rootMargin: '800px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });
</script>

<div class="page">
  <h1 class="page-title">{view?.Name ?? 'Biblioteca'}</h1>
  <p class="muted">{total ? fmt(total) + ' títulos' : !loading && (filter || yearKey || studio) ? 'Nenhum título com esses filtros' : ' '}</p>
  <FilterBar>
    <FilterMenu label="Ordenar" options={SORTS.map((s, n): [string, string] => [String(n), s[0]])} value={String(sort)}
      onselect={(k) => (sort = Number(k))} defaultKey="0" alwaysShowValue />
    <FilterMenu label="Ano de lançamento" options={YEARS.map(([k, t]): [string, string] => [k, t])} value={yearKey} onselect={(k) => (yearKey = k)} />
    <FilterMenu label="Gêneros" options={cats} value={filter} onselect={(k) => (filter = k)} />
    {#if studios.length}
      <FilterMenu label="Estúdios" options={[['', 'Todos'], ...studios.map((s): [string, string] => [s.Id, s.Name])]} value={studio} onselect={(k) => (studio = k)} />
    {/if}
    {#if filter || yearKey || studio}<button class="chip clear" onclick={() => { filter = ''; yearKey = ''; studio = ''; }}>Limpar</button>{/if}
  </FilterBar>
  {#if error && !items.length}<p class="bad">{error}</p>{/if}
  <div class="grid">
    {#each items as it (it.Id)}
      <MediaCard title={it.Name} subtitle={String(it.ProductionYear ?? '')} image={img.poster(it)} progress={progress(it)} rating={it.CommunityRating}
        badge={(it.UserData?.UnplayedItemCount ?? 0) > 0 ? String(it.UserData?.UnplayedItemCount) : ''} onclick={() => go(`/item/${it.Id}`)} />
    {/each}
  </div>
  <div bind:this={sentinel} class="center" style="min-height:80px">{#if loading}<div class="spinner"></div>{/if}</div>
</div>

<style>.clear{margin-left:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:24px 18px}
@media (max-width:900px){.grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:18px 12px}}</style>
