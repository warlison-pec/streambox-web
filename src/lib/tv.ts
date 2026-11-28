// Modo TV (Samsung Tizen e outras TVs): controle remoto no lugar do mouse.
// - Liga no build /tv/ (app da TV) ou quando o navegador é de uma TV.
// - As setas movem o foco para o item mais próximo naquela direção; OK abre; Voltar volta.
// - As teclas do controle Samsung (códigos próprios) viram as teclas que o site já entende.
// - Campos de texto só abrem o teclado da TV com OK (senão ele aparece a cada passada do foco).
import { router, back } from './router.svelte';
import { toast } from './toast.svelte';
import './tv.css';

const TV_UA = /Tizen|SMART-TV|SmartTV|Web0S|webOS|NetCast|HbbTV|BRAVIA|VIDAA/i;

export const isTv: boolean = (() => {
  try {
    if (import.meta.env.MODE === 'tv') return true;
    if (new URLSearchParams(location.search).get('tv') === '1') sessionStorage.setItem('sb.tv', '1');
    return sessionStorage.getItem('sb.tv') === '1' || TV_UA.test(navigator.userAgent);
  } catch {
    return TV_UA.test(navigator.userAgent);
  }
})();

// Códigos das teclas do controle (Tizen) -> tecla que o site já trata
const KEYS: Record<number, string> = {
  10009: 'Escape',            // Voltar
  413: 'Escape',              // Stop
  415: ' ', 19: ' ', 10252: ' ', // Play, Pause, Play/Pause
  417: 'ArrowRight',          // Avançar
  412: 'ArrowLeft',           // Voltar o vídeo
  427: 'ChannelUp', 428: 'ChannelDown',
  10190: 'LastChannel',       // Canal anterior
  457: 'Info', 10073: 'Guide', // Info, Lista de canais
  403: 'c',                   // botão vermelho: legendas
  10232: 'MediaTrackPrevious', 10233: 'MediaTrackNext',
};
const TIZEN_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
  'MediaTrackPrevious', 'MediaTrackNext', 'ChannelUp', 'ChannelDown', 'ChannelList', 'PreviousChannel', 'Info',
  'ColorF0Red', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const inPlayer = () => router.path.startsWith('/play/') || router.path.startsWith('/live/jf/') || router.path === '/live/m3u';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])';
const POPUP = '[role=dialog],[role=menu],[role=listbox],[aria-modal=true],.menu,.popover,.sheet,.modal';

function shown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  let e: Element | null = el;
  while (e && e !== document.body) {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    e = e.parentElement;
  }
  return true;
}

function candidates(scope: ParentNode = document): HTMLElement[] {
  // Alvos minúsculos (as bolinhas do carrossel) ficam fora: na TV atrapalham mais do que ajudam
  return (Array.from(scope.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 12 && r.height >= 12 && shown(el);
  });
}

const isText = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range|color|file|reset)$/i.test((el as HTMLInputElement).type)));

/** Foca sem abrir o teclado da TV em campos de texto (o OK abre). */
function focusEl(el: HTMLElement) {
  if (isText(el) && !el.readOnly) { el.readOnly = true; el.dataset.tvro = '1'; }
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  const anyEl = el as HTMLElement & { scrollIntoViewIfNeeded?: (center?: boolean) => void };
  if (anyEl.scrollIntoViewIfNeeded) anyEl.scrollIntoViewIfNeeded(true);
  else el.scrollIntoView({ block: 'center', inline: 'nearest' });
}

type Dir = 'up' | 'down' | 'left' | 'right';

