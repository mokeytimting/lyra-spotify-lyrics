export interface ImageDataLike {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

/** 完全沒有可用像素時的後備色盤 */
const FALLBACK_PALETTE: [string, string, string] = ['#222222', '#333333', '#444444'];

/** HSL 亮度可接受的範圍 */
const MIN_LIGHTNESS = 0.1;
const MAX_LIGHTNESS = 0.95;

interface ColorBin {
  r: number;
  g: number;
  b: number;
  count: number;
  order: number;
}

function toByte(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const v = Math.floor(value);
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

/** 把像素依 R/G/B 高 4 bit 分箱，回傳每個色箱的平均色與像素數 */
function collectBins(data: ImageDataLike | null | undefined): ColorBin[] {
  const pixels = data && data.data ? data.data : null;
  if (!pixels || pixels.length < 4) return [];

  const acc = new Map<number, { r: number; g: number; b: number; count: number; order: number }>();
  let order = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = toByte(pixels[i + 3]);
    if (alpha < 128) continue;

    const r = toByte(pixels[i]);
    const g = toByte(pixels[i + 1]);
    const b = toByte(pixels[i + 2]);

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = acc.get(key);
    if (bin) {
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.count += 1;
    } else {
      acc.set(key, { r, g, b, count: 1, order: order++ });
    }
  }

  const bins: ColorBin[] = [];
  for (const bin of acc.values()) {
    bins.push({
      r: bin.r / bin.count,
      g: bin.g / bin.count,
      b: bin.b / bin.count,
      count: bin.count,
      order: bin.order,
    });
  }
  return bins;
}

/** HSL 亮度：L = (max + min) / 2 */
function lightness(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return (max + min) / 2;
}

function toHex(r: number, g: number, b: number): string {
  const part = (value: number): string => {
    const clamped = value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * 從影像像素取出代表色盤。
 * 依 R/G/B 高 4 bit 分箱，略過 alpha < 128 的像素，取每箱平均色，
 * 排除過暗或過亮的色箱後依像素數排序取前 k 色，不足 3 色時以最後一色補滿。
 */
export function extractPalette(data: ImageDataLike, k = 3): [string, string, string] {
  const bins = collectBins(data);
  if (bins.length === 0) {
    return [FALLBACK_PALETTE[0], FALLBACK_PALETTE[1], FALLBACK_PALETTE[2]];
  }

  const wanted = Number.isFinite(k) ? Math.floor(k) : 3;
  const limit = Math.min(Math.max(wanted, 1), 3);

  const filtered = bins.filter((bin) => {
    const l = lightness(bin.r, bin.g, bin.b);
    return l >= MIN_LIGHTNESS && l <= MAX_LIGHTNESS;
  });
  // 全部被亮度條件排除時，退回不排除亮度再算一次
  const candidates = filtered.length > 0 ? filtered : bins;

  candidates.sort((a, b) => b.count - a.count || a.order - b.order);

  const picked = candidates.slice(0, limit).map((bin) => toHex(bin.r, bin.g, bin.b));
  while (picked.length < 3) {
    picked.push(picked.length > 0 ? picked[picked.length - 1] : FALLBACK_PALETTE[0]);
  }

  return [picked[0], picked[1], picked[2]];
}

/** 讀取圖片並縮放成 size x size，取出對應的 ImageData。 */
export function loadImageData(url: string, size = 64): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('無法取得畫布繪圖環境'));
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(ctx.getImageData(0, 0, size, size));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('讀取圖片像素失敗'));
      }
    };
    img.onerror = () => reject(new Error('圖片載入失敗'));
    img.src = url;
  });
}
