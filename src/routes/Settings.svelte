<script lang="ts">
  import { session, SUB_SIZES, SUB_COLORS, SUB_BGS, QUALITIES, CONFIG } from '../lib/session.svelte';
  import { seerr } from '../lib/api/extras';
  import { friendly } from '../lib/api/jellyfin';
  import { toast } from '../lib/toast.svelte';
  import { idle } from '../lib/idle.svelte';

  const S = session.settings;
  let m3u = $state(S.m3u);
  let epg = $state(S.epg);
  let seerrMode = $state<'user' | 'key'>(S.seerrKey ? 'key' : 'user');
  let seerrUser = $state(session.userName);
  let seerrPass = $state('');
  let seerrKey = $state(S.seerrKey);
  let seerrMsg = $state(S.seerrUser ? 'Conectado como ' + S.seerrUser : '');
  let seerrBusy = $state(false);
  const SAVERS: [string, number][] = [['Desligada', 0], ['2 min', 2], ['5 min', 5], ['10 min', 10], ['15 min', 15], ['30 min', 30]];

  const shadow = $derived(S.subBg === 0 ? '0 0 3px #000, 0 0 3px #000, 0 0 3px #000' : S.subBg === 1 ? '2px 2px 4px #000' : 'none');
  const boxBg = $derived(S.subBg === 2 ? 'rgba(0,0,0,.6)' : S.subBg === 3 ? '#000' : 'transparent');

  function saveTv() {
    session.set('m3u', m3u.trim()); session.set('epg', epg.trim());
    toast.show('Lista salva', 'ok');
  }
  async function connectSeerr() {
    seerrBusy = true;
    try {
      let who: string;
      if (seerrMode === 'key') { session.set('seerrKey', seerrKey.trim()); who = await seerr.me(); }
      else { session.set('seerrKey', ''); who = await seerr.login(seerrUser.trim(), seerrPass); }
      session.set('seerrUser', who); seerrPass = '';
      seerrMsg = 'Conectado como ' + who;
    } catch (e) {
      if (seerrMode === 'key') session.set('seerrKey', '');
      session.set('seerrUser', '');
      seerrMsg = 'Falha: ' + friendly(e);
    } finally { seerrBusy = false; }
  }
  function disconnectSeerr() { seerr.logout(); session.set('seerrKey', ''); session.set('seerrUser', ''); seerrMsg = 'Desconectado.'; }
</script>

