# Совместная работа ИИ

Эта папка хранит сквозное происхождение идей, аудитов, внешних референсов и отдельных
решений между тремя AI-ролями BodgeGene: **Креативщик → Ревизор → Кодер**.

Она отслеживается Git, но **не является вторым backlog или активным tracker**.
Канонические назначения остаются прежними:

- текущая работа — `CURRENT_TASK.md`;
- подтверждённые дефекты — `BUGS.md`;
- улучшения и техдолг — `docs/BACKLOG.md`;
- действующие решения — `DECISIONS.md`.

Из-за пробелов и кириллицы путь в shell-командах всегда заключается в кавычки.

## Структура

- `Идеи/` — отдельные предложения Креативщика или владельца;
- `Аудиты/` — отдельные доказательные проверки Ревизора;
- `Референсы/` — immutable Markdown metadata-wrappers внешних материалов;
- `Решения/` — отдельные content-pinned решения ведущего Ревизора.

Один материал — один файл и один автор. Несколько агентов не дописывают общий журнал.
После author handoff весь IDEA/AUD/REF source навсегда immutable. Ни автор, ни Ревизор
не дописывает disposition, backlink, status или уточнение. Исправление source создаётся
новым файлом с новым ID и `supersedes source path + full SHA-256`; старый файл остаётся
byte-identical. Решение всегда создаётся отдельным DISP-файлом и направленно ссылается
на source.

## Обязательная шапка source

Каждый IDEA/AUD/REF содержит:

- стабильный ID (`IDEA-YYYY-MM-DD-NNN`, `AUD-YYYY-MM-DD-NNN` или
  `REF-YYYY-MM-DD-NNN`);
- пометку `NON-CANONICAL INPUT` либо `NON-CANONICAL REFERENCE`;
- автора и роль;
- дату и локальный часовой пояс;
- дату/timezone author handoff;
- branch/base SHA, а для candidate review — manifest/digest;
- `supersedes source path + full SHA-256` либо дважды `NONE`;
- отдельно: доказанные факты, выводы и непроверенные гипотезы;
- рекомендуемое каноническое назначение.

Входящая запись не получает приоритет, исполнителя, sprint или статус реализации. Эти
поля появляются только после канонического переноса.

### REF wrapper и payload

REF-source — Markdown metadata-wrapper, не внешний payload. Помимо общей шапки wrapper
обязан хранить REF ID, source URL/path, snapshot date, applicability/staleness, payload
mode и полный payload SHA-256. SHA-256 самого wrapper фиксируется внешним handoff
отдельно; payload SHA не является wrapper SHA.

Допустимы только два payload mode:

- `SIDECAR`: неизменённый локальный payload лежит по отдельному exact path. Если его
  содержимое реально используется, `CURRENT_TASK.md` пинит wrapper path+full wrapper
  SHA-256 и payload path+full payload SHA-256; Кодер проверяет оба.
- `POINTER_ONLY`: wrapper хранит внешний URL/path и заявленный full payload SHA-256.
  Пока байты недоступны для проверки checksum, содержимое помечается `UNVERIFIED`; это
  не frozen copy и не доказанный факт.

Большие/бинарные payload не коммитятся и остаются `POINTER_ONLY`; hidden cache и третий
mode запрещены. Wrapper, локальный sidecar и predecessor после handoff immutable.
Поздняя проверка или уточнение создаёт новый successor REF-wrapper.

## Отдельное решение

`PENDING` означает отсутствие decision-файла. Только ведущий Ревизор создаёт
`Решения/DISP-<SOURCE-ID>-NNN...md` со следующими полями:

- decision ID, Reviewer/instance, дата и timezone;
- decision class (`INPUT_TRIAGE` либо `PACKAGE_REVIEW`) и disposition;
- source ID, exact path и full SHA-256;
- supersedes decision ID/path/full SHA-256 либо трижды `NONE`;
- reason и canonical target со stable locator либо `NONE`.

