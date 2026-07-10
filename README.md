# MiniCRM — Legal CRM Prototype

Рабочий прототип мини-CRM для юридической команды.

## Live demo

- Web App: https://script.google.com/macros/s/AKfycbwUqw1prf0ZuZY_IIe9JlHfudo_s9Y6qjgBvzGayZfD4Mz1Nl81G_DQUAQTL8Ilojv1Ug/exec
- Google Sheets DB: https://docs.google.com/spreadsheets/d/169tUJfh8pSz6nzTpUgRl44ghFfYY-J19TAcML7pt2JA/edit?gid=1003#gid=1003

## Что реализовано

- добавление клиента через Web App;
- хранение данных в Google Sheets;
- поля клиента: имя, основной телефон, второй телефон, Telegram, email, удобный способ связи, юридический статус, комментарий;
- юридические статусы под работу юриста;
- счетчики клиентов по каждому статусу;
- список клиентов в интерфейсе;
- изменение статуса и комментария;
- автообновление данных из таблицы;
- лист Settings для настроек;
- лист Logs для логирования;
- email-уведомление юристу при добавлении клиента.

## Стек

- Google Sheets — база данных;
- Google Apps Script — backend, Web App и интеграция с таблицей;
- HTML / CSS / JavaScript — интерфейс;
- MailApp — email-уведомления.

## Почему выбран этот стек

Для MVP за ограниченное время важнее быстро собрать рабочий прототип без сервера, отдельного хостинга и сложной инфраструктуры. Google Sheets удобен как прозрачная база данных, которую легко проверить вручную. Google Apps Script позволяет быстро сделать Web App, backend-логику и email-уведомления.

## Структура репозитория

```text
.
├── README.md
├── Code.gs
├── Index.html
├── appsscript.json
└── docs/
    └── TEST_LOG.md
```

## Установка

1. Открыть Google Sheets-файл.
2. Перейти в `Extensions → Apps Script`.
3. Вставить содержимое `Code.gs` в файл `Code.gs`.
4. Создать HTML-файл `Index` и вставить содержимое `Index.html`.
5. Запустить `setupPrototypeSheets`.
6. Запустить `debugBootstrapData` и проверить:
   - `parsedClientsCount > 0`;
   - `statusesCount = 13`;
   - `contactMethodsCount = 4`.
7. Сделать деплой: `Deploy → Manage deployments → New version → Deploy`.

## Что делал сам / что сделал AI

Я сам определил сценарий CRM, структуру данных, набор юридических статусов, UX-логику и стек. AI использовал как помощника для ускорения разработки: генерация чернового кода, отладка Google Apps Script, проверка UX, обработка ошибок и подготовка README.

## Важное техническое исправление

В коде есть нормализация значений из Google Sheets перед отправкой во frontend. Это нужно, чтобы Web App корректно получал данные из таблицы, включая даты, которые Google Sheets может возвращать как `Date`-объекты.