/** O item mais próximo na direção, preferindo os alinhados com o atual. */
function nearest(from: DOMRect, dir: Dir, list: HTMLElement[], current: Element | null): HTMLElement | null {
  let best: HTMLElement | null = null, bestScore = Infinity;
  const cx = from.left + from.width / 2, cy = from.top + from.height / 2;
  for (const el of list) {
    if (el === current || el.contains(current)) continue;
    const r = el.getBoundingClientRect();
    let gap: number, side: number;
    // Está mesmo naquela direção? (com folga: o item focado cresce um pouco com o zoom do foco)
    const mx = r.left + r.width / 2, my = r.top + r.height / 2;
    if (dir === 'right') { if (!(r.left >= from.right - 4 || (mx > cx + 8 && r.right > from.right + 4))) continue; gap = Math.max(0, r.left - from.right); side = Math.max(0, r.top - from.bottom, from.top - r.bottom); }
    else if (dir === 'left') { if (!(r.right <= from.left + 4 || (mx < cx - 8 && r.left < from.left - 4))) continue; gap = Math.max(0, from.left - r.right); side = Math.max(0, r.top - from.bottom, from.top - r.bottom); }
    else if (dir === 'down') { if (!(r.top >= from.bottom - 4 || (my > cy + 8 && r.bottom > from.bottom + 4))) continue; gap = Math.max(0, r.top - from.bottom); side = Math.max(0, r.left - from.right, from.left - r.right); }
    else { if (!(r.bottom <= from.top + 4 || (my < cy - 8 && r.top < from.top - 4))) continue; gap = Math.max(0, from.top - r.bottom); side = Math.max(0, r.left - from.right, from.left - r.right); }
    // alinhado no outro eixo pesa muito mais (fileiras e colunas)
    const score = gap + side * 3 + (side > 0 ? 400 : 0);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

/** Primeiro item da tela (conteúdo antes do menu). */
function firstInMain(): HTMLElement | null {
  const popup = document.querySelector(POPUP);
  const scope = (popup && shown(popup) ? popup : document.querySelector('main')) || document;
  const list = candidates(scope).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  });
  list.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return Math.round(ra.top / 20) - Math.round(rb.top / 20) || ra.left - rb.left;
  });
  return list[0] ?? candidates(document)[0] ?? null;
}

function move(dir: Dir): boolean {
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || cur === document.body || !shown(cur)) {
    const f = firstInMain();
    if (f) { focusEl(f); return true; }
    return false;
  }
  // Dentro de um menu aberto, o foco fica nele
  const popup = cur.closest(POPUP);
  const list = candidates(popup ?? document);
  const next = nearest(cur.getBoundingClientRect(), dir, list, cur);
  if (next) { focusEl(next); return true; }
  return false;
}

function onKeyCapture(e: KeyboardEvent) {
  // Tecla própria da TV: troca pela equivalente e manda de novo
  const mapped = KEYS[e.keyCode];
  if (mapped && e.key !== mapped && !(e as KeyboardEvent & { tvMapped?: boolean }).tvMapped) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const ev = new KeyboardEvent('keydown', { key: mapped, bubbles: true, cancelable: true });
    (ev as KeyboardEvent & { tvMapped?: boolean }).tvMapped = true;
    (e.target ?? document).dispatchEvent(ev);
  }
}

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || inPlayer()) return;      // o player e os menus já trataram
  const el = document.activeElement as HTMLElement | null;
  const typing = isText(el) && !el.readOnly;
  switch (e.key) {
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
      if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;   // move o cursor do texto
      if (typing) { (el as HTMLInputElement).readOnly = true; el!.dataset.tvro = '1'; }
      const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[e.key];
      if (move(dir)) e.preventDefault();
      return;
    }
    case 'Enter':
      if (isText(el) && el.readOnly && el.dataset.tvro) {    // OK num campo: abre o teclado
        e.preventDefault();
        el.readOnly = false;
        el.blur(); el.focus();
        return;
      }
      if (el && el !== document.body && el.tagName !== 'BUTTON' && el.tagName !== 'A' && el.tagName !== 'SELECT' && !isText(el)) {
        e.preventDefault();
        el.click();
      }
      return;
    case 'Escape': case 'Backspace': {
      if (typing) { e.preventDefault(); (el as HTMLInputElement).readOnly = true; el!.dataset.tvro = '1'; return; }
      if (e.key === 'Backspace' && isText(el)) return;
      e.preventDefault();
      // Menu aberto: o Voltar só fecha o menu (cada um fecha com o próprio Escape)
      if (Array.from(document.querySelectorAll(POPUP)).some(shown)) return;
      if (router.path !== '/') back();
      else askExit();                 // Voltar duas vezes no Início pergunta se quer fechar o app da TV
      return;
    }
  }
}

