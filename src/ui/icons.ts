// 介面用的 SVG 圖示（取代 emoji）。全部使用 currentColor，大小由 CSS 控制。

const svg = (body: string, viewBox = '0 0 24 24'): string =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  play: svg('<path fill="currentColor" d="M7 4.6v14.8c0 .9 1 1.4 1.7.9l11.2-7.4c.7-.4.7-1.4 0-1.8L8.7 3.7C8 3.2 7 3.7 7 4.6z"/>'),
  pause: svg('<rect fill="currentColor" x="5.5" y="4" width="4.5" height="16" rx="1.3"/><rect fill="currentColor" x="14" y="4" width="4.5" height="16" rx="1.3"/>'),
  prev: svg('<path fill="currentColor" d="M11.5 6.4v11.2c0 .8-.9 1.2-1.5.7L3.4 13c-.6-.5-.6-1.4 0-1.9L10 5.7c.6-.5 1.5-.1 1.5.7zm9 0v11.2c0 .8-.9 1.2-1.5.7L12.4 13c-.6-.5-.6-1.4 0-1.9L19 5.7c.6-.5 1.5-.1 1.5.7z"/>'),
  next: svg('<path fill="currentColor" d="M12.5 6.4v11.2c0 .8.9 1.2 1.5.7l6.6-5.3c.6-.5.6-1.4 0-1.9L14 5.7c-.6-.5-1.5-.1-1.5.7zm-9 0v11.2c0 .8.9 1.2 1.5.7l6.6-5.3c.6-.5.6-1.4 0-1.9L5 5.7c-.6-.5-1.5-.1-1.5.7z"/>'),
  volume: svg('<path fill="currentColor" d="M4 9.5h3l4.2-3.6c.6-.5 1.5-.1 1.5.7v10.8c0 .8-.9 1.2-1.5.7L7 14.5H4c-.6 0-1-.4-1-1v-3c0-.6.4-1 1-1z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.4 7.4 0 0 1 0 10.4"/>'),
  mute: svg('<path fill="currentColor" d="M4 9.5h3l4.2-3.6c.6-.5 1.5-.1 1.5.7v10.8c0 .8-.9 1.2-1.5.7L7 14.5H4c-.6 0-1-.4-1-1v-3c0-.6.4-1 1-1z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M16 9.5l5 5m0-5l-5 5"/>'),
  /** 網頁播放：瀏覽器視窗 */
  web: svg('<rect fill="none" stroke="currentColor" stroke-width="1.6" x="3" y="4.5" width="18" height="15" rx="2.5"/><path stroke="currentColor" stroke-width="1.6" d="M3 9h18"/><circle fill="currentColor" cx="6" cy="6.8" r=".9"/><circle fill="currentColor" cx="8.6" cy="6.8" r=".9"/>'),
  /** App 播放：筆電／裝置 */
  app: svg('<rect fill="none" stroke="currentColor" stroke-width="1.6" x="4.5" y="5" width="15" height="10.5" rx="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M2.5 19h19"/>'),
  translate: svg('<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M4 5.5h8M8 4v1.5M5.5 5.5c.6 2.6 2.4 4.8 5 6M10.5 5.5c-.6 2.8-2.6 5.2-5.5 6.5M13 20l3.5-8.5L20 20M14.2 17.2h4.6"/>'),
  romaji: svg('<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M4 18l4-12 4 12M5.3 14h5.4M14.5 18v-6.5M14.5 13.5c.6-1.4 1.8-2 3.5-2"/>'),
  queue: svg('<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M4 6.5h11M4 11.5h11M4 16.5h7"/><path fill="currentColor" d="M15.5 14.2v5.6c0 .5.5.8.9.5l4-2.8c.4-.3.4-.8 0-1.1l-4-2.8c-.4-.2-.9 0-.9.6z"/>'),
  search: svg('<circle fill="none" stroke="currentColor" stroke-width="1.8" cx="10.5" cy="10.5" r="6"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M15 15l5 5"/>'),
  close: svg('<path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>'),
  pip: svg('<rect fill="none" stroke="currentColor" stroke-width="1.6" x="3" y="5" width="18" height="14" rx="2.5"/><rect fill="currentColor" x="11.5" y="11" width="7.5" height="5.5" rx="1.2"/>'),
  gear: svg('<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M10.3 3.5h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.7v1.8l1.8 1.7-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.7v-1.8L4.2 8.9l1.7-2.9 2.3.8 1.6-.9z"/><circle fill="none" stroke="currentColor" stroke-width="1.6" cx="12" cy="12" r="2.8"/>'),
  shuffle: svg('<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M3 7h3.5c2.2 0 3.6 1.2 4.6 3.2l1.8 3.6c1 2 2.4 3.2 4.6 3.2H21M3 17h3.5c1.5 0 2.6-.6 3.4-1.6M14.1 8.6C14.9 7.6 16 7 17.5 7H21M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/>'),
  sparkle: svg('<path fill="currentColor" d="M12 3l1.6 5.1L19 10l-5.4 1.9L12 17l-1.6-5.1L5 10l5.4-1.9z"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** 建立一個只含圖示的按鈕；label 同時作為 aria-label 與 tooltip。 */
export function iconButton(className: string, icon: IconName, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `icon-btn ${className}`;
  b.innerHTML = ICONS[icon];
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

export function setIcon(el: HTMLElement, icon: IconName): void {
  el.innerHTML = ICONS[icon];
}
