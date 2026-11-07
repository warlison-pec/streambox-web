<script lang="ts">
  import { initials } from '../util';
  let {
    title, subtitle = '', image = null, landscape = false, progress = 0, badge = '', width = 0, onclick, played = false, onspot, rating = null,
  }: {
    title: string; subtitle?: string | null; image?: string | null; landscape?: boolean;
    progress?: number; badge?: string | null; width?: number; onclick?: () => void;
    played?: boolean; onspot?: () => void; rating?: number | null;
  } = $props();
  let failed = $state(false);
  let loaded = $state(false);
</script>

<div class="card" class:land={landscape} style={width ? `width:${width}px` : ''}>
  <button class="art" onclick={onclick} aria-label={title} onmouseenter={onspot} onfocus={onspot}>
    <span class="ini">{initials(title)}</span>
    {#if image && !failed}
      <img src={image} alt="" loading="lazy" class:loaded onload={() => (loaded = true)} onerror={() => (failed = true)} />
    {/if}
    {#if badge}<span class="badge">{badge}</span>{/if}
    {#if played}<span class="seen" title="Assistido"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>{/if}
    {#if rating && rating > 0}<span class="rate" class:up={progress > 0}><b>★</b> {rating.toFixed(1)}</span>{/if}
    {#if progress > 0}<span class="prog"><i style={`width:${Math.round(progress * 100)}%`}></i></span>{/if}
  </button>
  <div class="title" title={title}>{title}</div>
  {#if subtitle}<div class="sub">{subtitle}</div>{/if}
</div>

<style>
  .card{display:flex;flex-direction:column;gap:6px;min-width:0;animation:up .4s var(--ease) both}
  .art{position:relative;aspect-ratio:2/3;border-radius:10px;overflow:hidden;border:0;padding:0;cursor:pointer;
    background:linear-gradient(160deg,var(--surface3),var(--surface2));transition:transform .3s var(--ease),box-shadow .3s}
  .land .art{aspect-ratio:16/9}
  .art:hover,.art:focus-visible{transform:scale(1.05);box-shadow:0 0 0 3px var(--orange),0 18px 40px -12px #000;outline:none}
  .ini{position:absolute;inset:0;display:grid;place-items:center;font-size:30px;font-weight:800;color:rgba(255,122,0,.7)}
  img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .4s}
  img.loaded{opacity:1}
  .badge{position:absolute;top:8px;left:8px;background:var(--orange);color:#000;font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px}
  .seen{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;background:var(--orange);color:#000;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.5)}
  .rate{position:absolute;left:8px;bottom:8px;display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;
    background:rgba(0,0,0,.72);border:1px solid rgba(255,201,77,.45);color:#fff;font-size:12px;font-weight:700;backdrop-filter:blur(4px)}
  .rate b{color:#ffc94d;font-weight:400}
  .rate.up{bottom:12px}
  .prog{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(0,0,0,.6)}
  .prog i{display:block;height:100%;background:var(--orange)}
  .title{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sub{font-size:13px;color:var(--muted);margin-top:-4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