type TizenApp = { tizen?: { application?: { getCurrentApplication(): { exit(): void } } } };
const canExit = () => !!(window as unknown as TizenApp).tizen?.application;

/** Fecha o app da TV (só funciona dentro do app instalado). */
function exitApp() {
  try { (window as unknown as TizenApp).tizen?.application?.getCurrentApplication().exit(); }
  catch { /* navegador comum: não faz nada */ }
}

let lastBack = 0;
/** 1º Voltar no Início avisa; o 2º (em até 2,5 s) pergunta se quer fechar. */
function askExit() {
  if (!canExit()) return;                       // no navegador não há o que fechar
  const now = Date.now();
  if (now - lastBack > 2500) { lastBack = now; toast.show('Aperte Voltar de novo para sair', 'info', 2500); return; }
  lastBack = 0;
  const before = document.activeElement as HTMLElement | null;
  const box = document.createElement('div');
  box.className = 'tv-exit';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = '<div class="tv-exit-card"><h2>Fechar o StreamBox?</h2><p>O app será fechado. Voltar mantém você aqui.</p>' +
    '<div class="tv-exit-actions"><button class="btn" data-a="stay">Continuar</button><button class="btn primary" data-a="exit">Sair</button></div></div>';
  const close = () => {
    box.removeEventListener('keydown', onBoxKey);
    box.remove();
    if (before && document.contains(before)) focusEl(before);
  };
  const onBoxKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  box.addEventListener('keydown', onBoxKey);
  box.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.getAttribute('data-a');
    if (a === 'exit') exitApp();
    else if (a === 'stay' || e.target === box) close();
  });
  document.body.appendChild(box);
  // OK já confirma: a pessoa apertou Voltar duas vezes de propósito
  const sair = box.querySelector('[data-a=exit]') as HTMLElement | null;
  if (sair) focusEl(sair);
}

/** Ao trocar de tela, leva o foco para o começo do conteúdo. */
function focusOnRoute() {
  let tries = 0;
  const t = setInterval(() => {
    const a = document.activeElement;
    if (inPlayer() || (a && a !== document.body && shown(a) && a.closest('main'))) { clearInterval(t); return; }
    const f = firstInMain();
    if (f && f.closest('main')) { focusEl(f); clearInterval(t); }
    if (++tries > 20) clearInterval(t);
  }, 250);
}

export function initTv() {
  if (!isTv) return;
  document.documentElement.classList.add('tv');
  // gap em flex só existe a partir do Chromium 84: sem ele, o CSS da TV usa margens no lugar
  try {
    const d = document.createElement('div');
    d.style.display = 'flex'; d.style.flexDirection = 'column'; d.style.rowGap = '1px';
    d.appendChild(document.createElement('div')); d.appendChild(document.createElement('div'));
    document.body.appendChild(d);
    if (d.scrollHeight !== 1) document.documentElement.classList.add('no-flexgap');
    d.remove();
  } catch { /* sem body ainda */ }
  // Registra as teclas de mídia quando a API da TV está disponível (app instalado)
  try {
    const t = (window as unknown as { tizen?: { tvinputdevice?: { registerKey(k: string): void } } }).tizen;
    for (const k of TIZEN_KEYS) { try { t?.tvinputdevice?.registerKey(k); } catch { /* tecla não existe neste modelo */ } }
  } catch { /* fora da TV */ }
  addEventListener('keydown', onKeyCapture, true);
  document.addEventListener('keydown', onKey);
  document.addEventListener('focusout', (e) => {
    const el = e.target as HTMLElement;
    if (isText(el) && el.dataset.tvro) { el.readOnly = false; delete el.dataset.tvro; }
  });
  addEventListener('hashchange', focusOnRoute);
  focusOnRoute();
  // Sem nada focado (depois do login, de fechar um menu…): o foco volta para o começo da tela
  setInterval(() => {
    const a = document.activeElement;
    if (inPlayer() || document.hidden || (a && a !== document.body && shown(a))) return;
    const f = firstInMain();
    if (f && (f.closest('main') || f.closest(POPUP))) focusEl(f);   // espera o conteúdo carregar (não cai no menu)
  }, 1000);
}
