import type { Track } from '../spotify/types';
import { defineStrings } from '../i18n';
import { formatTime } from './nowPlaying';

const t = defineStrings({
  'zh-Hant': {
    'queue.head': '接下來播放',
    'queue.loading': '載入中…',
    'queue.error': '無法取得待播清單，請稍後再試',
    'queue.empty': '待播清單是空的',
  },
  'zh-Hans': {
    'queue.head': '接下来播放',
    'queue.loading': '加载中…',
    'queue.error': '无法获取待播清单，请稍后重试',
    'queue.empty': '待播清单是空的',
  },
  en: {
    'queue.head': 'Up Next',
    'queue.loading': 'Loading…',
    'queue.error': "Couldn't load the queue. Please try again later.",
    'queue.empty': 'The queue is empty',
  },
  ja: {
    'queue.head': '次に再生',
    'queue.loading': '読み込み中…',
    'queue.error': '再生キューを取得できませんでした。しばらくしてからもう一度お試しください。',
    'queue.empty': '再生キューは空です',
  },
  ko: {
    'queue.head': '다음 재생',
    'queue.loading': '불러오는 중…',
    'queue.error': '대기열을 가져올 수 없습니다. 잠시 후 다시 시도해 주세요.',
    'queue.empty': '대기열이 비어 있습니다',
  },
  es: {
    'queue.head': 'A continuación',
    'queue.loading': 'Cargando…',
    'queue.error': 'No se pudo obtener la cola de reproducción. Inténtalo de nuevo más tarde.',
    'queue.empty': 'La cola de reproducción está vacía',
  },
});

/** 右欄的「接下來播放」清單（取代歌詞欄顯示）。 */
export class QueueView {
  private readonly listEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;

  constructor(private readonly root: HTMLElement) {
    const head = document.createElement('div');
    head.className = 'queue-head';
    head.textContent = t('queue.head');
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'queue-status';
    this.listEl = document.createElement('div');
    this.listEl.className = 'queue-list';
    root.replaceChildren(head, this.statusEl, this.listEl);
  }

  setLoading(): void {
    if (this.listEl.childElementCount === 0) this.statusEl.textContent = t('queue.loading');
  }

  setError(): void {
    this.listEl.replaceChildren();
    this.statusEl.textContent = t('queue.error');
  }

  setTracks(tracks: Track[]): void {
    this.statusEl.textContent = tracks.length === 0 ? t('queue.empty') : '';
    const items = tracks.map((t, i) => {
      const item = document.createElement('div');
      item.className = 'queue-item';
      item.style.setProperty('--i', String(Math.min(i, 12)));

      const art = document.createElement('div');
      art.className = 'queue-art';
      if (t.imageUrl) {
        const img = document.createElement('img');
        img.src = t.imageUrl;
        img.alt = '';
        img.loading = 'lazy';
        art.appendChild(img);
      }

      const text = document.createElement('div');
      text.className = 'queue-text';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = t.name;
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = t.artists.join(', ');
      text.append(name, sub);

      const dur = document.createElement('div');
      dur.className = 'queue-dur';
      dur.textContent = formatTime(t.durationMs);

      item.append(art, text, dur);
      return item;
    });
    this.listEl.replaceChildren(...items);
    this.root.scrollTop = 0;
  }
}
