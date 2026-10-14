// kuroshiro 與 kuromoji 只在第一次遇到日文歌時才載入（字典很大，且載入失敗不能拖垮整個播放器）。
let kuroshiro: any = null;
let initPromise: Promise<void> | null = null;

/**
 * 初始化 kuroshiro（含 kuromoji 字典）。只會初始化一次；
 * 之後重複呼叫都會拿到同一個 Promise，dictPath 以第一次呼叫的為準。
 */
export function initJapanese(dictPath: string = '/kuromoji-dict/'): Promise<void> {
  if (initPromise === null) {
    initPromise = (async () => {
      // @ts-ignore
      const KuroshiroMod = await import('kuroshiro');
      // @ts-ignore
      const AnalyzerMod = await import('kuroshiro-analyzer-kuromoji');
      const Kuroshiro = KuroshiroMod.default?.default ?? KuroshiroMod.default ?? KuroshiroMod;
      const Analyzer = AnalyzerMod.default?.default ?? AnalyzerMod.default ?? AnalyzerMod;
      const instance = new Kuroshiro();
      await instance.init(new Analyzer({ dictPath }));
      kuroshiro = instance;
    })();
    initPromise.catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

async function ensureReady(): Promise<void> {
  if (kuroshiro === null) {
    await initJapanese();
  }
}

/** 將一行日文轉成含 <ruby> 的假名標音 HTML。 */
export async function toFuriganaHtml(line: string): Promise<string> {
  await ensureReady();
  return await kuroshiro.convert(line, { mode: 'furigana', to: 'hiragana' });
}

/** 將一行日文轉成羅馬拼音（Hepburn），去除前後空白並壓縮連續空白。 */
export async function toRomaji(line: string): Promise<string> {
  await ensureReady();
  const result = await kuroshiro.convert(line, {
    mode: 'spaced',
    to: 'romaji',
    romajiSystem: 'hepburn',
  });
  return String(result).trim().replace(/\s+/g, ' ');
}
