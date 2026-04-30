# T-Банк Loyalty Hub

Единый раздел лояльности Т-Банка по данным кейса РадиоХак. Проект объединяет frontend, backend и аналитику по CSV-датасету: пользователь выбирает клиента, видит счета, кешбэк, историю начислений, партнерские офферы, достижения, прогноз выгоды и рекомендации продуктов экосистемы.

## Демо

- Frontend: [https://tbank-loyalty-hub.pages.dev/](https://tbank-loyalty-hub.pages.dev/)
- Backend/API: [https://tbank-loyalty-hub-api.onrender.com](https://tbank-loyalty-hub-api.onrender.com)
- Health check: [https://tbank-loyalty-hub-api.onrender.com/api/health](https://tbank-loyalty-hub-api.onrender.com/api/health)
- Repository: [https://github.com/kiririri13/T-bank](https://github.com/kiririri13/T-bank)

## Что умеет

- Быстрый выбор клиента без логина и пароля.
- Поиск клиента по имени или id.
- Личный дашборд со счетами, балансами и суммарной выгодой.
- Детализация счета: программа лояльности, категория, выплаты и последние начисления.
- График выплат по месяцам с раскрытием конкретных операций.
- Прогноз выгоды на следующий месяц и ближайшие 3 месяца.
- 6 достижений с прогресс-барами и общим средним прогрессом.
- Партнерские предложения из `Offers.csv`, включая логотипы и доступность по сегменту клиента.
- Рекомендации продуктов экосистемы Т-Банка.
- Светлая/темная тема.
- PWA-режим: `manifest.json`, service worker, иконки 192/512.
- Подготовка к мобильной упаковке через Capacitor.

## Архитектура

Проект состоит из двух частей:

- `server.js` - Node.js backend без Express и внешних backend-фреймворков.
- `public/` - статический frontend на HTML, CSS и vanilla JavaScript.

Backend читает исходные CSV-файлы из `data/`, собирает агрегированные данные и отдает JSON API. Frontend запрашивает API, рендерит интерфейс и может работать как со same-origin backend локально, так и с внешним Render API на Cloudflare Pages.

## Технологии

- Node.js 20+
- Vanilla JavaScript
- HTML/CSS
- CSV как источник данных
- PWA manifest + service worker
- Capacitor config для мобильной упаковки
- GitHub Actions
- Cloudflare Pages
- Render

## Быстрый запуск

```bash
npm ci
npm start
```

После запуска откройте:

```text
http://localhost:3000
```

Если `npm` недоступен, backend можно запустить напрямую:

```bash
node server.js
```

На Windows также можно использовать:

```bat
start-server.cmd
```

## Скрипты

```bash
npm start
```

Запускает Node.js сервер и отдает frontend из `public/`.

```bash
npm test
```

Запускает тесты из `tests.js`.

```bash
npm run build:pages
```

Генерирует `public/config.js` для Cloudflare Pages. Скрипт берет backend URL из переменной `API_BASE_URL`.

## API

### `GET /api/health`

Проверка состояния backend и доступности датасета.

### `GET /api/users`

Возвращает список клиентов для стартового экрана.

### `POST /api/login`

Принимает `login` и находит клиента по email, телефону или id.

Пример тела запроса:

```json
{
  "login": "1"
}
```

### `GET /api/users/:id/dashboard`

Возвращает полный дашборд клиента: счета, историю выплат, категории, прогноз, достижения, офферы, продукты и AI-like insight.

## Данные

Backend намеренно использует только 5 исходных CSV-файлов:

```text
data/Users.csv
data/Accounts.csv
data/LoyaltyPrograms.csv
data/Offers.csv
data/LoyaltyHistory.csv
```

Список файлов закреплен в `CSV_FILES` внутри `server.js`. База данных не нужна.

## Переменные окружения

### Backend

```text
PORT=3000
HOST=0.0.0.0
ALLOWED_ORIGINS=*
```

`PORT` задает порт сервера. Render прокидывает его автоматически.

`HOST` по умолчанию равен `0.0.0.0`, чтобы сервис корректно работал на Render.

`ALLOWED_ORIGINS` управляет CORS. Для production лучше указать Cloudflare Pages домен:

```text
ALLOWED_ORIGINS=https://tbank-loyalty-hub.pages.dev
```

### Frontend build

```text
API_BASE_URL=https://tbank-loyalty-hub-api.onrender.com
```

Эта переменная используется скриптом `npm run build:pages`, который генерирует `public/config.js`.

## Деплой

### Render backend

В репозитории есть `render.yaml`, поэтому backend можно создать через Render Blueprint.

Настройки сервиса:

```text
Name: tbank-loyalty-hub-api
Runtime: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /api/health
Auto Deploy: after CI checks pass
```

Production URL:

```text
https://tbank-loyalty-hub-api.onrender.com
```

### Cloudflare Pages frontend

Настройки Pages:

```text
Project name: tbank-loyalty-hub
Build command: npm run build:pages
Build output directory: public
```

Environment variable:

```text
API_BASE_URL=https://tbank-loyalty-hub-api.onrender.com
```

Production URL:

```text
https://tbank-loyalty-hub.pages.dev/
```

## CI/CD

Workflow находится в `.github/workflows/ci.yml`.

На pull request:

```text
npm ci
npm test
```

На push в `main`:

```text
npm ci
npm test
npm run build:pages
npx --yes wrangler@4 pages deploy public --project-name=tbank-loyalty-hub
```

Для GitHub Actions нужны secrets:

```text
API_BASE_URL=https://tbank-loyalty-hub-api.onrender.com
CLOUDFLARE_ACCOUNT_ID=<Cloudflare Account ID>
CLOUDFLARE_API_TOKEN=<Cloudflare API token>
```

И repository variable:

```text
CLOUDFLARE_PAGES_PROJECT_NAME=tbank-loyalty-hub
```

Workflow дополнительно проверяет, что обязательные secrets заданы, и падает с понятной ошибкой, если чего-то не хватает.

## Тесты

```bash
npm test
```

Покрываются основные сценарии:

1. Загрузка исходных CSV и список пользователей.
2. Расчет личного дашборда.
3. Достижения и progress bars.
4. Health API, CORS/preflight и список пользователей.
5. Login API и Dashboard API.

Ожидаемый успешный вывод:

```text
✓ 1. Исходные CSV и пользователи
✓ 2. Расчет личного дашборда
✓ 3. Достижения и прогресс-бары
✓ 4. Health API и список пользователей
✓ 5. Login API и Dashboard API
All tests passed: 5 рабочих тестов
```

## PWA и мобильная подготовка

Frontend содержит:

- `public/manifest.json` - имя приложения, цвета, иконки и standalone-режим.
- `public/sw.js` - service worker для валидного PWA-поведения без перехвата запросов.
- `public/icon-192.png` и `public/icon-512.png` - иконки приложения.
- `capacitor.config.json` - базовая конфигурация Capacitor:

```json
{
  "appId": "ru.tbank.loyalty",
  "appName": "Т-Банк Лояльность",
  "webDir": "public"
}
```

## Структура проекта

```text
.
├── .github/workflows/ci.yml
├── data/
│   ├── Accounts.csv
│   ├── LoyaltyHistory.csv
│   ├── LoyaltyPrograms.csv
│   ├── Offers.csv
│   └── Users.csv
├── public/
│   ├── app.js
│   ├── config.js
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── index.html
│   ├── manifest.json
│   ├── styles.css
│   └── sw.js
├── scripts/
│   └── generate-config.js
├── capacitor.config.json
├── package.json
├── render.yaml
├── server.js
└── tests.js
```