<div class="page settings">
  <h1 class="page-title">Ajustes</h1>

  <section>
    <h2>Conta</h2>
    <p>Conectado como <b>{session.userName}</b></p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" onclick={() => session.logout()}>Sair</button>
      {#if CONFIG.downloads}<a class="btn" href="#/downloads">Downloads (apps)</a>{/if}
    </div>
  </section>

  <section>
    <h2>Qualidade padrão</h2>
    <div class="chips">{#each QUALITIES as q}<button class="chip" class:on={S.quality === q[1]} onclick={() => session.set('quality', q[1])}>{q[0]}</button>{/each}</div>
  </section>

  <section>
    <h2>Legendas</h2>
    <span class="lbl">Idioma</span>
    <div class="chips">{#each [['por', 'Português'], ['eng', 'Inglês'], ['spa', 'Espanhol']] as l}<button class="chip" class:on={S.subLang === l[0]} onclick={() => session.set('subLang', l[0])}>{l[1]}</button>{/each}</div>
    <div class="preview">
      <span style={`color:${SUB_COLORS[S.subColor][1]};font-size:${22 * SUB_SIZES[S.subSize][1]}px;text-shadow:${shadow};background:${boxBg}`}>Exemplo de legenda no vídeo</span>
    </div>
    <span class="lbl">Tamanho</span>
    <div class="chips">{#each SUB_SIZES as s, i}<button class="chip" class:on={S.subSize === i} onclick={() => session.set('subSize', i)}>{s[0]}</button>{/each}</div>
    <span class="lbl">Cor</span>
    <div class="chips">{#each SUB_COLORS as c, i}<button class="chip" class:on={S.subColor === i} onclick={() => session.set('subColor', i)}>{c[0]}</button>{/each}</div>
    <span class="lbl">Fundo</span>
    <div class="chips">{#each SUB_BGS as b, i}<button class="chip" class:on={S.subBg === i} onclick={() => session.set('subBg', i)}>{b}</button>{/each}</div>
  </section>

  <section>
    <h2>Tela inicial</h2>
    <p class="muted">Esconde dos destaques, da Minha lista e de "Adicionados em…" os filmes e séries que você já assistiu.</p>
    <span class="lbl">Ocultar assistidos</span>
    <div class="chips">
      <button class="chip" class:on={S.hideWatched} onclick={() => session.set('hideWatched', true)}>Ligado</button>
      <button class="chip" class:on={!S.hideWatched} onclick={() => session.set('hideWatched', false)}>Desligado</button>
    </div>
  </section>

  <section>
    <h2>Proteção de tela</h2>
    <p class="muted">Mostra imagens do catálogo quando a página fica parada (sem nada tocando).</p>
    <div class="chips">{#each SAVERS as s}<button class="chip" class:on={S.screensaver === s[1]} onclick={() => session.set('screensaver', s[1])}>{s[0]}</button>{/each}</div>
    <button class="btn sm" onclick={() => (idle.active = true)}>Ver agora</button>
  </section>

  {#if CONFIG.seerr}
  <section>
    <h2>Seerr / Jellyseerr</h2>
    <p class="muted">Ativa a seção "Pedir no Seerr" na busca.</p>
    <div class="chips">
      <button class="chip" class:on={seerrMode === 'user'} onclick={() => (seerrMode = 'user')}>Conta do Jellyfin</button>
      <button class="chip" class:on={seerrMode === 'key'} onclick={() => (seerrMode = 'key')}>Chave de API</button>
    </div>
    {#if seerrMode === 'user'}
      <div class="two">
        <input class="input" placeholder="Usuário" bind:value={seerrUser} />
        <input class="input" type="password" placeholder="Senha" bind:value={seerrPass} />
      </div>
    {:else}
      <input class="input" placeholder="Chave de API (Seerr → Configurações → Geral)" bind:value={seerrKey} />
      <p class="note">Com a chave, todos os pedidos saem como administrador do Seerr.</p>
    {/if}
    <div class="chips">
      <button class="btn primary sm" disabled={seerrBusy} onclick={connectSeerr}>{seerrBusy ? 'Conectando…' : 'Conectar'}</button>
      {#if S.seerrUser}<button class="btn sm" onclick={disconnectSeerr}>Desconectar</button>{/if}
    </div>
    {#if seerrMsg}<p class={S.seerrUser ? 'ok' : 'bad'}>{seerrMsg}</p>{/if}
  </section>
  {/if}

  <section>
    <h2>TV ao vivo · Minha lista (opcional)</h2>
    <p class="muted">Lista M3U de canais e guia EPG/XMLTV (.xml ou .xml.gz). Os canais passam pelo servidor para tocar no navegador.</p>
    <input class="input" placeholder="URL da lista M3U" bind:value={m3u} />
    <input class="input" placeholder="URL do guia EPG (opcional)" bind:value={epg} />
    <div class="chips">
      <button class="btn primary sm" onclick={saveTv}>Salvar</button>
      <button class="btn sm" onclick={() => { m3u = ''; epg = ''; saveTv(); }}>Remover</button>
    </div>
  </section>
</div>

<style>
  .settings section{max-width:760px;display:flex;flex-direction:column;gap:12px;padding:22px 0;border-bottom:1px solid #1f1f1f}
  h2{font-size:20px;font-weight:700}
  p{margin:0}
  .lbl{font-size:13px;color:var(--muted);font-weight:600;margin-top:4px}
  .preview{height:130px;border-radius:12px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:16px;
    background:linear-gradient(135deg,#3a4a5a,#1b2430 50%,#5a4636)}
  .preview span{font-weight:700;padding:2px 8px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .settings .btn{align-self:flex-start}
</style>
