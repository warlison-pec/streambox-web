// "Minha lista" (favoritos do Jellyfin) com resposta imediata enquanto o servidor confirma.
import { jf, friendly, isEpisode } from './api/jellyfin';
import { toast } from './toast.svelte';
import type { Item } from './types';

class Favorites {
  overrides = $state<Record<string, boolean>>({});
  /** Sobe a cada alteração: o Início recarrega a fileira. */
  version = $state(0);

  /** Episódio entra na lista como a série. */
  target(item: Item): string {
    return isEpisode(item) ? item.SeriesId ?? item.Id : item.Id;
  }

  isFavorite(item: Item): boolean {
    return this.overrides[item.Id] ?? !!item.UserData?.IsFavorite;
  }

  async toggle(item: Item): Promise<boolean> {
    const id = this.target(item);
    const fav = !(this.overrides[id] ?? this.isFavorite(item));
    const before = { ...this.overrides };
    this.overrides[id] = fav;
    this.overrides[item.Id] = fav;
    try {
      await jf.setFavorite(id, fav);
      this.version++;
      toast.show(fav ? 'Adicionado à Minha lista' : 'Removido da Minha lista', 'ok', 2500);
      return true;
    } catch (e) {
      this.overrides = before;
      toast.show('Não foi possível atualizar: ' + friendly(e), 'bad');
      return false;
    }
  }
}

export const favorites = new Favorites();
