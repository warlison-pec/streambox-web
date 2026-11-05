<script lang="ts">
  import Icon from './Icon.svelte';
  import { img, runtime, isSeries } from '../api/jellyfin';
  import { go } from '../router.svelte';
  import { watched } from '../watched.svelte';
  import type { Item } from '../types';
  let { slides }: { slides: Item[] } = $props();
  let i = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const item = $derived(slides[i % Math.max(slides.length, 1)]);
  const restart = () => { clearInterval(timer); timer = setInterval(() => (i = (i + 1) % slides.length), 7000); };
  const goTo = (n: number) => { i = (n + slides.length) % slides.length; restart(); };
  $effect(() => { if (slides.length > 1) restart(); return () => clearInterval(timer); });

  const play = () => (isSeries(item) ? go(`/item/${item.Id}`) : go(`/play/${item.Id}`));
  // swipe no celular
  let x0 = 0;
</script>

{#if item}
<section class="hero" ontouchstart={(e) => (x0 = e.touches[0].clientX)} ontouchend={(e) => { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) goTo(i + (dx < 0 ? 1 : -1)); }}>
  {#each slides as s, n (s.Id)}
    <div class="bg" class:show={n === i} style={`background-image:url("${img.backdrop(s, 1920)}")`}></div>
  {/each}
  <div class="shade"></div>
  <div class="content">
    <div class="eyebrow">{isSeries(item) ? 'Série em destaque' : 'Filme em destaque'}</div>
    <h1>{item.Name}</h1>
    <div class="meta">
      {#if item.ProductionYear}<span>{item.ProductionYear}</span>{/if}
      {#if runtime(item)}<span>{runtime(item)}</span>{/if}
      {#if item.OfficialRating}<span>{item.OfficialRating}</span>{/if}
      {#if item.CommunityRating}<span>★ {item.CommunityRating.toFixed(1)}</span>{/if}
    </div>
    {#if item.Overview}<p>{item.Overview}</p>{/if}
    <div class="actions">
      <button class="btn primary" onclick={play}><Icon name="play" />{(item.UserData?.PlaybackPositionTicks ?? 0) > 0 ? 'Continuar' : 'Assistir'}</button>
      <button class="btn" onclick={() => go(`/item/${item.Id}`)}><Icon name="info" />Detalhes</button>
      <button class="round chk" class:seen={watched.isPlayed(item)} aria-label={watched.isPlayed(item) ? 'Desmarcar visto' : 'Marcar como visto'} onclick={() => watched.toggle(item)}><Icon name="check" /></button>
      {#if slides.length > 1}
        <button class="round" aria-label="Anterior" onclick={() => goTo(i - 1)}><Icon name="left" /></button>
        <button class="round" aria-label="Próximo" onclick={() => goTo(i + 1)}><Icon name="right" /></button>
      {/if}
    </div>
    {#if slides.length > 1}
      <div class="dots">{#each slides as _, n}<button class:on={n === i} aria-label={`Destaque ${n + 1}`} onclick={() => goTo(n)}></button>{/each}</div>
    {/if}
  </div>
</section>
{/if}

<style>
  .hero{position:relative;height:min(62vh,560px);min-height:380px;overflow:hidden}
  .bg{position:absolute;inset:0;background-size:cover;background-position:center 25%;opacity:0;transition:opacity 1.2s ease;transform:scale(1.04)}
  .bg.show{opacity:1;animation:zoom 9s linear both}
  @keyframes zoom{from{transform:scale(1.04)}to{transform:scale(1.12)}}
  .shade{position:absolute;inset:0;background:linear-gradient(90deg,var(--black) 0%,rgba(10,10,10,.75) 40%,transparent 75%),linear-gradient(0deg,var(--black) 0%,transparent 45%)}
  .content{position:absolute;left:var(--pad);bottom:34px;max-width:640px;display:flex;flex-direction:column;gap:10px}
  h1{font-size:clamp(28px,4vw,48px);font-weight:800;line-height:1.08}
  .meta{display:flex;gap:14px;color:var(--muted);font-size:14px}
  p{margin:0;color:#cfcfcf;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px}
  .round{width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center;cursor:pointer}
  .round:hover{background:var(--orange);color:#000}
  .round.seen{background:#34c77b;color:#000}
  .dots{display:flex;gap:6px;margin-top:6px}
  .dots button{width:8px;height:4px;border-radius:2px;border:0;padding:0;background:rgba(255,255,255,.35);cursor:pointer;transition:width .3s}
  .dots button.on{width:24px;background:var(--orange)}
  @media (max-width:900px){.hero{height:62vh;min-height:340px}.content{right:var(--pad);bottom:20px}p{-webkit-line-clamp:2}.round:not(.seen):not(.chk){display:none}}
</style>
