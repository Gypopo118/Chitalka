# Читалка

Мобильный PWA-прототип книжной читалки для последующей упаковки в APK.

## Запуск

Проект не требует сборщика и внешних библиотек:

```bash
python -m http.server 4173
```

Откройте `http://localhost:4173` в браузере и установите приложение на главный экран. Сервис-воркер кеширует интерфейс для офлайн-запуска.

## Что реализовано

- библиотека с сортировкой по последней активности;
- обложки-заглушки, проценты 0–100% и зелёный статус завершённой книги;
- long press по книге → удаление;
- импорт TXT, FB2, EPUB и DOCX через системный выбор файла;
- чтение: панели по долгому нажатию (~500 мс) поверх текста без перепагинации, листание тапом по краям экрана или свайпом, яркость вертикальным драгом с индикатором;
- зеркало яркости: свайп вверх — светлее, вниз — темнее;
- короткий тап по странице скрывает панели чтения;
- просмотрщик изображений: pinch-зум, пан и double-tap;
- сноски FB2 во всплывающем окне;
- сохранение книги, страницы и процента чтения в `localStorage`;
- настройки размера, расстояния между строк, шрифта, фона, цвета текста, переноса по словам;
- импорт с форматированием: жирный/курсив, абзацы, заголовки, маркированные списки и картинки (FB2, EPUB, DOCX; TXT без форматирования);
- обложки FB2 в библиотеке (даунскейл до 512px);
- плавный zoom во вьювере: rAF-коалесцинг, без CSS-transition;
- дебаунс применения шрифта и интервала (400мс, без передёргивания модалки);
- порционная пагинация без фризов (чанки с yield, stale-guard);
- картинки целиком на странице (decode-aware, без обрезки);
- мёртвая кнопка-радуга фона удалена (остался рабочий custom-color);
- локальная яркость режима чтения через свайп вверх/вниз;
- `manifest.webmanifest`, иконка и service worker для PWA.

## Иконки

- `icons/icon-192.png`, `icons/icon-512.png` — обычные PWA-иконки (из `Icons/icon512.png`);
- `icons/maskable-512.png` — maskable-версия с полями под круглые/каплевидные маски Android;
- `icons/icon-180.png` — `apple-touch-icon`;
- `android-res/mipmap-*/ic_launcher.png` — лаунчер-иконки для APK (mdpi 48 … xxxhdpi 192).
- Исходники лежат в `icons/`, старый набор `drawable-*` не используется.

## Сборка APK (GitHub Actions)

Workflow `.github/workflows/android-apk.yml` собирает debug-APK через Capacitor:

1. `npm ci` → `npm run sync-www` (копирует веб-файлы в `www/`);
2. `npx cap add android`, подмена иконок из `android-res/`, `npx cap sync android`;
3. `./gradlew assembleDebug` → артефакт `chitalca-debug-apk`.

Запуск: push в `main`/`master` или вручную (Actions → Android APK → Run workflow).
Готовый APK: `android/app/build/outputs/apk/debug/app-debug.apk`, package `ru.chitalca.app`.

Локальная проверка цепочки без Android SDK:

```bash
npm install
npm run sync-www
npx cap add android
cp -r android-res/mipmap-* android/app/src/main/res/
npx cap sync android
```
