// ОРКЕСТРАТОР: связывает парсинг текста и сбор фото
window.AvitoParser = {
  parse: async function (options) {
    try {
      console.log('✓ Parser получил опции:', options);

      // 1. Парсим текст и характеристики
      const textData = window.AvitoParserCore.parseTextData();

      // 2. Собираем фото
      const photos_urls = await window.AvitoPhotoCollector.collectPhotos(options);
      console.log('✓ Финально собрано URL:', photos_urls.length);

      // 3. Объединяем и возвращаем
      return {
        ...textData,
        photos_urls: photos_urls
      };
    } catch (err) {
      console.error("Ошибка парсера Avito:", err);
      return null;
    }
  }
};