SHA текущего decision не записывается внутрь него: после freeze его фиксирует handoff
или `CURRENT_TASK.md`. Первый DISP получает NNN `001` и три predecessor-поля `NONE`.
Successor сохраняет тот же source pin, получает `max(existing NNN for source)+1` и
пинит непосредственного predecessor по ID, path и full SHA-256. Collision имени требует
STOP и повторного чтения цепочки. Два successors одного predecessor — fork: STOP и
решение ведущего Ревизора; выбирать «последний по дате» запрещено. Ни source, ни
predecessor не изменяется и не получает backlink.

## Disposition и канонический перенос

- `INPUT_TRIAGE`: `ACCEPT FOR TRIAGE`, `CLARIFY`, `PARK`, `REJECT`. `ACCEPT FOR TRIAGE`
  создаётся только после переноса содержания ровно в один первичный tracker: дефект —
  `BUGS.md`, улучшение/долг — `docs/BACKLOG.md`. `PARK` требует stable BACKLOG locator.
  Остальные dispositions не авторизуют Кодера.
- `PACKAGE_REVIEW`: `ACCEPT`, `CORRECTION`, `REJECT`, `STOP`. `CORRECTION` поддерживает
  ровно один correction manifest; `ACCEPT` закрывает пакет; `REJECT` и `STOP` запрещают
  дальнейшие изменения candidate.

До successor решения, уже выбранного активным task, Ревизор переводит task в STOP и
получает frozen handoff Кодера. Продолжение оформляется новым `CURRENT_TASK.md`, который
явно пинит выбранную ветвь.

## Поток

1. Креативщик или Ревизор создаёт отдельный файл по шаблону и замораживает его.
2. Ревизор проверяет факты против живого кода, тестов, спецификаций и инвариантов.
3. Для input triage Ревизор переносит принятое содержание в один primary tracker и
   создаёт новый DISP; source не меняется. `DECISIONS.md` дополняется лишь при изменении
   durable contract.
4. Реализация разрешена только когда Ревизор выпустил `CURRENT_TASK.md` с base, IN/OUT,
   manifest, gates и полной принятой тройкой для каждого IDEA/AUD: source path+full
   SHA-256, matching DISP path+full SHA-256, canonical target+stable locator.
5. REF выбирается wrapper path+full wrapper SHA-256 только как context и не расширяет
   scope. При использовании `SIDECAR` дополнительно обязательны payload path+full
   payload SHA-256. Кодер не сканирует папку, не выбирает `latest` и не следует
   непинованному sidecar/pointer.
6. Кодер проверяет требуемые hashes, совпадение DISP source pin и допустимость
   class/disposition. Mismatch означает STOP. Только `CURRENT_TASK.md`, не source, DISP
   или REF, разрешает запись.

## Иерархия доверия

Источник истины по поведению: живой код → тесты → нормативная спецификация → текущие
канонические документы. Аудиты, идеи и обзор Claude — evidence и контекст, но не могут
переопределить живой контракт без решения Ревизора и канонического переноса.

Внешний материал не смешивается с REF-wrapper. Локальный неизменённый payload хранится
как отдельно pinned `SIDECAR`; внешний pointer остаётся `POINTER_ONLY/UNVERIFIED`, пока
его bytes и payload checksum недоступны для проверки.

## Безопасность совместной записи

- Креативщик пишет только новый файл в `Идеи/`.
- Кодер не пишет в эту папку, кроме отдельно разрешённого frozen handoff-файла.
- Ревизор пишет новые audits и DISP, а также канонический перенос, но не изменяет frozen
  source/predecessor и не пишет product code.
- Независимые Ревизоры не читают выводы друг друга до собственного freeze.
- Не хранить здесь generated logs, зависимости, секреты, персональные данные или большие
  бинарные payload; для них используется `POINTER_ONLY` с locator и checksum, без
  скрытого cache.
