<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="fbar" role="toolbar" aria-label="Filtros">
  <span class="fl"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z"/></svg>FILTROS</span>
  {@render children()}
</div>

<style>
  .fbar{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:12px 0 18px}
  .fl{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:13px;font-weight:800;letter-spacing:.04em;margin-right:6px}
</style>
