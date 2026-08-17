importScripts('./config.js');
importScripts('./jszip.min.js');
importScripts('./lib_queue.js');
importScripts('./background_ai.js');
importScripts('./ai_prompts.js');
importScripts('./ai_extract.js');
importScripts('./ai_fetch.js');
importScripts('./ai_interactive_bg.js');
importScripts('./ai_interactive_inject.js');
importScripts('./ai_score.js');
importScripts('./background_photos.js');
importScripts('./background_zip.js');
importScripts('./background_core.js');

console.log('Background загружен. Таймаут ИИ:', AI_TIMEOUT_DEFAULT, 'сек; кап:', AI_CAP_SEC, 'сек');
