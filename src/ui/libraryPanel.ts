import { defineStrings } from '../i18n';
import { ICONS } from './icons';
import type { AlbumSummary, PlaylistSummary, Track } from '../spotify/types';

const t = defineStrings({
  'zh-Hant': {
    tabSearch: '搜尋',
    tabPlaylists: '歌單',
    tabLiked: '已按讚的歌曲',
    close: '關閉',
    searchPlaceholder: '搜尋歌曲、歌手、專輯',
    playAll: '播放整張歌單',
    trueShuffle: '真・隨機播放',
    trueShuffleTitle: '整份清單每首都播過一次才重新洗牌，跨天也記得播到哪',
    albumSub: '專輯 · {artist}',
    playlistSub: '歌單',
    noResults: '沒有結果',
    noPlaylists: '沒有歌單',
    backToPlaylists: '← 返回歌單',
    notOwnedNote: 'Spotify 限制：只能檢視自己建立的歌單曲目',
    noLikedSongs: '沒有已按讚的歌曲',
    loadFailed: '載入失敗，請稍後再試',
  },
  'zh-Hans': {
    tabSearch: '搜索',
    tabPlaylists: '歌单',
    tabLiked: '已点赞的歌曲',
    close: '关闭',
    searchPlaceholder: '搜索歌曲、歌手、专辑',
    playAll: '播放整个歌单',
    trueShuffle: '真・随机播放',
    trueShuffleTitle: '整份列表每首都播过一次才重新洗牌，跨天也记得播到哪',
    albumSub: '专辑 · {artist}',
    playlistSub: '歌单',
    noResults: '没有结果',
    noPlaylists: '没有歌单',
    backToPlaylists: '← 返回歌单',
    notOwnedNote: 'Spotify 限制：只能查看自己创建的歌单曲目',
    noLikedSongs: '没有已点赞的歌曲',
    loadFailed: '加载失败，请稍后重试',
  },
  en: {
    tabSearch: 'Search',
    tabPlaylists: 'Playlists',
    tabLiked: 'Liked Songs',
    close: 'Close',
    searchPlaceholder: 'Search songs, artists, albums',
    playAll: 'Play playlist',
    trueShuffle: 'True Shuffle',
    trueShuffleTitle: 'Reshuffles only after every track in the list has played once, and remembers your place across days',
    albumSub: 'Album · {artist}',
    playlistSub: 'Playlist',
    noResults: 'No results',
    noPlaylists: 'No playlists',
    backToPlaylists: '← Back to playlists',
    notOwnedNote: 'Spotify limitation: you can only view tracks in playlists you created',
    noLikedSongs: 'No liked songs',
    loadFailed: 'Failed to load, please try again later',
  },
  ja: {
    tabSearch: '検索',
    tabPlaylists: 'プレイリスト',
    tabLiked: 'お気に入りの曲',
    close: '閉じる',
    searchPlaceholder: '曲、アーティスト、アルバムを検索',
    playAll: 'プレイリストを再生',
    trueShuffle: '真のシャッフル',
    trueShuffleTitle: 'リストの全曲を一度再生し終えてから再シャッフル。日をまたいでも再生位置を覚えます',
    albumSub: 'アルバム · {artist}',
    playlistSub: 'プレイリスト',
    noResults: '結果がありません',
    noPlaylists: 'プレイリストがありません',
    backToPlaylists: '← プレイリストに戻る',
    notOwnedNote: 'Spotify の制限：自分で作成したプレイリストの曲のみ表示できます',
    noLikedSongs: 'お気に入りの曲がありません',
    loadFailed: '読み込みに失敗しました。しばらくしてからもう一度お試しください',
  },
  ko: {
    tabSearch: '검색',
    tabPlaylists: '플레이리스트',
    tabLiked: '좋아요 표시한 곡',
    close: '닫기',
    searchPlaceholder: '곡, 아티스트, 앨범 검색',
    playAll: '플레이리스트 재생',
    trueShuffle: '진정한 셔플',
    trueShuffleTitle: '목록의 모든 곡을 한 번씩 재생한 뒤에 다시 섞으며, 날이 바뀌어도 재생 위치를 기억합니다',
    albumSub: '앨범 · {artist}',
    playlistSub: '플레이리스트',
    noResults: '결과가 없습니다',
    noPlaylists: '플레이리스트가 없습니다',
    backToPlaylists: '← 플레이리스트로 돌아가기',
    notOwnedNote: 'Spotify 제한: 직접 만든 플레이리스트의 곡만 볼 수 있습니다',
    noLikedSongs: '좋아요 표시한 곡이 없습니다',
    loadFailed: '불러오지 못했습니다. 잠시 후 다시 시도해 주세요',
  },
  es: {
    tabSearch: 'Buscar',
    tabPlaylists: 'Listas',
    tabLiked: 'Canciones que te gustan',
    close: 'Cerrar',
    searchPlaceholder: 'Buscar canciones, artistas, álbumes',
    playAll: 'Reproducir lista',
    trueShuffle: 'Aleatorio real',
    trueShuffleTitle: 'Vuelve a mezclar solo después de reproducir todas las canciones de la lista una vez, y recuerda por dónde ibas aunque cambie el día',
    albumSub: 'Álbum · {artist}',
    playlistSub: 'Lista',
    noResults: 'Sin resultados',
    noPlaylists: 'No hay listas',
    backToPlaylists: '← Volver a las listas',
    notOwnedNote: 'Limitación de Spotify: solo puedes ver las canciones de las listas que hayas creado',
    noLikedSongs: 'No hay canciones que te gusten',
    loadFailed: 'No se pudo cargar, inténtalo de nuevo más tarde',
  },
});

