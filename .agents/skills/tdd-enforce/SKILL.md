---
name: tdd-enforce
description: Apply proportionate test-first proof to BodgeGene behavior changes. Use for product code, tests, reducers, hooks, parsers, workers, and algorithms; scale RED, related tests, mutation checks, and full gates to the risk of the package.
---

# Proportionate TDD for BodgeGene

## Before editing

1. Record the accepted base commit and the pre-existing dirty-file allowlist.
2. Record the writer mode, each owned manifest, and the integration-responsible Coder.
3. State the observable contract and the cheapest layer that can prove it.
4. For cross-layer defects, make the RED use the real production-shaped path. A synthetic helper fixture is not enough when the bug is in transport, state, or wiring.
5. When a mock is necessary, stub the function production actually calls and assert that
   the stub was invoked. Keep deliberately malformed boundary values raw; do not make
   them valid merely to pass through a newer envelope.

## One package cycle

1. Add the smallest diagnostic test that fails for the intended reason.
2. Run only that test or file. If it is already green, stop: prove that the behavior already exists or strengthen the observable before implementation.
3. Implement the coherent package. Do not interrupt the coder after every file when the accepted contract spans several layers.
4. Run focused tests while iterating, limited to the writer's owned surface.
5. Preliminary proposals/components/proofs do not duplicate the related or full gate.
   The integration-responsible Coder runs the related set once on the assembled candidate, bound to
   the accepted base SHA (`--changed <base-sha>`) or an explicit manifest-derived test
   list. Record collected files/tests. Zero collected tests for a product-code candidate
   is FAIL/unverified; only a predeclared docs/comment/permission-only exception may skip it.
6. Freeze and hand off the candidate. After consolidated review/correction, the
   Reviewer runs the full frontend/backend gate once; Coders and read-only Reviewers
   do not duplicate it.

Never weaken an assertion, wrap malformed data into a valid shape, or update a fixture merely to obtain green. When a contract changes intentionally, name the old assumption and prove the new one.

## Information gain and anti-loop

Tests are evidence, not the deliverable. Before every run, state the diagnostic question
and how PASS and FAIL change the next action. Repeating the same command against unchanged
relevant code, tests, fixtures, instrumentation and environment is not new evidence and
is forbidden, except for the single controlled retry allowed by the flake protocol.

Once a RED localizes the failing contract, change the implementation or report an exact
blocker. Do not substitute a broader suite for diagnosis. A further run is informative
only after a relevant code/test/fixture/mutation change or under a named, falsifiable
environment hypothesis. If two consecutive Reviewer↔Coder cycles contain only reruns or
review with neither such a change nor a new causal diagnosis, stop and replan before a
third cycle.

## Mutation checks

Use targeted mutation only for high-risk guards whose tests could pass for the wrong reason: trust boundaries, cancellation/ACK, stale-drop, topology, canonical ranking, caps, budgets, and destructive state transitions.

- Mutate one guard at a time.
- Require the named test to turn red for that guard.
- Restore by exact inverse patch and verify the file hash or exact diff.
- Do not require mutation theatre for ordinary rendering or mechanical migration.

## Instrument controls

A benchmark, telemetry field, counter, RSS value, cancellation result, or digest becomes
evidence only after the instrument responds to a named negative/control case where it
must fail or produce a different value. Prefer a frozen defect, targeted mutation, known
different input, or intentionally wrong reference implementation. Without that control,
report the number as unverified or inference, not proof.

## Commands

From the repository root, use the project-pinned runner:

```powershell
npm --prefix gui/designer test -- src/path/foo.test.js --maxWorkers=4
npm --prefix gui/designer test -- src/path/foo.test.js -t "case" --maxWorkers=1
npm --prefix gui/designer run test:related -- <accepted-base-sha> --maxWorkers=4
npm --prefix gui/designer test -- --maxWorkers=4
npm --prefix gui/designer run build
npm --prefix gui/designer run lint
py -m pytest
```

Do not use `npx vitest`; it may resolve an incompatible global or downloaded version.

## Baseline and failures

Do not use stash, checkout, reset, or whole-file restore to manufacture a clean baseline. Compare read-only against the accepted commit, or run the existing worktree without changing it.

When a full gate fails, record the exact file, test, failure class and original resource
signals. A present-but-wrong value, coordinate, count, payload, topology, content, or other
invariant mismatch remains a contract failure regardless of isolated green runs.

An assertion-shaped absence (empty/not found/not yet rendered) may enter the resource-
flake path only when the original log also contains an explicit timeout, pool/crash, or
resource signature and the asserted value is absent rather than present-but-wrong. Run
one diagnostic isolated invocation with internal repeat >=3 and verify every repeat plus
the collected count. Only a complete PASS permits one retry of the original gate. Any
isolated failure or recurrence in that single retry is gate FAIL. Preserve the original
failure, diagnostic run and retry in the handoff.

Verify collected files/tests for focused, related and full runs. A partial green run is
not a gate; a zero-file related run for product code is FAIL/unverified.

If the runner dies before naming a file or test, localize once with predetermined suite
partitions. Do not blindly rerun the full suite; without localization the gate remains
failed or explicitly unverified.

## Exceptions

Comment-only, documentation-only, permission-policy, and proven dead-code changes do not need an artificial RED. Validate their syntax, references, scoped lint/diff, and the smallest relevant contract instead.

## Handoff truth

Report separately what was proved by tests, build, browser, benchmark, and inference.
For any repeated run, name the information delta that justified it. State unrun checks
and known decorative tests explicitly. Do not stage or commit unless the user has
separately authorized the exact manifest.
