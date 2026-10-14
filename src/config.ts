/** 應用程式名稱（依 Spotify 開發者條款，名稱不可以「Spotify」開頭或看起來像官方產品） */
export const APP_NAME = 'Lyra';

export const CONFIG = {
  /** 執行時由 data/settings.json 載入（每位使用者用自己的 Spotify App） */
  clientId: '' as string,
  redirectUri: 'http://127.0.0.1:5180/callback',
  scopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
  ],
  deviceName: 'Lyra',
  miniBreakpointPx: 600,
  remotePollMs: 1000,
  /** 歌詞提早多少毫秒亮起（人眼需要一點時間讀；Apple Music 也會稍微提早） */
  lyricsLeadMs: 250,
};
