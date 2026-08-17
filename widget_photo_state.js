// widget_photo_state.js — логика работы кнопки "+ 1фото"
window.UAAWidget = window.UAAWidget || {};
var state = UAAWidget.state;

UAAWidget.photoEffective = function () {
  if (!state.currentUid) return false;
  if (state.photoAlways) return true; // Глобальная настройка всегда побеждает
  var v = state.photoPages[state.currentUid];
  return v === true;
};

UAAWidget.togglePhoto = function (w) {
  if (!state.currentUid || state.photoAlways) return; // Игнорируем клики, если глобально включено
  var next = !UAAWidget.photoEffective();
  state.photoPages[state.currentUid] = next;
  var keys = Object.keys(state.photoPages);
  if (keys.length > 300) delete state.photoPages[keys[0]];
  if (UAAWidget.extAlive()) {
    chrome.storage.local.set({ widgetPhotoPages: state.photoPages }, function () {
      UAAWidget.setPhotoBtnState(w, UAAWidget.photoEffective(), false);
    });
  } else {
    UAAWidget.setPhotoBtnState(w, UAAWidget.photoEffective(), false);
  }
};
