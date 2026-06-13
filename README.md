# Films Portal

Lokalny portal filmowy dla oglądania filmów z dysku — aplikacja Electron.

## Uruchomienie

```
start.bat
```

lub z terminala:
```
cd d:\films_site
npm start
```

## Instalacja (pierwsze uruchomienie)

```
npm install
npm start
```

## Funkcje

- Skanowanie folderów z filmami (konfiguracja w zakładce **Ustawienia**)
- Generowanie miniaturek (FFmpeg)
- Sekcja **Nowości** — ostatnio dodane pliki
- Sekcja **Kontynuuj oglądanie** — powrót do przerwanego seansu
- Grupowanie seriali wg sezonu
- Wyszukiwarka i filtrowanie
- Player wideo z obsługą wielu formatów (MP4, MKV, AVI, MOV...)
- Wybór ścieżki audio
- Napisy (wbudowane i zewnętrzne .srt)
- Zapamiętywanie pozycji odtwarzania

## Struktura seriali

Aby seriale były rozpoznawane, foldery powinny wyglądać tak:

```
Mój Serial/
├── Season 1/
│   ├── E01.mkv
│   └── E02.mkv
└── Season 2/
    └── S02E01.mkv
```
