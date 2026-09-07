---
name: scope-stop
description: Enforce one accepted BodgeGene package, one Reviewer decision center, at most two isolated Coders, one integration responsibility, canonical trackers, immutable shared inputs, separately pinned Reviewer decisions, and distinct REF wrapper/payload identities.
---

# Scope and ownership stop

## Role boundary

BodgeGene has three AI roles:

- the **Reviewer** triages ideas, writes `CURRENT_TASK.md`, controls scope, reviews and
  accepts or rejects candidates;
- the **Creative** writes only non-canonical idea files under
  `Совместная работа ИИ/Идеи/`;
- the **Coder** writes only the accepted implementation/proof manifest.

The shared folder is provenance, not permission. After author handoff every IDEA, AUD
and REF source is immutable forever. A correction or clarification is a new source file
with a new ID plus `supersedes source path + full SHA-256`; never append a disposition,
backlink or status to the old source.

A Coder may consume an IDEA or AUD only when `CURRENT_TASK.md` names the complete
accepted triple: `source path + full SHA-256`, matching `DISP path + full SHA-256`, and
`canonical target + stable locator`. Verify that the DISP pins the same source and that
its class/disposition permits the named use.

Treat a REF source as an immutable Markdown metadata-wrapper, never as the external
payload itself. Require the wrapper to record its REF ID, `NON-CANONICAL REFERENCE`,
source URL/path, snapshot date, applicability/staleness, payload mode and full payload
SHA-256. Pin the wrapper's own bytes externally as `wrapper path + full wrapper SHA-256`;
never substitute the payload hash for the wrapper hash. Permit only two payload modes:

- `SIDECAR`: keep the unchanged local payload at an exact separate path. If its content
  is used, require `CURRENT_TASK.md` to pin both wrapper path+SHA and payload path+SHA,
  and verify both before use.
- `POINTER_ONLY`: keep only the external locator and declared payload SHA in the wrapper.
  Mark the content `UNVERIFIED` until its bytes are accessible and the checksum is
  verified; do not present it as a frozen copy or evidenced fact.

Keep large/binary payloads out of Git as `POINTER_ONLY`; create no hidden cache or third
payload mode. Keep the wrapper, any local sidecar and predecessor immutable after
handoff. A REF remains context-only and never authorizes scope. Do not scan the shared
folder, follow an unpinned sidecar/pointer or choose a file by date. Any missing or
mismatched pin is STOP. Only `CURRENT_TASK.md` authorizes writes.

## Start contract

Before implementation, the Reviewer names:

- one product goal;
- the accepted base commit;
- the allowed file surface and explicit OUT;
- the writer mode: `solo`, `implementation + independent proof`, `seam split`, or
  `independent alternatives`;
- each Coder's exact manifest and writable worktree;
- which Coder is responsible for integration;
- exact accepted source+DISP+canonical-target triples for IDEA/AUD, if any;
- exact context-only REF wrapper pins and, when `SIDECAR` content is used, its separate
  payload path+SHA pin, if any;
- observable acceptance and gates.

Use `solo` by default. A high-risk package may use at most two instances of the Coder
role:

- `implementation + independent proof`: one owns production, one owns only
  oracle/tests/mutations/benchmark and stays blind to the implementation until freeze;
- `seam split`: a frozen interface, separate worktrees and disjoint manifests;
- `independent alternatives`: competing hypotheses and a selection criterion fixed by
  the Reviewer before code; proposals are never auto-merged.

Two Coders start only from the same clean frozen base or an explicitly reproducible
snapshot. They never share a writable checkout or file. Proof-writer and integration
owner are assignments of the Coder role, not extra roles.

Before the first edit, every Coder runs `git rev-parse HEAD`, `git status --short` and
`git worktree list`; HEAD must equal the accepted base and dirty/untracked paths must
equal the declared allowlist. Launch the normal roles with `claude --agent reviewer`,
`claude --agent creative` and `claude --agent coder`. Launch a second Coder only as a
separate foreground process with `claude --worktree <unique-name> --agent coder`.
The owner or an external orchestrator launches independent Reviewer lenses with
`claude --agent reviewer-readonly`; this is an assignment of the Reviewer role, not a
fourth role. The leading Reviewer does not spawn writers.

## While implementing

- Do not fix a neighbouring defect, rename unrelated code, reformat broadly or clean a
  green test.
- Report a confirmed adjacent defect to the Reviewer for `BUGS.md`; report improvement
  or debt for `docs/BACKLOG.md`.
