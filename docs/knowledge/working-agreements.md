# Working agreements — Igor ↔ Claude Code (BodgeGene)

Standing decisions from our conversations about *how the work should be done*.
These are preferences and process rules, not code — they govern every session.

## Communication
- **Respond in Russian** to the user (Igor). Code, identifiers, test names, commit
  messages stay in their natural language (English/code). Rationale: Igor is a Russian-
  speaking researcher (ФИЦ Биотехнологии РАН); user-facing prose must be Russian.

## Engineering process
- **TDD-first is the prime rule**: write the failing test (red) → write code (green) →
  run the full suite. Never write code without a test first. This is the #1 project rule.
- **Self-verify rigorously**: re-check own work every step; run the FULL Vitest suite +
  `vite build` before declaring done; for UI work, also verify in the browser when the
  change is observable. Correctness over speed. "проверяя себя и перепроверяя."
- **Honest verification reporting**: state plainly what was verified vs deferred. When a
  full manual browser gesture is impractical (empty dev library, fragile canvas
  automation), say so and rely on deterministic tests — do not claim a browser repro
  that wasn't done.
- **Reuse existing components**, do not build parallel bespoke viewers. E.g. extend the
  shared SequenceView / useSequenceSelection rather than forking a custom viewer.
- **No scope creep**: fix the reported bug; flag adjacent issues rather than silently
  expanding. Deliberately-deferred items get a written rationale, not silent omission.

## Real-case iteration loop
- Igor tests the app by hand and reports specific bugs from real workflows (assembly,
  replace fragment, mutagenesis, annotation). After fixing, run "ещё пару итераций" with
  emphasis on **real cases**. Proactively sweep the surface he is actively testing for
  the next batch of gaps instead of waiting for him to hit each one.

## Orchestration (ultracode)
- Ultracode is ON: prefer multi-agent Workflow orchestration for substantive tasks;
  token cost is not a constraint ("лимита токенов нет, делай сколько необходимо и чуть
  чуть больше"). Use read-only Explore agents for audits, adversarially verify findings,
  then apply fixes yourself by TDD.

## Coordination docs (single sources of truth)
- Bugs ONLY in BUGS.md. Tasks ONLY in CURRENT_TASK.md. Sprint decisions in DECISIONS.md;
  fundamental ⚓ in ANCHORS.md; version journal in RELEASES.md; snapshot in PROJECT_STATE.md.
  Never create parallel trackers.
