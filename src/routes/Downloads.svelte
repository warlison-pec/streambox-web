<script lang="ts">
  // Página pública: lista os arquivos da pasta de downloads do servidor (índice JSON do nginx).
  import Icon from '../lib/components/Icon.svelte';
  import { CONFIG, session } from '../lib/session.svelte';
  import { router, go } from '../lib/router.svelte';

  type Entry = { name: string; type: 'file' | 'directory'; mtime: string; size?: number };
  let list = $state<Entry[] | null>(null);
  let error = $state('');

  // subpasta atual (?p=Android/TV), sem ".." nem barras soltas
  const sub = $derived((router.query.get('p') ?? '').split('/').filter((x) => x && x !== '.' && x !== '..').join('/'));
  const base = $derived(CONFIG.downloads + (sub ? sub.split('/').map(encodeURIComponent).join('/') + '/' : ''));

  $effect(() => {
    const url = base;
    list = null; error = '';
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Entry[]) => {
        if (url !== base) return;
        list = d.filter((e) => !e.name.startsWith('.'))
          .sort((a, b) => (a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : Date.parse(b.mtime) - Date.parse(a.mtime)));
      })
      .catch((s) => { error = s === 404 ? 'A pasta de downloads ainda não foi configurada no servidor.' : 'Não foi possível carregar a lista de arquivos.'; list = []; });
  });

  const ext = (n: string) => (n.includes('.') ? n.split('.').pop()!.toLowerCase() : '');
  const icon = (e: Entry) => (e.type === 'directory' ? 'folder' : ext(e.name) === 'apk' ? 'android' : 'file');
  const kind = (e: Entry) => {
    const x = ext(e.name);
    return x === 'apk' ? 'App Android (celular e TV box)' : x === 'exe' || x === 'msi' ? 'Programa para Windows'
      : x === 'zip' || x === '7z' || x === 'rar' ? 'Arquivo compactado' : x === 'pdf' ? 'Documento PDF' : x ? x.toUpperCase() : 'Arquivo';
  };
  const size = (b = 0) => (b >= 1 << 30 ? (b / (1 << 30)).toFixed(1) + ' GB' : b >= 1 << 20 ? (b / (1 << 20)).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const when = (m: string) => new Date(m).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const open = (e: Entry) => go('/downloads?p=' + encodeURIComponent((sub ? sub + '/' : '') + e.name));
  const up = () => go('/downloads' + (sub.includes('/') ? '?p=' + encodeURIComponent(sub.split('/').slice(0, -1).join('/')) : ''));
  const hasApk = $derived(!!list?.some((e) => ext(e.name) === 'apk'));
</script>

<div class="dl">
  <header>
    <a class="brand" href="#/"><span class="logo">SB</span> {CONFIG.title}</a>
    <a class="btn" href="#/">{session.loggedIn ? 'Voltar ao app' : 'Entrar'}</a>
  </header>

  <section class="intro">
    <span class="eyebrow">Downloads</span>
    <h1>Leve o {CONFIG.title} para<br /><em>todas as telas.</em></h1>
    <p>Apps para celular, TV box e outros programas oficiais. Baixe sempre por aqui para ter a versão mais recente.</p>
  </section>

  {#if sub}
    <button class="crumb" onclick={up}><Icon name="back" size={18} /> {sub}</button>
  {/if}

  {#if list === null}
    <div class="center"><div class="spinner"></div></div>
  {:else if error}
    <p class="muted">{error}</p>
  {:else if !list.length}
    <p class="muted">Nenhum arquivo disponível no momento.</p>
  {:else}
    <div class="files">
      {#each list as e, n (e.name)}
        {#if e.type === 'directory'}
          <button class="file" onclick={() => open(e)}>
            <span class="ic"><Icon name="folder" size={28} /></span>
            <span class="meta"><b>{e.name}</b><small>Pasta</small></span>
            <span class="go"><Icon name="right" /></span>
          </button>
        {:else}
          <a class="file" class:new={n === list.findIndex((x) => x.type === 'file')} href={base + encodeURIComponent(e.name)} download>
            <span class="ic"><Icon name={icon(e)} size={28} /></span>
            <span class="meta"><b>{e.name}</b><small>{kind(e)} · {size(e.size)} · {when(e.mtime)}</small></span>
            <span class="go"><Icon name="download" /> Baixar</span>
          </a>
        {/if}
      {/each}
    </div>
  {/if}

  {#if hasApk}
    <section class="howto">
      <h2>Como instalar o app Android</h2>
      <ol>
        <li>Baixe o arquivo <b>.apk</b> no celular ou na TV box (na TV, o app <b>Downloader</b> facilita: digite o endereço desta página).</li>
        <li>Abra o arquivo. Se pedir, permita <b>"Instalar apps desconhecidos"</b> para o navegador ou gerenciador de arquivos.</li>
        <li>Toque em <b>Instalar</b> e entre com o mesmo usuário do Jellyfin.</li>
      </ol>
    </section>
  {/if}

  {#if CONFIG.whatsapp}
    <a class="help" href={`https://wa.me/${CONFIG.whatsapp}`} target="_blank" rel="noopener">
      <Icon name="chat" /> Dúvidas ou pedido de acesso: WhatsApp {CONFIG.whatsappLabel}
    </a>
  {/if}
</div>

<style>
  .dl{max-width:980px;margin:0 auto;padding:28px 24px 60px;min-height:100vh}
  header{display:flex;justify-content:space-between;align-items:center;gap:12px}
  .brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:18px;color:inherit;text-decoration:none}
  .logo{width:40px;height:40px;border-radius:11px;background:var(--orange);color:#000;display:grid;place-items:center;font-weight:800;font-size:14px}
  .intro{position:relative;margin:48px 0 34px}
  .intro::before{content:"";position:absolute;width:420px;height:420px;left:-180px;top:-200px;border-radius:50%;background:radial-gradient(circle,rgba(255,122,0,.22),transparent 65%);pointer-events:none;z-index:-1}
  .eyebrow{color:var(--orange);font-weight:800;letter-spacing:2px;font-size:12px;text-transform:uppercase}
  h1{font-size:clamp(30px,4.4vw,48px);line-height:1.06;font-weight:800;margin:10px 0 12px}
  h1 em{font-style:normal;color:var(--orange)}
  .intro p{color:#bdbdbd;max-width:560px}
  .crumb{display:inline-flex;align-items:center;gap:8px;border:0;background:var(--surface2);color:inherit;padding:8px 14px;border-radius:999px;margin-bottom:16px;cursor:pointer;font:inherit}
  .files{display:flex;flex-direction:column;gap:10px}
  .file{display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:16px;background:var(--surface2);border:1px solid #232323;color:inherit;text-decoration:none;text-align:left;font:inherit;cursor:pointer;transition:border-color .2s,transform .2s}
  .file:hover,.file:focus-visible{border-color:var(--orange);transform:translateY(-1px)}
  .file.new{border-color:rgba(255,122,0,.55);background:linear-gradient(90deg,#1d1307,var(--surface2))}
  .ic{width:52px;height:52px;flex:none;border-radius:14px;display:grid;place-items:center;background:rgba(255,122,0,.14);color:var(--orange)}
  .meta{flex:1;min-width:0}
  .meta b{display:block;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .meta small{display:block;color:#9a9a9a;margin-top:3px}
  .go{display:flex;align-items:center;gap:6px;flex:none;background:var(--orange);color:#000;font-weight:700;padding:9px 14px;border-radius:10px}
  button.file .go{background:transparent;color:#9a9a9a;padding:0}
  .howto{margin-top:34px;padding:22px 24px;border-radius:16px;background:var(--surface2)}
  .howto h2{font-size:18px;margin-bottom:10px}
  .howto ol{padding-left:20px;display:flex;flex-direction:column;gap:8px;color:#cfcfcf}
  .help{display:inline-flex;align-items:center;gap:10px;margin-top:26px;color:var(--orange);text-decoration:none;font-weight:600}
  .center{display:grid;place-items:center;padding:40px}
  @media (max-width:600px){.go{padding:9px 10px;font-size:0;gap:0}.go :global(svg){font-size:initial}.file{padding:14px}.ic{width:44px;height:44px}}
</style>
