<script lang="ts">
  import { jf, img } from '../api/jellyfin';
  import type { Item } from '../types';
  let { onclose }: { onclose: () => void } = $props();
  let items = $state<Item[]>([]);
  let i = $state(0);
  let now = $state(new Date());

  $effect(() => {
    jf.featured('Movie,Series', 40).then((r) => (items = r.filter((x) => img.backdrop(x)))).catch(() => {});
    const a = setInterval(() => { if (items.length) i = (i + 1) % items.length; }, 9000);
    const b = setInterval(() => (now = new Date()), 20000);
    const close = () => onclose();
    const t = setTimeout(() => {
      addEventListener('keydown', close, { once: true });
      addEventListener('pointerdown', close, { once: true });
      addEventListener('mousemove', close, { once: true });
    }, 600);
    return () => { clearInterval(a); clearInterval(b); clearTimeout(t); removeEventListener('keydown', close); removeEventListener('pointerdown', close); removeEventListener('mousemove', close); };
  });
  const cur = $derived(items[i]);
</script>

<div class="saver">
  {#each items as it, n (it.Id)}
    {#if Math.abs(n - i) <= 1 || (i === 0 && n === items.length - 1)}
      <div class="bg" class:show={n === i} class:alt={n % 2 === 1} style={`background-image:url("${img.backdrop(it, 1920)}")`}></div>
    {/if}
  {/each}
  <div class="shade"></div>
  <div class="clock">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
  {#if cur}
    <div class="info">
      <div class="eyebrow">StreamBox</div>
      <h1>{cur.Name}</h1>
      <div class="muted">{[cur.Type === 'Series' ? 'Série' : 'Filme', cur.ProductionYear, (cur.Genres ?? []).slice(0, 2).join(', ')].filter(Boolean).join('  ·  ')}</div>
      <small>Pressione qualquer tecla ou mova o mouse para voltar</small>
    </div>
  {/if}
</div>

<style>
  .saver{position:fixed;inset:0;z-index:150;background:#000;cursor:none;animation:fade .8s}
  .bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.6s ease}
  .bg.show{opacity:1;animation:kb 11s linear both}
  .bg.alt.show{animation-name:kb2}
  @keyframes kb{from{transform:scale(1.04) translate(-1%,0)}to{transform:scale(1.16) translate(1%,-1%)}}
  @keyframes kb2{from{transform:scale(1.04) translate(1%,0)}to{transform:scale(1.16) translate(-1%,-1%)}}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),transparent 30%,transparent 55%,rgba(0,0,0,.85))}
  .clock{position:absolute;top:40px;right:56px;font-size:48px;font-weight:300}
  .info{position:absolute;left:56px;bottom:56px;max-width:760px;display:flex;flex-direction:column;gap:6px}
  h1{font-size:clamp(30px,4.5vw,52px);font-weight:800}
  small{color:rgba(255,255,255,.45);margin-top:10px}
</style>
