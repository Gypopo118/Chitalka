const STORAGE_KEY = 'chitalca-state-v1';
const DEMO_BOOKS = [
  { id: 'demo-master', title: 'Мастер и Маргарита', author: 'Михаил Булгаков', format: 'FB2', progress: 63, text: `Глава первая\n\nНикогда не разговаривайте с неизвестными.\n\nОднажды весною, в час небывало жаркого заката, в Москве, на Патриарших прудах появились два гражданина. Первый из них — приблизительно сорока лет, одетый в серый летний костюм, был маленького роста, темноволос, упитан и лыс.\n\nВторой — молодой человек в клетчатом кепе — был плечист, рыжеват, с вихрастой копной волос.\n\nПисатель и редактор спорили о том, как человек распоряжается собственной судьбой. Вечер постепенно становился прохладным, а город зажигал первые огни.\n\nИ всё это было удивительно тихо, будто сама Москва ненадолго задержала дыхание.`, cover: 'gradient-gold', updated: Date.now() - 1000 * 60 * 17 },
  { id: 'demo-dune', title: 'Дюна', author: 'Фрэнк Герберт', format: 'EPUB', progress: 27, text: `Книга первая\n\nДюна\n\nВ начале был голос. И голос говорил о пустыне, о ветре, который шёл по песку, и о людях, научившихся слушать тишину.\n\nПол покинул комнату и подошёл к окну. За стеклом лежал холодный вечер. Он думал о дороге, которая ждала его, и о доме, который уже никогда не будет прежним.\n\nКаждое решение имеет цену. Но иногда цена бездействия оказывается ещё выше.`, cover: 'gradient-blue', updated: Date.now() - 1000 * 60 * 60 * 3 },
  { id: 'demo-notes', title: 'Тихие заметки', author: 'Личная библиотека', format: 'TXT', progress: 100, text: `Заметка\n\nЭто место для коротких текстов, которые хочется сохранить.\n\nЧтение завершено. Возвращайтесь к любимым историям в любой момент.`, cover: null, updated: Date.now() - 1000 * 60 * 60 * 28 }
];

const DEFAULT_STATE = {
  books: DEMO_BOOKS,
  settings: { fontSize: 19, lineHeight: 1.65, font: 'sans', bg: '#1e2024', text: '#f8ecd7', wordWrap: true, brightness: 0 },
  activeBookId: null,
  lastReaderId: null
};
let state = loadState();
let view = state.activeBookId ? 'reader' : 'library';
let chromeVisible = false;
let settingsOpen = false;
let longPressId = null;
let pressTimer = null;
let swipeStart = null;
let toastTimer = null;
let readerPageIndex = 0;
let positionedId = null;
let paginationCache = null;

const app = document.querySelector('#app');
const fileInput = document.querySelector('#file-input');

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      const next = { ...DEFAULT_STATE, ...saved, settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) } };
      if (!['#ffffff', '#fff7ea', '#f8ecd7', '#f0dfc3', '#e1c9a6'].includes(next.settings.text)) next.settings.text = '#f8ecd7';
      return next;
    }
  } catch (_) {}
  return typeof structuredClone === 'function' ? structuredClone(DEFAULT_STATE) : JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function isQuotaError(err) { return !!err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014); }
