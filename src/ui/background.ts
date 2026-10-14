import { extractPalette, loadImageData, type ImageDataLike } from './colors';
import { createFluidBackground, type FluidBackground } from './fluidBackground';

/** 沒有封面或載入失敗時使用的預設色盤 */
const DEFAULT_PALETTE: [string, string, string] = ['#2a2a35', '#3a2f45', '#1f2a3a'];

/**
 * 把色盤寫進 CSS 變數 --c1/--c2/--c3。
 * 淡入淡出過渡由樣式表（main.css 的 transition）負責。
 */
export function setBackground(
  palette: [string, string, string],
  root: HTMLElement = document.documentElement,
): void {
  root.style.setProperty('--c1', palette[0]);
  root.style.setProperty('--c2', palette[1]);
  root.style.setProperty('--c3', palette[2]);
}

/** 遞增序號：只有最後一次呼叫的結果會被套用 */
let requestSeq = 0;

/**
 * 依封面網址更新背景色。
 * - url 為 null：使用預設色盤。
 * - 載入或取色失敗：使用預設色盤（不丟錯）。
 * - 若在 await 期間有更新的呼叫進來，舊的結果一律丟棄。
 */
export async function updateBackgroundFromImage(
  url: string | null,
  load: (url: string) => Promise<ImageData> = loadImageData,
): Promise<void> {
  const token = ++requestSeq;

  if (!url) {
    setBackground([...DEFAULT_PALETTE]);
    return;
  }

  let palette: [string, string, string];

  try {
    const data = await load(url);
    if (token !== requestSeq) return;
    palette = extractPalette(data as ImageDataLike);
  } catch {
    if (token !== requestSeq) return;
    palette = [...DEFAULT_PALETTE];
    setBackground(palette);
    return;
  }

  if (token !== requestSeq) return;
  setBackground(palette);
}

/** 目前顯示中的封面圖層（兩組輪流使用，換歌時交叉淡入）。 */
let artIndex = 0;
let lastArtUrl: string | null = null;

/**
 * 把封面放進背景的旋轉模糊圖層（.bg .art-set）。
 * 兩組圖層輪流使用：新封面放在沒顯示的那組，再交叉淡入。
 */
let fluid: FluidBackground | null | undefined;

export function setBackgroundArt(url: string | null, doc: Document = document): void {
  if (url === lastArtUrl) return;
  lastArtUrl = url;

  // 優先使用 WebGL 流動背景；第一次呼叫時才建立
  if (fluid === undefined) {
    const canvas = doc.querySelector<HTMLCanvasElement>('.bg .bg-fluid');
    fluid = canvas ? createFluidBackground(canvas) : null;
    if (fluid) canvas?.closest('.bg')?.classList.add('fluid-on');
  }
  if (fluid) {
    fluid.setImage(url);
    return;
  }

  const sets = doc.querySelectorAll<HTMLElement>('.bg .art-set');
  if (sets.length === 0) return;
  if (url === null) {
    sets.forEach((s) => s.classList.remove('show'));
    return;
  }
  const next = sets[(artIndex + 1) % sets.length];
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = (): void => {
    if (lastArtUrl !== url) return;
    next.style.setProperty('--art', `url("${url.replace(/"/g, '%22')}")`);
    sets.forEach((s) => s.classList.toggle('show', s === next));
    artIndex = (artIndex + 1) % sets.length;
  };
  img.src = url;
}
