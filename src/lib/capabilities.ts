/**
 * O que ESTE navegador consegue tocar sozinho, testado na hora (não por nome de navegador).
 * Vira o perfil enviado ao Jellyfin: quanto mais o navegador toca direto, menos o servidor converte.
 * Se um teste mentir, o player percebe (sem imagem / sem som / erro) e pede a conversão.
 */

const el = typeof document !== 'undefined' ? document.createElement('video') : null;
const MSE: any = typeof window !== 'undefined' ? (window as any).ManagedMediaSource ?? (window as any).MediaSource : undefined;

const native = (t: string) => !!el && el.canPlayType(t).replace(/no/, '') !== '';
const mse = (t: string) => { try { return !!MSE?.isTypeSupported?.(t); } catch { return false; } };
const any = (...types: string[]) => types.some((t) => native(t) || mse(t));

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
// Chrome/Edge/Opera tocam .mkv pelo <video> mesmo respondendo "" no canPlayType
const chromium = /\b(Chrome|Chromium|Edg|OPR)\//.test(ua) && !/\bFirefox\//.test(ua);

const has = {
  h264: any('video/mp4; codecs="avc1.640028"', 'video/mp4; codecs="avc1.42E01E"'),
  hevc: any('video/mp4; codecs="hvc1.1.6.L120.90"', 'video/mp4; codecs="hev1.1.6.L120.90"'),
  hevc10: any('video/mp4; codecs="hvc1.2.4.L120.90"', 'video/mp4; codecs="hev1.2.4.L120.90"'),
  av1: any('video/mp4; codecs="av01.0.08M.08"', 'video/webm; codecs="av01.0.08M.08"'),
  av1_10: any('video/mp4; codecs="av01.0.08M.10"', 'video/webm; codecs="av01.0.08M.10"'),
  vp9: any('video/webm; codecs="vp9"', 'video/mp4; codecs="vp09.00.10.08"'),
  vp8: any('video/webm; codecs="vp8"'),
  aac: any('audio/mp4; codecs="mp4a.40.2"', 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
  mp3: any('audio/mpeg', 'audio/mp4; codecs="mp4a.6B"'),
  opus: any('audio/webm; codecs="opus"', 'audio/mp4; codecs="opus"'),
  vorbis: any('audio/webm; codecs="vorbis"'),
  flac: any('audio/flac', 'audio/mp4; codecs="flac"'),
  ac3: any('audio/mp4; codecs="ac-3"'),
  eac3: any('audio/mp4; codecs="ec-3"'),
  mkv: native('video/x-matroska') || native('video/mkv') || chromium,
  hlsMse: !!MSE,
};

const list = (pairs: [string, boolean][]) => pairs.filter(([, ok]) => ok).map(([c]) => c).join(',');

const videoMp4 = list([['h264', has.h264], ['hevc', has.hevc || has.hevc10], ['av1', has.av1], ['vp9', has.vp9]]);
const audioMp4 = list([['aac', has.aac], ['mp3', has.mp3], ['opus', has.opus], ['flac', has.flac], ['ac3', has.ac3], ['eac3', has.eac3]]);
const videoMkv = list([['h264', has.h264], ['hevc', has.hevc || has.hevc10], ['av1', has.av1], ['vp9', has.vp9], ['vp8', has.vp8]]);
const audioMkv = list([['aac', has.aac], ['mp3', has.mp3], ['opus', has.opus], ['vorbis', has.vorbis], ['flac', has.flac], ['ac3', has.ac3], ['eac3', has.eac3]]);

/**
 * Conversão: HLS com pedaços fMP4 quando o navegador toca HEVC/AV1 (o servidor só copia o vídeo, sem
 * recodificar); senão HLS .ts com H.264. O primeiro codec de cada lista é o usado se precisar recodificar.
 */
const fmp4 = has.hlsMse && (has.hevc || has.hevc10 || has.av1);
export const HLS = {
  container: fmp4 ? 'mp4' : 'ts',
  video: fmp4 ? list([['h264', true], ['hevc', has.hevc || has.hevc10], ['av1', has.av1]]) : 'h264',
  audio: fmp4
    ? list([['aac', true], ['mp3', has.mp3], ['ac3', has.ac3], ['eac3', has.eac3], ['opus', has.opus], ['flac', has.flac]])
    : list([['aac', true], ['mp3', has.mp3], ['ac3', has.ac3], ['eac3', has.eac3]]),
  maxChannels: 6,
};

/** Bitrate máximo para tocar o original (acima disso o servidor converteria). */
export const ORIGINAL_BITRATE = 120_000_000;

const codecProfiles: unknown[] = [
  // H.264 de 10 bits (Hi10P) nenhum navegador decodifica
  { Type: 'Video', Codec: 'h264', Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false }] },
];
if (has.hevc && !has.hevc10)
  codecProfiles.push({ Type: 'Video', Codec: 'hevc', Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false }] });
if (has.av1 && !has.av1_10)
  codecProfiles.push({ Type: 'Video', Codec: 'av1', Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false }] });

const direct: unknown[] = [
  { Type: 'Video', Container: 'mp4,m4v,mov', VideoCodec: videoMp4, AudioCodec: audioMp4 },
  { Type: 'Video', Container: 'webm', VideoCodec: list([['vp8', has.vp8], ['vp9', has.vp9], ['av1', has.av1]]), AudioCodec: list([['opus', has.opus], ['vorbis', has.vorbis]]) },
];
if (has.mkv) direct.push({ Type: 'Video', Container: 'mkv,matroska', VideoCodec: videoMkv, AudioCodec: audioMkv });

export const BROWSER_PROFILE = {
  MaxStreamingBitrate: ORIGINAL_BITRATE,
  MaxStaticBitrate: ORIGINAL_BITRATE,
  DirectPlayProfiles: direct,
  TranscodingProfiles: [
    {
      Type: 'Video', Container: HLS.container, Protocol: 'hls', Context: 'Streaming',
      VideoCodec: HLS.video, AudioCodec: HLS.audio, MaxAudioChannels: String(HLS.maxChannels),
      BreakOnNonKeyFrames: true, MinSegments: 1,
    },
  ],
  CodecProfiles: codecProfiles,
  SubtitleProfiles: [
    { Format: 'vtt', Method: 'External' }, { Format: 'srt', Method: 'External' }, { Format: 'subrip', Method: 'External' },
    { Format: 'ass', Method: 'External' }, { Format: 'ssa', Method: 'External' },
  ],
};

/** Para o diagnóstico em Ajustes / console. */
export const capabilities = { ...has, chromium, hlsContainer: HLS.container };

if (typeof console !== 'undefined') console.info('[StreamBox] este navegador toca direto:', capabilities, 'perfil:', BROWSER_PROFILE);
