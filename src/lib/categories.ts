// Anime e Dorama não são gêneros no TMDB: são reconhecidos pelo país de produção e pelas tags
// (palavras-chave do TMDB que o Jellyfin importa).
import type { Item } from './types';

export const ANIME = 'anime';
export const DORAMA = 'dorama';

const animation = /anima|anime/i;
const japan = /^(jp|japan|jap[aã]o)$/i;
const asia = /^(jp|kr|cn|tw|th|hk|japan|jap[aã]o|.*korea.*|.*coreia.*|china|taiwan|thailand|tail[aâ]ndia|hong kong)$/i;
const animeTag = /^anime$|^animes$|japanese animation|anima[cç][aã]o japonesa/i;
const doramaTag = /dorama|k-?drama|c-?drama|j-?drama|thai drama|korean drama|asian drama|drama coreano/i;

const isAnimation = (i: Item) => (i.Genres ?? []).some((g) => animation.test(g));
const from = (i: Item, re: RegExp) => (i.ProductionLocations ?? []).some((p) => re.test(p.trim()));

export function isAnime(i: Item): boolean {
  return (i.Tags ?? []).some((t) => animeTag.test(t))
    || (i.Genres ?? []).some((g) => g.toLowerCase() === 'anime')
    || (isAnimation(i) && from(i, japan));
}

export function isDorama(i: Item): boolean {
  return (i.Tags ?? []).some((t) => doramaTag.test(t))
    || (i.Type === 'Series' && !isAnimation(i) && !isAnime(i) && from(i, asia));
}

export const matches = (key: string, i: Item) => key === ANIME ? isAnime(i) : key === DORAMA ? isDorama(i) : true;