export interface LibraryDeps {
  search(
    q: string,
    offset?: number,
  ): Promise<{
    tracks: Track[];
    playlists: PlaylistSummary[];
    albums: AlbumSummary[];
  }>;
  getMyPlaylists(
    offset?: number,
  ): Promise<{ playlists: PlaylistSummary[]; next: boolean }>;
  getPlaylistItems(
    id: string,
    offset?: number,
  ): Promise<{ tracks: Track[]; next: boolean }>;
  getSavedTracks(
    offset?: number,
  ): Promise<{ tracks: Track[]; next: boolean }>;
  playContext(uri: string, offsetUri?: string): Promise<void>;
  playUris(uris: string[], offsetUri?: string): Promise<void>;
  isNotOwned(e: unknown): boolean;
  /** 真・隨機播放（只支援已按讚的歌曲與自己的歌單） */
  trueShuffle?(src: { kind: 'liked' } | { kind: 'playlist'; id: string; name: string }): void;
}

type Tab = 'search' | 'playlists' | 'liked';

interface LibraryPanelElements {
  tabs: HTMLButtonElement[];
  searchInput: HTMLInputElement;
  body: HTMLDivElement;
  playAll: HTMLButtonElement;
  shuffleBtn: HTMLButtonElement;
  note: HTMLDivElement;
}

const SEARCH_PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  const html = el as HTMLElement;
  if (html.isContentEditable === true) return true;
  return false;
}

export class LibraryPanel {
  private readonly root: HTMLElement;
  private readonly deps: LibraryDeps;
  private readonly doc: Document;
  private readonly el: LibraryPanelElements;

  private activeTab: Tab = 'search';

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;
  private searchQuery = '';
  private searchTracks: Track[] = [];
  private searchAlbums: AlbumSummary[] = [];
  private searchPlaylists: PlaylistSummary[] = [];
  private searchOffset = 0;
  private searchHasMore = false;

  private playlists: PlaylistSummary[] = [];
  private playlistsNext = false;
  private playlistsLoaded = false;

  private playlistView: PlaylistSummary | null = null;
  private playlistViewTracks: Track[] = [];
  private playlistDetailNext = false;

  private savedTracks: Track[] = [];
  private savedNext = false;
  private savedLoaded = false;

  private loadingMore = false;

