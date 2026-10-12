# SPEC: техническая спецификация учебной системы барбершопа

## 1. Архитектура

Основной поток данных:

```text
Сайт / Telegram Mini App / Админка
                ↓
            HTTP API
                ↓
       Fastify API на Vercel
                ↓
      Prisma + бизнес-логика
                ↓
       Supabase PostgreSQL
```

Telegram-бот использует тот же backend API.

Фоновые уведомления работают отдельно:

```text
Supabase Cron
      ↓
Supabase Edge Function
      ↓
PostgreSQL
      ↓
Telegram Bot API
```

Frontend не должен напрямую создавать записи в базе.

---

## 2. Стек

| Слой | Технология |
|---|---|
| Репозиторий | npm workspaces |
| Сайт + админка | Next.js, TypeScript |
| Mini App | React + Vite + TypeScript |
| Backend API | Fastify + TypeScript |
| Валидация | Zod |
| ORM | Prisma |
| База данных | Supabase PostgreSQL |
| Фото | Supabase Storage |
| Telegram Bot | grammY |
| Фоновые задачи | Supabase Cron + Edge Functions |
| Деплой frontend | Vercel |
| Деплой API | Vercel |
| Тесты | Vitest / Playwright |

Не требуются:

- Docker;
- Docker Compose;
- Redis;
- pg-boss;
- VPS;
- Nginx.

---

## 3. Структура репозитория

```text
package.json

apps/
  web/
    Next.js
    лендинг
    /book
    /booking/[token]
    /admin

  api/
    Fastify
    REST API
    Telegram webhook
    business logic

  miniapp/
    React + Vite
    Telegram Mini App

packages/
  ui/
    общие UI-компоненты

  shared/
    Zod-схемы
    TypeScript-типы
    утилиты времени

supabase/
  functions/
    notifications/
```

---

## 4. Supabase

Supabase используется как управляемая облачная инфраструктура.

Используем:

- PostgreSQL;
- Storage;
- Cron;
- Edge Functions.

Не используем в MVP:

- Supabase Auth как основную авторизацию;
- прямой клиентский CRUD критических таблиц.

### Подключения

Backend получает строки подключения через environment variables.

Пример:

```env
DATABASE_URL=
DIRECT_URL=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

TELEGRAM_BOT_TOKEN=
APP_URL=
API_URL=
```

Секретные переменные не должны попадать в frontend bundle.

---

## 5. Модель данных

### barbers

```text
id
name
photo_url
bio
experience_years
telegram_chat_id
is_active
sort_order
```

### portfolio_items

```text
id
barber_id
image_url
sort_order
```

### services

```text
id
name
description
duration_min
price
is_active
sort_order
```

### barber_services

```text
barber_id
service_id
duration_min nullable
price nullable
is_enabled
```

### working_hours

```text
id
barber_id
weekday
start_time
end_time
```

### breaks

```text
id
barber_id
weekday
start_time
end_time
```

### time_off

```text
id
barber_id nullable
starts_at
ends_at
type
note
```

`barber_id = null` означает исключение для всего барбершопа.

### clients

```text
id
name
phone
telegram_id nullable unique
telegram_chat_id nullable
created_at
```

### bookings

```text
id
client_id
barber_id
starts_at
ends_at
total_price
total_duration_min
status
source
manage_token
created_at

reminder_day_sent_at nullable
reminder_30m_sent_at nullable
review_requested_at nullable
auto_completed_at nullable
```

Статусы:

```text
confirmed
completed
cancelled
no_show
```

Источник:

```text
web
telegram
admin
```

### booking_services

Снимок услуги на момент записи:

```text
booking_id
service_id
name
duration_min
price
```

### reviews

```text
id
booking_id
barber_id
client_id
rating
comment
is_public
created_at
```

### settings

```text
key
value
```

Примеры:

```text
cancel_cutoff_min = 30
slot_step_min = 15
booking_horizon_days = 30
min_notice_min = 30
reminder_day_minutes = 1440
reminder_short_minutes = 30
review_delay_min = 60
timezone = Asia/Tashkent
review_public_min_rating = 4
```

