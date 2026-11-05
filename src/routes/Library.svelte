<script lang="ts">
  import MediaCard from '../lib/components/MediaCard.svelte';
  import { jf, img, progress, itemTypesFor, friendly } from '../lib/api/jellyfin';
  import { go } from '../lib/router.svelte';
  import type { Item } from '../lib/types';
  import { fmt } from '../lib/util';
  import { untrack } from 'svelte';

  let { id, libs }: { id: string; libs: Item[] } = $props();
  const SORTS: [string, string, boolean][] = [
    ['A–Z', 'SortName', false], ['Recentes', 'DateCreated', true], ['Lançamento', 'PremiereDate,ProductionYear', true], ['Avaliação', 'CommunityRating', true],
  ];
  const view = $derived(libs.find((l) => l.Id === id));
  let sort = $state(0);
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
      const r = await jf.library(id, itemTypesFor(view?.CollectionType) ?? 'Movie,Series', reset ? 0 : items.length, 60, field, desc);
      if (my !== req) return;
      items = reset ? r.Items : [...items, ...r.Items];
      total = r.TotalRecordCount;
      done = !r.Items.length || items.length >= total;
    } catch (e) { if (my === req) { error = friendly(e); done = true; } }
    finally { if (my === req) loading = false; }
  }

  // Recarrega só quando muda a biblioteca, a ordenação ou o tipo dela
  $effect(() => {
    id; sort; view?.CollectionType;
    untrack(() => { items = []; total = 0; error = ''; more(true); });
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
  <p class="muted">{total ? fmt(total) + ' títulos' : ' '}</p>
  <div class="chips" style="margin:14px 0 22px">
    {#each SORTS as s, n}<button class="chip" class:on={n === sort} onclick={() => (sort = n)}>{s[0]}</button>{/each}
  </div>
  {#if error && !items.length}<p class="bad">{error}</p>{/if}
  <div class="grid">
    {#each items as it (it.Id)}
      <MediaCard title={it.Name} subtitle={String(it.ProductionYear ?? '')} image={img.poster(it)} progress={progress(it)}
        badge={(it.UserData?.UnplayedItemCount ?? 0) > 0 ? String(it.UserData?.UnplayedItemCount) : ''} onclick={() => go(`/item/${it.Id}`)} />
    {/each}
  </div>
  <div bind:this={sentinel} class="center" style="min-height:80px">{#if loading}<div class="spinner"></div>{/if}</div>
</div>

<style>.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:24px 18px}
@media (max-width:900px){.grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:18px 12px}}</style>
