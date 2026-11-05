<script lang="ts">
  import Icon from './Icon.svelte';
  import { router } from '../router.svelte';
  import type { Item } from '../types';
  let { libs }: { libs: Item[] } = $props();

  const iconFor = (t?: string) => (t === 'movies' ? 'movie' : t === 'tvshows' ? 'tv' : t === 'boxsets' ? 'library' : 'folder');
  const active = (href: string) => {
    const p = router.path;
    if (href === '#/') return p === '/';
    return ('#' + p).startsWith(href);
  };
</script>

<!-- Menu lateral (telas largas) -->
<nav class="rail">
  <a class="logo" href="#/" aria-label="Início"><span>SB</span></a>
  <a href="#/" class:on={active('#/')}><Icon name="home" /><small>Início</small></a>
  {#each libs as l (l.Id)}
    <a href={`#/lib/${l.Id}`} class:on={active(`#/lib/${l.Id}`)} title={l.Name}><Icon name={iconFor(l.CollectionType)} /><small>{l.Name}</small></a>
  {/each}
  <a href="#/live" class:on={active('#/live')}><Icon name="live" /><small>TV ao vivo</small></a>
  <a href="#/search" class:on={active('#/search')}><Icon name="search" /><small>Buscar</small></a>
  <a href="#/settings" class:on={active('#/settings')}><Icon name="settings" /><small>Ajustes</small></a>
</nav>

<!-- Barra inferior (celular) -->
<nav class="bar">
  <a href="#/" class:on={active('#/')}><Icon name="home" /><small>Início</small></a>
  <a href="#/libs" class:on={active('#/libs') || active('#/lib/')}><Icon name="library" /><small>Bibliotecas</small></a>
  <a href="#/live" class:on={active('#/live')}><Icon name="live" /><small>Ao vivo</small></a>
  <a href="#/search" class:on={active('#/search')}><Icon name="search" /><small>Buscar</small></a>
  <a href="#/settings" class:on={active('#/settings')}><Icon name="settings" /><small>Ajustes</small></a>
</nav>

<style>
  .rail{position:fixed;inset:0 auto 0 0;width:var(--rail);background:var(--surface);display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 0;overflow-y:auto;z-index:20;scrollbar-width:none}
  .logo{width:46px;height:46px;border-radius:13px;background:var(--orange);display:grid;place-items:center;margin-bottom:18px;color:#000;font-weight:800}
  .rail a:not(.logo){width:80px;padding:10px 4px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--muted);transition:background .2s,color .2s}
  .rail a:not(.logo):hover{background:var(--surface2);color:var(--text)}
  .rail a.on{color:var(--orange);background:rgba(255,122,0,.14)}
  .rail small{font-size:11px;font-weight:600;text-align:center;line-height:1.2;max-width:76px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .bar{display:none}
  @media (max-width:900px){
    .rail{display:none}
    .bar{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(20,20,20,.96);backdrop-filter:blur(10px);
      padding:6px 6px calc(6px + env(safe-area-inset-bottom));border-top:1px solid #222}
    .bar a{display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--muted);padding:6px 0;border-radius:10px}
    .bar a.on{color:var(--orange)}
    .bar small{font-size:11px}
  }
</style>
