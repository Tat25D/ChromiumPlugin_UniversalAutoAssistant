// parser_auto_ru.js — оркестратор: связывает парсинг текста и сбор фото (Авто.ру)
window.AutoRuParser={
  parse: async function (options) {
    try {
      const textData=window.AutoRuParserCore.parseTextData();
      const photos_urls=await window.AutoRuPhotoCollector.collectPhotos(options);
      return { ...textData, photos_urls: photos_urls };
    } catch (err) {
      console.error('Ошибка парсера Auto.ru:', err);
      return null;
    }
  }
};
