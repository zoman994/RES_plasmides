---
name: sprint-report
description: Produce the compact evidence handoff from a BodgeGene Coder to the Reviewer. Use at candidate completion or after a correction package; do not turn CURRENT_TASK.md into a session journal.
---

# Candidate handoff

Send the report as a message. Do not append it to `CURRENT_TASK.md` unless that document is explicitly in the accepted file surface.

## Required structure

```markdown
## Outcome
<what now works, in product language>

## Role and mode
<Coder assignment and writer mode; proposal/component/proof/integrated candidate;
integration-responsible Coder>

## Base and manifest
<accepted base SHA; exact changed manifest; preserved dirty exclusions;
recomputable digest of changed content or candidate patch; for an integrated candidate,
the Reviewer-issued integration manifest, ownership map and digests of every accepted
frozen input>

## Contract
<important invariants and ownership decisions>

## Evidence
- RED: <test and exact pre-fix failure, or justified exception>
- Focused: <files/tests/result>
- Related: <files/tests/result>
- Final gate: <Reviewer gate pending — normal at Coder handoff; result only if Reviewer
  explicitly delegated that one run>
- Mutation: <guard → named RED, only when used>
- Build/lint/diff: <result>
- Browser/benchmark: <result or not run>
- Instrument control: <metric/counter/digest → negative control → observed change, or unverified>
- Flake evidence: <first failure → isolated run → single retry, or none>
- Information delta: <why each repeated run could change the next action, or none>

## Files and size
<new/changed files, bytes, new soft/hard entrants>

## Deviations and adjacent findings
<explicit list, or none; findings are not silently fixed>

## Not verified
<everything the evidence does not prove>

STOP. Nothing staged or committed unless separately authorized.
```

## Truth rules

- Separate proof by tests, build, browser, benchmark, and inference.
- Never claim a full gate from a focused run or omit the number of collected files.
- Never claim a benchmark, telemetry, counter, RSS, cancellation, or digest value unless
  its instrument changed under a named negative/control case; otherwise label it
  unverified or inference.
- Name timeout/pool flakiness and the isolated repeat result.
- If a new test was green before implementation, say so and explain how its non-decorative value was established.
- A repeated run on an unchanged candidate is not new evidence unless it is the single
  controlled flake retry. Name the diagnostic question for every other repeat.
- Report a correction as a delta from the integration-responsible Coder: what changed since the
  previous handoff and which prior claims are superseded. Do not resend the entire history.
- List only relevant pre-existing warnings and distinguish them from new ones.
- Do not propose or start the next package; the Reviewer owns triage, prioritization and canonical tracker updates.

## Git boundary

The report is not permission to stage, commit, push, or restore files. Those actions require a separate explicit instruction and an exact manifest.