function stripImages(html) { return (html || '').replace(/<img\b[^>]*>/gi, ''); }
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return; }
  catch (err) {
    if (!isQuotaError(err)) return;
    try {
      const slim = { ...state, books: state.books.map(book => (book.html ? { ...book, html: stripImages(book.html) } : book)) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      console.warn('chitalca: localStorage full, images dropped, text and progress saved');
      return;
    } catch (_) {}
    showToast('Мало места на устройстве: позиция может не сохраниться');
  }
}
function activeBook() { return state.books.find(book => book.id === state.activeBookId) || state.books[0]; }
function escapeHTML(value = '') { return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function formatDate(ts) {
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 60) return minutes <= 1 ? 'только что' : `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
function coverMarkup(book) {
  if (book.coverData) return `<div class="cover"><img class="cover-art" src="${book.coverData}" alt="Обложка: ${escapeHTML(book.title)}"></div>`;
  return `<div class="cover ${book.cover || 'placeholder'}" aria-label="Нет обложки"></div>`;
}
function render() {
  document.documentElement.classList.toggle('reader-open', view === 'reader');
  app.innerHTML = view === 'reader' && activeBook() ? renderReader() : renderLibrary();
  if (settingsOpen) app.insertAdjacentHTML('beforeend', renderSettings());
  bindEvents();
  if (view === 'reader') requestAnimationFrame(ensurePagination);
}
function renderLibrary() {
  const books = [...state.books].sort((a, b) => b.updated - a.updated);
  return `<main class="app-shell library">
    <header class="library-header"><div><div class="eyebrow">Твоя библиотека</div><h1>Читалка</h1></div><div class="book-count">${books.length} ${plural(books.length, 'книга', 'книги', 'книг')}</div></header>
    <section class="book-list" aria-label="Книги">
      ${books.length ? books.map(renderBookCard).join('') : `<div class="empty-state"><strong>Библиотека пока пуста</strong><p>Добавь первую книгу через кнопку «+».<br>Поддерживаются FB2, EPUB, TXT и DOCX.</p></div>`}
    </section>
    <div class="library-footnote">Все файлы и прогресс остаются на этом устройстве</div>
    <button class="fab" id="add-book" aria-label="Добавить книгу"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
  </main>`;
}
function renderBookCard(book) {
  const done = book.progress >= 100;
  const selected = longPressId === book.id;
  return `<article class="book-card ${selected ? 'long-pressed' : ''}" data-book-id="${book.id}">
    ${coverMarkup(book)}
    <div class="book-info"><div class="book-title">${escapeHTML(book.title)}</div><div class="book-author">${escapeHTML(book.author || 'Неизвестный автор')}</div><div class="book-meta"><div class="progress-line"><span class="${done ? 'done' : ''}" style="width:${book.progress}%"></span></div><span>${formatDate(book.updated)}</span></div></div>
    <div class="progress-value ${done ? 'done' : ''}">${book.progress}%</div>
    ${selected ? `<div class="delete-action"><button class="cancel cancel-delete" data-book-id="${book.id}">Отмена</button><button class="confirm-delete" data-book-id="${book.id}">Удалить</button></div>` : ''}
  </article>`;
}
function renderReader() {
  const book = activeBook();
  const settings = state.settings;
  const isHtml = !!book.html;
  const pages = paginationCache?.id === book.id ? paginationCache.pages : fallbackPages(book);
  const pageIndex = Math.min(Math.max(readerPageIndex, 0), pages.length - 1);
  const progress = book.pageIndex == null ? Math.round(book.progress || 0) : (pages.length <= 1 ? 100 : Math.round((pageIndex / (pages.length - 1)) * 100));
  const raw = pages[pageIndex] || '';
  const paragraphs = isHtml ? raw : formatPage(raw, pageIndex === 0);
  return `<main class="app-shell reader ${chromeVisible ? 'chrome-visible' : ''}" style="--reader-size:${settings.fontSize}px;--reader-lh:${settings.lineHeight};--reader-bg:${settings.bg};--reader-text:${settings.text};--reader-font:${settings.font === 'serif' ? 'Georgia, serif' : 'Arial, sans-serif'}">
    <section class="reader-stage" id="reader-stage"><div class="reader-copy ${settings.wordWrap ? 'word-wrap' : ''}" id="reader-copy">${paragraphs}</div></section>
    <div class="reader-chrome"><header class="reader-topbar"><button class="back-btn" id="back-library" aria-label="Назад в библиотеку"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button><div class="reader-title">${escapeHTML(book.title)}</div></header><footer class="reader-bottom"><button class="settings-pill" id="open-settings">Настройки</button></footer></div>
    <div class="page-progress">${progress}%</div>
    <div class="brightness-indicator" id="brightness-indicator">☀ ${Math.round((1 - settings.brightness) * 100)}%</div><div class="brightness-overlay" style="opacity:${settings.brightness}"></div>
  </main>`;
}
function renderSettings() {
  const s = state.settings;
  const bgOptions = ['#1e2024', '#25221f', '#302d26', '#101820', '#f0eadc'];
  return `<div class="modal-backdrop" id="settings-backdrop"><section class="settings-modal" role="dialog" aria-modal="true" aria-label="Настройки чтения">
    <header class="modal-head"><h2>Настройки чтения</h2><button class="close-btn" id="close-settings" aria-label="Закрыть">×</button></header>
    <div class="setting-block"><div class="setting-label"><span>Размер шрифта</span><span class="setting-caption">${s.fontSize}px</span></div><div class="size-control"><button class="round-control" id="font-minus">−</button><input class="font-number" id="font-size" type="number" min="10" max="34" value="${s.fontSize}" aria-label="Размер шрифта"><button class="round-control" id="font-plus">+</button></div></div>
    <div class="setting-block"><div class="setting-label"><span>Расстояние между строк</span><span class="setting-caption">${Number(s.lineHeight).toFixed(2)}</span></div><div class="size-control"><button class="round-control" id="lh-minus">−</button><input class="font-number" id="line-height" type="number" min="1.2" max="2.4" step="0.05" value="${s.lineHeight}" aria-label="Расстояние между строк"><button class="round-control" id="lh-plus">+</button></div></div>
    <div class="setting-block"><div class="setting-label"><span>Фон страницы</span><span class="setting-caption">графит</span></div><div class="swatches">${bgOptions.map(color => `<button class="swatch ${s.bg === color ? 'active' : ''}" data-bg="${color}" style="background:${color}" aria-label="Цвет ${color}"></button>`).join('')}<button class="swatch color-wheel" aria-label="Выбрать оттенок"></button><input class="custom-color" id="custom-color" type="color" value="${s.bg}" aria-label="Свой цвет"></div></div>
    <div class="setting-block"><div class="setting-label"><span>Цвет текста</span><span class="setting-caption">от белого к молочному</span></div><div class="swatches"><button class="swatch ${s.text === '#ffffff' ? 'active' : ''}" data-text="#ffffff" style="background:#ffffff" aria-label="Чисто белый"></button><button class="swatch ${s.text === '#fff7ea' ? 'active' : ''}" data-text="#fff7ea" style="background:#fff7ea" aria-label="Слоновая кость"></button><button class="swatch ${s.text === '#f8ecd7' ? 'active' : ''}" data-text="#f8ecd7" style="background:#f8ecd7" aria-label="Молочный"></button><button class="swatch ${s.text === '#f0dfc3' ? 'active' : ''}" data-text="#f0dfc3" style="background:#f0dfc3" aria-label="Светло-бежевый"></button><button class="swatch ${s.text === '#e1c9a6' ? 'active' : ''}" data-text="#e1c9a6" style="background:#e1c9a6" aria-label="Тёмно-бежевый"></button></div></div>
    <div class="setting-block"><div class="setting-label"><span>Шрифт</span><span class="setting-caption">${s.font === 'serif' ? 'с засечками' : 'без засечек'}</span></div><div class="font-options"><button class="font-option sans ${s.font === 'sans' ? 'active' : ''}" data-font="sans">Aa <small>Arial · без засечек</small></button><button class="font-option serif ${s.font === 'serif' ? 'active' : ''}" data-font="serif">Aa <small>Georgia · с засечками</small></button></div></div>
    <div class="setting-block toggle-row"><div><div class="setting-label">Переносить по словам</div><div class="setting-caption">Целые слова не разрываются на строках</div></div><label class="toggle"><input id="word-wrap" type="checkbox" ${s.wordWrap ? 'checked' : ''}><span class="toggle-track"></span></label></div>
    <div class="setting-block file-note">Свайп вверх/вниз в тексте меняет яркость только внутри приложения. После выхода она вернётся к системной.</div><button class="modal-done" id="done-settings">Готово</button>
  </section></div>`;
}
function plural(n, one, few, many) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? few : many; }
function clampLineHeight(value) { return Math.min(2.4, Math.max(1.2, Math.round((Number(value) || 1.65) * 20) / 20)); }
function openReader(id) {
  const book = state.books.find(item => item.id === id); if (!book) return;
  const pages = paginationCache?.id === id ? paginationCache.pages : fallbackPages(book); readerPageIndex = book.pageIndex ?? 0; positionedId = id;
  state.activeBookId = id; state.lastReaderId = id; book.updated = Date.now(); saveState(); view = 'reader'; chromeVisible = false; longPressId = null; history.pushState({ view: 'reader', id }, '', `#reader-${id}`); render();
}
function openLibrary() { state.activeBookId = null; positionedId = null; saveState(); view = 'library'; settingsOpen = false; chromeVisible = false; history.pushState({ view: 'library' }, '', '#library'); render(); }
function updateSetting(key, value) { state.settings[key] = value; saveState(); render(); }
function closeImageViewer() { document.querySelector('.img-viewer')?.remove(); }
function openImageViewer(src) {
  closeImageViewer();
  const overlay = document.createElement('div');
  overlay.className = 'img-viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Просмотр изображения');
  overlay.innerHTML = `<button class="img-viewer-close" type="button" aria-label="Закрыть">×</button><img src="${escapeHTML(src)}" alt="" draggable="false">`;
  document.querySelector('#app').appendChild(overlay);
  const img = overlay.querySelector('img');
  const pointers = new Map();
  let scale = 1, tx = 0, ty = 0;
  let pinchBase = null, pinchMid0 = null, panStart = null, panBase = null, movedFlag = false;
  let lastTap = 0, lastTapTarget = null;
  const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
  const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  const clampPan = () => {
    if (scale <= 1) { tx = 0; ty = 0; return; }
    const w = img.clientWidth || img.naturalWidth || 1, h = img.clientHeight || img.naturalHeight || 1;
    const sw = w * scale, sh = h * scale, vw = window.innerWidth, vh = window.innerHeight;
    const Lx = -tx + img.getBoundingClientRect().left, Ly = -ty + img.getBoundingClientRect().top;
    tx = sw <= vw ? (vw - sw) / 2 - Lx : clampValue(tx, vw - sw - Lx, -Lx);
    ty = sh <= vh ? (vh - sh) / 2 - Ly : clampValue(ty, vh - sh - Ly, -Ly);
  };
  const doubleTapZoom = point => {
    const s1 = scale === 1 ? 2 : 1;
    const rect = img.getBoundingClientRect();
    const Lx = rect.left - tx, Ly = rect.top - ty;
    const k = s1 / scale;
    overlay.classList.add('zooming');
    if (s1 === 1) { scale = 1; tx = 0; ty = 0; }
    else { scale = s1; tx = (point.x - Lx) * (1 - k) + tx * k; ty = (point.y - Ly) * (1 - k) + ty * k; clampPan(); }
    apply();
    setTimeout(() => overlay.classList.remove('zooming'), 220);
  };
  overlay.addEventListener('pointerdown', e => {
    if (e.target.closest('.img-viewer-close')) return;
    e.preventDefault();
    try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
    const point = { x: e.clientX, y: e.clientY, target: e.target };
    pointers.set(e.pointerId, point);
    if (pointers.size === 1) {
      const onImg = e.target === img;
      const now = Date.now();
      if (onImg && lastTapTarget === 'img' && lastTap > 0 && now - lastTap <= 300) { doubleTapZoom(point); lastTap = 0; lastTapTarget = null; }
      else { lastTap = now; lastTapTarget = onImg ? 'img' : 'backdrop'; }
      panStart = { x: e.clientX, y: e.clientY }; panBase = { tx, ty };
    } else if (pointers.size === 2) {
      lastTap = 0; lastTapTarget = null;
      overlay.classList.remove('zooming');
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (dist > 0) pinchBase = { scale, tx, ty, dist };
      pinchMid0 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      panStart = null;
    }
  });
  overlay.addEventListener('pointermove', e => {
    const point = pointers.get(e.pointerId);
    if (!point) return;
    point.x = e.clientX; point.y = e.clientY;
    if (pointers.size >= 2 && pinchBase) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (dist > 0) {
        const next = clampValue(pinchBase.scale * dist / pinchBase.dist, 1, 4);
        const k = next / pinchBase.scale;
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        scale = next;
        tx = mid.x - pinchMid0.x * k + pinchBase.tx * k;
        ty = mid.y - pinchMid0.y * k + pinchBase.ty * k;
        clampPan(); apply();
      }
      movedFlag = true;
    } else if (pointers.size === 1 && panStart) {
      tx = panBase.tx + (point.x - panStart.x);
      ty = panBase.ty + (point.y - panStart.y);
      clampPan(); apply();
      if (Math.abs(point.x - panStart.x) + Math.abs(point.y - panStart.y) > 8) { movedFlag = true; lastTap = 0; lastTapTarget = null; }
    }
  });
  overlay.addEventListener('pointerup', e => {
    const point = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      panStart = { x: remaining.x, y: remaining.y }; panBase = { tx, ty };
      pinchBase = null; pinchMid0 = null;
    }
    if (pointers.size === 0) {
      pinchBase = null; pinchMid0 = null; panStart = null;
      if (point?.target === overlay && !movedFlag) closeImageViewer();
      movedFlag = false;
    }
  });
  overlay.addEventListener('pointercancel', e => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) { pinchBase = null; pinchMid0 = null; panStart = null; movedFlag = false; }
  });
  overlay.addEventListener('contextmenu', e => e.preventDefault());
  overlay.querySelector('.img-viewer-close').addEventListener('click', closeImageViewer);
}
function closeNotePopup() { document.querySelector('.note-popup')?.remove(); }
function openNotePopup(noteId) {
  closeNotePopup();
  const content = activeBook()?.notes?.[noteId] || '';
  if (!content) { showToast('Сноска не найдена'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'note-popup';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Сноска');
  overlay.innerHTML = `<div class="note-popup-sheet"><button class="note-popup-close" type="button" aria-label="Закрыть">×</button><div class="note-popup-body">${content}</div></div>`;
  document.querySelector('#app').appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target.closest('.note-popup-close')) { closeNotePopup(); return; }
    if (e.target === overlay) closeNotePopup();
  });
}
function bindEvents() {
  document.querySelector('#add-book')?.addEventListener('click', () => fileInput.click());
  document.querySelectorAll('.book-card').forEach(card => {
    const id = card.dataset.bookId;
    card.addEventListener('pointerdown', () => { clearTimeout(pressTimer); pressTimer = setTimeout(() => { longPressId = id; render(); showToast('Книга выбрана'); }, 550); });
    card.addEventListener('pointerup', () => clearTimeout(pressTimer)); card.addEventListener('pointerleave', () => clearTimeout(pressTimer));
    card.addEventListener('click', event => { if (event.target.closest('button') || longPressId) return; openReader(id); });
  });
  document.querySelectorAll('.confirm-delete').forEach(btn => btn.addEventListener('click', () => { state.books = state.books.filter(book => book.id !== btn.dataset.bookId); if (state.activeBookId === btn.dataset.bookId) state.activeBookId = null; saveState(); longPressId = null; render(); showToast('Книга удалена из библиотеки'); }));
  document.querySelectorAll('.cancel-delete').forEach(btn => btn.addEventListener('click', () => { longPressId = null; render(); }));
  document.querySelector('#back-library')?.addEventListener('click', openLibrary);
  document.querySelector('#open-settings')?.addEventListener('click', () => { settingsOpen = true; render(); });
  document.querySelector('#close-settings')?.addEventListener('click', () => { settingsOpen = false; render(); });
  document.querySelector('#done-settings')?.addEventListener('click', () => { settingsOpen = false; render(); });
  document.querySelector('#settings-backdrop')?.addEventListener('click', e => { if (e.target.id === 'settings-backdrop') { settingsOpen = false; render(); } });
  document.querySelector('#font-minus')?.addEventListener('click', () => updateSetting('fontSize', Math.max(10, state.settings.fontSize - 1)));
  document.querySelector('#font-plus')?.addEventListener('click', () => updateSetting('fontSize', Math.min(34, state.settings.fontSize + 1)));
  document.querySelector('#font-size')?.addEventListener('change', e => updateSetting('fontSize', Math.min(34, Math.max(10, Number(e.target.value) || 19))));
  document.querySelector('#lh-minus')?.addEventListener('click', () => updateSetting('lineHeight', clampLineHeight(state.settings.lineHeight - 0.05)));
  document.querySelector('#lh-plus')?.addEventListener('click', () => updateSetting('lineHeight', clampLineHeight(state.settings.lineHeight + 0.05)));
  document.querySelector('#line-height')?.addEventListener('change', e => updateSetting('lineHeight', clampLineHeight(e.target.value)));
  document.querySelectorAll('[data-bg]').forEach(btn => btn.addEventListener('click', () => updateSetting('bg', btn.dataset.bg)));
  document.querySelector('#custom-color')?.addEventListener('input', e => updateSetting('bg', e.target.value));
  document.querySelectorAll('[data-text]').forEach(btn => btn.addEventListener('click', () => updateSetting('text', btn.dataset.text)));
  document.querySelectorAll('[data-font]').forEach(btn => btn.addEventListener('click', () => updateSetting('font', btn.dataset.font)));
  document.querySelector('#word-wrap')?.addEventListener('change', e => updateSetting('wordWrap', e.target.checked));
  const stage = document.querySelector('#reader-stage');
  if (stage) {
    let holdTimer = null, holdPos = null, holdFired = false, downTime = 0;
    const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };
    const toggleChrome = () => { chromeVisible = !chromeVisible; document.querySelector('.reader')?.classList.toggle('chrome-visible', chromeVisible); };
    stage.addEventListener('pointerdown', e => { holdFired = false; holdPos = { x: e.clientX, y: e.clientY }; downTime = Date.now(); cancelHold(); holdTimer = setTimeout(() => { holdFired = true; toggleChrome(); }, 500); });
    stage.addEventListener('pointermove', e => { if (holdPos && (Math.abs(e.clientX - holdPos.x) > 12 || Math.abs(e.clientY - holdPos.y) > 12)) cancelHold(); });
    stage.addEventListener('pointerup', e => {
      const quick = Date.now() - downTime < 500;
      const moved = !holdPos || Math.abs(e.clientX - holdPos.x) > 12 || Math.abs(e.clientY - holdPos.y) > 12;
      const fired = holdFired;
      cancelHold(); holdPos = null;
      const img = e.target.closest('img');
      if (img) {
        if (!fired && quick && !moved) openImageViewer(img.getAttribute('src') || '');
        return;
      }
      const noteLink = e.target.closest('.note-link');
      if (noteLink) {
        if (!fired && quick && !moved) openNotePopup(noteLink.getAttribute('data-note') || '');
        return;
      }
      if (fired || !quick || moved) return;
      if (chromeVisible) { chromeVisible = false; document.querySelector('.reader')?.classList.remove('chrome-visible'); }
      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      if (x < 0.25) changePage(-1); else if (x > 0.75) changePage(1);
    });
    stage.addEventListener('pointercancel', () => { cancelHold(); holdPos = null; });
    stage.addEventListener('contextmenu', e => e.preventDefault());
    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: true });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
  }
}
const BRIGHT_MAX = 0.85;
let brightGesture = null, brightDirty = false;
function brightnessLabel(value) { return `☀ ${Math.round((1 - value) * 100)}%`; }
function paintBrightness(value) {
  const overlay = document.querySelector('.brightness-overlay'); if (overlay) overlay.style.opacity = value;
  const indicator = document.querySelector('#brightness-indicator'); if (indicator) { indicator.textContent = brightnessLabel(value); indicator.classList.add('show'); }
}
function onTouchStart(e) { const t = e.changedTouches[0]; swipeStart = { x: t.clientX, y: t.clientY }; brightGesture = { y: t.clientY, value: state.settings.brightness }; brightDirty = false; }
function onTouchMove(e) {
  if (!brightGesture || !swipeStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipeStart.x, dy = t.clientY - swipeStart.y;
  if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
    const h = window.innerHeight || 760;
    const next = Math.max(0, Math.min(BRIGHT_MAX, brightGesture.value + (dy / h) * BRIGHT_MAX));
    state.settings.brightness = Number(next.toFixed(3));
    brightDirty = true;
    paintBrightness(state.settings.brightness);
  }
}
function onTouchEnd(e) {
  if (!swipeStart) { brightGesture = null; return; }
  const t = e.changedTouches[0]; const dx = t.clientX - swipeStart.x; const dy = t.clientY - swipeStart.y; swipeStart = null; brightGesture = null;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)) { changePage(dx < 0 ? 1 : -1); return; }
  if (brightDirty) { brightDirty = false; saveState(); }
  const indicator = document.querySelector('#brightness-indicator');
  if (indicator?.classList.contains('show')) setTimeout(() => indicator.classList.remove('show'), 350);
}
function formatPage(text, isFirstPage) {
  return text.split(/\n{2,}/).map((part, index) => { const clean = part.replace(/\s+$/, ''); return (isFirstPage && index === 0 ? `<h3>${escapeHTML(clean)}</h3>` : `<p>${escapeHTML(clean)}</p>`); }).join('');
}
function paginateText(text) {
  const maxChars = Math.max(650, Math.min(1250, Math.floor((window.innerHeight || 760) * 1.35)));
  const tokens = tokenizeText(text); const pages = []; let page = '';
  tokens.forEach(token => { const next = appendToken(page, token); if (page && next.length > maxChars) { pages.push(page); page = token.trim(); } else page = next; });
  if (page) pages.push(page); return pages.length ? pages : [''];
}
function tokenizeText(text) { return text.replace(/\r/g, '').match(/\n{2,}|[^\s]+/g) || []; }
function appendToken(page, token) { return token.startsWith('\n') ? `${page}${page ? '\n\n' : ''}` : (page ? `${page.endsWith('\n\n') ? page : `${page} `}${token}` : token); }
function htmlToText(html) { const tmp = document.createElement('div'); tmp.innerHTML = html || ''; return tmp.textContent || ''; }
function fallbackPages(book) {
  const fallback = book.text || 'У этой книги пока не удалось извлечь текст. Попробуйте открыть её ещё раз или использовать другой файл.';
  const pages = paginateText(fallback);
  if (book.html) return pages.map(part => formatPage(part, false));
  return pages;
}
function splitBlocks(html) {
  const tmp = document.createElement('div'); tmp.innerHTML = html || '';
  return [...tmp.children].map(el => el.outerHTML).filter(Boolean);
}
function explodeBlock(blockHtml) {
  const tmp = document.createElement('div'); tmp.innerHTML = blockHtml; const el = tmp.firstElementChild;
  if (!el) return [];
  const tag = el.tagName.toLowerCase();
  if (tag === 'ul' || tag === 'ol') {
    const items = [...el.children];
    return items.length ? items.map(li => ({ atomic: `<${tag}><li>${li.innerHTML}</li></${tag}>` })) : [{ atomic: blockHtml }];
  }
  if (el.querySelector('img')) return [{ atomic: blockHtml }];
  if (!['p', 'h1', 'h2', 'h3', 'h4', 'blockquote'].includes(tag)) return [{ atomic: blockHtml }];
  const cleaned = el.cloneNode(true);
  for (let node = cleaned.lastChild; node; node = cleaned.lastChild) {
    if (node.nodeType !== 3) break;
    node.textContent = node.textContent.replace(/\s+$/, '');
    if (node.textContent) break;
    cleaned.removeChild(node);
  }
  const words = (cleaned.textContent || '').match(/[^\s]+/g) || [];
  if (!words.length) return [];
  return [{ tag, words, html: cleaned.outerHTML }];
}
function wrapWords(tag, words) { return `<${tag}>${escapeHTML(words.join(' '))}</${tag}>`; }
function ensurePagination() {
  if (view !== 'reader' || !activeBook()) return;
  const book = activeBook(); const copy = document.querySelector('#reader-copy'); const stage = document.querySelector('#reader-stage'); if (!copy || !stage) return;
  const style = getComputedStyle(copy); const availableHeight = Math.max(80, stage.clientHeight - parseFloat(getComputedStyle(stage).paddingTop) - parseFloat(getComputedStyle(stage).paddingBottom));
  const key = [book.id, book.html ? book.html.length : (book.text || '').length, style.width, style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, state.settings.wordWrap, availableHeight].join('|');
  if (paginationCache?.key === key) return;
  const measure = copy.cloneNode(false); measure.id = 'reader-measure'; measure.style.position = 'fixed'; measure.style.left = '-100000px'; measure.style.top = '0'; measure.style.height = 'auto'; measure.style.maxHeight = 'none'; measure.style.width = `${copy.clientWidth}px`; measure.style.overflow = 'visible'; measure.style.visibility = 'hidden'; measure.style.padding = '0'; measure.style.fontSize = style.fontSize; measure.style.fontFamily = style.fontFamily; measure.style.fontWeight = style.fontWeight; measure.style.lineHeight = style.lineHeight; measure.style.letterSpacing = style.letterSpacing; (copy.parentNode || document.body).appendChild(measure);
  const fits = parts => { measure.innerHTML = parts.join(''); return measure.scrollHeight <= availableHeight; };
  const flush = () => { if (current.length) { pages.push(current.join('')); current = []; } };
  const packWords = (tag, words, originalHtml) => {
    if (!words.length) return;
    const whole = originalHtml || wrapWords(tag, words);
    if (current.length) {
      if (fits(current.concat([whole]))) { current.push(whole); return; }
      const trial = n => current.concat([wrapWords(tag, words.slice(0, n))]);
      let lo = 0, hi = words.length;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(trial(mid))) lo = mid; else hi = mid - 1; }
      if (lo > 0) current.push(wrapWords(tag, words.slice(0, lo)));
      flush();
      packWords(tag, words.slice(lo), null);
      return;
    }
    if (fits([whole])) { current.push(whole); return; }
    if (words.length === 1) { current.push(whole); return; }
    const half = Math.ceil(words.length / 2);
    packWords(tag, words.slice(0, half), null);
    packWords(tag, words.slice(half), null);
  };
  const packAtomic = html => {
    if (current.length && !fits(current.concat([html]))) flush();
    current.push(html);
  };
  const pages = []; let current = [];
  if (book.html) {
    splitBlocks(book.html).forEach(block => {
      explodeBlock(block).forEach(part => {
        if (part.words) packWords(part.tag, part.words, part.html);
        else packAtomic(part.atomic);
      });
    });
    flush();
  } else {
    const tokens = tokenizeText(book.text || 'У этой книги пока не удалось извлечь текст. Попробуйте открыть её ещё раз или использовать другой файл.');
    let page = '';
    tokens.forEach(token => { const next = appendToken(page, token); measure.innerHTML = formatPage(next, pages.length === 0); if (page && measure.scrollHeight > availableHeight) { pages.push(page); page = token.trim(); } else page = next; });
    if (page) pages.push(page);
  }
  measure.remove();
  paginationCache = { id: book.id, key, pages: pages.length ? pages : [book.html ? '' : ''] };
  if (positionedId !== book.id) { positionedId = book.id; if (book.pageIndex != null) readerPageIndex = Math.min(Math.max(book.pageIndex, 0), paginationCache.pages.length - 1); else if (book.progress) readerPageIndex = pageIndexForProgress(paginationCache.pages.map(part => book.html ? htmlToText(part).length : part.length), book.progress); }
  readerPageIndex = Math.min(readerPageIndex, paginationCache.pages.length - 1); render();
}
function changePage(delta) {
  const book = activeBook(); if (!book) return; const pages = paginationCache?.id === book.id ? paginationCache.pages : fallbackPages(book); const next = Math.max(0, Math.min(pages.length - 1, readerPageIndex + delta));
  if (next === readerPageIndex) { showToast(delta > 0 ? 'Это последняя страница' : 'Это первая страница'); return; }
  readerPageIndex = next; book.pageIndex = next; book.progress = pages.length <= 1 ? 100 : Math.round((next / (pages.length - 1)) * 100); book.updated = Date.now(); saveState(); render();
}
function pageIndexForProgress(plainLengths, progress) {
  const total = plainLengths.reduce((sum, len) => sum + len, 0);
  const target = Math.max(0, Math.floor((total || 1) * progress / 100)); let offset = 0;
  for (let index = 0; index < plainLengths.length; index++) { offset += plainLengths[index]; if (target <= offset) return index; }
  return plainLengths.length - 1;
}

