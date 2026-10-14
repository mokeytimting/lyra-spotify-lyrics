export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album: string;
  durationMs: number;
  imageUrl: string | null;
}

export interface PlaybackState {
  track: Track | null;
  positionMs: number;
  isPlaying: boolean;
  deviceId: string | null;
  deviceName: string | null;
  /** performance.now() at the moment positionMs was observed */
  timestamp: number;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isRestricted: boolean;
}

export interface PlaylistSummary {
  id: string;
  uri: string;
  name: string;
  imageUrl: string | null;
  owned: boolean;
}

export interface AlbumSummary {
  uri: string;
  name: string;
  imageUrl: string | null;
  artist: string;
}
