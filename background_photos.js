// background_photos.js — скачивание фото с управляемой отладкой
self.BackgroundCore = self.BackgroundCore || {};

self.BackgroundCore.fetchPhotoBlobs = async function (urls, debugEnabled, debugVerbose) {
  if (debugEnabled) console.log('[DEBUG] fetchPhotoBlobs получил URL:', urls);

  if (!Array.isArray(urls) || urls.length === 0) {
    if (debugEnabled) console.warn('[DEBUG] Парсер не передал ни одной ссылки!');
    return [];
  }

  const results=[];
  const queue=urls.map((url, index)=> ({ url, index }));
  if (debugEnabled) console.log('[DEBUG] Очередь загрузки создана, элементов:', queue.length);

  const workers=Array.from({ length: 4 }, async (workerIndex)=> {
    while (queue.length) {
      const item=queue.shift();
      if (!item) break;

      if (debugVerbose) console.log(`[DEBUG] Worker ${workerIndex} пытается скачать:`, item.url);
      let timer=null;
      try {
        const controller=new AbortController();
        timer=setTimeout(()=> {
          if (debugVerbose) console.warn(`[DEBUG] Таймаут запроса (20с) для:`, item.url);
          controller.abort();
        }, 20000);

        let referrer = 'https://avito.ru/';
        if (/drom/i.test(item.url)) referrer = 'https://auto.drom.ru/';
        else if (/auto\.ru|yandex/i.test(item.url)) referrer = 'https://auto.ru/';

        if (debugVerbose) console.log(`[DEBUG] Использую referrer:`, referrer);

        const res=await fetch(item.url, {
          signal: controller.signal,
          referrer: referrer
        });

        clearTimeout(timer);
        if (debugVerbose) console.log(`[DEBUG] Ответ от сервера (статус ${res.status}):`, item.url);

        if (!res.ok) {
          if (debugVerbose) console.warn(`[DEBUG] Ошибка HTTP ${res.status}, пропускаем:`, item.url);
          continue;
        }

        const blob=await res.blob();
        if (debugVerbose) console.log(`[DEBUG] Скачан blob, размер: ${blob.size} байт, тип: ${blob.type}`);

        if (!blob || blob.size < 10240) {
          if (debugVerbose) console.warn(`[DEBUG] Файл слишком маленький (${blob.size} байт), пропускаем:`, item.url);
          continue;
        }

        let ext = 'jpg';
        if (/\.png$/i.test(item.url)) ext = 'png';
        else if (/\.webp$/i.test(item.url)) ext = 'webp';

        if (debugVerbose) console.log(`[DEBUG] УСПЕХ! Добавлено фото в архив:`, item.url);
        results.push({ index: item.index, blob, ext });
      } catch (e) {
        if (timer) clearTimeout(timer);
        if (debugVerbose) console.error(`[DEBUG] Критическая ошибка при скачивании:`, item.url, e.message);
      }
    }
  });

  await Promise.all(workers);
  results.sort((a, b)=> a.index - b.index);
  if (debugEnabled) console.log('[DEBUG] Итоговое количество скачанных фото:', results.length);
  return results;
};
