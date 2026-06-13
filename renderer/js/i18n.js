/**
 * i18n — Translations: Ukrainian (default) + Polish
 */

const TRANSLATIONS = {
  uk: {
    app_title:      'Домашній кінотеатр',
    nav_home:       'Головна',
    nav_films:      'Фільми',
    nav_series:     'Серіали',
    nav_mama:       'Мама',
    nav_settings:   'Налаштування',

    continue_title: 'Продовжити перегляд',
    new_title:      'Новинки',
    movies_title:   'Фільми',
    films_title:    'Всі фільми',
    all_genres:     'Всі',
    mama_all:       'Фільми Мама',
    mama_label:     'Мама',
    mama_empty:     'Немає фільмів.\nПозначте папки як Мама в Налаштуваннях.',
    search_ph:      'Пошук фільмів...',
    time_left:      'Залишилось:',

    empty_movies:   'Немає фільмів.\nДодайте папки в Налаштуваннях і натисніть Сканувати.',
    empty_series:   'Немає серіалів.\nСтруктура: Серіал / Сезон X / епізод.mkv',
    no_folders:     'Папки не додані',

    settings_folders: 'Папки з відео',
    settings_scan:  'Сканування',
    add_folder:     '+ Додати папку',
    scan_btn:       'Сканувати зараз',
    scan_done:      'Готово!',
    scan_err:       'Помилка сканування',
    folder_added:   'Папку додано. Запустіть сканування.',
    scanning:       '⏳ Сканування...',

    season:         'Сезон',
    episodes:       'епізодів',
    seasons:        'сезон(и)',

    back:           'Назад',
    audio_label:    'Аудіо:',
    mova:           'Мова',
    sub_btn:        'CC',
    not_found:      'Фільм не знайдено',

    badge_new:      'НОВЕ',
    badge_sub:      'SUB',

    scan_complete_toast: 'Сканування завершено!',
    stats_films:  'фільмів',
    stats_series: 'серіалів',
    stats_files:  'файлів',

    nav_history:        'Історія',
    hist_watched:       'Переглянуті',
    hist_unwatched:     'Не переглянуті',
    hist_file_deleted:  'Файл видалено з диска',
    hist_empty_watched:   'Немає переглянутих фільмів.\nПосмотрите хоч один до 70% і він з\'явиться тут.',
    hist_empty_unwatched: 'Немає незакінчених фільмів.',
    clear_history:        'Очистити всю історію',
    clear_history_confirm:'Очистити всю історію перегляду? Цю дію не можна скасувати.',
    factory_reset:        'Скинути всі дані',
    factory_reset_confirm:'Видалити ВСІ дані додатку?\n\nБудуть видалені:\n• Всі відскановані фільми\n• Вся історія перегляду\n• Всі папки з налаштувань\n\nЦю дію не можна скасувати.',
    factory_reset_done:   'Дані очищено. Додайте папки і запустіть сканування.',
    factory_reset_desc:   'Видаляє всі відскановані фільми, історію перегляду та всі налаштовані папки.',
    settings_danger:      'Небезпечна зона',

    group_label: 'Нова Група',
    group_empty: 'Немає відео у цій групі.',
  },

  pl: {
    app_title:      'Domowe Kino',
    nav_home:       'Strona główna',
    nav_films:      'Filmy',
    nav_series:     'Seriale',
    nav_mama:       'Mama',
    nav_settings:   'Ustawienia',

    continue_title: 'Kontynuuj oglądanie',
    new_title:      'Nowości',
    movies_title:   'Filmy',
    films_title:    'Wszystkie filmy',
    all_genres:     'Wszystkie',
    mama_all:       'Filmy Mama',
    mama_label:     'Mama',
    mama_empty:     'Brak filmów.\nOznacz foldery jako Mama w Ustawieniach.',
    search_ph:      'Szukaj filmów...',
    time_left:      'Pozostało:',

    empty_movies:   'Brak filmów.\nDodaj foldery w Ustawieniach i kliknij Skanuj.',
    empty_series:   'Brak seriali.\nStruktura: Serial / Season X / odcinek.mkv',
    no_folders:     'Brak folderów',

    settings_folders: 'Foldery z wideo',
    settings_scan:  'Skanowanie',
    add_folder:     '+ Dodaj folder',
    scan_btn:       'Skanuj teraz',
    scan_done:      'Gotowe!',
    scan_err:       'Błąd skanowania',
    folder_added:   'Folder dodany. Uruchom skanowanie.',
    scanning:       '⏳ Skanuję...',

    season:         'Sezon',
    episodes:       'odcinków',
    seasons:        'sezon(y)',

    back:           'Powrót',
    audio_label:    'Audio:',
    mova:           'Mowa',
    sub_btn:        'CC',
    not_found:      'Film nie znaleziony',

    badge_new:      'NOWY',
    badge_sub:      'SUB',

    scan_complete_toast: 'Skanowanie ukończone!',
    stats_films:  'filmów',
    stats_series: 'seriali',
    stats_files:  'plików',

    nav_history:        'Historia',
    hist_watched:       'Obejrzane',
    hist_unwatched:     'Nie obejrzane',
    hist_file_deleted:  'Plik usunięty z dysku',
    hist_empty_watched:   'Brak obejrzanych filmów.\nObejrzyj coś do 70% — pojawi się tutaj.',
    hist_empty_unwatched: 'Brak nieukończonych filmów.',
    clear_history:        'Wyczyść całą historię',
    clear_history_confirm:'Wyczyścić całą historię oglądania? Tej operacji nie można cofnąć.',
    factory_reset:        'Resetuj wszystkie dane',
    factory_reset_confirm:'Usunąć WSZYSTKIE dane aplikacji?\n\nZostaną usunięte:\n• Wszystkie zeskanowane filmy\n• Cała historia oglądania\n• Wszystkie foldery z ustawień\n\nTej operacji nie można cofnąć.',
    factory_reset_done:   'Dane wyczyszczone. Dodaj foldery i uruchom skanowanie.',
    factory_reset_desc:   'Usuwa wszystkie zeskanowane filmy, historię oglądania i wszystkie skonfigurowane foldery.',
    settings_danger:      'Strefa niebezpieczna',

    group_label: 'Nowa Grupa',
    group_empty: 'Brak wideo w tej grupie.',
  }
};

let currentLang = 'uk';

function setLang(lang) {
  if (TRANSLATIONS[lang]) currentLang = lang;
}

function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key])
    || (TRANSLATIONS['uk'] && TRANSLATIONS['uk'][key])
    || key;
}

function getLang() { return currentLang; }

if (typeof module !== 'undefined') {
  module.exports = { t, setLang, getLang, TRANSLATIONS };
} else {
  window.i18n = { t, setLang, getLang, TRANSLATIONS };
}