  constructor(root: HTMLElement, deps: LibraryDeps) {
    this.root = root;
    this.deps = deps;
    this.doc = root.ownerDocument;

    const doc = this.doc;
    root.replaceChildren();

    const head = doc.createElement('div');
    head.className = 'lib-head';

    const tabsWrap = doc.createElement('div');
    tabsWrap.className = 'lib-tabs';

    const tabDefs: { tab: Tab; label: string }[] = [
      { tab: 'search', label: t('tabSearch') },
      { tab: 'playlists', label: t('tabPlaylists') },
      { tab: 'liked', label: t('tabLiked') },
    ];

    const tabButtons: HTMLButtonElement[] = [];
    for (const def of tabDefs) {
      const button = doc.createElement('button');
      button.className = 'lib-tab';
      button.type = 'button';
      button.dataset.tab = def.tab;
      button.textContent = def.label;
      button.addEventListener('click', () => {
        this.switchTab(def.tab);
      });
      tabsWrap.appendChild(button);
      tabButtons.push(button);
    }

    const closeButton = doc.createElement('button');
    closeButton.className = 'lib-close';
    closeButton.type = 'button';
    closeButton.innerHTML = ICONS.close;
    closeButton.setAttribute('aria-label', t('close'));
    closeButton.addEventListener('click', () => {
      this.close();
    });
    tabsWrap.appendChild(closeButton);

    head.appendChild(tabsWrap);
    root.appendChild(head);

    const searchInput = doc.createElement('input');
    searchInput.className = 'lib-search';
    searchInput.type = 'search';
    searchInput.placeholder = t('searchPlaceholder');
    searchInput.addEventListener('input', () => {
      this.onSearchInput();
    });
    root.appendChild(searchInput);

    const body = doc.createElement('div');
    body.className = 'lib-body';
    body.addEventListener('scroll', () => {
      this.onBodyScroll();
    });
    root.appendChild(body);

    const playAll = doc.createElement('button');
    playAll.className = 'play-all';
    playAll.type = 'button';
    playAll.textContent = t('playAll');
    playAll.hidden = true;
    playAll.addEventListener('click', () => {
      const playlist = this.playlistView;
      if (!playlist) return;
      this.playAndClose(() => this.deps.playContext(playlist.uri));
    });
    const shuffleBtn = doc.createElement('button');
    shuffleBtn.className = 'true-shuffle';
    shuffleBtn.type = 'button';
    shuffleBtn.innerHTML = `${ICONS.shuffle}<span>${t('trueShuffle')}</span>`;
    shuffleBtn.title = t('trueShuffleTitle');
    shuffleBtn.hidden = true;
    shuffleBtn.addEventListener('click', () => {
      const src = this.shuffleSource;
      if (!src || !this.deps.trueShuffle) return;
      this.deps.trueShuffle(src);
      this.close();
    });

    const actions = doc.createElement('div');
    actions.className = 'lib-actions';
    actions.append(playAll, shuffleBtn);
    root.appendChild(actions);

    const note = doc.createElement('div');
    note.className = 'lib-note';
    note.hidden = true;
    root.appendChild(note);

    this.el = {
      tabs: tabButtons,
      searchInput,
      body,
      playAll,
      shuffleBtn,
      note,
    };

    this.doc.addEventListener('keydown', (event: KeyboardEvent) => {
      this.onKeydown(event);
    });

    this.updateTabs();
    this.renderSearchResults();
  }

  open(tab?: Tab): void {
    this.root.classList.add('open');
    if (tab !== undefined) {
      this.switchTab(tab);
    }
    if (this.activeTab === 'search') {
      this.el.searchInput.focus();
    }
  }

