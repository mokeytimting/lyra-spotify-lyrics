/** 手動搜尋 LRCLIB 歌詞用的挑選面板（無 UI 框架，純 DOM）。 */

import { defineStrings } from '../i18n';

const t = defineStrings({
  'zh-Hant': {
    'picker.title': '手動搜尋歌詞',
    'picker.close': '關閉',
    'picker.note': '歌詞來自 LRCLIB 社群資料庫；選好後這首歌會記住你的選擇',
    'picker.empty': '找不到結果，試試只輸入歌名',
    'picker.synced': '同步',
    'picker.plain': '純文字',
  },
  'zh-Hans': {
    'picker.title': '手动搜索歌词',
    'picker.close': '关闭',
    'picker.note': '歌词来自 LRCLIB 社区数据库；选好后这首歌会记住你的选择',
    'picker.empty': '没有找到结果，试试只输入歌名',
    'picker.synced': '同步',
    'picker.plain': '纯文本',
  },
  en: {
    'picker.title': 'Search lyrics manually',
    'picker.close': 'Close',
    'picker.note': 'Lyrics come from the LRCLIB community database; once you pick one, this track will remember your choice',
    'picker.empty': 'No results found — try entering just the song title',
    'picker.synced': 'Synced',
    'picker.plain': 'Plain text',
  },
  ja: {
    'picker.title': '歌詞を手動で検索',
    'picker.close': '閉じる',
    'picker.note': '歌詞は LRCLIB のコミュニティデータベースから取得します。選ぶと、この曲はあなたの選択を記憶します',
    'picker.empty': '結果が見つかりません。曲名だけを入力してみてください',
    'picker.synced': '同期',
    'picker.plain': 'テキストのみ',
  },
  ko: {
    'picker.title': '가사 직접 검색',
    'picker.close': '닫기',
    'picker.note': '가사는 LRCLIB 커뮤니티 데이터베이스에서 가져옵니다. 선택하면 이 곡에 선택한 가사가 기억됩니다',
    'picker.empty': '검색 결과가 없습니다. 곡 제목만 입력해 보세요',
    'picker.synced': '동기화',
    'picker.plain': '일반 텍스트',
  },
  es: {
    'picker.title': 'Buscar letras manualmente',
    'picker.close': 'Cerrar',
    'picker.note': 'Las letras provienen de la base de datos comunitaria de LRCLIB; cuando elijas una, esta canción recordará tu elección',
    'picker.empty': 'No se encontraron resultados; prueba a escribir solo el título de la canción',
    'picker.synced': 'Sincronizada',
    'picker.plain': 'Texto plano',
  },
});

export interface PickerSearchResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  durationSec: number;
  synced: boolean;
}

export interface PickerDeps {
  search(q: string): Promise<PickerSearchResult[]>;
  onPick(id: number): void | Promise<void>;
}

const DEBOUNCE_MS = 350;
const MATCH_TOLERANCE_SEC = 2;