### admin_users

```text
id
login
password_hash
telegram_chat_id nullable
```

---

## 6. Защита от двойной записи

Проверки в коде недостаточно.

Два пользователя могут одновременно выбрать один слот.

Поэтому PostgreSQL должен запрещать пересекающиеся подтверждённые записи одного барбера.

Используем range + exclusion constraint:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
ADD COLUMN time_range tstzrange
GENERATED ALWAYS AS (
  tstzrange(starts_at, ends_at, '[)')
) STORED;

ALTER TABLE bookings
ADD CONSTRAINT bookings_no_overlap
EXCLUDE USING gist (
  barber_id WITH =,
  time_range WITH &&
)
WHERE (status = 'confirmed');
```

Если возникает конфликт PostgreSQL `23P01`, API возвращает:

```http
409 Conflict
```

```json
{
  "code": "SLOT_TAKEN"
}
```

---

## 7. Расчёт свободных слотов

Вход:

```text
serviceIds
barberId
date
```

Backend:

1. получает услуги;
2. определяет общую длительность;
3. получает рабочее время барбера;
4. исключает обед;
5. исключает `time_off`;
6. исключает существующие confirmed-записи;
7. строит свободные интервалы;
8. генерирует старты с шагом `slot_step_min`;
9. проверяет, помещается ли вся услуга;
10. исключает прошедшее время;
11. учитывает `min_notice_min`;
12. учитывает `booking_horizon_days`.

Для `barberId=any`:

- считаются слоты всех подходящих активных барберов;
- пользователю показывается объединённый список;
- при подтверждении выбирается один доступный барбер.

---

## 8. REST API

Префикс:

```text
/api/v1
```

### Публичные

```http
GET    /services
GET    /barbers
GET    /barbers/:id

GET    /availability
GET    /availability/days

POST   /bookings

GET    /bookings/:token
POST   /bookings/:token/cancel
POST   /bookings/:token/reschedule

GET    /me/bookings

GET    /reviews/public
POST   /reviews
```

### Админские

```http
POST   /admin/login
POST   /admin/logout

GET/POST/PATCH/DELETE /admin/barbers
GET/POST/PATCH/DELETE /admin/services

PUT    /admin/barbers/:id/schedule

GET/POST/PATCH/DELETE /admin/time-off

GET    /admin/bookings
POST   /admin/bookings
PATCH  /admin/bookings/:id

GET    /admin/reviews

GET    /admin/analytics/revenue
GET    /admin/analytics/services
GET    /admin/analytics/load
GET    /admin/analytics/heatmap
GET    /admin/analytics/cancellations
GET    /admin/analytics/retention

