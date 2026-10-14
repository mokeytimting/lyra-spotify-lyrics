// @ts-ignore
import * as OpenCC from 'opencc-js';

type Converter = (text: string) => string;

let converter: Converter | null = null;

function getConverter(): Converter {
  if (converter === null) {
    const oc: any = (OpenCC as any).default ?? OpenCC;
    converter = oc.Converter({ from: 'cn', to: 'tw' }) as Converter;
  }
  return converter;
}

export function toTraditional(s: string): string {
  if (typeof s !== 'string' || s.length === 0) return s;
  return getConverter()(s);
}

export function isLikelySimplified(s: string): boolean {
  if (typeof s !== 'string' || s.length === 0) return false;
  return toTraditional(s) !== s;
}

let toCn: Converter | null = null;

/** 繁體轉簡體（介面選簡體中文時，中文歌詞統一顯示簡體） */
export function toSimplified(s: string): string {
  if (typeof s !== 'string' || s.length === 0) return s;
  if (toCn === null) {
    const oc: any = (OpenCC as any).default ?? OpenCC;
    toCn = oc.Converter({ from: 'tw', to: 'cn' }) as Converter;
  }
  return toCn(s);
}