function formatDuration(sec: number): string {
  const total = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export class LyricsPicker {
  private readonly root: HTMLElement;
  private readonly deps: PickerDeps;
  private readonly doc: Document;
  private readonly card: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLDivElement;

  private openFlag = false;
  private trackDurationSec = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchToken = 0;

  public constructor(root: HTMLElement, deps: PickerDeps) {
    this.root = root;
    this.deps = deps;
    this.doc = root.ownerDocument;

    const existingCard = root.querySelector('.picker-card');
    if (existingCard !== null) {
      existingCard.remove();
    }

    this.card = this.doc.createElement('div');
    this.card.className = 'picker-card';

    const head = this.doc.createElement('div');
    head.className = 'picker-head';

    const title = this.doc.createElement('h3');
    title.textContent = t('picker.title');

    const closeButton = this.doc.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'picker-close';
    closeButton.setAttribute('aria-label', t('picker.close'));
    closeButton.textContent = '×';

    head.appendChild(title);
    head.appendChild(closeButton);

    this.input = this.doc.createElement('input');
    this.input.type = 'search';
    this.input.className = 'picker-q';

    this.list = this.doc.createElement('div');
    this.list.className = 'picker-list';

    const note = this.doc.createElement('p');
    note.className = 'picker-note';
    note.textContent = t('picker.note');

    this.card.appendChild(head);
    this.card.appendChild(this.input);
    this.card.appendChild(this.list);
    this.card.appendChild(note);
    this.root.appendChild(this.card);

    this.input.addEventListener('input', this.handleInput);
    closeButton.addEventListener('click', this.handleCloseClick);
    this.root.addEventListener('click', this.handleRootClick);
    this.doc.addEventListener('keydown', this.handleKeyDown);
  }

  public open(initialQuery: string, trackDurationSec: number): void {
    this.trackDurationSec = Number.isFinite(trackDurationSec) ? trackDurationSec : 0;
    this.openFlag = true;
    this.root.classList.add('open');
    this.input.value = initialQuery;
    this.input.focus();

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    void this.runSearch(initialQuery);
  }

  public close(): void {
    this.openFlag = false;
    this.root.classList.remove('open');

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.searchToken += 1;
  }

  public isOpen(): boolean {
    return this.openFlag;
  }

  private readonly handleInput = (): void => {
    this.scheduleSearch(this.input.value);
  };

  private readonly handleCloseClick = (): void => {
    this.close();
  };

  private readonly handleRootClick = (event: MouseEvent): void => {
    if (event.target === this.root) {
      this.close();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.openFlag) {
      this.close();
    }
  };

  private scheduleSearch(query: string): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runSearch(query);
    }, DEBOUNCE_MS);
  }

  private async runSearch(query: string): Promise<void> {
    const token = (this.searchToken += 1);
    let results: PickerSearchResult[] = [];

    try {
      const found = await this.deps.search(query);
      if (Array.isArray(found)) {
        results = found;
      }
    } catch {
      results = [];
    }

    if (token !== this.searchToken || !this.openFlag) {
      return;
    }

    this.render(results);
  }

  private render(results: PickerSearchResult[]): void {
    this.list.textContent = '';

    if (results.length === 0) {
      const empty = this.doc.createElement('div');
      empty.className = 'picker-empty';
      empty.textContent = t('picker.empty');
      this.list.appendChild(empty);
      return;
    }

    const sorted = results.slice().sort((a, b) => {
      const matchA = this.isMatch(a) ? 0 : 1;
      const matchB = this.isMatch(b) ? 0 : 1;
      if (matchA !== matchB) {
        return matchA - matchB;
      }
      const syncedA = a.synced ? 0 : 1;
      const syncedB = b.synced ? 0 : 1;
      return syncedA - syncedB;
    });

    for (const item of sorted) {
      this.list.appendChild(this.createItem(item));
    }
  }

  private createItem(item: PickerSearchResult): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = 'picker-item';
    if (this.isMatch(item)) {
      button.classList.add('match');
    }

    const name = this.doc.createElement('span');
    name.className = 'name';
    name.textContent = item.trackName;

    const sub = this.doc.createElement('span');
    sub.className = 'sub';
    sub.textContent = `${item.artistName} · ${item.albumName}`;

    const dur = this.doc.createElement('span');
    dur.className = 'dur';
    dur.textContent = formatDuration(item.durationSec);

    const badge = this.doc.createElement('span');
    badge.className = 'badge';
    if (item.synced) {
      badge.textContent = t('picker.synced');
      badge.classList.add('synced');
    } else {
      badge.textContent = t('picker.plain');
      button.disabled = true;
    }

    button.appendChild(name);
    button.appendChild(sub);
    button.appendChild(dur);
    button.appendChild(badge);

    button.addEventListener('click', () => {
      if (button.disabled) {
        return;
      }
      void this.handlePick(item.id);
    });

    return button;
  }

  private async handlePick(id: number): Promise<void> {
    try {
      await this.deps.onPick(id);
    } catch {
      // 挑選失敗時仍關閉面板，讓使用者可以再試一次。
    } finally {
      this.close();
    }
  }

  private isMatch(item: PickerSearchResult): boolean {
    return (
      Number.isFinite(item.durationSec) &&
      Math.abs(item.durationSec - this.trackDurationSec) <= MATCH_TOLERANCE_SEC
    );
  }
}
