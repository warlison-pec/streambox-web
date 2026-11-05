<script lang="ts">
  import Nav from './lib/components/Nav.svelte';
  import Toasts from './lib/components/Toasts.svelte';
  import ScreenSaver from './lib/components/ScreenSaver.svelte';
  import Login from './routes/Login.svelte';
  import Home from './routes/Home.svelte';
  import Libraries from './routes/Libraries.svelte';
  import Library from './routes/Library.svelte';
  import Details from './routes/Details.svelte';
  import Search from './routes/Search.svelte';
  import LiveTv from './routes/LiveTv.svelte';
  import Settings from './routes/Settings.svelte';
  import Downloads from './routes/Downloads.svelte';
  import { session, CONFIG } from './lib/session.svelte';
  import { router } from './lib/router.svelte';
  import { idle } from './lib/idle.svelte';
  import { jf, itemTypesFor } from './lib/api/jellyfin';
  import type { Item } from './lib/types';

  let libs = $state<Item[]>([]);
  $effect(() => {
    if (!session.loggedIn) return;
    jf.views().then((v) => (libs = v.filter((x) => itemTypesFor(x.CollectionType)))).catch(() => {});
  });

  // Rotas do player ficam por cima das telas
  const playMatch = $derived(router.match('/play/:id'));
  const liveJf = $derived(router.match('/live/jf/:id'));
  const liveM3u = $derived(router.path === '/live/m3u');
  const inPlayer = $derived(!!playMatch || !!liveJf || liveM3u);

  const page = $derived.by(() => {
    const p = router.path;
    if (p === '/' || inPlayer) return 'home';
    if (p === '/libs') return 'libs';
    if (router.match('/lib/:id')) return 'lib';
    if (router.match('/item/:id')) return 'item';
    if (p === '/search') return 'search';
    if (p === '/live') return 'live';
    if (p === '/settings') return 'settings';
    return 'home';
  });

  // rola para o topo ao trocar de tela
  $effect(() => { router.path; if (!inPlayer) window.scrollTo(0, 0); });

  // Proteção de tela: tempo sem interação (fora do player)
  $effect(() => {
    const touch = () => idle.touch();
    const evs = ['mousemove', 'keydown', 'pointerdown', 'wheel', 'touchstart'];
    evs.forEach((e) => addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => {
      const m = session.settings.screensaver;
      if (m > 0 && session.loggedIn && !inPlayer && !idle.active && !document.hidden && Date.now() - idle.last >= m * 60_000) idle.active = true;
    }, 10_000);
    return () => { evs.forEach((e) => removeEventListener(e, touch)); clearInterval(t); };
  });
</script>

{#if router.path === '/downloads' && CONFIG.downloads}
  <Downloads />
{:else if !session.loggedIn}
  <Login />
{:else}
  <Nav {libs} />
  <main class="main" class:under={inPlayer}>
    {#key page + router.path}
      {#if page === 'home'}<Home />
      {:else if page === 'libs'}<Libraries {libs} />
      {:else if page === 'lib'}<Library id={router.match('/lib/:id')!.id} {libs} />
      {:else if page === 'item'}<Details id={router.match('/item/:id')!.id} />
      {:else if page === 'search'}<Search />
      {:else if page === 'live'}<LiveTv />
      {:else if page === 'settings'}<Settings />
      {/if}
    {/key}
  </main>

  {#if inPlayer}
    <!-- O player (hls.js) só é baixado quando alguém aperta play -->
    {#await import('./player/Player.svelte')}
      <div class="loading-player"><div class="spinner"></div></div>
    {:then { default: Player }}
      {#if playMatch}
        {#key playMatch.id}
          <Player mode="vod" id={playMatch.id} startTicks={router.query.get('start') !== null ? Number(router.query.get('start')) : null} />
        {/key}
      {:else if liveJf}
        {#key liveJf.id}<Player mode="jf-live" id={liveJf.id} name={router.query.get('name') ?? 'Canal'} />{/key}
      {:else if liveM3u}
        {#key router.query.get('u')}<Player mode="m3u" url={router.query.get('u') ?? ''} name={router.query.get('name') ?? 'Canal'} />{/key}
      {/if}
    {/await}
  {/if}

  {#if idle.active && !inPlayer}<ScreenSaver onclose={() => { idle.active = false; idle.touch(); }} />{/if}
{/if}
<Toasts />

<style>
  .main{margin-left:var(--rail);min-height:100vh;padding-bottom:20px}
  .main.under{visibility:hidden}
  .loading-player{position:fixed;inset:0;z-index:100;background:#000;display:grid;place-items:center}
  @media (max-width:900px){.main{margin-left:0;padding-bottom:90px}}
</style>
