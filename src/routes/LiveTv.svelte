<script lang="ts">
  import { jf, img, friendly } from '../lib/api/jellyfin';
  import { indexer } from '../lib/api/extras';
  import { session } from '../lib/session.svelte';
  import { go } from '../lib/router.svelte';
  import type { Item, LiveChannel } from '../lib/types';
  import { hhmm } from '../lib/util';

  let tab = $state<'jf' | 'm3u'>('jf');
  let filter = $state('');
  let group = $state('');
  let now = $state(Date.now());
  let jfList = $state<Item[] | null>(null);
  let jfError = $state('');
  let m3u = $state<LiveChannel[] | null>(null);
  let m3uError = $state('');
  let m3uLoading = $state(false);

  $effect(() => {
    jf.liveChannels().then((r) => { jfList = r; if (!r.length && session.settings.m3u) tab = 'm3u'; })
      .catch((e) => { jfList = []; jfError = friendly(e); if (session.settings.m3u) tab = 'm3u'; });
    const t = setInterval(() => (now = Date.now()), 30000);
    return () => clearInterval(t);
  });

  async function loadM3u(force = false) {
    if (!session.settings.m3u) return;
    m3uLoading = true; m3uError = '';
    try { m3u = (await indexer.liveTv(session.settings.m3u, session.settings.epg, force)).channels; }
    catch (e) { m3uError = friendly(e); } finally { m3uLoading = false; }
  }
  $effect(() => { if (tab === 'm3u' && m3u === null) loadM3u(); });

  const parse = (s?: string) => (s ? Date.parse(s.endsWith('Z') ? s : s + 'Z') : NaN);
  const pct = (a: number, b: number) => (b > a ? Math.min(100, Math.max(0, ((now - a) / (b - a)) * 100)) : 0);
  const match = (name: string) => !filter.trim() || name.toLowerCase().includes(filter.trim().toLowerCase());
  const groups = $derived.by(() => {
    const c = new Map<string, number>();
    for (const ch of m3u ?? []) c.set(ch.group, (c.get(ch.group) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  });
  const m3uShown = $derived((m3u ?? []).filter((c) => (!group || c.group === group) && match(c.name)).slice(0, 1500));
  const jfShown = $derived((jfList ?? []).filter((c) => match(c.Name)));
</script>

<div class="page">
  <h1 class="page-title">TV ao vivo</h1>
  <div class="bar">
    <div class="chips">
      <button class="chip" class:on={tab === 'jf'} onclick={() => (tab = 'jf')}>Jellyfin</button>
      <button class="chip" class:on={tab === 'm3u'} onclick={() => (tab = 'm3u')}>Minha lista</button>
    </div>
    <input class="input" placeholder="Filtrar canais…" bind:value={filter} />
  </div>

  {#if tab === 'jf'}
    {#if jfList === null}<div class="center"><div class="spinner"></div></div>
    {:else if !jfList.length}<p class="muted">{jfError ? 'TV ao vivo do Jellyfin indisponível: ' + jfError : 'Nenhum canal configurado no Jellyfin (Painel → TV ao vivo).'}</p>
    {:else}
      <div class="list">
        {#each jfShown as ch (ch.Id)}
          {@const a = parse(ch.CurrentProgram?.StartDate)}
          {@const b = parse(ch.CurrentProgram?.EndDate)}
          <button class="ch" onclick={() => go(`/live/jf/${ch.Id}?name=${encodeURIComponent(ch.Name)}`)}>
            <span class="logo">{ch.Name.slice(0, 2)}{#if img.channel(ch)}<img src={img.channel(ch)} alt="" loading="lazy" />{/if}</span>
            <span class="txt">
              <strong>{[ch.ChannelNumber, ch.Name].filter(Boolean).join('  ')}</strong>
              {#if ch.CurrentProgram}
                <small>Agora: {ch.CurrentProgram.Name}{!isNaN(a) && !isNaN(b) ? `  ·  ${hhmm(a)} – ${hhmm(b)}` : ''}</small>
                <i class="bar2"><b style={`width:${pct(a, b)}%`}></b></i>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  {:else if !session.settings.m3u}
    <div class="empty">
      <h2>Nenhuma lista configurada</h2>
      <p class="muted">Em Ajustes, informe o endereço de uma lista M3U de canais que você tem direito de acessar e, se quiser, de um guia EPG (XMLTV).</p>
      <a class="btn primary" href="#/settings">Abrir Ajustes</a>
    </div>
  {:else if m3u === null || (m3uLoading && !m3u.length)}
    <div class="center"><div class="spinner"></div><p>{m3uError || 'Baixando lista e guia… (a primeira vez pode demorar)'}</p></div>
  {:else}
    <div class="chips groups">
      <button class="chip" class:on={!group} onclick={() => (group = '')}>Todos · {m3u.length}</button>
      {#each groups as [g, n] (g)}<button class="chip" class:on={group === g} onclick={() => (group = g)}>{g} · {n}</button>{/each}
      <button class="chip" onclick={() => loadM3u(true)}>{m3uLoading ? 'Atualizando…' : '↻ Atualizar'}</button>
    </div>
    {#if m3uError}<p class="bad">{m3uError}</p>{/if}
    <div class="list">
      {#each m3uShown as ch (ch.id + ch.url)}
        <button class="ch" onclick={() => go(`/live/m3u?u=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}`)}>
          <span class="logo">{ch.name.slice(0, 2)}{#if ch.logo}<img src={ch.logo} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{/if}</span>
          <span class="txt">
            <strong>{ch.name}</strong>
            {#if ch.now}
              <small>Agora: {ch.now.title}  ·  {hhmm(ch.now.start)} – {hhmm(ch.now.stop)}</small>
              <i class="bar2"><b style={`width:${pct(ch.now.start, ch.now.stop)}%`}></b></i>
            {/if}
            {#if ch.next}<small>Depois: {hhmm(ch.next.start)} {ch.next.title}</small>{/if}
          </span>
        </button>
      {/each}
    </div>
    {#if m3uShown.length >= 1500}<p class="note">Mostrando 1500 canais. Use o filtro ou os grupos.</p>{/if}
  {/if}
</div>

<style>
  .bar{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:14px 0 18px}
  .bar .input{max-width:420px;height:40px}
  .groups{margin-bottom:16px}
  .list{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:10px}
  .ch{display:flex;gap:14px;align-items:center;text-align:left;background:var(--surface);border:0;border-radius:12px;padding:10px;cursor:pointer;transition:background .2s,box-shadow .2s}
  .ch:hover,.ch:focus-visible{background:var(--surface2);box-shadow:0 0 0 2px var(--orange);outline:none}
  .logo{position:relative;width:96px;height:56px;flex:none;border-radius:8px;background:var(--surface3);display:grid;place-items:center;color:var(--orange);font-weight:800;text-transform:uppercase;overflow:hidden}
  .logo img{position:absolute;inset:6px;width:calc(100% - 12px);height:calc(100% - 12px);object-fit:contain;background:var(--surface3)}
  .txt{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
  .txt strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .txt small{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar2{display:block;height:3px;border-radius:2px;background:var(--surface3)} .bar2 b{display:block;height:100%;background:var(--orange)}
  .empty{display:flex;flex-direction:column;gap:12px;align-items:flex-start;max-width:600px}
  @media (max-width:900px){.list{grid-template-columns:1fr}.logo{width:72px;height:44px}}
</style>
