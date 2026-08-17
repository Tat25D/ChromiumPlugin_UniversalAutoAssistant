// parser_drom.js — оркестратор: связывает парсинг текста и сбор фото (Дром)
window.DromParser = {
  parse: async function (options) {
    try {
      const textData = window.DromParserCore.parseTextData();
      const photos_urls = await window.DromPhotoCollector.collectPhotos(options);
      return { ...textData, photos_urls: photos_urls };
    } catch (err) {
      console.error("Ошибка парсера Drom:", err);
      return null;
    }
  }
};
