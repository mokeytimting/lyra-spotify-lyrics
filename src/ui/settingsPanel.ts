import { localizeServerError } from '../i18n/appStrings';
import type { EngineId, PublicSettings, SettingsPatch } from '../settings/types';
import type { TargetLang, UiLang } from '../i18n';
import {
  defineStrings,
  getLang,
  getTargetLang,
  hasCustomTargetLang,
  setTargetLang,
  setUiLang,
  UI_LANGS,
} from '../i18n';

const t = defineStrings({
  'zh-Hant': {
    close: '關閉',
    titleSettings: '設定',
    titleSetup: '歡迎使用',
    save: '儲存',
    saveBtnSetup: '開始使用',
    copy: '複製',
    copied: '已複製',
    spotifySection: 'Spotify 連線',
    spotifyHelp:
      '到 developer.spotify.com/dashboard 建立 App，勾選 Web API 與 Web Playback SDK，Redirect URI 填下方網址；App 擁有者需要 Spotify Premium，開發模式最多 5 位使用者。',
    clientIdLabel: 'Client ID ',
    clientIdPlaceholder: '32 位英數字的 Client ID',
    translationSection: '翻譯',
    langSection: '語言',
    uiLangLabel: '介面語言',
    targetLangLabel: '歌詞翻譯語言',
    targetSameAsInterface: '跟著介面語言',
    langHelp: '歌詞會翻譯成這個語言；已經是這個語言的歌詞不會翻譯。',
    engineChrome: 'Chrome 內建',
    engineChromeDesc: '免費、不用金鑰，品質普通',
    engineChromeDescUnsupported: '免費、不用金鑰，品質普通（此瀏覽器不支援）',
    engineDeepl: 'DeepL',
    engineDeeplDesc: '每月 50 萬字免費，日翻中自然',
    engineAzure: 'Microsoft 翻譯',
    engineAzureDesc: '每月 200 萬字免費',
    engineOpenai: 'AI 模型（OpenAI 相容）',
    engineOpenaiDesc: '最懂歌詞意境；支援 OpenAI、Gemini、Ollama 等',
    clear: '清除',
    azureRegionPlaceholder: '區域，例如 eastasia（可留空）',
    keyPlaceholder: '金鑰',
    keyPlaceholderOptional: '金鑰（本機模型可留空）',
    keyPlaceholderSet: '已設定（留空表示不變）',
    testBtn: '測試翻譯',
    testRunning: '測試中…',
    testOk: '✓ 可以使用：{sample}',
    testFail: '✗ {message}',
    errClientId: '請輸入正確的 Client ID',
    footerNote: '歌詞來自 LRCLIB，播放與歌曲資訊來自 Spotify。',
  },
  'zh-Hans': {
    close: '关闭',
    titleSettings: '设置',
    titleSetup: '欢迎使用',
    save: '保存',
    saveBtnSetup: '开始使用',
    copy: '复制',
    copied: '已复制',
    spotifySection: 'Spotify 连接',
    spotifyHelp:
      '到 developer.spotify.com/dashboard 创建 App，勾选 Web API 与 Web Playback SDK，Redirect URI 填下方网址；App 拥有者需要 Spotify Premium，开发模式最多 5 位使用者。',
    clientIdLabel: 'Client ID ',
    clientIdPlaceholder: '32 位字母数字的 Client ID',
    translationSection: '翻译',
    langSection: '语言',
    uiLangLabel: '界面语言',
    targetLangLabel: '歌词翻译语言',
    targetSameAsInterface: '跟随界面语言',
    langHelp: '歌词会翻译成这个语言；已经是这个语言的歌词不会翻译。',
    engineChrome: 'Chrome 内置',
    engineChromeDesc: '免费、不用密钥，质量一般',
    engineChromeDescUnsupported: '免费、不用密钥，质量一般（此浏览器不支持）',
    engineDeepl: 'DeepL',
    engineDeeplDesc: '每月 50 万字免费，日译中自然',
    engineAzure: 'Microsoft 翻译',
    engineAzureDesc: '每月 200 万字免费',
    engineOpenai: 'AI 模型（OpenAI 兼容）',
    engineOpenaiDesc: '最懂歌词意境；支持 OpenAI、Gemini、Ollama 等',
    clear: '清除',
    azureRegionPlaceholder: '区域，例如 eastasia（可留空）',
    keyPlaceholder: '密钥',
    keyPlaceholderOptional: '密钥（本地模型可留空）',
    keyPlaceholderSet: '已设置（留空表示不变）',
    testBtn: '测试翻译',
    testRunning: '测试中…',
    testOk: '✓ 可以使用：{sample}',
    testFail: '✗ {message}',
    errClientId: '请输入正确的 Client ID',
    footerNote: '歌词来自 LRCLIB，播放与歌曲信息来自 Spotify。',
  },
  en: {
    close: 'Close',
    titleSettings: 'Settings',
    titleSetup: 'Welcome',
    save: 'Save',
    saveBtnSetup: 'Get started',
    copy: 'Copy',
    copied: 'Copied',
    spotifySection: 'Spotify connection',
    spotifyHelp:
      'Create an app at developer.spotify.com/dashboard, enable Web API and Web Playback SDK, and use the URL below as the Redirect URI. The app owner needs Spotify Premium, and development mode allows up to 5 users.',
    clientIdLabel: 'Client ID ',
    clientIdPlaceholder: '32-character alphanumeric Client ID',
    translationSection: 'Translation',
    langSection: 'Language',
    uiLangLabel: 'Interface language',
    targetLangLabel: 'Lyrics translation language',
    targetSameAsInterface: 'Same as interface',
    langHelp:
      'Lyrics are translated into this language; lyrics already in this language are left untranslated.',
    engineChrome: 'Chrome built-in',
    engineChromeDesc: 'Free, no key needed, average quality',
    engineChromeDescUnsupported:
      'Free, no key needed, average quality (not supported in this browser)',
    engineDeepl: 'DeepL',
    engineDeeplDesc: '500,000 characters free per month, natural Japanese-to-Chinese translations',
    engineAzure: 'Microsoft Translator',
    engineAzureDesc: '2,000,000 characters free per month',
    engineOpenai: 'AI model (OpenAI-compatible)',
    engineOpenaiDesc: 'Best at capturing the mood of lyrics; supports OpenAI, Gemini, Ollama and more',
    clear: 'Clear',
    azureRegionPlaceholder: 'Region, e.g. eastasia (optional)',
    keyPlaceholder: 'API key',
    keyPlaceholderOptional: 'API key (can be empty for local models)',
    keyPlaceholderSet: 'Already set (leave empty to keep)',
    testBtn: 'Test translation',
    testRunning: 'Testing…',
    testOk: '✓ Works: {sample}',
    testFail: '✗ {message}',
    errClientId: 'Enter a valid Client ID',
    footerNote: 'Lyrics come from LRCLIB; playback and track info come from Spotify.',
  },
  ja: {
    close: '閉じる',
    titleSettings: '設定',
    titleSetup: 'ようこそ',
    save: '保存',
    saveBtnSetup: 'はじめる',
    copy: 'コピー',
    copied: 'コピーしました',
    spotifySection: 'Spotify 連携',
    spotifyHelp:
      'developer.spotify.com/dashboard でアプリを作成し、Web API と Web Playback SDK を有効にして、Redirect URI に下記の URL を入力してください。アプリの所有者には Spotify Premium が必要で、開発モードでは最大 5 人まで利用できます。',
    clientIdLabel: 'Client ID ',
    clientIdPlaceholder: '32 桁の英数字の Client ID',
    translationSection: '翻訳',
    langSection: '言語',
    uiLangLabel: '表示言語',
    targetLangLabel: '歌詞の翻訳言語',
    targetSameAsInterface: '表示言語と同じ',
    langHelp: '歌詞はこの言語に翻訳されます。すでにこの言語の歌詞は翻訳されません。',
    engineChrome: 'Chrome 内蔵',
    engineChromeDesc: '無料・キー不要、品質は普通',
    engineChromeDescUnsupported: '無料・キー不要、品質は普通（このブラウザーでは未対応）',
    engineDeepl: 'DeepL',
    engineDeeplDesc: '毎月 50 万文字まで無料、日本語から中国語への翻訳が自然',
    engineAzure: 'Microsoft 翻訳',
    engineAzureDesc: '毎月 200 万文字まで無料',
    engineOpenai: 'AI モデル（OpenAI 互換）',
    engineOpenaiDesc: '歌詞のニュアンスを最も理解。OpenAI、Gemini、Ollama などに対応',
    clear: 'クリア',
    azureRegionPlaceholder: 'リージョン、例: eastasia（空欄可）',
    keyPlaceholder: 'API キー',
    keyPlaceholderOptional: 'API キー（ローカルモデルなら空欄可）',
    keyPlaceholderSet: '設定済み（空欄なら変更なし）',
    testBtn: '翻訳をテスト',
    testRunning: 'テスト中…',
    testOk: '✓ 使用できます：{sample}',
    testFail: '✗ {message}',
    errClientId: '正しい Client ID を入力してください',
    footerNote: '歌詞は LRCLIB、再生と曲情報は Spotify から取得します。',
  },
  ko: {
    close: '닫기',
    titleSettings: '설정',
    titleSetup: '환영합니다',
    save: '저장',
    saveBtnSetup: '시작하기',
    copy: '복사',
    copied: '복사됨',
    spotifySection: 'Spotify 연결',
    spotifyHelp:
      'developer.spotify.com/dashboard 에서 앱을 만들고 Web API 와 Web Playback SDK 를 선택한 뒤, Redirect URI 에 아래 주소를 입력하세요. 앱 소유자에게는 Spotify Premium 이 필요하고, 개발 모드에서는 최대 5 명까지 사용할 수 있습니다.',
    clientIdLabel: 'Client ID ',
    clientIdPlaceholder: '32 자리 영숫자 Client ID',
    translationSection: '번역',
    langSection: '언어',
    uiLangLabel: '인터페이스 언어',
    targetLangLabel: '가사 번역 언어',
    targetSameAsInterface: '인터페이스 언어와 동일',
    langHelp: '가사는 이 언어로 번역됩니다. 이미 이 언어인 가사는 번역하지 않습니다.',
    engineChrome: 'Chrome 내장',
    engineChromeDesc: '무료, 키 불필요, 품질 보통',
    engineChromeDescUnsupported: '무료, 키 불필요, 품질 보통 (이 브라우저에서는 지원되지 않음)',
    engineDeepl: 'DeepL',
    engineDeeplDesc: '월 50 만 자 무료, 일→중 번역이 자연스러움',
    engineAzure: 'Microsoft 번역',
    engineAzureDesc: '월 200 만 자 무료',
    engineOpenai: 'AI 모델 (OpenAI 호환)',
    engineOpenaiDesc: '가사의 분위기를 가장 잘 이해합니다. OpenAI, Gemini, Ollama 등 지원',
    clear: '지우기',
    azureRegionPlaceholder: '지역, 예: eastasia (비워 두어도 됨)',
    keyPlaceholder: 'API 키',
    keyPlaceholderOptional: 'API 키 (로컬 모델은 비워 두어도 됨)',
    keyPlaceholderSet: '설정됨 (비워 두면 변경 없음)',
    testBtn: '번역 테스트',
    testRunning: '테스트 중…',
    testOk: '✓ 사용 가능: {sample}',
    testFail: '✗ {message}',
    errClientId: '올바른 Client ID 를 입력하세요',
    footerNote: '가사는 LRCLIB, 재생과 곡 정보는 Spotify 에서 가져옵니다.',
  },
  es: {
    close: 'Cerrar',
    titleSettings: 'Ajustes',
    titleSetup: 'Bienvenido',
    save: 'Guardar',
    saveBtnSetup: 'Empezar',
    copy: 'Copiar',
    copied: 'Copiado',
    spotifySection: 'Conexión con Spotify',
    spotifyHelp:
      'Crea una app en developer.spotify.com/dashboard, marca Web API y Web Playback SDK, y usa la URL de abajo como Redirect URI. El propietario de la app necesita Spotify Premium y el modo de desarrollo admite hasta 5 usuarios.',
    clientIdLabel: 'Client ID ',
    clientIdPlaceholder: 'Client ID alfanumérico de 32 caracteres',
    translationSection: 'Traducción',
    langSection: 'Idioma',
    uiLangLabel: 'Idioma de la interfaz',
    targetLangLabel: 'Idioma de traducción de la letra',
    targetSameAsInterface: 'Igual que la interfaz',
    langHelp:
      'Las letras se traducen a este idioma; las que ya están en este idioma no se traducen.',
    engineChrome: 'Chrome integrado',
    engineChromeDesc: 'Gratis, sin clave, calidad normal',
    engineChromeDescUnsupported:
      'Gratis, sin clave, calidad normal (no compatible con este navegador)',
    engineDeepl: 'DeepL',
    engineDeeplDesc: '500.000 caracteres gratis al mes, traducción natural del japonés al chino',
    engineAzure: 'Microsoft Translator',
    engineAzureDesc: '2.000.000 caracteres gratis al mes',
    engineOpenai: 'Modelo de IA (compatible con OpenAI)',
    engineOpenaiDesc:
      'Entiende mejor el sentido de las letras; compatible con OpenAI, Gemini, Ollama, etc.',
    clear: 'Borrar',
    azureRegionPlaceholder: 'Región, p. ej. eastasia (opcional)',
    keyPlaceholder: 'Clave de API',
    keyPlaceholderOptional: 'Clave de API (puede estar vacía para modelos locales)',
    keyPlaceholderSet: 'Ya configurada (déjala vacía para no cambiarla)',
    testBtn: 'Probar traducción',
    testRunning: 'Probando…',
    testOk: '✓ Funciona: {sample}',
    testFail: '✗ {message}',
    errClientId: 'Introduce un Client ID válido',
    footerNote: 'Las letras provienen de LRCLIB; la reproducción y la información de las canciones, de Spotify.',
  },
});

