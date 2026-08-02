# CURRENT_TASK — SEARCH-GAPPED-DNA

**Статус:** ✅ COMPLETE — U7 PASS / local production acceptance
**Закрыто:** 02.08.2026
**Нормативный контракт:** [SPEC_GAPPED_DNA_SEARCH.md](docs/specs/SPEC_GAPPED_DNA_SEARCH.md)
**Checkpoint:** ожидает отдельного разрешения пользователя на stage/commit.

## Результат

Глобальный поиск и Ctrl+F используют общий DNA worker/core по обеим цепям и кольцевым
молекулам, но входные минимумы различаются: Ctrl+F требует 8 нт, bare DNA в глобальной
строке использует настраиваемый порог автоопределения (по умолчанию 8), а явный `seq:`
этот порог намеренно обходит. Exact не имеет верхнего предела; approximate выполняется
для допустимого DNA-запроса длиной до 100 нт. Выдача ранжируется по биологическому
качеству, ведёт к каноническому локусу, а Back восстанавливает поисковую сессию.

## Действующий продуктовый контракт

- DNA query после trim и uppercase принимает только `A/C/G/T`.
- `U`, IUPAC-коды, внутренние пробелы и иные символы дают `invalid-dna`;
  молчаливого исправления запроса нет.
- Неоднозначная буква в target считается mismatch, а не wildcard.
- Identity: `M / (M + X + I + D)`, сравнение выполняется в basis points.
- Весь query участвует в query-global / target-local выравнивании; partial seed не является hit.
- Exact-фаза выполняется первой по всему допустимому корпусу.
- Если exact найден хотя бы в одной молекуле, approximate-строки не подмешиваются.
- Exact не имеет верхнего предела длины.
- Bare DNA распознаётся от `minQueryLen` (4–30, default 8); явный `seq:` принимает
  любой непустой A/C/G/T query; Ctrl+F отдельно требует минимум 8 нт.
- Approximate запускается для принятого DNA query длиной до 100 нт.
- При threshold <100% запрос `>100` без exact возвращает `REQUIRES_ALIGNMENT`;
  threshold 100% является exact-only и после exact-промаха честно возвращает ноль.
- Production route: `EXACT_FIRST`.
- Production approximate kernel: `LINEAR`.
- Клиентский timeout остаётся 15 секунд.
- Поддерживаются `+`, `−`, палиндромная `both` и origin-wrap кольцевой молекулы.
- Канонический best выбирается общим occurrence-порядком с физическим endpoint кольца.
- Результат sequence-провайдера — строгий envelope
  `{occurrences, locationCount, bestIndex}`.
- `locationCount` измеряется до транспортного cap; best сохраняется при обоих cap.
- Ошибка, malformed payload, timeout и resource limit дают incomplete, не honest-empty.
- Неполная строка не выбирается как подтверждённый результат.

## Исполнение и отмена

- Тяжёлая работа выполняется в worker, не в UI-потоке.
- Одновременно активна не более чем одна тяжёлая job.
- Обычная отмена кооперативна: `cancel → unwind → ACK`.
- При обычной отмене worker остаётся жив; `terminate()` — аварийный/dispose путь.
- Следующая job отправляется только после ACK или terminal предыдущей.
- Scan, verifier, traceback, materialisation и сортировка имеют ограниченные участки
  работы между точками приостановки.
- Поздние terminal-ответы не меняют UI.

## UI-контракт

- Одна молекула занимает одну строку; подтверждённые строки идут первыми.
- Далее строки сортируются по identity, каноническому best и стабильному entity key.
- Строка показывает identity, `M/L`, `X/I/D`, gap events, цепь,
  half-open координаты и точное число локусов.
- Wrap показывается двумя сегментами; `both` сохраняет обе цепи.
- Ответный occurrence payload и DOM не содержат edit script, `editRuns`, mismatch positions
  или bases target; сам target закономерно передаётся в worker во входном документе.
- Click и Enter открывают occurrence, по которому строка ранжирована.
- Глобальный jump не уничтожает независимую Ctrl+F-подсветку.
- Back восстанавливает query, mode, chips, строки, active row и scroll.
- При неизменившемся корпусе Back переиспользует результат без новой worker-job;
  при изменившемся выполняется ровно один новый поиск.
- Dirty guard не создаёт return frame при отменённом переходе.
- Во время поиска показывается индикатор активности без выдуманного процента;
  `prefers-reduced-motion` отключает движение.
- Pending/incomplete строки не открываются мышью или Enter.

## Финальная проверка U7

### Доказано тестами

- Frontend: **804/804 файлов**, **8182 теста** —
  **8162 passed, 20 skipped, 0 failed**.
- Backend: **127 passed**.
- Ranking-контракт отдельно доказывает 95% выше 85% независимо от имени
  и corpus-wide исключение approximate-строк при найденном exact.
- Mutation/temp/backup residues: 0; `git diff --check` чист.
- После разделения K2-теста новых hard-size нарушителей нет.
- Новые и изменённые файлы не добавляют lint errors;
  полный проектный lint сохраняет предсуществующий долг.

Первый corrective full-run дал четыре нагрузочных падения в трёх файлах.
Все три прошли изолированно (27/27), а разрешённый повтор полного прогона прошёл
804/804. Инфраструктурная нестабильность учитывается как BG-022.

### Доказано build

- Production build: **успешен, 579 modules**.

### Проверено в браузере

- Shipping build без benchmark override: **32/32 сценария**.
- Проверены approximate ranking, exact-only, activity indicator, hover/focus,
  Enter/click, plus/minus/wrap jump и Back.
- Worker payload и DOM не содержат alignment internals.
- Отмена: `job → cancel → ACK` за 6 мс, новых worker — 0, `terminate()` — 0.
- Console errors: 0; HTTP errors: 0; long tasks >50 мс: 0.

### Граница доказательства

- Pending и incomplete mouse/Enter no-op покрыты интеграционными тестами.
- В живом браузере эти два состояния не наблюдались: поиск завершался раньше рендера.
- Живой `REQUIRES_ALIGNMENT` проверен, но не считается их проверкой.
- Weak-PC benchmark и точный current-build worker-memory peak отложены в
  [BACKLOG.md](docs/BACKLOG.md) и не входят в local production acceptance.
- Fork-crash без assertion failure остаётся инфраструктурным BG-022.

## Состояние этапов и STOP

- U0–U5: ✅ PASS.
- U6: ✅ PASS — local production acceptance.
- U7: ✅ PASS.
- `EXACT_FIRST`, `LINEAR`, upper approximate limit 100 нт и timeout 15 с — финальные defaults;
  различие входных минимумов поверхностей зафиксировано выше.
- `SHARED_SCANNER` и approximate 200/400 нт не включены.
- Индекс и новые поисковые функции не начинались.
- После разрешённого checkpoint история промежуточных RED/GREEN, мутаций и бенчей
  останется в Git; до него рабочее дерево не является сохранённой историей.
- Незавершённые улучшения находятся только в `docs/BACKLOG.md`;
  открытые дефекты — только в `BUGS.md`.
- Следующая продуктовая работа требует нового отдельного scope.
- Stage/commit — только после прямого разрешения пользователя.
