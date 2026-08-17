// background_zip.js — сборка ZIP и XML
(function () {
  function escapeXml(unsafe) {
    if (unsafe === null || unsafe === undefined) return 'Не указано';
    return String(unsafe)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case "'": return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
  }

  self.BackgroundCore = self.BackgroundCore || {};

  self.BackgroundCore.buildZipArchive = async function (standardData, options, onStatus) {
    if (!standardData || !standardData.db_fields) {
      throw new Error('standardData.db_fields пуст');
    }

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip не загружен');
    }

    // KEEPALIVE: Предотвращает засыпание Service Worker
    const keepAlive = setInterval(() => {
      try { chrome.storage.local.set({ _keepalive: Date.now() }); } catch(e) {}
    }, 20000);

    try {
      const opts=Object.assign({}, DEFAULT_CONFIG, options || {});
      const zip=new JSZip();
      const fields=Object.assign({}, standardData.db_fields);
      const uid=(String(fields.uid || '').replace(/[^a-zA-Z0-9_-]/g, '') || String(Date.now()));

      // Формируем единое имя для папки внутри архива и для самого файла
      let sitePrefix = 'auto';
      const sourceSite = String(fields.source_site || '').toLowerCase();
      if (sourceSite.includes('avito')) sitePrefix = 'avito';
      else if (sourceSite.includes('drom')) sitePrefix = 'drom';
      else if (sourceSite.includes('auto.ru') || sourceSite.includes('autoru')) sitePrefix = 'autoru';

      const d = new Date();
      const dateStr = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');

      const folderName = sitePrefix + '_' + dateStr + '_car_' + uid;

      const links=Array.isArray(standardData.links_manifest)
      ? standardData.links_manifest.filter(Boolean)
      : [];

      const CARS=(typeof COMPARE_CARS !== 'undefined' && COMPARE_CARS) || {};

      const aiTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise(res => setTimeout(() => res({ text: '', status: 'error', source: 'timeout', debug: 'AI Timeout' }), ms))
      ]);

      let fixedScore=null;

      if (opts.aiReport || opts.aiCompare) {
        try {
          const cache=await new Promise((res)=> {
            chrome.storage.local.get({ scoreCache: {} }, (r)=> res(r.scoreCache || {}));
          });
          const cacheKey=uid + '_' + (opts.compare || DEFAULT_COMPARE_CAR);
          const v=Number(cache[cacheKey]);
          if (isFinite(v) && v >= 1 && v <= 10) fixedScore=v;
        } catch (e) {}

        if (fixedScore === null) {
          try {
            fields.mileageAdjust = opts.mileageAdjust || 0;
            fields.historyAdd = opts.historyAdd || 0;
            const srep=await aiTimeout(self.BackgroundAI.fetchAiScore(
              self.BackgroundAI.buildScorePrompt(fields, self.BackgroundAI.getRefCar(opts)),
              opts,
              30
            ), 60000);
            if (srep && srep.ok && typeof srep.score === 'number') fixedScore=srep.score;
          } catch (e) {}
        }
      }

      //--- ИИ: отчёт ---
      if (opts.aiReport) {
        onStatus && onStatus('ai');
        const runMarkers=self.BackgroundAI.makeRunMarkers();
        const aiOpts=Object.assign({}, opts, runMarkers, {
          carName: fields.car_display_name || '',
          scoreFixed: fixedScore,
          refCar: self.BackgroundAI.getRefCar(opts)
        });
        const rep=await aiTimeout(self.BackgroundAI.fetchAiPart(
          self.BackgroundAI.buildReportPrompt(fields, aiOpts),
          'отчёт по авто',
          aiOpts
        ), 120000);
        fields.ai_expert_report=(rep && rep.text) ? rep.text : 'AI timeout';
        fields.ai_expert_status=rep
        ? (rep.status + '; источник: ' + rep.source + (rep.debug ? ';' + rep.debug : ''))
        : 'error; источник: нет';
      } else {
        fields.ai_expert_report='';
        fields.ai_expert_status='disabled';
      }

      //--- ИИ: сравнение ---
      if (opts.aiCompare) {
        onStatus && onStatus('ai');
        const cmp=CARS[opts.compare] || CARS.yaris || {
          name: 'Toyota Yaris (2 пок., XP90)',
          years: '2005–2011',
          engine: '1.0–1.3',
          hp: '68–87',
          trans: '5MT'
        };

        fields.ai_compare_with=cmp.name + ', ' + cmp.years;

        const runMarkers=self.BackgroundAI.makeRunMarkers();
        const aiOpts=Object.assign({}, opts, runMarkers, {
          carName: fields.car_display_name || '',
          scoreFixed: fixedScore,
          refCar: self.BackgroundAI.getRefCar(opts)
        });

        const rep=await aiTimeout(self.BackgroundAI.fetchAiPart(
          self.BackgroundAI.buildComparePrompt(fields, cmp, aiOpts),
          'сравнение',
          aiOpts
        ), 120000);

        fields.ai_compare_report=(rep && rep.text) ? rep.text : 'AI timeout';
        fields.ai_compare_status=rep
        ? (rep.status + '; источник: ' + rep.source + (rep.debug ? ';' + rep.debug : ''))
        : 'error; источник: нет';
      } else {
        fields.ai_compare_with='';
        fields.ai_compare_report='';
        fields.ai_compare_status='disabled';
      }

      //--- Фото ---
      onStatus && onStatus('photos');

      const carFolder=zip.folder(folderName);
      const fileByUrl=new Map();

      if (opts.savePhotos !== false) {
        try {
          const blobs=await self.BackgroundCore.fetchPhotoBlobs(links, opts.aiDebug, opts.aiDebugVerbose);
          blobs.forEach((p, i)=> {
            const fname='photo_' + (i + 1) + '.' + p.ext;
            fileByUrl.set(links[p.index], fname);
            carFolder.file(fname, p.blob);
          });
        } catch (e) {
          console.error('[ZIP] Ошибка скачивания фото, формирую архив без фото:', e);
        }
      }

      //--- XML ---
      onStatus && onStatus('zip');

      let xml='<?xml version="1.0" encoding="UTF-8"?>\n<standard_car_entry>\n';
      for (const [k, v] of Object.entries(fields)) {
        xml += ' <' + k + '>' + escapeXml(v) + '</' + k + '>\n';
      }

      xml += ' <source_photos_urls>\n';
      links.forEach((u)=> {
        xml += ' <photo>\n';
        xml += ' <url>' + escapeXml(u) + '</url>\n';
        xml += ' <file>' + escapeXml(fileByUrl.get(u) || '') + '</file>\n';
        xml += ' </photo>\n';
      });
      xml += ' </source_photos_urls>\n</standard_car_entry>';

      carFolder.file('database_import_' + uid + '.xml', xml);

      const base64=await zip.generateAsync({
        type: 'base64',
        compression: 'STORE'
      });

      const dataUrl='data:application/zip;base64,' + base64;

      // ПРОВЕРКА ОТМЕНЫ
      if (opts.checkCanceled && opts.checkCanceled()) {
        console.log('[ZIP] Задача отменена, пропускаем скачивание');
        return;
      }

      const finalFilename = 'UniversalAutoAssistant/' + folderName + '.zip';

      await new Promise((resolve, reject)=> {
        chrome.downloads.download(
          {
            url: dataUrl,
            filename: finalFilename,
            saveAs: false
          },
          (id)=> {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(id);
            }
          }
        );
      });

    } finally {
      clearInterval(keepAlive);
    }
  };
})();
