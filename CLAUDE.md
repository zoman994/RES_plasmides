@AGENTS.md
@CURRENT_TASK.md
@PROJECT_STATE.md

# Claude Code compatibility

Импортированные файлы — канонические инструкции и единственный текущий tracker.
Project skills находятся только в `.agents/skills/<name>/SKILL.md`: если `AGENTS.md`
или принятый пакет называет skill, прочитайте этот файл полностью. Не используйте
устаревшие копии skills из старых worktree.

Auto-memory отключена и не заменяет `CURRENT_TASK.md`. Project agent profile задаёт
одну из трёх ролей — Ревизор, Креативщик или Кодер, — но не даёт scope сам по себе.
Кодер пишет только после получения от Ревизора base SHA, writer mode, точного manifest,
OUT и назначения ответственного за интеграцию.

До первой правки Кодер выполняет `git rev-parse HEAD`, `git status --short` и
`git worktree list`: HEAD обязан совпасть с base SHA, а dirty-state — с объявленным
allowlist. Обычный запуск: `claude --agent reviewer`, `claude --agent creative` и
`claude --agent coder`. Второй экземпляр Кодера запускается только отдельным процессом:
`claude --worktree <unique-name> --agent coder`. Независимая read-only линза той же роли
Ревизор запускается владельцем или внешним orchestrator через
`claude --agent reviewer-readonly`; это не четвёртая роль.

`Совместная работа ИИ/` хранит immutable non-canonical IDEA/AUD/REF sources и отдельные
frozen DISP-решения. Не читать папку целиком и не выбирать `latest`. IDEA/AUD Кодер
открывает только по полной принятой тройке из `CURRENT_TASK.md`: source path+full
SHA-256, matching DISP path+full SHA-256 и canonical target+stable locator. Кодер
проверяет оба хэша, source pin и допустимость class/disposition.

REF — immutable Markdown metadata-wrapper, не внешний payload. Wrapper содержит REF ID,
`NON-CANONICAL REFERENCE`, source URL/path, snapshot date, applicability/staleness,
payload mode и полный payload SHA-256; собственный wrapper SHA-256 пинится внешне и не
подменяется payload hash. Допустимы только `SIDECAR` и `POINTER_ONLY`. Если Кодер
использует локальный `SIDECAR`, `CURRENT_TASK.md` обязан назвать и wrapper path+SHA, и
отдельный payload path+SHA; проверяются оба. `POINTER_ONLY` остаётся `UNVERIFIED`, пока
байты недоступны для проверки checksum, и не считается frozen copy или доказанным
фактом. Большой/бинарный payload не коммитится; hidden cache и третий mode запрещены.
Wrapper, sidecar и predecessor после handoff immutable. REF остаётся context-only;
непинованный sidecar/pointer не открывается. Несовпадение означает `STOP`; разрешение на
запись даёт только `CURRENT_TASK.md`, не shared input, DISP или REF.
