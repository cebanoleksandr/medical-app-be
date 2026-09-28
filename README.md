# De-ID Studio — backend

API для де-идентификации медицинских текстов и генерации синтетических клинических данных.

- **Вход** — magic link на почту, без паролей.
- **Де-идентификация** — HIPAA (Safe Harbor / Expert Determination), EU GDPR, UK GDPR, Swiss FADP; английский и украинский.
- **Синтетические данные** — 4 встроенных типа датасетов, генерация по загруженной таблице или по де-идентифицированному документу, экспорт CSV / JSON / XLSX, отчёт о соответствии и качестве.

Деплой — в [DEPLOY.md](DEPLOY.md).

## Архитектура

```
Frontend ──/api──►  NestJS API (этот репозиторий)  ──►  PostgreSQL
                         │
                         └──X-API-Key──►  Presidio (presidio/, Python)
                                          детекция PII/PHI, en + uk
```

| Модуль | Что делает |
|---|---|
| `src/auth` | magic link, JWT (15 мин) + refresh-cookie с ротацией, удаление аккаунта |
| `src/deidentify` | мастер де-идентификации: фреймворки, детекция, режимы замены, извлечение текста из PDF/DOCX/TXT |
| `src/synthetic` | синтетика: генераторы, источники (файл / документ), экспорт, валидация |
| `src/audit` | журнал действий, `/activity`, `/dashboard` |
| `presidio/` | FastAPI + Presidio: свои распознаватели (MRN, РНОКПП, паспорт UA, AHV…) и фильтры ложных срабатываний |

## Персональные данные

Главное правило проекта — **исходный текст и значения идентификаторов не сохраняются**.

- **Анализы.** В базе только настройки и счётчики. Для переключения Included/Excluded клиент отправляет текст обратно, сервер сверяет его с анализом.
- **Синтетика.** Запись № *i* — детерминированная функция `(seed, i)`. Хранятся параметры и seed, записи генерируются на лету при просмотре и скачивании.
- **Источники синтетики.** Хранится только обезличенная выжимка:
  - из файла — статистика по колонкам: децили 5–95%, категории, встречающиеся 5 и более раз; колонки-идентификаторы и свободный текст отбрасываются;
  - из документа — шаблон, в котором вместо идентификаторов записаны только тип и «форма» значения.
  
  Выжимка шифруется AES-256-GCM и удаляется по TTL.
- **Псевдонимы.** Выводятся из HMAC с серверным секретом, поэтому одинаковы при каждом пересчёте, хотя нигде не хранятся.
- **Логи и аудит.** Нет текста, email, IP и имён файлов.
- **Удаление.** `DELETE /api/auth/me` каскадно удаляет всё, что принадлежит пользователю.

## Локальный запуск

Нужны Node 22 и Docker.

```bash
npm install
cp .env.example .env
# заполнить секреты в .env:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # JWT_ACCESS_SECRET, PSEUDONYM_SECRET, PRESIDIO_API_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # SOURCE_ENCRYPTION_KEY

docker compose up -d        # Postgres :5440 и Presidio :5001 (первая сборка ~5 мин)
npm run start:dev           # API на http://localhost:3000/api
```

- **Миграции** применяются автоматически при старте.
- **Письма** в dev не отправляются: при `MAIL_PROVIDER=console` ссылка для входа печатается в лог.
- **Swagger** доступен на http://localhost:3000/api/docs.

## Тесты

```bash
npm test                 # unit
npm run test:e2e         # e2e: нужен `docker compose up -d` (Postgres + Presidio)
npm run lint

# тесты Presidio
cd presidio && docker run --rm --user root -v "$PWD":/work -w /work backend-presidio \
  sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q"
```

## Миграции

```bash
npm run migration:generate -- src/database/migrations/<Name>   # после изменения entity
npm run migration:run
npm run migration:revert
```

`synchronize` выключен: схема меняется только миграциями.

## Переменные окружения

Полный список с комментариями — в [.env.example](.env.example). Схема проверяется при старте ([src/config/env.validation.ts](src/config/env.validation.ts)): с неверным конфигом приложение не запустится.

| Переменная | Назначение |
|---|---|
| `APP_URL` | origin фронтенда: CORS и ссылка в письме |
| `DATABASE_URL`, `DATABASE_SSL` | Postgres |
| `JWT_ACCESS_SECRET` | подпись access-токенов; при смене все пользователи разлогиниваются |
| `PSEUDONYM_SECRET` | ключ HMAC для псевдонимов; при смене псевдонимы меняются |
| `SOURCE_ENCRYPTION_KEY` | шифрование источников синтетики; при смене текущие источники станут нечитаемыми (всё равно живут не дольше TTL) |
| `PRESIDIO_URL`, `PRESIDIO_API_KEY` | сервис детекции; ключ должен совпадать с ключом Presidio |
| `MAIL_PROVIDER`, `RESEND_API_KEY` / `BREVO_API_KEY`, `MAIL_FROM_EMAIL` | почта: `resend` (основной) или `brevo`; `console` в production запрещён |
| `COOKIE_SECURE`, `COOKIE_SAMESITE`, `TRUST_PROXY` | настройки за прокси; для production см. DEPLOY.md |
| `SYNTH_DATASET_TTL_MINUTES` | сколько живут датасеты и источники (по умолчанию 60) |
| `AUDIT_RETENTION_DAYS` | срок хранения аудита (по умолчанию 365) |
| `SWAGGER_ENABLED` | документация `/api/docs`, в production по умолчанию выключена |

## API

Полное описание — в Swagger (`/api/docs`). Все маршруты под `/api`, по умолчанию требуют `Authorization: Bearer <accessToken>`.

| Группа | Эндпоинты |
|---|---|
| Auth | `POST auth/magic-link`, `POST auth/verify`, `POST auth/refresh`, `POST auth/logout`, `GET/DELETE auth/me` |
| De-identification | `GET analyses/options`, `POST analyses/extract-text`, `POST analyses`, `POST analyses/:id/render` |
| Synthetic | `GET synthetic/options`, `POST synthetic/datasets`, `GET synthetic/datasets/:id`, `…/records`, `…/records/:recordId`, `…/validation`, `…/download`, `POST …/regenerate` |
| Sources | `POST synthetic/sources/file`, `POST synthetic/sources/analysis`, `GET synthetic/sources/:id` |
| Activity | `GET activity`, `GET dashboard` |

### Схема входа для фронтенда

1. `POST /api/auth/magic-link { email, locale: "uk" | "en" }`. В письме придёт ссылка `APP_URL/auth/verify?token=…`.
2. Страница `/auth/verify` отправляет `POST /api/auth/verify { token }`. Верификация намеренно сделана через POST, а не GET: почтовые сканеры открывают ссылки заранее и «съели» бы одноразовый токен. В ответ приходит `accessToken`, refresh-токен ставится в `httpOnly` cookie.
3. Access-токен хранится в памяти (не в `localStorage`). При ответе 401 вызывается `POST /api/auth/refresh` с `credentials: 'include'`. Одновременные refresh-запросы лучше объединять в один: повторное использование старого refresh-токена спустя 30 секунд после ротации считается кражей, и тогда сбрасываются все сессии.
