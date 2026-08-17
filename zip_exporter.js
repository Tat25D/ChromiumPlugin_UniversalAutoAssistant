import './jszip.min.js';

async function fetchPhotoBlobs(urls) {
  const results = [];
  const queue = urls.map((url, index) => ({ url, index }));

  // Пул из 4 параллельных воркеров (Обход CORS за счет контекста Background)
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const { url, index } = item;
      let timer = null;
      try {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(url, {
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          referrer: 'https://avito.ru'
        });
        clearTimeout(timer);

        if (!res.ok) { console.warn('Фото: HTTP', res.status, url); continue; }

        const type = res.headers.get('content-type') || '';
        if (!type.startsWith('image/')) continue;

        const blob = await res.blob();
        if (blob.size < 2048) continue; // Фильтрация пустышек и мелких заглушек

        const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
        results.push({ index, blob, ext });
      } catch (e) {
        if (timer) clearTimeout(timer);
        console.warn('Фото не скачалось:', url, e);
      }
    }
  });

  await Promise.all(workers);
  results.sort((a, b) => a.index - b.index);
  return results;
}

export async function buildZipArchive(standardData) {
    const zip = new JSZip();
    const fields = standardData.db_fields;
    const uid = fields.uid || new Date().getTime();

    const folderName = `car_${uid}`;
    const carFolder = zip.folder(folderName);

    // Генерируем унифицированный XML для СУБД
    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<standard_car_entry>\n`;
    for (const [columnName, value] of Object.entries(fields)) {
        xmlContent += `  <${columnName}>${escapeXml(value)}</${columnName}>\n`;
    }
    xmlContent += `  <source_photos_urls>\n`;
    (standardData.links_manifest || []).forEach(url => {
        xmlContent += `    <url>${escapeXml(url)}</url>\n`;
    });
    xmlContent += `  </source_photos_urls>\n`;
    xmlContent += `</standard_car_entry>`;

    carFolder.file(`database_import_${uid}.xml`, xmlContent);

    // Параллельно выкачиваем Blobs и кладем в ZIP напрямую
    const photoBlobs = await fetchPhotoBlobs(standardData.links_manifest || []);
    photoBlobs.forEach((p, i) => {
        carFolder.file(`photo_${i + 1}.${p.ext}`, p.blob);
    });

    // Нативная выгрузка через Base64 Data URL, стабильная для Service Worker
    const base64Data = await zip.generateAsync({ type: 'base64', compression: 'STORE' });
    const dataUrl = `data:application/zip;base64,${base64Data}`;

    await chrome.downloads.download({
        url: dataUrl,
        filename: `Avito_Cars/car_${uid}.zip`,
        saveAs: false
    });
}

function escapeXml(unsafe) {
    if (unsafe === null || unsafe === void 0) return "Не указано";
    return unsafe.toString().replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}