fileInput.addEventListener('change', async event => { const files = [...event.target.files]; for (const file of files) { try { const book = await importBook(file); state.books.push(book); saveState(); } catch (error) { showToast(error.message || 'Не удалось открыть файл'); } } fileInput.value = ''; render(); if (files.length) showToast(`${files.length} ${plural(files.length, 'книга добавлена', 'книги добавлены', 'книг добавлено')}`); });
async function importBook(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['fb2', 'epub', 'txt', 'docx'].includes(extension)) throw new Error('Файл не поддерживается');
  let title = file.name.replace(/\.[^.]+$/, ''), author = 'Импортированный файл', text = '', html = '', notes = null;
  if (extension === 'txt') text = await file.text();
  else if (extension === 'fb2') {
    const raw = await file.text(); const xml = new DOMParser().parseFromString(raw, 'application/xml');
    title = xml.querySelector('book-title')?.textContent || title;
    author = [xml.querySelector('first-name')?.textContent, xml.querySelector('last-name')?.textContent].filter(Boolean).join(' ') || author;
    text = [...xml.querySelectorAll('body section, body')].map(node => node.textContent.trim()).join('\n\n');
    const binaries = {};
    [...xml.getElementsByTagName('binary')].forEach(bin => { const id = bin.getAttribute('id'); if (id) binaries[id] = { type: bin.getAttribute('content-type') || 'image/jpeg', data: bin.textContent.replace(/\s/g, '') }; });
    const bodies = [...xml.getElementsByTagName('body')].filter(body => !['notes', 'note'].includes(body.getAttribute('name')));
    html = bodies.map(body => fb2BodyToHtml(body, binaries)).join('');
    const noteBodies = [...xml.getElementsByTagName('body')].filter(body => ['notes', 'note'].includes(body.getAttribute('name')));
    if (noteBodies.length) {
      const noteIdFor = el => {
        if (el.nodeType !== 1) return '';
        const own = el.getAttribute('id') || el.getAttribute('name') || '';
        if (own) return own;
        const anchors = el.getElementsByTagName('a');
        for (const anchor of anchors) { const value = anchor.getAttribute('id') || anchor.getAttribute('name'); if (value) return value; }
        return '';
      };
      const collected = {};
      let order = 0;
      noteBodies.forEach(body => {
        const sections = [...body.childNodes].filter(node => node.nodeType === 1);
        (sections.length ? sections : [body]).forEach(section => {
          order += 1;
          const id = noteIdFor(section) || `n${order}`;
          const blockHtml = fb2BodyToHtml(section, binaries);
          if (htmlToText(blockHtml).trim()) collected[id] = blockHtml;
        });
      });
      if (Object.keys(collected).length) notes = collected;
    }
  }
  else {
    const entries = await unzip(file);
    if (extension === 'docx') {
      const doc = entries.text['word/document.xml'] || ''; const xml = new DOMParser().parseFromString(doc, 'application/xml');
      const relsDoc = entries.text['word/_rels/document.xml.rels'] || ''; const relsXml = new DOMParser().parseFromString(relsDoc, 'application/xml');
      html = docxToHtml(xml, relsXml, entries.img);
      text = htmlToText(html);
    } else {
      const container = entries.text['META-INF/container.xml'] || ''; const cxml = new DOMParser().parseFromString(container, 'application/xml');
      const root = cxml.querySelector('rootfile')?.getAttribute('full-path') || 'OEBPS/content.opf';
      const opf = entries.text[root] || ''; const opfXml = new DOMParser().parseFromString(opf, 'application/xml');
      title = opfXml.querySelector('dc\\:title, title')?.textContent || title; author = opfXml.querySelector('dc\\:creator, creator')?.textContent || author;
      const base = root.includes('/') ? root.slice(0, root.lastIndexOf('/') + 1) : '';
      const manifest = Object.fromEntries([...opfXml.querySelectorAll('manifest item')].map(i => [i.getAttribute('id'), i.getAttribute('href')]));
      const ids = [...opfXml.querySelectorAll('spine itemref')].map(i => i.getAttribute('idref'));
      html = ids.map(id => {
        const href = (manifest[id] || '').replace(/^\.?\//, '');
        const docBase = normalizeZipPath(base + href.replace(/[^/]+$/, ''));
        const source = entries.text[base + href] || entries.text[href] || '';
        if (!source) return '';
        const doc = new DOMParser().parseFromString(source, 'text/html');
        return collectBlocks(doc.body || doc, src => resolveEpubImage(src, docBase, entries.img));
      }).join('');
      text = htmlToText(html);
    }
  }
  if (!text.trim()) text = `Файл «${title}» добавлен.\n\nТекст не удалось извлечь автоматически в этом браузере, но книга сохранена в библиотеке.`;
  const book = { id: `book-${Date.now()}-${Math.random().toString(16).slice(2)}`, title, author, format: extension.toUpperCase(), progress: 0, text: text.trim(), cover: null, updated: Date.now() };
  if (html && htmlToText(html).trim()) book.html = html;
  if (notes) book.notes = notes;
  return book;
}
function normalizeZipPath(path) {
  const parts = [];
  path.split('/').forEach(part => { if (!part || part === '.') return; if (part === '..') parts.pop(); else parts.push(part); });
  return parts.join('/');
}
function resolveEpubImage(src, docBase, images) {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  const clean = src.split('#')[0].split('?')[0];
  const key = normalizeZipPath(docBase.replace(/\/?$/, '/') + clean.replace(/^\.?\//, ''));
  return images[key] || images[clean] || '';
}
function fb2BodyToHtml(body, binaries) {
  const kids = node => [...node.childNodes].map(walk).join('');
  const imgFor = node => {
    const href = node.getAttribute('xlink:href') || node.getAttribute('l:href') || node.getAttribute('href') || '';
    const bin = binaries[href.replace(/^#/, '')];
    return bin ? `<img src="data:${bin.type};base64,${bin.data}" alt="">` : '';
  };
  function walk(node) {
    if (node.nodeType === 3) return escapeHTML(node.textContent);
    if (node.nodeType !== 1) return '';
    const tag = (node.tagName || '').toLowerCase().replace(/^.*:/, '');
    if (tag === 'p' || tag === 'subtitle' || tag === 'text-author') return `<p>${kids(node)}</p>`;
    if (tag === 'title') { const t = node.textContent.trim(); return t ? `<h3>${escapeHTML(t)}</h3>` : ''; }
    if (tag === 'emphasis') return `<em>${kids(node)}</em>`;
    if (tag === 'strong') return `<strong>${kids(node)}</strong>`;
    if (tag === 'strikethrough') return `<s>${kids(node)}</s>`;
    if (tag === 'sub') return `<sub>${kids(node)}</sub>`;
    if (tag === 'sup') return `<sup>${kids(node)}</sup>`;
    if (tag === 'v') return `${kids(node)}<br>`;
    if (tag === 'empty-line') return '<p><br></p>';
    if (tag === 'image') return imgFor(node);
    if (tag === 'a') {
      const href = node.getAttribute('xlink:href') || node.getAttribute('l:href') || node.getAttribute('href') || '';
      if (href.startsWith('#')) return `<button type="button" class="note-link" data-note="${escapeHTML(href.slice(1))}">${kids(node)}</button>`;
      return kids(node);
    }
    return kids(node);
  }
  return [...body.childNodes].map(node => {
    if (node.nodeType === 3) return node.textContent.trim() ? `<p>${escapeHTML(node.textContent)}</p>` : '';
    return walk(node);
  }).join('');
}
function collectBlocks(root, resolveImg) {
  const doc = document.implementation.createHTMLDocument('');
  const blocks = [];
  const inlineNode = node => {
    if (node.nodeType === 3) return node.textContent ? doc.createTextNode(node.textContent) : null;
    if (node.nodeType !== 1) return null;
    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'link', 'meta', 'head', 'title'].includes(tag)) return null;
    if (tag === 'br') return doc.createElement('br');
    if (tag === 'img') {
      const src = resolveImg(node.getAttribute('src') || '');
      if (!src) return null;
      const img = doc.createElement('img'); img.setAttribute('src', src); img.setAttribute('alt', node.getAttribute('alt') || '');
      return img;
    }
    if (tag === 'button' && node.classList.contains('note-link') && node.getAttribute('data-note')) {
      const btn = doc.createElement('button');
      btn.setAttribute('type', 'button');
      btn.setAttribute('class', 'note-link');
      btn.setAttribute('data-note', node.getAttribute('data-note'));
      appendInline(node, btn);
      return btn;
    }
    const inlineTags = { strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', s: 's', strike: 's', sub: 'sub', sup: 'sup', span: 'span', font: 'span', a: 'span', code: 'code' };
    if (inlineTags[tag]) { const el = doc.createElement(inlineTags[tag]); appendInline(node, el); return el; }
    const frag = doc.createDocumentFragment(); appendInline(node, frag); return frag;
  };
  const appendInline = (node, parent) => { node.childNodes.forEach(child => { const built = inlineNode(child); if (built) parent.appendChild(built); }); };
  const pushText = text => { if (text && text.trim()) { const p = doc.createElement('p'); p.textContent = text; blocks.push(p); } };
  const block = node => {
    if (node.nodeType === 3) { pushText(node.textContent); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'link', 'meta', 'head', 'title'].includes(tag)) return;
    if (['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre'].includes(tag)) {
      const el = doc.createElement(tag); appendInline(node, el);
      if (el.textContent.trim() || el.querySelector('img')) blocks.push(el);
      return;
    }
    if (tag === 'hr') { blocks.push(doc.createElement('hr')); return; }
    if (tag === 'ul' || tag === 'ol') {
      const list = doc.createElement(tag);
      node.childNodes.forEach(child => {
        if (child.nodeType === 3) { pushText(child.textContent); return; }
        if (child.nodeType === 1 && child.tagName.toLowerCase() === 'li') { const item = doc.createElement('li'); appendInline(child, item); if (item.textContent.trim() || item.querySelector('img')) list.appendChild(item); }
        else block(child);
      });
      if (list.children.length) blocks.push(list);
      return;
    }
    if (tag === 'li') { const p = doc.createElement('p'); appendInline(node, p); if (p.textContent.trim() || p.querySelector('img')) blocks.push(p); return; }
    if (tag === 'img') {
      const built = inlineNode(node);
      if (built) { const wrap = doc.createElement('p'); wrap.appendChild(built); blocks.push(wrap); }
      return;
    }
    node.childNodes.forEach(block);
  };
  block(root);
  const wrap = doc.createElement('div'); blocks.forEach(item => wrap.appendChild(item));
  return wrap.innerHTML;
}
function docxToHtml(docXml, relsXml, images) {
  const doc = document.implementation.createHTMLDocument('');
  const rels = {};
  [...relsXml.getElementsByTagName('Relationship')].forEach(rel => { rels[rel.getAttribute('Id')] = rel.getAttribute('Target'); });
  const blocks = [];
  const imgSrc = embedId => {
    const target = rels[embedId];
    if (!target) return '';
    const key = normalizeZipPath('word/' + target.replace(/^\.?\//, ''));
    return images[key] || '';
  };
  const runHtml = run => {
    const frag = doc.createDocumentFragment();
    const rPr = run.getElementsByTagName('w:rPr')[0];
    const bold = !!rPr?.getElementsByTagName('w:b').length;
    const italic = !!rPr?.getElementsByTagName('w:i').length;
    [...run.childNodes].forEach(child => {
      if (child.nodeType !== 1) return;
      const tag = (child.tagName || '').toLowerCase();
      if (tag === 'w:t' || tag === 't') {
        let el = doc.createTextNode(child.textContent);
        if (italic) { const em = doc.createElement('em'); em.appendChild(el); el = em; }
        if (bold) { const st = doc.createElement('strong'); st.appendChild(el); el = st; }
        frag.appendChild(el);
      } else if (tag === 'w:br' || tag === 'br') frag.appendChild(doc.createElement('br'));
      else if (tag === 'w:drawing' || tag === 'w:pict') {
        const blip = child.getElementsByTagName('a:blip')[0];
        const src = blip ? imgSrc(blip.getAttribute('r:embed')) : '';
        if (src) { const img = doc.createElement('img'); img.setAttribute('src', src); frag.appendChild(img); }
      }
    });
    const wrap = doc.createElement('span'); wrap.appendChild(frag); return wrap.innerHTML;
  };
  let openList = null;
  const closeList = () => { if (openList) { blocks.push(openList.outerHTML); openList = null; } };
  [...docXml.getElementsByTagName('w:p')].forEach(p => {
    const isList = p.getElementsByTagName('w:numPr').length > 0;
    const styleEl = p.getElementsByTagName('w:pStyle')[0];
    const styleName = (styleEl?.getAttribute('w:val') || '').toLowerCase();
    const inner = [...p.getElementsByTagName('w:r')].map(runHtml).join('');
    if (!htmlToText(inner).trim() && !inner.includes('<img')) { closeList(); return; }
    if (isList) {
      if (!openList) openList = doc.createElement('ul');
      const item = doc.createElement('li'); item.innerHTML = inner; openList.appendChild(item);
      return;
    }
    closeList();
    const tag = styleName.startsWith('heading1') ? 'h3' : styleName.startsWith('heading') ? 'h4' : 'p';
    blocks.push(`<${tag}>${inner}</${tag}>`);
  });
  closeList();
  return blocks.join('');
}
function bytesToBase64(bytes) {
  let out = ''; const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(out);
}
function mimeForImage(name) {
  const ext = name.split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext] || '';
}
async function unzip(file) {
  const buffer = await file.arrayBuffer(), view = new DataView(buffer), bytes = new Uint8Array(buffer), decoder = new TextDecoder();
  let eocd = -1; for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Не удалось прочитать архив книги'); const count = view.getUint16(eocd + 10, true), centralOffset = view.getUint32(eocd + 16, true); let pos = centralOffset; const text = {}, img = {};
  for (let i = 0; i < count; i++) { if (view.getUint32(pos, true) !== 0x02014b50) break; const method = view.getUint16(pos + 10, true), compressed = view.getUint32(pos + 20, true), nameLen = view.getUint16(pos + 28, true), extraLen = view.getUint16(pos + 30, true), commentLen = view.getUint16(pos + 32, true), localOffset = view.getUint32(pos + 42, true); const name = decoder.decode(bytes.slice(pos + 46, pos + 46 + nameLen)); pos += 46 + nameLen + extraLen + commentLen; if (name.endsWith('/')) continue; const lp = localOffset + 30, localNameLen = view.getUint16(localOffset + 26, true), localExtraLen = view.getUint16(localOffset + 28, true), data = bytes.slice(lp + localNameLen + localExtraLen, lp + localNameLen + localExtraLen + compressed); let raw = data; if (method === 8) raw = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); const mime = mimeForImage(name); if (mime) img[name] = `data:${mime};base64,${bytesToBase64(raw)}`; else if (!/\.(otf|ttf|woff2?|eot)$/i.test(name)) text[name] = decoder.decode(raw); }
  return { text, img };
}

window.addEventListener('popstate', () => { if (settingsOpen) { settingsOpen = false; render(); } else if (view === 'reader') { openLibrary(); } else if (state.lastReaderId && state.books.some(book => book.id === state.lastReaderId)) { openReader(state.lastReaderId); } });
window.addEventListener('resize', () => { if (view === 'reader') { paginationCache = null; render(); } });
window.addEventListener('pagehide', () => { try { saveState(); } catch (_) {} });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { try { saveState(); } catch (_) {} } });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
render();
