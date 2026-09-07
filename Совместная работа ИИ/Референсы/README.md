# Референсы

Здесь хранятся immutable Markdown metadata-wrappers, которые Ревизор может назвать в
конкретном `CURRENT_TASK.md`. REF-wrapper не является внешним payload, нормативной
спецификацией или разрешением на код и не читается Кодером автоматически.

## Обязательный REF-wrapper

Каждый wrapper содержит:

- стабильный REF ID и `NON-CANONICAL REFERENCE`;
- автора/источник и дату/timezone author handoff;
- source URL/path и snapshot date;
- applicability/staleness, включая известные stale parts;
- payload mode: только `SIDECAR` либо `POINTER_ONLY`;
- payload locator: exact local path либо external URL/path;
- полный payload SHA-256;
- payload verification: `VERIFIED` с методом/датой либо `UNVERIFIED`;
- `supersedes source path + full SHA-256` либо дважды `NONE`.

SHA-256 самого Markdown wrapper фиксируется внешним handoff как `wrapper path + full
wrapper SHA-256`. Он не записывается внутрь wrapper и никогда не подменяется payload
SHA-256.

## Два payload mode

### SIDECAR

Неизменённый локальный payload хранится отдельно по exact path. Если Кодер реально
использует его содержимое, `CURRENT_TASK.md` обязан пинить обе идентичности:

- wrapper path + full wrapper SHA-256;
- payload path + full payload SHA-256.

Кодер проверяет оба pin до чтения payload. Непинованный sidecar не открывается.

### POINTER_ONLY

Wrapper хранит внешний URL/path и заявленный full payload SHA-256, но не копию payload.
Пока bytes недоступны и checksum нельзя проверить, содержимое явно `UNVERIFIED`: его
нельзя называть frozen copy или использовать как доказанный факт. Поздняя успешная
проверка оформляется новым successor REF-wrapper, а прежний wrapper не меняется.

Большие и бинарные payload не коммитятся: для них используется `POINTER_ONLY`. Hidden
cache и третий payload mode запрещены. Wrapper, локальный sidecar и predecessor после
handoff immutable.

## Выбор в CURRENT_TASK

REF всегда context-only и не расширяет scope. План пинит wrapper, а при фактическом
использовании `SIDECAR` — также payload. Кодер не сканирует папку, не выбирает `latest`
и не следует непинованному sidecar или pointer. Единственный источник writable scope —
`CURRENT_TASK.md`.

## Известные материалы Claude

- Производный пакет SYNC-1 находится локально в
  `.claude/handoff/2026-09-05-sync1/`. Он игнорируется Git и не является копией полного
  аудита; без отдельного REF-wrapper он не выбран как reference.
- Общий замысел сборки находится локально в
  `.claude/handoff/act-2026-09-06/DOC-00A-design.md`; это design reference, а не аудит
  текущего HEAD. Его использование требует wrapper pin и, как локального `SIDECAR`,
  отдельного payload pin.
- Полный аудит Claude от 05.09.2026 (22 read-only читателя, 70 независимых проверок)
  согласно `PROJECT_STATE.md` хранится вне репозитория. Его точный исходный путь пока не
  предоставлен, поэтому проверяемый `SIDECAR` и REF-wrapper здесь ещё не созданы.
- **MIGRATION BLOCKER:** пока payload недоступен и его checksum не проверен,
  `CURRENT_TASK.md` не должен называть «полный аудит Claude» frozen copy или доказанным
  фактом. `POINTER_ONLY` был бы только `UNVERIFIED` context. Известные производные
  документы выбираются отдельно только с собственными wrapper+payload pins.
- Старые `docs/archive/AUDIT_RU.md` в заброшенных worktree относятся к 28.03.2026 и не
  являются заменой обзору 05.09.

После получения payload Ревизор сохраняет его неизменённым `SIDECAR`, проверяет полный
payload SHA-256 и создаёт новый wrapper. Уже замороженный `POINTER_ONLY` wrapper при этом
не редактируется.
