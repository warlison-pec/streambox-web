// Gênero do canal (Abertos, Notícias, Esportes…), com as mesmas regras do "Organizar por categoria" do
// STRM Indexer: primeiro pelo grupo da lista, depois pelo nome ("Band Sports" é esporte, não a Band).
const CATS: [string, RegExp, RegExp][] = [
  ['Abertos', /abert|nacionais|regionais|locais|\bgeneral\b|variedades|entertainment/i,
    /\b(globo|sbt|record|band|bandeirantes|rede ?tv|cultura|tv brasil|gazeta|cnt|rede ?vida|tv aparecida|tv camara|tv senado|tv justi|canal sete|chroma|futura)\b(?!.*news)/i],
  ['Notícias', /not[ií]cia|\bnews\b|jornal|jornalismo/i,
    /news|cnn|bandnews|globonews|jovem pan|record news|sbt news|cnbc|bloomberg|euronews|dw\b|bbc world|al jazeera/i],
  ['Esportes', /esporte|sport|futebol|football|soccer|\bufc\b|luta|combate|premiere/i,
    /espn|sportv|premiere|combate|band ?sports|fox sports|tnt sports|dazn|eleven|goat|cazé|caze|nba|nfl|xsports|sport/i],
  ['Filmes e Séries', /filme|s[eé]rie|movie|cinema|\btelecine\b|\bhbo\b/i,
    /hbo|telecine|cinemax|megapix|\btnt\b|\baxn\b|warner|sony|universal|paramount|space|\bfx\b|studio|star channel|amc|film|cine|runtime|a&e|\bae\b|lifetime|tcm|prime ?box/i],
  ['Infantil', /kid|infantil|crian[cç]a|anima[cç]|cartoon|desenho|anime/i,
    /cartoon|disney|nick|gloob|discovery kids|boomerang|baby|tooncast|zoomoo|kids|ra-tim-bum|gloobinho|otaku|anime/i],
  ['Documentários', /document|educa|ci[eê]ncia|natureza|hist[oó]ri|cultura/i,
    /discovery|history|nat ?geo|national geographic|animal planet|curiosity|smithsonian|tlc|h2\b|science/i],
  ['Música', /m[uú]sic|music|\bclipes?\b|r[aá]dio/i, /mtv|music|vh1|bis\b|multishow|clubbing|trace|kiss|hits/i],
  ['Religiosos', /relig|gospel|cat[oó]lic|evang|crist[aã]o/i,
    /can[cç][aã]o nova|aparecida|rede vida|gospel|novo tempo|rit\b|boa vontade|evang|igreja|catol/i],
];
export const OTHER = 'Outros';
export const ORDER = [...CATS.map((c) => c[0]), OTHER];

export function classify(name?: string | null, group?: string | null): string {
  const g = group ?? '', n = name ?? '';
  const exact = CATS.find(([c]) => g.trim().toLowerCase() === c.toLowerCase());
  if (exact) return exact[0];
  for (const [c, grx] of CATS) if (grx.test(g) && !(c === 'Abertos' && CATS[1][2].test(n))) return c;
  for (const [c, , nrx] of [...CATS.slice(1), CATS[0]]) if (nrx.test(n)) return c;
  return OTHER;
}

/** Opções do filtro (só os gêneros que existem), com contagem. */
export function genreOptions(all: string[]): [string, string][] {
  const count = new Map<string, number>();
  for (const g of all) count.set(g, (count.get(g) ?? 0) + 1);
  return [['', `Todos · ${all.length}`], ...ORDER.filter((g) => count.get(g)).map((g): [string, string] => [g, `${g} · ${count.get(g)}`])];
}
