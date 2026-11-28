// Fileira "Em alta" do Início (igual à do app Android): só títulos que já estão no catálogo.
// Com Seerr, usa as tendências do TMDB; o que faltar vem dos lançamentos mais bem avaliados do Jellyfin.
import { jf } from './api/jellyfin';
import { seerr } from './api/extras';
import type { Item, SeerrResult } from './types';

const WANT = 20;

const timeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

async function fromTmdb(): Promise<Item[]> {
  if (!seerr.configured()) return [];
  const pages = await Promise.all([1, 2].map((p) => seerr.trending(p).catch(() => [] as SeerrResult[])));
  const seen = new Set<string>();
  const list = pages.flat().filter((t) => {
    const k = t.mediaType + t.id;
    if (seen.has(k)) return false;
    seen.add(k);
    // Só procura no catálogo o que o Seerr diz estar disponível (ou que ele não conhece)
    const st = t.mediaInfo?.status ?? 1;
    return st === 1 || st >= 4;
  }).slice(0, 30);
  const found = await Promise.all(list.map((t) => jf.findByTmdb(t.id, t.mediaType === 'tv' ? 'series' : 'movie').catch(() => null)));
  return found.filter((x): x is Item => !!x);
}

export async function trending(): Promise<Item[]> {
  const tmdb = await timeout(fromTmdb(), 6000, [] as Item[]);
  const local = tmdb.length >= WANT ? [] : await jf.topRatedRecent(new Date().getFullYear() - 1).catch(() => [] as Item[]);
  const ids = new Set<string>();
  return [...tmdb, ...local].filter((i) => !i.UserData?.Played && !ids.has(i.Id) && !!ids.add(i.Id)).slice(0, WANT);
}
