// Fileiras do Início que a pessoa pode ligar, desligar e reordenar em Ajustes (como no app Android).
import { session } from './session.svelte';

export const HOME_SECTIONS = ['resume', 'next', 'trending', 'because', 'arrived', 'favorites', 'latest'] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export const SECTION_LABEL: Record<HomeSection, string> = {
  resume: 'Continuar assistindo',
  next: 'Próximos episódios',
  trending: 'Em alta',
  because: 'Para você que assistiu…',
  arrived: 'Seu pedido chegou',
  favorites: 'Minha lista',
  latest: 'Adicionados recentemente',
};

export const SECTION_HINT: Partial<Record<HomeSection, string>> = {
  trending: 'Filmes e séries em alta agora (tendências do TMDB, via Seerr) que já estão no catálogo. Sem Seerr, mostra os lançamentos mais bem avaliados.',
  because: 'Sugestões pelo que você assistiu. Só aparece quando já houver histórico.',
  arrived: 'Pedidos seus que já estão no catálogo.',
  latest: 'Uma fileira por biblioteca.',
};

/** Ordem salva; fileira nova (de uma versão mais nova) entra logo depois da que vem antes dela no padrão. */
export function homeOrder(): HomeSection[] {
  const saved = session.settings.homeOrder.filter((k): k is HomeSection => (HOME_SECTIONS as readonly string[]).includes(k))
    .filter((k, i, a) => a.indexOf(k) === i);
  if (!saved.length) return [...HOME_SECTIONS];
  const order = [...saved];
  HOME_SECTIONS.forEach((key, i) => {
    if (order.includes(key)) return;
    let before: HomeSection | undefined;
    for (let j = i - 1; j >= 0; j--) if (order.includes(HOME_SECTIONS[j])) { before = HOME_SECTIONS[j]; break; }
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, key);
  });
  return order;
}

export const homeShows = (key: HomeSection) => !session.settings.homeHidden.includes(key);
