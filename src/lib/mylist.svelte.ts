// "Minha Lista" (favoritos do Jellyfin) com resposta imediata enquanto o servidor confirma.
import { jf, friendly } from './api/jellyfin';
import { toast } from './toast.svelte';
import type { Item } from './types';

class MyList {
  overrides = $state<Record<string, boolean>>({});
  /** Sobe a cada alteração: a tela Início recarrega a fileira. */
  version = $state(0);

  has(item: Item): boolean {
    return this.overrides[item.Id] ?? !!item.UserData?.IsFavorite;
  }

  async toggle(item: Item): Promise<boolean> {
    const on = !this.has(item);
    this.overrides[item.Id] = on;
    try {
      await jf.setFavorite(item.Id, on);
      this.version++;
      toast.show(on ? 'Adicionado à Minha Lista' : 'Removido da Minha Lista', 'ok', 2500);
      return true;
    } catch (e) {
      delete this.overrides[item.Id];
      toast.show('Não foi possível atualizar: ' + friendly(e), 'bad');
      return false;
    }
  }
}

export const myList = new MyList();
