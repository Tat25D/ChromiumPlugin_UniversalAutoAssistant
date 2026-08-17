//=====================================================
// ЕДИНАЯ ТОЧКА НАСТРОЕК ПЛАГИНА
//=====================================================

//--- ИИ: тайминги ---
const AI_TIMEOUT_DEFAULT = 90;
const AI_CAP_SEC = 180;
const AI_MIN_TIMEOUT_SEC = 30;
const AI_POLL_MS = 250;

//--- ИИ: текст ---
const AI_MIN_TEXT_LEN = 80;
const AI_MAX_TEXT_LEN = 12000;

//--- ИИ: маркеры ---
const AI_MARKER_START = '----------------НАЧАЛО  ОТЧЁТА----------------';
const AI_MARKER_END =   '-----------------КОНЕЦ ОТЧЁТА-----------------';

//--- ИИ: виджет "Предварителная оценка AI" ---
const AI_SCORE_RETRIES = 3;
const AI_SCORE_DELAY_MS = 600;
const AI_SCORE_TIMEOUT_SEC = 30;
const AI_SCORE_TIMEOUT_GROW = 2;

//--- Поведение по умолчанию ---
const DEFAULT_SAVE_PHOTOS = false;
const DEFAULT_AI_REPORT = false;
const DEFAULT_AI_COMPARE = false;
const DEFAULT_AI_SCORE=true;
const DEFAULT_CLOSE_AI = true;
const DEFAULT_COMPARE_CAR = 'yaris';
const HOTKEY_DEFAULT = 'Alt+G';

//--- Отладка ---
const AI_DEBUG = false;
const AI_DEBUG_VERBOSE = false;
const AI_DEBUG_KEEP_TABS = false;

//=====================================================
// СПИСОК АВТО ДЛЯ СРАВНЕНИЯ
//=====================================================
const COMPARE_CARS = {
  yaris:  { name: 'Toyota Yaris (2 пок., XP90)',  years: '2005–2011', engine: '1.0–1.3',  hp: '68–87',   trans: '5MT/4AT', resource: 350000 },
  jazz:   { name: 'Honda Jazz/Fit (1–2 пок.)',    years: '2004–2009', engine: '1.2–1.4',  hp: '78–100',  trans: '5MT/CVT', resource: 300000 },
  note:   { name: 'Nissan Note (1 пок., E11)',    years: '2005–2010', engine: '1.4–1.6',  hp: '88–110',  trans: '5MT/4AT', resource: 300000 },
  fiesta: { name: 'Ford Fiesta (6 пок., Mk6)',    years: '2005–2008', engine: '1.25–1.4', hp: '75–80',   trans: '5MT/4AT', resource: 250000 },
  getz:   { name: 'Hyundai Getz (рестайлинг)',    years: '2005–2010', engine: '1.1–1.4',  hp: '66–97',   trans: '5MT/4AT', resource: 250000 }
};

//=====================================================
// НАСТРОЙКИ ПО УМОЛЧАНИЮ
//=====================================================
const DEFAULT_CONFIG = {
  savePhotos: DEFAULT_SAVE_PHOTOS,
  aiReport: DEFAULT_AI_REPORT,
  aiCompare: DEFAULT_AI_COMPARE,
  aiScore: DEFAULT_AI_SCORE,
  closeAiTabs: DEFAULT_CLOSE_AI,
  compare: DEFAULT_COMPARE_CAR,

  aiTimeoutSec: AI_TIMEOUT_DEFAULT,
  aiCapSec: AI_CAP_SEC,
  aiMinTimeoutSec: AI_MIN_TIMEOUT_SEC,
  aiPollMs: AI_POLL_MS,

  aiMinTextLen: AI_MIN_TEXT_LEN,
  aiMaxTextLen: AI_MAX_TEXT_LEN,

  aiMarkerStart: AI_MARKER_START,
  aiMarkerEnd: AI_MARKER_END,

  aiScoreRetries: AI_SCORE_RETRIES,
  aiScoreDelayMs: AI_SCORE_DELAY_MS,
  aiScoreTimeoutSec: AI_SCORE_TIMEOUT_SEC,
  aiScoreTimeoutGrow: AI_SCORE_TIMEOUT_GROW,

  aiDebug: AI_DEBUG,
  aiDebugVerbose: AI_DEBUG_VERBOSE,
  aiDebugKeepTabs: AI_DEBUG_KEEP_TABS,
  mileageAdd: 0,
  historyAdd: 0,
  mileageReduce: 0,
  aiDebugKeepTabs: AI_DEBUG_KEEP_TABS,
  mileageAdjust: 0,
  historyAdd: 0
};
