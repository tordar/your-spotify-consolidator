// Input types (from merged streaming history)
export interface CompleteSong {
  songId: string;
  name: string;
  duration_ms: number;
  artists: string[];
  album: {
    id: string;
    name: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
  };
  artist: {
    name: string;
    genres: string[];
  };
  external_urls: {
    spotify: string;
  };
  preview_url: string | null;
  playCount: number;
  totalListeningTime: number;
  listeningEvents: Array<{
    playedAt: string;
    msPlayed: number;
    conn_country?: string;
  }>;
}

export interface CompleteListeningHistory {
  metadata: {
    totalSongs: number;
    totalListeningEvents: number;
    totalListeningTime: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
    timestamp: string;
    source: string;
  };
  songs: CompleteSong[];
}

// Output types (matching existing format)
export interface CleanedSong {
  rank: number;
  duration_ms: number;
  count: number;
  songId: string;
  song: {
    name: string;
    preview_url: string | null;
    external_urls: Record<string, string>;
  };
  album: {
    name: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
  };
  artist: {
    name: string;
    genres: string[];
  };
  consolidated_count: number;
  original_songIds: string[];
  yearly_play_time?: Array<{
    year: string;
    totalListeningTimeMs: number;
  }>; // Yearly play time since first year the song was played
  rank_30_days_ago?: number; // Rank 30 days ago (undefined if not in top 500)
  count_30_days_ago?: number; // Play count 30 days ago
}

export interface CleanedAlbum {
  rank: number;
  duration_ms: number;
  count: number;
  differents: number;
  primaryAlbumId: string;
  total_count: number;
  total_duration_ms: number;
  album: {
    name: string;
    album_type: string;
    artists: string[];
    release_date: string;
    release_date_precision: string;
    popularity: number;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    external_urls: Record<string, string>;
    genres: string[];
  };
  consolidated_count: number;
  original_albumIds: string[];
  rank_30_days_ago?: number; // Rank 30 days ago (undefined if not in top 500)
  count_30_days_ago?: number; // Play count 30 days ago
}

export interface ArtistTopSong {
  songId: string;
  name: string;
  play_count: number;
  total_listening_time_ms: number;
  album: {
    name: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
  };
}

export interface ArtistTopAlbum {
  primaryAlbumId: string;
  name: string;
  play_count: number;
  total_listening_time_ms: number;
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
  artists: string[];
}

export interface CleanedArtist {
  rank: number;
  duration_ms: number;
  count: number;
  differents: number;
  primaryArtistId: string;
  total_count: number;
  total_duration_ms: number;
  artist: {
    name: string;
    genres: string[];
    popularity: number;
    followers: {
      total: number;
    };
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    external_urls: Record<string, string>;
  };
  consolidated_count: number;
  original_artistIds: string[];
  yearly_play_time?: Array<{
    year: string;
    totalListeningTimeMs: number;
  }>; // Yearly play time since first year the artist was played
  top_songs?: ArtistTopSong[]; // Top 5 songs by play time
  top_albums?: ArtistTopAlbum[]; // Top 5 albums by play time
  rank_30_days_ago?: number; // Rank 30 days ago (undefined if not in top 500)
  count_30_days_ago?: number; // Play count 30 days ago
}

// Song within album (for detailed album view)
export interface AlbumSong {
  songId: string;
  name: string;
  duration_ms: number;
  track_number: number;
  disc_number: number;
  explicit: boolean;
  preview_url: string | null;
  external_urls: Record<string, string>;
  play_count: number;
  total_listening_time_ms: number;
  artists: string[];
}

export interface AlbumWithSongs extends CleanedAlbum {
  total_songs: number;
  played_songs: number;
  unplayed_songs: number;
  songs: AlbumSong[];
  earliest_played_at?: string; // ISO 8601 date string of the earliest play time
  yearly_play_time?: Array<{
    year: string;
    totalListeningTimeMs: number;
  }>; // Yearly play time since first year the album was played
}

// Spotify API interfaces
export interface SpotifyTrack {
  id: string;
  name: string;
  track_number: number;
  disc_number: number;
  explicit: boolean;
  album: {
    id: string;
    name: string;
    album_type: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    release_date: string;
    release_date_precision: string;
    artists: Array<{
      id: string;
      name: string;
    }>;
    external_urls: {
      spotify: string;
    };
  };
  artists: Array<{
    id: string;
    name: string;
  }>;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
}

export interface SpotifyTracksResponse {
  tracks: SpotifyTrack[];
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  album_type: string;
  artists: Array<{
    id: string;
    name: string;
  }>;
  release_date: string;
  release_date_precision: string;
  popularity: number;
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
  external_urls: {
    spotify: string;
  };
  genres: string[];
}

export interface SpotifyAlbumsResponse {
  albums: SpotifyAlbum[];
}

export interface SpotifyArtist {
  id: string;
  name: string;
  popularity: number;
  followers: {
    total: number;
  };
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
  external_urls: {
    spotify: string;
  };
  genres: string[];
}

export interface SpotifyArtistsResponse {
  artists: SpotifyArtist[];
}

// Consolidation rules
export interface ConsolidationRule {
  artistName: string;
  baseAlbumName: string;
  variations: string[];
}

export interface ConsolidationRules {
  rules: ConsolidationRule[];
}

// Detailed statistics interface
export interface YearlyListeningTime {
  year: string;
  totalListeningTimeMs: number;
  totalListeningHours: number;
  playCount: number;
}

export interface TopSong {
  songId: string;
  name: string;
  artist: string;
  playCount: number;
  totalListeningTimeMs: number;
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
}

export interface TopArtist {
  artistName: string;
  playCount: number;
  totalListeningTimeMs: number;
  uniqueSongs: number;
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
}

export interface TopAlbum {
  albumName: string;
  artist: string;
  playCount: number;
  totalListeningTimeMs: number;
  uniqueSongs: number;
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
}

export interface YearlyTopItems {
  year: string;
  topSongs: TopSong[];
  topArtists: TopArtist[];
  topAlbums: TopAlbum[];
}

export interface HourlyListeningDistribution {
  hour: number; // 0-23
  totalListeningTimeMs: number;
  totalListeningHours: number;
  playCount: number;
}

export interface CountryListeningData {
  countryCode: string;
  totalMsPlayed: number;
  totalHours: number;
  playCount: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
}

export interface DetailedStats {
  yearlyListeningTime: YearlyListeningTime[];
  yearlyTopItems: YearlyTopItems[];
  totalListeningHours: number;
  totalListeningDays: number;
  totalListeningEvents?: number;
  hourlyListeningDistribution: HourlyListeningDistribution[];
  countryListeningData?: CountryListeningData[];
}

