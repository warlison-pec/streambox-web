// Tipos da API do Jellyfin (somente os campos usados) e das integrações.

export interface UserData {
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  Played?: boolean;
  UnplayedItemCount?: number;
  IsFavorite?: boolean;
}

export interface Item {
  Id: string;
  Name: string;
  Type: string;
  CollectionType?: string;
  ProductionYear?: number;
  Overview?: string;
  RunTimeTicks?: number;
  CommunityRating?: number;
  OfficialRating?: string;
  Genres?: string[];
  SeriesId?: string;
  SeriesName?: string;
  SeasonId?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ChildCount?: number;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  SeriesPrimaryImageTag?: string;
  UserData?: UserData;
  ChannelNumber?: string;
  CurrentProgram?: Item;
  StartDate?: string;
  EndDate?: string;
  Chapters?: { StartPositionTicks: number; Name?: string }[];
}

/** Trecho marcado no servidor (Jellyfin 10.10+). */
export interface MediaSegment {
  Type: 'Intro' | 'Outro' | 'Recap' | 'Preview' | 'Commercial' | 'Unknown' | string;
  StartTicks: number;
  EndTicks: number;
}

export interface ItemsResult {
  Items: Item[];
  TotalRecordCount: number;
}

export interface AuthResult {
  AccessToken: string;
  User: { Id: string; Name: string };
}

export interface MediaStream {
  Type: string;
  Index: number;
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  Title?: string;
  IsExternal?: boolean;
  IsDefault?: boolean;
  IsTextSubtitleStream?: boolean;
  Height?: number;
  Channels?: number;
}

export interface MediaSource {
  Id: string;
  Path?: string;
  IsRemote?: boolean;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  TranscodingUrl?: string;
  LiveStreamId?: string;
  Container?: string;
  MediaStreams?: MediaStream[];
}

export interface PlaybackInfo {
  MediaSources: MediaSource[];
  PlaySessionId?: string;
}

export interface RemoteSubtitle {
  Id: string;
  Name: string;
  ProviderName: string;
  DownloadCount?: number;
}

export interface QuickConnect {
  Secret: string;
  Code: string;
  Authenticated: boolean;
}

/* STRM Indexer */
export interface IndexerItem {
  kind: 'movie' | 'series';
  title: string;
  year?: number | null;
  catalog_year?: number | null;
  sources?: number;
  episodes?: number;
  in_library?: number;
  seasons: number[];
  poster?: string | null;
  overview?: string;
  requested?: boolean;
}

export interface RequestStatus {
  id: string;
  state: string;
  message: string;
}

export interface LiveChannel {
  id: string;
  name: string;
  group: string;
  logo?: string | null;
  url: string;
  number?: string | null;
  now?: { title: string; start: number; stop: number } | null;
  next?: { title: string; start: number; stop: number } | null;
}

/* Seerr */
export interface SeerrResult {
  id: number;
  mediaType: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  releaseDate?: string;
  firstAirDate?: string;
  posterPath?: string;
  overview?: string;
  mediaInfo?: { status: number };
}
