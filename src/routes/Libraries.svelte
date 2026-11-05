<script lang="ts">
  import MediaCard from '../lib/components/MediaCard.svelte';
  import { img } from '../lib/api/jellyfin';
  import { go } from '../lib/router.svelte';
  import type { Item } from '../lib/types';
  let { libs }: { libs: Item[] } = $props();
  const label = (t?: string) => (t === 'movies' ? 'Filmes' : t === 'tvshows' ? 'Séries' : t === 'boxsets' ? 'Coleções' : 'Vídeos');
</script>

<div class="page">
  <h1 class="page-title">Bibliotecas</h1>
  <div class="grid">
    {#each libs as l (l.Id)}
      <MediaCard landscape title={l.Name} subtitle={label(l.CollectionType)} image={img.library(l)} onclick={() => go(`/lib/${l.Id}`)} />
    {/each}
  </div>
</div>

<style>.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px;margin-top:20px}</style>
