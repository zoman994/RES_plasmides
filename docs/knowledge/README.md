# docs/knowledge — curated decision & conversation distillates

Hand-written, version-controlled knowledge that seeds the graphify knowledge graph
(`.graphify/`, gitignored). These capture *how the work should be done* and *how key
features should really work* — the "why" behind the code, distilled from Igor ↔ Claude
conversations. Unlike the auto-derived graph, these are canonical and travel with the repo.

| File | What it holds |
|------|---------------|
| `working-agreements.md` | Process/communication rules (Russian responses, TDD-first, self-verify, reuse, real-case iteration, ultracode orchestration). |
| `intended-behavior-library-annotator.md` | How the Library/Annotator/inspector must behave: dual-host persistence model, annotation + sequence-edit persistence, annotator selection/delete; deferred items with rationale. |
| `decision-history.md` | Distilled major decision threads (architecture epoch, canvas/assembly model, bio-invariants, T-series, tooling audits). |
| `IDEA-features-as-objects-and-autolab.md` | Idea/design-exploration (verbatim Igor quotes): фичи как объекты (ООП-слой над нуклеотидами), система классов деталей с жёсткими правилами, замена детали в 2 клика, режим «Автолаборатория» (комбинаторная генерация → протокол → робот). Не реализовано — захват контекста. |

**Rebuilding the graph:** these are the semantic seed for `/graphify`. When rebuilding,
include `docs/knowledge/*.md` in the curated document scope so the decisions stay wired to
the code. The full code graph is AST-derived; this folder is the decisions layer.