  close(): void {
    this.root.classList.remove('open');
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      return;
    }
    if (event.key === '/' && !isEditableElement(this.doc.activeElement)) {
      event.preventDefault();
      this.open('search');
    }
  }

  private updateTabs(): void {
    for (const button of this.el.tabs) {
      button.classList.toggle('active', button.dataset.tab === this.activeTab);
    }
    this.el.searchInput.hidden = this.activeTab !== 'search';
  }

  private switchTab(tab: Tab): void {
    this.activeTab = tab;
    this.playlistView = null;
    this.playlistViewTracks = [];
    this.playlistDetailNext = false;
    this.updateTabs();
    this.hidePlayAll();
    this.hideNote();

    if (tab === 'search') {
      this.renderSearchResults();
      return;
    }
    if (tab === 'playlists') {
      if (!this.playlistsLoaded) {
        void this.loadPlaylists(true);
      } else {
        this.renderPlaylists();
      }
      return;
    }
    if (!this.savedLoaded) {
      void this.loadSaved(true);
    } else {
      this.renderSaved();
    }
  }

  private onSearchInput(): void {
    const raw = this.el.searchInput.value;
    const query = raw.trim();

    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }

    if (query === '') {
      this.searchSeq += 1;
      this.searchQuery = '';
      this.searchTracks = [];
      this.searchAlbums = [];
      this.searchPlaylists = [];
      this.searchOffset = 0;
      this.searchHasMore = false;
      this.renderSearchResults();
      return;
    }

    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.searchQuery = query;
      void this.runSearch(query, undefined, false);
    }, DEBOUNCE_MS);
  }

  private async runSearch(
    query: string,
    offset: number | undefined,
    append: boolean,
  ): Promise<void> {
    const seq = append ? this.searchSeq : this.searchSeq + 1;
    if (!append) {
      this.searchSeq = seq;
    }
    try {
      const result = await this.deps.search(query, offset);
      if (seq !== this.searchSeq) return;
      if (append) {
        this.searchTracks = this.searchTracks.concat(result.tracks);
      } else {
        this.searchTracks = result.tracks;
        this.searchAlbums = result.albums;
        this.searchPlaylists = result.playlists;
      }
      this.searchOffset = (offset ?? 0) + SEARCH_PAGE_SIZE;
      this.searchHasMore = result.tracks.length > 0;
      this.renderSearchResults();
    } catch {
      if (seq !== this.searchSeq) return;
      this.showError();
    }
  }

  private renderSearchResults(): void {
    const prevTop = this.el.body.scrollTop;
    const body = this.el.body;
    body.replaceChildren();
    this.hidePlayAll();
    this.hideNote();

    const frag = this.doc.createDocumentFragment();
    for (const track of this.searchTracks) {
      frag.appendChild(
        this.createItem({
          imageUrl: track.imageUrl,
          name: track.name,
          sub: this.trackSub(track),
          onClick: () => {
            this.playAndClose(() => this.deps.playUris([track.uri]));
          },
        }),
      );
    }
    for (const album of this.searchAlbums) {
      frag.appendChild(
        this.createItem({
          imageUrl: album.imageUrl,
          name: album.name,
          sub: t('albumSub', { artist: album.artist }),
          onClick: () => {
            this.playAndClose(() => this.deps.playContext(album.uri));
          },
        }),
      );
    }
    for (const playlist of this.searchPlaylists) {
      frag.appendChild(
        this.createItem({
          imageUrl: playlist.imageUrl,
          name: playlist.name,
          sub: t('playlistSub'),
          onClick: () => {
            void this.openPlaylist(playlist);
          },
        }),
      );
    }

    if (frag.childNodes.length === 0 && this.searchQuery !== '') {
      body.appendChild(this.createMessage(t('noResults')));
    } else {
      body.appendChild(frag);
    }
    body.scrollTop = prevTop;
  }

  private async loadPlaylists(reset: boolean): Promise<void> {
    const offset = reset ? 0 : this.playlists.length;
    try {
      const result = await this.deps.getMyPlaylists(offset);
      if (reset) {
        this.playlists = result.playlists;
      } else {
        this.playlists = this.playlists.concat(result.playlists);
      }
      this.playlistsNext = result.next;
      this.playlistsLoaded = true;
      this.renderPlaylists();
    } catch {
      this.showError();
    }
  }

  private renderPlaylists(): void {
    const prevTop = this.el.body.scrollTop;
    const body = this.el.body;
    body.replaceChildren();
    this.hidePlayAll();
    this.hideNote();

    if (this.playlists.length === 0) {
      body.appendChild(this.createMessage(t('noPlaylists')));
      body.scrollTop = prevTop;
      return;
    }

    const frag = this.doc.createDocumentFragment();
    for (const playlist of this.playlists) {
      frag.appendChild(
        this.createItem({
          imageUrl: playlist.imageUrl,
          name: playlist.name,
          sub: t('playlistSub'),
          onClick: () => {
            void this.openPlaylist(playlist);
          },
        }),
      );
    }
    body.appendChild(frag);
    body.scrollTop = prevTop;
  }

  private async openPlaylist(playlist: PlaylistSummary): Promise<void> {
    this.activeTab = 'playlists';
    this.playlistView = playlist;
    this.playlistViewTracks = [];
    this.playlistDetailNext = false;
    this.updateTabs();
    this.hidePlayAll();
    this.hideNote();
    this.el.body.replaceChildren();

    try {
      const result = await this.deps.getPlaylistItems(playlist.id, 0);
      if (this.playlistView !== playlist) return;
      this.playlistViewTracks = result.tracks;
      this.playlistDetailNext = result.next;
      this.renderPlaylistDetail();
    } catch (error) {
      if (this.playlistView !== playlist) return;
      if (this.deps.isNotOwned(error)) {
        this.renderPlaylistDetailNotOwned();
      } else {
        this.showError();
      }
    }
  }

  private renderPlaylistDetail(): void {
    const playlist = this.playlistView;
    if (!playlist) return;

    const prevTop = this.el.body.scrollTop;
    const body = this.el.body;
    body.replaceChildren();

    body.appendChild(
      this.createItem({
        imageUrl: null,
        name: t('backToPlaylists'),
        sub: '',
        onClick: () => {
          this.playlistView = null;
          this.playlistViewTracks = [];
          this.playlistDetailNext = false;
          this.hidePlayAll();
          this.hideNote();
          if (this.playlistsLoaded) {
            this.renderPlaylists();
          } else {
            void this.loadPlaylists(true);
          }
        },
      }),
    );

    this.showPlayAll();
    this.showShuffle({ kind: 'playlist', id: playlist.id, name: playlist.name });

    const frag = this.doc.createDocumentFragment();
    for (const track of this.playlistViewTracks) {
      frag.appendChild(
        this.createItem({
          imageUrl: track.imageUrl,
          name: track.name,
          sub: this.trackSub(track),
          onClick: () => {
            this.playAndClose(() =>
              this.deps.playContext(playlist.uri, track.uri),
            );
          },
        }),
      );
    }
    body.appendChild(frag);
    body.scrollTop = prevTop;
  }

  private renderPlaylistDetailNotOwned(): void {
    const body = this.el.body;
    body.replaceChildren();
    this.showPlayAll();
    this.showNote(t('notOwnedNote'));
  }

  private async loadSaved(reset: boolean): Promise<void> {
    const offset = reset ? 0 : this.savedTracks.length;
    try {
      const result = await this.deps.getSavedTracks(offset);
      if (reset) {
        this.savedTracks = result.tracks;
      } else {
        this.savedTracks = this.savedTracks.concat(result.tracks);
      }
      this.savedNext = result.next;
      this.savedLoaded = true;
      this.renderSaved();
    } catch {
      this.showError();
    }
  }

  private renderSaved(): void {
    const prevTop = this.el.body.scrollTop;
    const body = this.el.body;
    body.replaceChildren();
    this.hidePlayAll();
    this.hideNote();

    if (this.savedTracks.length === 0) {
      body.appendChild(this.createMessage(t('noLikedSongs')));
      body.scrollTop = prevTop;
      return;
    }

    this.showShuffle({ kind: 'liked' });

    const frag = this.doc.createDocumentFragment();
    for (const track of this.savedTracks) {
      frag.appendChild(
        this.createItem({
          imageUrl: track.imageUrl,
          name: track.name,
          sub: this.trackSub(track),
          onClick: () => {
            const uris = this.savedTracks.map((item) => item.uri);
            this.playAndClose(() => this.deps.playUris(uris, track.uri));
          },
        }),
      );
    }
    body.appendChild(frag);
    body.scrollTop = prevTop;
  }

  private onBodyScroll(): void {
    const el = this.el.body;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      void this.loadMore();
    }
  }

  private async loadMore(): Promise<void> {
    if (this.loadingMore) return;

    if (this.activeTab === 'search') {
      if (this.searchQuery === '' || !this.searchHasMore) return;
      this.loadingMore = true;
      try {
        await this.runSearch(this.searchQuery, this.searchOffset, true);
      } finally {
        this.loadingMore = false;
      }
      return;
    }

    if (this.activeTab === 'playlists') {
      if (this.playlistView) {
        if (!this.playlistDetailNext) return;
        this.loadingMore = true;
        try {
          await this.loadMorePlaylistDetail();
        } finally {
          this.loadingMore = false;
        }
      } else {
        if (!this.playlistsNext) return;
        this.loadingMore = true;
        try {
          await this.loadPlaylists(false);
        } finally {
          this.loadingMore = false;
        }
      }
      return;
    }

    if (!this.savedNext) return;
    this.loadingMore = true;
    try {
      await this.loadSaved(false);
    } finally {
      this.loadingMore = false;
    }
  }

  private async loadMorePlaylistDetail(): Promise<void> {
    const playlist = this.playlistView;
    if (!playlist) return;
    try {
      const result = await this.deps.getPlaylistItems(
        playlist.id,
        this.playlistViewTracks.length,
      );
      if (this.playlistView !== playlist) return;
      this.playlistViewTracks = this.playlistViewTracks.concat(result.tracks);
      this.playlistDetailNext = result.next;
      this.renderPlaylistDetail();
    } catch (error) {
      if (this.playlistView !== playlist) return;
      if (this.deps.isNotOwned(error)) {
        this.renderPlaylistDetailNotOwned();
      } else {
        this.showError();
      }
    }
  }

  private createItem(opts: {
    imageUrl: string | null;
    name: string;
    sub: string;
    onClick: () => void;
  }): HTMLDivElement {
    const item = this.doc.createElement('div');
    item.className = 'lib-item';

    const img = this.doc.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    if (opts.imageUrl) {
      img.src = opts.imageUrl;
    } else {
      img.classList.add('noimg');
    }

    const text = this.doc.createElement('div');
    text.className = 'lib-text';

    const name = this.doc.createElement('div');
    name.className = 'name';
    name.textContent = opts.name;

    const sub = this.doc.createElement('div');
    sub.className = 'sub';
    sub.textContent = opts.sub;

    text.appendChild(name);
    text.appendChild(sub);
    item.appendChild(img);
    item.appendChild(text);
    item.addEventListener('click', () => {
      opts.onClick();
    });
    return item;
  }

  private createMessage(text: string): HTMLDivElement {
    const div = this.doc.createElement('div');
    div.className = 'lib-empty';
    div.textContent = text;
    return div;
  }

  private trackSub(track: Track): string {
    const parts: string[] = [];
    if (track.artists.length > 0) {
      parts.push(track.artists.join(', '));
    }
    if (track.album !== '') {
      parts.push(track.album);
    }
    return parts.join(' · ');
  }

  private showError(): void {
    const body = this.el.body;
    body.replaceChildren();
    this.hidePlayAll();
    this.hideNote();
    const div = this.doc.createElement('div');
    div.className = 'lib-error';
    div.textContent = t('loadFailed');
    body.appendChild(div);
  }

  private showPlayAll(): void {
    this.el.playAll.hidden = false;
  }

  private hidePlayAll(): void {
    this.el.playAll.hidden = true;
    this.el.shuffleBtn.hidden = true;
    this.shuffleSource = null;
  }

  private shuffleSource: { kind: 'liked' } | { kind: 'playlist'; id: string; name: string } | null = null;

  private showShuffle(src: { kind: 'liked' } | { kind: 'playlist'; id: string; name: string }): void {
    if (!this.deps.trueShuffle) return;
    this.shuffleSource = src;
    this.el.shuffleBtn.hidden = false;
  }

  private showNote(text: string): void {
    this.el.note.textContent = text;
    this.el.note.hidden = false;
  }

  private hideNote(): void {
    this.el.note.textContent = '';
    this.el.note.hidden = true;
  }

  private playAndClose(run: () => Promise<void>): void {
    try {
      const pending = run();
      void pending.catch(() => undefined);
    } catch {
      // 播放失敗時仍收起面板，錯誤由後續狀態更新處理。
    }
    this.close();
  }
}
