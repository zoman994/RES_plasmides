@AGENTS.md
@CURRENT_TASK.md
@PROJECT_STATE.md

# Claude Code compatibility

Импортированные файлы — канонические инструкции и единственный текущий tracker.
Project skills находятся только в `.agents/skills/<name>/SKILL.md`: если `AGENTS.md`
или принятый пакет называет skill, прочитайте этот файл полностью. Не используйте
устаревшие копии skills из старых worktree.

Auto-memory отключена и не заменяет `CURRENT_TASK.md`. Project agent profile задаёт
роль, но не даёт scope: писать можно только после получения base SHA, режима writer,
точного manifest, OUT и имени Integration owner от Planner.
