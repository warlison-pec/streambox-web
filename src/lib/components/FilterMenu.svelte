<script lang="ts">
  // Botão de filtro compacto: as opções só aparecem no clique (como "Gêneros ⌄").
  let {
    label, options, value, onselect, defaultKey = '', alwaysShowValue = false,
  }: {
    label: string; options: [string, string][]; value: string; onselect: (key: string) => void;
    defaultKey?: string; alwaysShowValue?: boolean;
  } = $props();
  let open = $state(false);
  let box: HTMLDivElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  const active = $derived(value !== defaultKey && !alwaysShowValue);
  const current = $derived(options.find(([k]) => k === value)?.[1]);
  const text = $derived(current && (value !== defaultKey || alwaysShowValue) ? `${label}: ${current}` : label);

  function pick(k: string) { open = false; onselect(k); }
  $effect(() => {
    if (!open) return;
    const close = (e: Event) => { if (box && !box.contains(e.target as Node)) open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { open = false; e.stopPropagation(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc, true);
    // foco na opção escolhida (controle remoto / teclado)
    queueMicrotask(() => (list?.querySelector('.on') as HTMLElement | null ?? list?.querySelector('button') as HTMLElement | null)?.focus());
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc, true); };
  });
  function nav(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = [...(list?.querySelectorAll('button') ?? [])] as HTMLElement[];
    const i = btns.indexOf(document.activeElement as HTMLElement);
    btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    e.preventDefault(); e.stopPropagation();
  }
</script>

<div class="fm" bind:this={box}>
  <button class="fm-btn" class:active class:open aria-haspopup="listbox" aria-expanded={open} onclick={() => (open = !open)}>
    <span>{text}</span>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
  </button>
  {#if open}
    <div class="fm-list" role="listbox" tabindex="-1" bind:this={list} onkeydown={nav}>
      {#each options as [k, t] (k)}
        <button role="option" aria-selected={k === value} class:on={k === value} onclick={() => pick(k)}>
          <span>{t}</span>{#if k === value}<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .fm{position:relative;flex:none}
  .fm-btn{display:inline-flex;align-items:center;gap:4px;height:38px;padding:0 12px;border-radius:99px;border:0;background:transparent;
    color:var(--text);font:inherit;font-size:15px;font-weight:500;cursor:pointer;white-space:nowrap;max-width:320px;transition:background .2s,color .2s}
  .fm-btn span{overflow:hidden;text-overflow:ellipsis}
  .fm-btn:hover,.fm-btn:focus-visible,.fm-btn.open{background:var(--surface2);outline:none}
  .fm-btn:focus-visible{box-shadow:0 0 0 2px var(--orange)}
  .fm-btn.active{color:var(--orange);background:rgba(255,122,0,.14)}
  .fm-list{position:absolute;z-index:40;top:calc(100% + 6px);left:0;min-width:220px;max-width:340px;max-height:min(420px,60vh);overflow:auto;
    padding:6px;border-radius:12px;background:var(--surface2);border:1px solid var(--line, rgba(255,255,255,.08));box-shadow:0 18px 40px -10px #000;
    animation:fmIn .15s ease}
  .fm-list button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:9px 12px;border:0;border-radius:8px;
    background:none;color:var(--text);font:inherit;font-size:14px;text-align:left;cursor:pointer}
  .fm-list button:hover,.fm-list button:focus-visible{background:var(--surface3);outline:none}
  .fm-list button.on{color:var(--orange);font-weight:600}
  @keyframes fmIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
</style>
