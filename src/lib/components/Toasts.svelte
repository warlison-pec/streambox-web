<script lang="ts">
  import { toast } from '../toast.svelte';
</script>
<div class="toasts">
  {#each toast.list as t (t.id)}<div class="t {t.kind}">{t.text}</div>{/each}
</div>
<style>
  .toasts{position:fixed;right:20px;bottom:20px;z-index:200;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none}
  .t{background:#1e1e1e;border-left:4px solid var(--orange);padding:12px 16px;border-radius:10px;box-shadow:0 10px 30px #000;max-width:420px;animation:up .3s var(--ease)}
  .t.ok{border-color:var(--ok)} .t.bad{border-color:var(--bad)}
  @media (max-width:900px){.toasts{left:16px;right:16px;bottom:84px;align-items:stretch}}
</style>
