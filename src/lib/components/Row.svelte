<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { title, children }: { title: string; children: Snippet } = $props();
  let scroller: HTMLDivElement;
  const scroll = (dir: number) => scroller.scrollBy({ left: dir * scroller.clientWidth * 0.8, behavior: 'smooth' });
</script>

<section class="row">
  <div class="head">
    <h2>{title}</h2>
    <div class="arrows">
      <button aria-label="Anterior" onclick={() => scroll(-1)}><Icon name="left" /></button>
      <button aria-label="Próximo" onclick={() => scroll(1)}><Icon name="right" /></button>
    </div>
  </div>
  <div class="scroller" bind:this={scroller}>{@render children()}</div>
</section>

<style>
  .row{margin-top:26px}
  .head{display:flex;align-items:center;justify-content:space-between;padding:0 var(--pad)}
  h2{font-size:20px;font-weight:700}
  .arrows{display:flex;gap:6px}
  .arrows button{width:34px;height:34px;border-radius:50%;border:0;background:var(--surface2);display:grid;place-items:center;cursor:pointer}
  .arrows button:hover{background:var(--orange);color:#000}
  .scroller{display:grid;grid-auto-flow:column;grid-auto-columns:max-content;gap:16px;overflow-x:auto;padding:12px var(--pad) 8px;scroll-snap-type:x proximity;scroll-padding-inline:var(--pad);scrollbar-width:none}
  .scroller::-webkit-scrollbar{display:none}
  .scroller > :global(*){scroll-snap-align:start}
  @media (max-width:900px){.arrows{display:none}}
</style>
