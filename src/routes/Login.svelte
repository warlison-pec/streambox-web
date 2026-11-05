<script lang="ts">
  import { jf, friendly } from '../lib/api/jellyfin';
  import { session, CONFIG } from '../lib/session.svelte';
  import { sleep } from '../lib/util';
  import Icon from '../lib/components/Icon.svelte';

  let mode = $state<'quick' | 'pass'>('pass');
  let user = $state(session.userName);
  let pass = $state('');
  let busy = $state(false);
  let error = $state('');
  let code = $state('');
  let server = $state('');
  let polling = 0;

  $effect(() => { jf.publicInfo().then((i) => (server = i.ServerName)).catch(() => (error = 'Servidor Jellyfin indisponível.')); });

  async function submit(e: Event) {
    e.preventDefault();
    busy = true; error = '';
    try {
      const a = await jf.login(user.trim(), pass);
      session.login(a.AccessToken, a.User.Id, a.User.Name);
    } catch (err) { error = friendly(err); } finally { busy = false; }
  }

  async function quick() {
    busy = true; error = ''; code = '';
    const run = ++polling;
    try {
      if (!(await jf.qcEnabled())) { error = 'A conexão rápida está desativada no servidor (Painel → Geral).'; return; }
      const r = await jf.qcInitiate();
      code = r.Code;
      busy = false;
      while (run === polling) {
        await sleep(3000);
        if (run !== polling) return;
        const st = await jf.qcState(r.Secret).catch(() => null);
        if (st?.Authenticated) {
          const a = await jf.qcLogin(r.Secret);
          session.login(a.AccessToken, a.User.Id, a.User.Name);
          return;
        }
      }
    } catch (err) { error = friendly(err); } finally { busy = false; }
  }
  $effect(() => () => { polling++; });
</script>

<div class="login">
  <aside class="art" aria-hidden="true">
    <div class="reels">{#each Array(20) as _}<span></span>{/each}</div>
    <div class="brand"><span class="logo">SB</span> {CONFIG.title}</div>
    <div class="claim"><h1>Filmes, séries e TV<br /><em>num só lugar.</em></h1><p>Entre com sua conta do Jellyfin{server ? ` (${server})` : ''}.</p></div>
  </aside>
  <main>
    <div class="panel">
      <div class="logo big">SB</div>
      <h2>Bem-vindo</h2>
      <p class="muted">Use o mesmo usuário do Jellyfin.</p>
      <div class="chips">
        <button class="chip" class:on={mode === 'pass'} onclick={() => { mode = 'pass'; polling++; code = ''; }}>Usuário e senha</button>
        <button class="chip" class:on={mode === 'quick'} onclick={() => (mode = 'quick')}>Conexão rápida</button>
      </div>
      {#if mode === 'pass'}
        <form onsubmit={submit}>
          <label class="field">Usuário<input class="input" bind:value={user} autocomplete="username" required /></label>
          <label class="field">Senha<input class="input" type="password" bind:value={pass} autocomplete="current-password" /></label>
          <button class="btn primary block" disabled={busy || !user.trim()}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
      {:else if code}
        <div class="code">
          <span class="muted">Seu código</span>
          <strong>{code.match(/.{1,3}/g)?.join(' ')}</strong>
          <span class="muted">Em outro aparelho já conectado ao Jellyfin: perfil → Conexão rápida → digite o código.</span>
          <span class="wait"><i class="spinner"></i> Aguardando autorização…</span>
        </div>
        <button class="btn block" onclick={quick}>Gerar novo código</button>
      {:else}
        <p class="muted">Gere um código e confirme em outro aparelho onde você já está conectado.</p>
        <button class="btn primary block" disabled={busy} onclick={quick}>{busy ? 'Gerando…' : 'Gerar código'}</button>
      {/if}
      {#if error}<p class="bad">{error}</p>{/if}

      {#if CONFIG.whatsapp}
        <a class="contact" href={`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(`Olá! Gostaria de solicitar acesso ao ${CONFIG.title}.`)}`} target="_blank" rel="noopener">
          <span class="ic"><Icon name="chat" /></span>
          <span><b>Não tem acesso?</b><small>Fale com o administrador no WhatsApp{CONFIG.whatsappLabel ? ` · ${CONFIG.whatsappLabel}` : ''}</small></span>
        </a>
      {/if}
      {#if CONFIG.downloads}
        <a class="contact" href="#/downloads">
          <span class="ic"><Icon name="download" /></span>
          <span><b>Downloads</b><small>Apps para celular, TV box e outros programas</small></span>
        </a>
      {/if}
    </div>
  </main>
</div>

<style>
  .login{display:grid;grid-template-columns:1.1fr 1fr;min-height:100vh}
  .art{position:relative;overflow:hidden;background:linear-gradient(140deg,#1a0d00,#0a0a0a 60%);padding:44px;display:flex;flex-direction:column;justify-content:space-between}
  .art::before{content:"";position:absolute;width:600px;height:600px;left:-160px;bottom:-260px;border-radius:50%;background:radial-gradient(circle,rgba(255,122,0,.35),transparent 65%)}
  .reels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:20px;transform:rotate(-10deg) scale(1.3) translateX(10%);opacity:.18}
  .reels span{aspect-ratio:2/3;border-radius:14px;border:1px solid rgba(255,255,255,.15);background:linear-gradient(160deg,rgba(255,255,255,.08),transparent)}
  .reels span:nth-child(3n){background:linear-gradient(160deg,rgba(255,122,0,.35),transparent)}
  .brand,.claim{position:relative}
  .brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:18px}
  .logo{width:40px;height:40px;border-radius:11px;background:var(--orange);color:#000;display:grid;place-items:center;font-weight:800;font-size:14px}
  .logo.big{width:60px;height:60px;border-radius:16px;font-size:20px}
  .claim h1{font-size:clamp(32px,3.6vw,50px);line-height:1.05;font-weight:800}
  .claim em{font-style:normal;color:var(--orange)}
  .claim p{color:#cfcfcf}
  main{display:grid;place-items:center;padding:28px}
  .panel{width:min(420px,100%);display:flex;flex-direction:column;gap:14px}
  h2{font-size:30px;font-weight:800}
  form{display:flex;flex-direction:column;gap:14px}
  .code{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;background:var(--surface2);padding:22px;border-radius:16px}
  .code strong{font-size:44px;color:var(--orange);letter-spacing:6px;font-family:ui-monospace,monospace}
  .wait{display:flex;gap:10px;align-items:center;font-size:14px}
  .wait .spinner{width:16px;height:16px;border-width:2px}
  .contact{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;background:var(--surface2);border:1px solid #262626;color:inherit;text-decoration:none;transition:border-color .2s,background .2s}
  .contact:first-of-type{margin-top:10px}
  .contact:hover,.contact:focus-visible{border-color:var(--orange);background:#1c1206}
  .contact .ic{width:40px;height:40px;flex:none;border-radius:12px;display:grid;place-items:center;background:rgba(255,122,0,.15);color:var(--orange)}
  .contact b{display:block;font-size:15px}
  .contact small{display:block;color:var(--muted, #9a9a9a);font-size:13px;margin-top:2px}
  @media (max-width:860px){.login{grid-template-columns:1fr}.art{display:none}}
</style>
