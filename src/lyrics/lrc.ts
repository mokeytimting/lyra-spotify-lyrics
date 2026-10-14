/**
 * LRC 歌詞解析工具（計畫 Task 6）。
 *
 * 提供：
 * - parseLrc：把 LRC 文字解析成依時間排序的歌詞行
 * - lineIndexAt：以二分搜尋找出某個時間點對應的歌詞行
 * - cleanTitle：清掉歌名中的版本說明，供 LRCLIB 查詢備援使用
 */

export type LyricLine = {
  timeMs: number;
  text: string;
};

/** 時間標籤：[mm:ss]、[mm:ss.xx]、[mm:ss.xxx]（小數分隔可用 . 或 :）。 */
const TIME_TAG_PATTERN = '\\[(\\d+):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]';

/** 位移標籤：[offset:+500]、[offset:-500]。 */
const OFFSET_TAG_PATTERN = /\[offset:\s*([+-]?\d+)\s*\]/i;

/** 方括號段落（例如 [Remix]、[Live]）。 */
const SQUARE_BRACKET_PATTERN = /\[[^\]]*\]/g;

/** 括號內的 feat. / ft. / with / featuring 段落。 */
const FEAT_PAREN_PATTERN = /\(\s*(?:feat(?:uring)?|ft|with)\.?\s[^)]*\)/gi;

/** 破折號之後的版本說明（例如 " - Remastered 2009"、" - Live"）。 */
const VERSION_SUFFIX_PATTERN = /\s+-\s*.*$/;

/**
 * 解析 LRC 文字。
 *
 * - 支援 [mm:ss]、[mm:ss.xx]、[mm:ss.xxx]
 * - 同一行有多個時間標籤時，展開成多筆共用同一段文字
 * - 套用 [offset:±ms]（正的 offset 表示歌詞提早，所有時間減去該值；小於 0 取 0）
 * - 依時間升冪排序（同時間者維持原始出現順序）
 * - 略過沒有時間標籤的行（metadata 或一般文字）
 * - 有時間標籤但文字為空的行保留成 text: ''（間奏）
 */
export function parseLrc(lrc: string): LyricLine[] {
  if (typeof lrc !== 'string' || lrc.length === 0) {
    return [];
  }

  const rawLines = lrc.split(/\r\n|\r|\n/);

  let offsetMs = 0;
  for (const rawLine of rawLines) {
    const offsetMatch = OFFSET_TAG_PATTERN.exec(rawLine);
    if (offsetMatch !== null) {
      const value = Number.parseInt(offsetMatch[1] ?? '0', 10);
      if (Number.isFinite(value)) {
        offsetMs = value;
      }
    }
  }

  const timeTagPattern = new RegExp(TIME_TAG_PATTERN, 'g');
  const parsed: LyricLine[] = [];

  for (const rawLine of rawLines) {
    timeTagPattern.lastIndex = 0;
    const stamps: number[] = [];

    let match: RegExpExecArray | null = timeTagPattern.exec(rawLine);
    while (match !== null) {
      const minutes = Number.parseInt(match[1] ?? '0', 10);
      const seconds = Number.parseInt(match[2] ?? '0', 10);
      const fraction = match[3] ?? '';

      let fractionMs = 0;
      if (fraction.length === 1) {
        fractionMs = Number.parseInt(fraction, 10) * 100;
      } else if (fraction.length === 2) {
        fractionMs = Number.parseInt(fraction, 10) * 10;
      } else if (fraction.length === 3) {
        fractionMs = Number.parseInt(fraction, 10);
      }

      stamps.push(minutes * 60000 + seconds * 1000 + fractionMs);
      match = timeTagPattern.exec(rawLine);
    }

    if (stamps.length === 0) {
      continue;
    }

    timeTagPattern.lastIndex = 0;
    const text = rawLine.replace(timeTagPattern, '').trim();

    for (const stamp of stamps) {
      let timeMs = stamp - offsetMs;
      if (timeMs < 0) {
        timeMs = 0;
      }
      parsed.push({ timeMs, text });
    }
  }

  parsed.sort((a, b) => a.timeMs - b.timeMs);
  return parsed;
}

/**
 * 找出 ms 這個時間點落在哪一行（回傳最後一個 timeMs <= ms 的索引）。
 * 在第一行之前、陣列為空或 ms 非有限數值時回傳 -1。
 */
export function lineIndexAt(lines: LyricLine[], ms: number): number {
  if (!Array.isArray(lines) || lines.length === 0) {
    return -1;
  }
  if (!Number.isFinite(ms)) {
    return -1;
  }

  let low = 0;
  let high = lines.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = lines[mid]?.timeMs;
    if (typeof value === 'number' && value <= ms) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
}

/**
 * 清理歌名：去掉方括號段落、feat./ft./with 括號段落，以及破折號之後的版本說明。
 * 清理後為空字串時回傳原始歌名。
 */
export function cleanTitle(name: string): string {
  if (typeof name !== 'string') {
    return name;
  }

  let out = name;
  out = out.replace(SQUARE_BRACKET_PATTERN, ' ');
  out = out.replace(FEAT_PAREN_PATTERN, ' ');
  out = out.replace(VERSION_SUFFIX_PATTERN, '');
  out = out.replace(/\s+/g, ' ').trim();

  if (out.length === 0) {
    return name;
  }
  return out;
}
