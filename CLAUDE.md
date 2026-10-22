# Контекст проекта mycompany (lsFusion)

МК — сокращённое название проекта mycompany.

## Репозитории

- Основной репозиторий доработок: `rokotoff/mycompany` (fork `lsfusion-solutions/mycompany`).
- Остальные участники работают в своих fork от `rokotoff/mycompany` и присылают изменения через pull request.

## Чьи папки (`src/main/lsfusion`)

- `extra` — доработки владельца репозитория (rokotoff). Верхний модуль — `MyCompanyExtra`.
- `alfaExtra` — доработки второго разработчика. Верхний модуль — `AlfaExtra`, он подключает `MyCompanyExtra`.
- `custom` — ведёт другая команда, не изменять.
- Остальные папки — код upstream (`lsfusion-solutions/mycompany`), не изменять.

Работай только в своей папке. Чужие модули можно читать и использовать через `REQUIRE`, но не изменять.
Новый модуль подключай в `REQUIRE` верхнего модуля своей папки.

## Правила

- Перед работой с lsFusion используй `lsfusion_get_guidance`.
- Локальные настройки сервера — `conf/settings.properties`, он не хранится в git. Шаблон — `conf/settings.properties.example`.
- Личные настройки участника — в `CLAUDE.local.md` (не хранится в git).
