// Estado "assistido" com resposta imediata: guarda a escolha enquanto o servidor confirma.
import { jf, friendly } from './api/jellyfin';
import { toast } from './toast.svelte';
import type { Item } from './types';

class Watched {
  overrides = $state<Record<string, boolean>>({});
  /** Sobe a cada alteração: telas com cache (Início) recarregam. */
  version = $state(0);

  isPlayed(item: Item): boolean {
    return this.overrides[item.Id] ?? !!item.UserData?.Played;
  }

  async set(item: Item, played: boolean, children: Item[] = []): Promise<boolean> {
    const before = { ...this.overrides };
    this.overrides[item.Id] = played;
    for (const c of children) this.overrides[c.Id] = played;
    try {
      await jf.setPlayed(item.Id, played);
      this.version++;
      toast.show(played ? 'Marcado como assistido' : 'Marcado como não assistido', 'ok', 2500);
      return true;
    } catch (e) {
      this.overrides = before;
      toast.show('Não foi possível atualizar: ' + friendly(e), 'bad');
      return false;
    }
  }

  toggle(item: Item, children: Item[] = []) {
    return this.set(item, !this.isPlayed(item), children);
  }
}

export const watched = new Watched();