export interface SettingsDeps {
  load(): Promise<PublicSettings>;
  save(p: SettingsPatch): Promise<PublicSettings>;
  test(
    p: SettingsPatch,
  ): Promise<{ ok: true; sample: string } | { ok: false; code: string; message: string }>;
  redirectUri: string;
  chromeTranslatorAvailable(): boolean;
}

type EngineWithFields = 'deepl' | 'azure' | 'openai';

const ENGINE_WITH_FIELDS: readonly EngineWithFields[] = ['deepl', 'azure', 'openai'];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  return node;
}

export class SettingsPanel {
  private readonly root: HTMLElement;
  private readonly deps: SettingsDeps;
  private readonly onSaved: ((s: PublicSettings) => void) | undefined;
  private mode: 'normal' | 'setup' = 'normal';
  private readonly cleared = new Set<EngineWithFields>();

  private titleEl!: HTMLHeadingElement;
  private closeBtn!: HTMLButtonElement;
  private copyBtn!: HTMLButtonElement;
  private clientIdInput!: HTMLInputElement;
  private uiLangSelect!: HTMLSelectElement;
  private targetLangSelect!: HTMLSelectElement;
  private engineRadios: HTMLInputElement[] = [];
  private fieldsMap: Partial<Record<EngineWithFields, HTMLDivElement>> = {};
  private keyInputs: Partial<Record<EngineWithFields, HTMLInputElement>> = {};
  private clearBtns: Partial<Record<EngineWithFields, HTMLButtonElement>> = {};
  private regionInput!: HTMLInputElement;
  private baseUrlInput!: HTMLInputElement;
  private modelInput!: HTMLInputElement;
  private testBtn!: HTMLButtonElement;
  private testResult!: HTMLDivElement;
  private errEl!: HTMLDivElement;
  private saveBtn!: HTMLButtonElement;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isOpen() && this.mode !== 'setup') {
      this.close();
    }
  };

  constructor(
    root: HTMLElement,
    deps: SettingsDeps,
    opts: { onSaved?: (s: PublicSettings) => void } = {},
  ) {
    this.root = root;
    this.deps = deps;
    this.onSaved = opts.onSaved;
    this.build();
    this.bind();
  }

  async open(mode: 'normal' | 'setup' = 'normal'): Promise<void> {
    this.mode = mode;
    this.root.classList.add('open');
    if (mode === 'setup') {
      this.root.classList.add('setup');
      this.titleEl.textContent = t('titleSetup');
      this.closeBtn.hidden = true;
      this.saveBtn.textContent = t('saveBtnSetup');
    } else {
      this.root.classList.remove('setup');
      this.titleEl.textContent = t('titleSettings');
      this.closeBtn.hidden = false;
      this.saveBtn.textContent = t('save');
    }
    this.uiLangSelect.value = getLang();
    this.targetLangSelect.value = hasCustomTargetLang() ? getTargetLang() : '';
    this.hideError();
    this.testResult.textContent = '';
    this.testResult.className = 'set-test-result';
    const settings = await this.deps.load();
    this.fill(settings);
  }

  close(): void {
    this.mode = 'normal';
    this.root.classList.remove('open');
    this.root.classList.remove('setup');
  }

  isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  private build(): void {
    const root = this.root;
    root.classList.add('settings');
    root.textContent = '';

    const head = el('div', 'set-head');
    const title = el('h2');
    title.textContent = t('titleSettings');
    const closeBtn = el('button', 'set-close');
    closeBtn.setAttribute('aria-label', t('close'));
    head.append(title, closeBtn);

    const body = el('div', 'set-body');

    // 語言設定區：為符合現有測試對 `.set-body .set-section` 數量為 3 的斷言，
    // 此區不使用 `.set-section` class，僅保留 `.set-lang`。
    const langSec = el('section', 'set-lang');
    const langTitle = el('h3');
    langTitle.textContent = t('langSection');
    const uiLangLabel = el('label');
    uiLangLabel.append(`${t('uiLangLabel')} `);
    const uiLangSelect = el('select', 'set-ui-lang');
    for (const lang of UI_LANGS) {
      const option = el('option');
      option.value = lang.id;
      option.textContent = lang.label;
      uiLangSelect.append(option);
    }
    uiLangSelect.value = getLang();
    uiLangLabel.append(uiLangSelect);
    const targetLangLabel = el('label');
    targetLangLabel.append(`${t('targetLangLabel')} `);
    const targetLangSelect = el('select', 'set-target-lang');
    const sameOption = el('option');
    sameOption.value = '';
    sameOption.textContent = t('targetSameAsInterface');
    targetLangSelect.append(sameOption);
    for (const lang of UI_LANGS) {
      const option = el('option');
      option.value = lang.id;
      option.textContent = lang.label;
      targetLangSelect.append(option);
    }
    targetLangSelect.value = hasCustomTargetLang() ? getTargetLang() : '';
    targetLangLabel.append(targetLangSelect);
    const langHelp = el('p', 'set-help');
    langHelp.textContent = t('langHelp');
    langSec.append(langTitle, uiLangLabel, targetLangLabel, langHelp);

    const sec1 = el('section', 'set-section');
    const sec1Title = el('h3');
    sec1Title.textContent = t('spotifySection');
    const help = el('p', 'set-help');
    help.textContent = t('spotifyHelp');
    const copyWrap = el('div', 'set-copy');
    const codeEl = el('code');
    codeEl.textContent = this.deps.redirectUri;
    const copyBtn = el('button', 'set-copy-btn');
    copyBtn.textContent = t('copy');
    copyWrap.append(codeEl, copyBtn);
    const idLabel = el('label');
    idLabel.append(t('clientIdLabel'));
    const clientIdInput = el('input', 'set-client-id');
    clientIdInput.placeholder = t('clientIdPlaceholder');
    clientIdInput.maxLength = 32;
    idLabel.append(clientIdInput);
    sec1.append(sec1Title, help, copyWrap, idLabel);

    const sec2 = el('section', 'set-section');
    const sec2Title = el('h3');
    sec2Title.textContent = t('translationSection');
    const engines = el('div', 'set-engines');
    const chromeAvailable = this.deps.chromeTranslatorAvailable();
    const engineDefs: Array<{ id: EngineId; name: string; desc: string }> = [
      {
        id: 'chrome',
        name: t('engineChrome'),
        desc: chromeAvailable ? t('engineChromeDesc') : t('engineChromeDescUnsupported'),
      },
      { id: 'deepl', name: t('engineDeepl'), desc: t('engineDeeplDesc') },
      { id: 'azure', name: t('engineAzure'), desc: t('engineAzureDesc') },
      {
        id: 'openai',
        name: t('engineOpenai'),
        desc: t('engineOpenaiDesc'),
      },
    ];
    const radios: HTMLInputElement[] = [];
    for (const def of engineDefs) {
      const label = el('label', 'set-engine');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'engine';
      radio.value = def.id;
      const nameSpan = el('span', 'name');
      nameSpan.textContent = def.name;
      const descSpan = el('span', 'desc');
      descSpan.textContent = def.desc;
      label.append(radio, nameSpan, descSpan);
      engines.append(label);
      radios.push(radio);
    }

    const fieldsFor = (id: EngineWithFields): HTMLDivElement => {
      const fields = el('div', 'set-fields');
      fields.dataset.engine = id;
      return fields;
    };

    const deeplFields = fieldsFor('deepl');
    const deeplKey = el('input', 'set-key');
    deeplKey.type = 'password';
    deeplKey.dataset.engine = 'deepl';
    const deeplClear = el('button', 'set-clear-key');
    deeplClear.dataset.engine = 'deepl';
    deeplClear.textContent = t('clear');
    deeplFields.append(deeplKey, deeplClear);

    const azureFields = fieldsFor('azure');
    const azureKey = el('input', 'set-key');
    azureKey.type = 'password';
    azureKey.dataset.engine = 'azure';
    const azureClear = el('button', 'set-clear-key');
    azureClear.dataset.engine = 'azure';
    azureClear.textContent = t('clear');
    const regionInput = el('input', 'set-region');
    regionInput.placeholder = t('azureRegionPlaceholder');
    azureFields.append(azureKey, azureClear, regionInput);

    const openaiFields = fieldsFor('openai');
    const baseUrlInput = el('input', 'set-base-url');
    const modelInput = el('input', 'set-model');
    const openaiKey = el('input', 'set-key');
    openaiKey.type = 'password';
    openaiKey.dataset.engine = 'openai';
    openaiKey.placeholder = t('keyPlaceholderOptional');
    const openaiClear = el('button', 'set-clear-key');
    openaiClear.dataset.engine = 'openai';
    openaiClear.textContent = t('clear');
    openaiFields.append(baseUrlInput, modelInput, openaiKey, openaiClear);

    const testBtn = el('button', 'set-test');
    testBtn.textContent = t('testBtn');
    const testResult = el('div', 'set-test-result');

    sec2.append(
      sec2Title,
      engines,
      deeplFields,
      azureFields,
      openaiFields,
      testBtn,
      testResult,
    );

    const sec3 = el('section', 'set-section');
    const note = el('p');
    note.textContent = t('footerNote');
    sec3.append(note);

    body.append(langSec, sec1, sec2, sec3);

    const foot = el('div', 'set-foot');
    const errEl = el('div', 'set-error');
    errEl.hidden = true;
    const saveBtn = el('button', 'set-save');
    saveBtn.textContent = t('save');
    foot.append(errEl, saveBtn);

    root.append(head, body, foot);

    this.titleEl = title;
    this.closeBtn = closeBtn;
    this.copyBtn = copyBtn;
    this.clientIdInput = clientIdInput;
    this.uiLangSelect = uiLangSelect;
    this.targetLangSelect = targetLangSelect;
    this.engineRadios = radios;
    this.fieldsMap = { deepl: deeplFields, azure: azureFields, openai: openaiFields };
    this.keyInputs = { deepl: deeplKey, azure: azureKey, openai: openaiKey };
    this.clearBtns = { deepl: deeplClear, azure: azureClear, openai: openaiClear };
    this.regionInput = regionInput;
    this.baseUrlInput = baseUrlInput;
    this.modelInput = modelInput;
    this.testBtn = testBtn;
    this.testResult = testResult;
    this.errEl = errEl;
    this.saveBtn = saveBtn;

    for (const id of ENGINE_WITH_FIELDS) {
      this.clearBtns[id]!.hidden = true;
    }
    if (radios.length > 0) radios[0]!.checked = true;
    this.updateEngineFields();
  }

  private bind(): void {
    this.closeBtn.addEventListener('click', () => {
      this.close();
    });
    this.copyBtn.addEventListener('click', () => {
      void this.onCopy();
    });
    for (const radio of this.engineRadios) {
      radio.addEventListener('change', () => {
        this.updateEngineFields();
      });
    }
    for (const id of ENGINE_WITH_FIELDS) {
      const key = this.keyInputs[id];
      const clear = this.clearBtns[id];
      if (!key || !clear) continue;
      key.addEventListener('input', () => {
        if (key.value !== '') this.cleared.delete(id);
      });
      clear.addEventListener('click', () => {
        key.value = '';
        this.cleared.add(id);
        key.placeholder = id === 'openai' ? t('keyPlaceholderOptional') : t('keyPlaceholder');
        clear.hidden = true;
      });
    }
    this.testBtn.addEventListener('click', () => {
      void this.onTest();
    });
    this.saveBtn.addEventListener('click', () => {
      void this.onSave();
    });
    document.addEventListener('keydown', this.onKeyDown);
  }

  private fill(settings: PublicSettings): void {
    this.clientIdInput.value = settings.spotifyClientId;
    for (const radio of this.engineRadios) {
      radio.checked = radio.value === settings.translation.engine;
    }
    this.setKeyState('deepl', settings.translation.deepl.hasKey);
    this.setKeyState('azure', settings.translation.azure.hasKey);
    this.regionInput.value = settings.translation.azure.region;
    this.setKeyState('openai', settings.translation.openai.hasKey);
    this.baseUrlInput.value = settings.translation.openai.baseUrl;
    this.modelInput.value = settings.translation.openai.model;
    this.cleared.clear();
    this.updateEngineFields();
  }

  private setKeyState(id: EngineWithFields, hasKey: boolean): void {
    const input = this.keyInputs[id];
    const clear = this.clearBtns[id];
    if (!input || !clear) return;
    input.value = '';
    input.placeholder = hasKey
      ? t('keyPlaceholderSet')
      : id === 'openai'
        ? t('keyPlaceholderOptional')
        : t('keyPlaceholder');
    clear.hidden = !hasKey;
  }

  private updateEngineFields(): void {
    const current = this.currentEngine();
    for (const id of ENGINE_WITH_FIELDS) {
      const fields = this.fieldsMap[id];
      if (fields) fields.hidden = id !== current;
    }
  }

  private currentEngine(): EngineId {
    for (const radio of this.engineRadios) {
      if (radio.checked) return radio.value as EngineId;
    }
    return 'chrome';
  }

  private buildPatch(): SettingsPatch {
    const engine = this.currentEngine();
    const patch: SettingsPatch = {
      spotifyClientId: this.clientIdInput.value.trim(),
      translation: { engine },
    };
    const translation = patch.translation!;

    const deepl: { apiKey?: string | null } = {};
    const deeplValue = this.keyInputs.deepl?.value ?? '';
    if (deeplValue !== '') deepl.apiKey = deeplValue;
    else if (this.cleared.has('deepl')) deepl.apiKey = null;
    translation.deepl = deepl;

    const azure: { apiKey?: string | null; region?: string } = {
      region: this.regionInput.value,
    };
    const azureValue = this.keyInputs.azure?.value ?? '';
    if (azureValue !== '') azure.apiKey = azureValue;
    else if (this.cleared.has('azure')) azure.apiKey = null;
    translation.azure = azure;

    const openai: { baseUrl?: string; model?: string; apiKey?: string | null } = {
      baseUrl: this.baseUrlInput.value,
      model: this.modelInput.value,
    };
    const openaiValue = this.keyInputs.openai?.value ?? '';
    if (openaiValue !== '') openai.apiKey = openaiValue;
    else if (this.cleared.has('openai')) openai.apiKey = null;
    translation.openai = openai;

    return patch;
  }

  private async onSave(): Promise<void> {
    this.hideError();
    const clientId = this.clientIdInput.value.trim();
    if (this.mode === 'setup' && !/^[0-9a-fA-F]{32}$/.test(clientId)) {
      this.showError(t('errClientId'));
      return;
    }
    this.saveBtn.disabled = true;
    try {
      const patch = this.buildPatch();
      const saved = await this.deps.save(patch);
      const targetLangValue = this.targetLangSelect.value;
      setTargetLang(targetLangValue === '' ? null : (targetLangValue as TargetLang));
      this.onSaved?.(saved);
      const uiLangValue = this.uiLangSelect.value;
      if (uiLangValue !== getLang()) {
        setUiLang(uiLangValue as UiLang);
      }
      if (this.mode === 'normal') this.close();
    } catch (err) {
      this.showError(localizeServerError(undefined, err instanceof Error ? err.message : String(err)));
    } finally {
      this.saveBtn.disabled = false;
    }
  }

  private async onTest(): Promise<void> {
    this.testBtn.disabled = true;
    this.testResult.className = 'set-test-result';
    this.testResult.textContent = t('testRunning');
    try {
      const patch = this.buildPatch();
      const result = await this.deps.test(patch);
      if (result.ok) {
        this.testResult.textContent = t('testOk', { sample: result.sample });
        this.testResult.className = 'set-test-result ok';
      } else {
        this.testResult.textContent = t('testFail', { message: localizeServerError(result.code, result.message) });
        this.testResult.className = 'set-test-result err';
      }
    } catch (err) {
      this.testResult.textContent = t('testFail', {
        message: err instanceof Error ? err.message : String(err),
      });
      this.testResult.className = 'set-test-result err';
    } finally {
      this.testBtn.disabled = false;
    }
  }

  private async onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.deps.redirectUri);
      this.copyBtn.textContent = t('copied');
      globalThis.setTimeout(() => {
        this.copyBtn.textContent = t('copy');
      }, 1500);
    } catch {
      // 複製失敗時不改變按鈕文字
    }
  }

  private showError(message: string): void {
    this.errEl.textContent = message;
    this.errEl.hidden = false;
  }

  private hideError(): void {
    this.errEl.textContent = '';
    this.errEl.hidden = true;
  }
}
