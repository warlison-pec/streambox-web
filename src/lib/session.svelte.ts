// Sessão e preferências guardadas no navegador (localStorage).

const KEY = 'streambox';

export interface Settings {
  quality: number;        // bitrate máximo (0 = original)
  subLang: string;        // por | eng | spa
  subSize: number;        // índice em SUB_SIZES
  subColor: number;       // índice em SUB_COLORS
  subBg: number;          // 0 contorno, 1 sombra, 2 translúcido, 3 caixa preta
  screensaver: number;    // minutos (0 = desligada)
  m3u: string;
  epg: string;
  seerrKey: string;
  seerrUser: string;
}

const DEFAULTS: Settings = {
  quality: 0, subLang: 'por', subSize: 1, subColor: 0, subBg: 0, screensaver: 5,
  m3u: '', epg: '', seerrKey: '', seerrUser: '',
};

export const SUB_SIZES: [string, number][] = [['Pequeno', 0.8], ['Médio', 1], ['Grande', 1.25], ['Muito grande', 1.55]];
export const SUB_COLORS: [string, string][] = [['Branco', '#ffffff'], ['Amarelo', '#ffe14d'], ['Laranja', '#ff9a3d']];
export const SUB_BGS = ['Contorno', 'Sombra', 'Fundo translúcido', 'Caixa preta'];
export const QUALITIES: [string, number, number | null][] = [
  ['Original (sem conversão)', 0, null],
  ['1080p · 10 Mbps', 10_000_000, 1080],
  ['720p · 4 Mbps', 4_000_000, 720],
  ['480p · 1,5 Mbps', 1_500_000, 480],
  ['360p · 700 kbps', 700_000, 360],
];

function load(): any {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

class Session {
  token = $state('');
  userId = $state('');
  userName = $state('');
  deviceId = '';
  settings = $state<Settings>({ ...DEFAULTS });

  constructor() {
    const d = load();
    this.token = d.token || '';
    this.userId = d.userId || '';
    this.userName = d.userName || '';
    this.deviceId = d.deviceId || (crypto.randomUUID?.() ?? String(Math.random()).slice(2)).replace(/-/g, '');
    this.settings = { ...DEFAULTS, ...(d.settings || {}) };
    this.save();
  }

  get loggedIn() { return !!(this.token && this.userId); }

  save() {
    localStorage.setItem(KEY, JSON.stringify({
      token: this.token, userId: this.userId, userName: this.userName,
      deviceId: this.deviceId, settings: $state.snapshot(this.settings),
    }));
  }

  login(token: string, userId: string, userName: string) {
    this.token = token; this.userId = userId; this.userName = userName;
    this.save();
  }

  logout() {
    this.token = ''; this.userId = '';
    this.save();
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.settings[key] = value;
    this.save();
  }
}

export const session = new Session();

/* Endereços dos serviços (public/config.js) */
const cfg = window.STREAMBOX ?? {};
export const CONFIG = {
  jellyfin: (cfg.jellyfin ?? '/api').replace(/\/$/, ''),
  indexer: (cfg.indexer ?? '/strm-api').replace(/\/$/, ''),
  seerr: (cfg.seerr ?? '/seerr').replace(/\/$/, ''),
  title: cfg.title ?? 'StreamBox',
  whatsapp: (cfg.whatsapp ?? '').replace(/\D/g, ''),              // número com DDI, ex. 5593991807963
  whatsappLabel: cfg.whatsappLabel ?? '',
  downloads: (cfg.downloads ?? '').replace(/\/?$/, '/').replace(/^\/$/, ''), // pasta pública ('' desativa)
};