PUT    /admin/settings
```

---

## 9. Создание записи

Пример:

```http
POST /api/v1/bookings
```

```json
{
  "serviceIds": ["uuid"],
  "barberId": "uuid",
  "startsAt": "2026-10-05T10:00:00Z",
  "client": {
    "name": "Иван",
    "phone": "+998..."
  }
}
```

Алгоритм:

1. Zod валидирует входные данные.
2. Backend загружает выбранные услуги.
3. Проверяет барбера.
4. Считает длительность и цену.
5. Проверяет расписание.
6. Проверяет исключения.
7. Проверяет актуальную доступность.
8. В транзакции создаёт запись.
9. Ограничение PostgreSQL окончательно защищает от гонки.
10. API возвращает созданную запись.

Ответы:

```text
201 — запись создана
409 SLOT_TAKEN — слот уже занят
422 OUTSIDE_WORKING_HOURS
422 TOO_SOON
422 TOO_FAR
400/422 — невалидные данные
```

---

## 10. Авторизация

### Telegram Mini App

Mini App передаёт `initData`.

Backend обязан:

- проверить HMAC-подпись;
- проверить срок жизни;
- извлечь Telegram user;
- найти или создать клиента.

### Сайт

Гостевая запись:

- имя;
- телефон.

Управление записью — через длинный случайный `manage_token`.

### Админка

- login + password;
- пароль хранится только как Argon2 hash;
- session в httpOnly cookie;
- rate limit на login.

---

## 11. Telegram

### Webhook

Telegram вызывает:

```text
POST /telegram/webhook
```

API обрабатывает:

- `/start`;
- deep links;
- команды;
- callback-кнопки;
- отзывы.

### Deep links

Для записи с сайта:

```text
t.me/<bot>?start=b_<manageToken>
```

Для привязки барбера:

```text
t.me/<bot>?start=barber_<oneTimeCode>
```

---

## 12. Фоновые задачи

Не используется долгоживущий worker.

Вместо этого Supabase Cron регулярно вызывает Edge Function.

Например:

```text
каждые 5 минут
```

Edge Function ищет:

### Напоминание за день

```text
status = confirmed
starts_at скоро наступит в окне около 24 часов
reminder_day_sent_at IS NULL
```

После успешной отправки:

```text
reminder_day_sent_at = now()
```

### Напоминание за 30 минут

```text
status = confirmed
starts_at скоро наступит в окне около 30 минут
reminder_30m_sent_at IS NULL
```

После отправки:

```text
reminder_30m_sent_at = now()
```

### Автозавершение

Если:

```text
status = confirmed
ends_at < now()
```

можно автоматически поставить:

```text
completed
```

и сохранить:

```text
auto_completed_at
```

### Запрос отзыва

Если после конца визита прошёл `review_delay_min` и:

```text
review_requested_at IS NULL
```

бот отправляет запрос отзыва и записывает timestamp.

Все фоновые операции должны быть идемпотентными.

---

## 13. UI

### Сайт

Этапы:

```text
лендинг
→ запись
→ подтверждение
→ управление записью
```

### Форма записи

Шаги:

```text
Услуга
→ Барбер
→ Дата
→ Время
→ Контакты
→ Подтверждение
```

### Mini App

Использует тот же сценарий и тот же API.

### Админка

Разделы:

```text
Сегодня
Записи
Барберы
Услуги
График
Исключения
Отзывы
Аналитика
Настройки
```

---

## 14. Безопасность

Обязательно:

- Zod для входных данных;
- backend не доверяет вычислениям frontend;
- Telegram `initData` проверяется на сервере;
- admin password hash;
- httpOnly cookie;
- rate limit;
- CORS только для разрешённых доменов;
- секреты только на сервере;
- RLS включён на таблицах;
- service role ключ никогда не попадает в frontend;
- exclusion constraint защищает от двойной записи.

---

## 15. Время

В PostgreSQL:

```text
timestamptz / UTC
```

Отображение:

```text
Asia/Tashkent
```

---

## 16. Тестирование

### Unit

Проверить:

- расчёт слотов;
- обед;
- конец рабочего дня;
- исключения;
- разные длительности;
- cutoff отмены;
- аналитику.

### Integration

Проверить:

- создание записи;
- перенос;
- отмену;
- `time_off`;
- race condition.

Обязательный тест:

> два параллельных запроса на один слот дают ровно один `201` и один `409`.

### E2E

Playwright:

- открыть сайт;
- выбрать услугу;
- выбрать барбера;
- выбрать дату и время;
- создать запись;
- проверить подтверждение;
- отменить или перенести.

---

## 17. Деплой

### Vercel

Деплоятся:

- `apps/web`;
- `apps/miniapp`;
- `apps/api`.

Для каждого приложения задаются environment variables.

### Supabase

Остаются:

- PostgreSQL;
- Storage;
- Cron;
- Edge Function.

После деплоя:

- настроить CORS;
- указать production API URL;
- настроить Telegram webhook на production endpoint;
- зарегистрировать production Mini App URL;
- провести полный end-to-end тест.

---

## 18. Принцип архитектуры

Студент должен уметь объяснить систему одной схемой:

```text
Пользователь
    ↓
Сайт / Mini App
    ↓
Fastify API
    ↓
Проверки и бизнес-логика
    ↓
PostgreSQL

PostgreSQL
    ↓
Cron
    ↓
Edge Function
    ↓
Telegram Bot
    ↓
Напоминание пользователю
```