- Do not turn a shared-folder input into a second tracker, hidden TODO or scope expansion.
- The Reviewer and read-only Reviewer lenses do not edit product files while a Coder owns
  them.
- After first freeze every non-integrating Coder becomes read-only. The integration-
  responsible Coder may write again only after the Reviewer issues a new explicit
  integration manifest containing accepted frozen inputs and named integration files.

## Preserve the worktree

Treat every pre-existing change as user-owned. Record the dirty-file allowlist before
editing.

- Roll back only exact hunks written in the current package.
- Never use whole-file restore, reset, checkout, clean or stash as a convenient rollback.
- If a target contains foreign hunks, stop before broad rewrite and split the edit
  exactly.
- A frozen current package is not a base for an unrelated package. Use an accepted
  checkpoint in a separate worktree.

## Handoff rhythm

Each Coder completes the accepted component/proof, runs focused evidence, freezes it and
sends one compact handoff. The integration-responsible Coder receives the Reviewer-
approved integration manifest, assembles one canonical candidate and runs related
evidence once.

The Reviewer performs one consolidated read-only review and chooses `ACCEPT`,
`CORRECTION`, `REJECT` or `STOP`. At most one correction pass follows. If the same defect
survives correction or a new root cause invalidates the contract, stop and replan; do not
enter a second test-only correction or third review/repair cycle.

Every freeze identifies base SHA, exact manifest, preserved exclusions and a reproducible
digest of content or patch. The integrated handoff maps accepted frozen inputs. A live
changing diff or chat summary is not a handoff.

The Coder does not journal in `CURRENT_TASK.md`, rewrite `PROJECT_STATE.md`, close
`BUGS.md`, decide ideas or add architectural decisions unless those files/actions were
explicitly included. The Reviewer owns canonical tracker sync at acceptance, rejection
or blocker.

## Immutable decision chain

Only the leading Reviewer creates a decision file under `Совместная работа ИИ/Решения/`.
Its ID is `DISP-<SOURCE-ID>-NNN`. `PENDING` means that no decision file exists; it is not
a disposition written into the source.

- `INPUT_TRIAGE` permits `ACCEPT FOR TRIAGE`, `CLARIFY`, `PARK` or `REJECT`. Only
  `ACCEPT FOR TRIAGE`, created after transfer into exactly one primary tracker, can
  support ordinary implementation. `PARK` requires a stable `docs/BACKLOG.md` locator.
- `PACKAGE_REVIEW` permits `ACCEPT`, `CORRECTION`, `REJECT` or `STOP`. `CORRECTION`
  supports exactly one correction manifest; `ACCEPT` closes the package, while
  `REJECT` and `STOP` prohibit further changes to that candidate.

The first decision uses `001` and pins `supersedes decision ID/path/SHA-256` as three
`NONE` values. A successor keeps the same source pin, uses
`max(existing NNN for source)+1`, and pins the immediate predecessor by ID, path and
full SHA-256. Never edit the source or predecessor and never record the current
decision's own SHA inside itself; a handoff or `CURRENT_TASK.md` pins it after freeze.
An occupied filename, two successors of one predecessor, or any chain mismatch is STOP
for the leading Reviewer—not permission to choose the newest date. Before superseding a
decision selected by an active task, put that task in STOP, obtain the Coder handoff and
issue a new task that pins the chosen branch.

## Blocker

Stop only when the accepted contract is impossible, materially ambiguous or contradicted
by a new root cause. Report:

1. exact conflicting facts;
2. smallest reproducer or file/line evidence;
3. safe options and consequences;
4. untouched state of OUT files.

Do not reinterpret the requirement merely to keep moving.

## Acceptance and Git

After acceptance the Reviewer may update canonical documents. Stage, commit and push
still require separate explicit user authorization and an exact manifest.

A file-level pathspec is safe only when the whole file is owned or explicitly included.
If package and foreign hunks share a file, stop before staging unless the user accepts the
whole file; otherwise use and verify an exact hunk-level index patch. Never use broad
`git add .`.

Before a two-Coder dispatch and checkpoint, record `git worktree list` plus path,
branch/HEAD and dirty/untracked state of every package worktree. Prove no accepted file
exists only in a secondary worktree. Never remove a worktree automatically: clean and
integrated still requires permission; dirty or untracked means STOP and report.

The next package starts from an accepted checkpoint SHA, not memory, chat or an
unpromoted shared-folder note.
