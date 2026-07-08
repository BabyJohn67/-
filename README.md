# Hookah Gold QR Menu

Простой сайт для кальянной: гости открывают список табаков по ссылке или QR-коду, мастер входит по PIN-коду и видит подготовленную панель управления.

## Что внутри

- `src/` — сайт на React.
- `server/` — маленький Node.js + Express сервер.
- `.env.example` — пример настроек.
- `README.md` — эта инструкция.

## Как запустить локально

1. Установите зависимости:

   ```bash
   npm install
   ```

   Если на вашем Mac не установлен `npm`, можно использовать встроенный в Codex `pnpm`:

   ```bash
   /Users/igorgoldobaev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/igorgoldobaev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs install
   ```

2. Запустите сайт:

   ```bash
   npm run dev
   ```

   Если запускаете через встроенный Codex `pnpm`, используйте:

   ```bash
   PATH=/Users/igorgoldobaev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH /Users/igorgoldobaev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/igorgoldobaev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs run dev
   ```

3. Откройте в браузере:

   ```text
   http://127.0.0.1:5173
   ```

## PIN мастера

Временный PIN: `2580`.

Для будущего изменения создайте файл `.env` рядом с `.env.example` и добавьте:

```bash
MASTER_PIN=ваш_новый_pin
```

## Google Таблица

Сервер умеет работать с вкладкой `Табаки` двумя способами:

- через Google Sheets API, если в `.env` добавлены ключи service account;
- через CSV export как запасной вариант для чтения.

CSV fallback:

```text
https://docs.google.com/spreadsheets/d/1Fu330axX0aYehTS7mv9EopnzM_4THrxv2d-aR0NQL4o/export?format=csv&gid=569579743
```

Для записи количества и добавления новых позиций нужен Google Sheets API. Создайте `.env` рядом с `.env.example`:

```bash
GOOGLE_SHEET_ID=1Fu330axX0aYehTS7mv9EopnzM_4THrxv2d-aR0NQL4o
GOOGLE_SHEET_NAME=Табаки
GOOGLE_SERVICE_ACCOUNT_EMAIL=ваш-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Потом откройте Google Таблицу и дайте этому service account доступ `Редактор`.

Важно: эти ключи хранятся только на сервере. React-сайт обращается к Google Таблице только через Express API.

Если ключи Google не настроены, сайт продолжит показывать список через CSV/fallback, но сохранение из панели мастера вернет понятную ошибку.

Если CSV тоже недоступен, таблица должна быть доступна по ссылке или опубликована в веб.

Самый простой вариант:

1. Откройте Google Таблицу.
2. Нажмите `Файл` → `Поделиться` → `Опубликовать в интернете`.
3. Выберите вкладку `Табаки`.
4. Опубликуйте как CSV или просто сделайте таблицу доступной для просмотра по ссылке.
5. Перезапустите сайт.

Если данные не загрузятся, сайт покажет понятное сообщение и тестовый список табаков.

## Как подготовить QR-код

Когда сайт будет размещен на сервере, у него появится обычная ссылка, например:

```text
https://your-hookah-menu.ru
```

Эту ссылку нужно вставить в любой генератор QR-кодов и распечатать QR для столиков.

## QR на конкретном кальяне

Для физических кальянов добавлена страница активного микса:

```text
/hookah/1
/hookah/2
/hookah/3
```

Мастер заходит в панель мастера, блок `Создать микс для кальяна`, указывает номер кальяна, табаки, проценты и комментарий. После сохранения гость, который откроет QR вида `/hookah/1`, увидит активный микс именно этого кальяна.

В локальной версии активные миксы сохраняются на backend в файле:

```text
server/data/activeMixes.json
```

Для реальной работы с телефона QR должен вести на опубликованный сайт, например:

```text
https://your-hookah-menu.ru/hookah/1
```

## Бесплатная публикация на Render

Проект подготовлен для бесплатного размещения на Render. После публикации Render выдаст бесплатный адрес вида:

```text
https://hookah-menu.onrender.com
```

Для QR на кальяне нужны ссылки:

```text
https://hookah-menu.onrender.com/hookah/1
https://hookah-menu.onrender.com/hookah/2
https://hookah-menu.onrender.com/hookah/3
```

### Что уже подготовлено

- `render.yaml` — конфигурация для Render.
- `npm run build` собирает React-сайт.
- `npm run start` запускает Express в production.
- Express отдаёт и API, и готовый сайт из `dist`.
- На сервере приложение слушает `0.0.0.0`, локально — `127.0.0.1`.
- Активные миксы сохраняются в Google Таблицу во вкладку `Активные миксы`, если настроен service account.
- Если service account не настроен, активные миксы локально сохраняются в `server/data/activeMixes.json`.

### Как опубликовать

1. Загрузите проект в GitHub-репозиторий.
2. Откройте Render: `https://render.com`.
3. Создайте аккаунт или войдите.
4. Нажмите `New` → `Blueprint`.
5. Выберите GitHub-репозиторий с этим проектом.
6. Render прочитает файл `render.yaml`.
7. Подтвердите создание сервиса.
8. В настройках сервиса откройте `Environment`.
9. Заполните секретные переменные:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=ваш-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
MASTER_PIN=2580
```

10. Откройте Google Таблицу и дайте service account доступ `Редактор`.
11. Нажмите `Manual Deploy` → `Deploy latest commit`.
12. После завершения Render покажет публичную ссылку.

### Важное про бесплатный тариф

На бесплатном тарифе Render может засыпать после простоя. Первый вход после паузы может открываться медленнее. Для теста и первых QR этого достаточно, но для постоянной коммерческой работы лучше позже перейти на платный тариф или VPS.

Если активные миксы должны не пропадать после перезапуска сервера, обязательно настройте service account. Тогда они будут храниться в Google Таблице, а не во временном файле сервера.

## Что доделать для полноценной публикации

- Разместить проект на Render по инструкции выше.
- Позже подключить собственный домен, если нужен красивый адрес без `onrender.com`.
- Заменить временный PIN на нормальную авторизацию.
- Проверить права service account к Google Таблице.
- Заменить временную PIN-защиту API на полноценный вход мастера.
