---
name: scope-stop
description: Enforce one accepted BodgeGene package, one decision center, at most two isolated writers, one integration owner, and one tracker. Use throughout implementation and review to prevent adjacent fixes, unsafe parallel edits or rollback, tracker sprawl, and unauthorized staging or commits.
---

# Scope and ownership stop

## Start contract

Before implementation, name:

- one product goal;
- the accepted base commit;
- the allowed file surface;
- explicit out-of-scope areas;
- the writer mode: `solo`, `implementation + independent proof`, `seam split`, or
  `independent alternatives`;
- each writer's exact manifest and writable worktree;
- one Integration owner.

A package may be a substantial vertical slice across several layers. Prefer that over a chain of tiny handoffs. Do not combine independent product goals merely to make a package larger.

Use `solo` by default. If a high-risk package justifies two writers, default to
`implementation + independent proof`: production and proof remain blind until first
freeze. Use `seam split` only for a genuinely frozen interface. Use `independent
alternatives` only when the contract itself is underdetermined and the Planner records
the competing hypotheses plus the selection criterion before code exists.

Two writers are permitted only from the same clean frozen base or an explicitly prepared
reproducible snapshot. They never share a writable checkout. Their manifests are disjoint
except in `independent alternatives`, where overlap is intentional but proposals are
never auto-merged.

## While implementing

- Do not fix a neighboring defect, rename unrelated code, reformat broadly, or clean a green test.
- Report a confirmed adjacent defect to the Planner for `BUGS.md`.
- Report an unfinished improvement or technical debt to the Planner for `docs/BACKLOG.md`.
- Do not create hidden TODOs, ad-hoc reports, or a second tracker.
- If the Planner delegated the package, the Planner and reviewers remain read-only on the same files until handoff.
- After the first freeze, every non-integrating writer becomes read-only. Only the named
  Integration owner may assemble the canonical candidate or receive a correction, and
  only after the Planner issues an explicit integration manifest containing the accepted
  frozen files plus any named integration-only files. Preliminary manifests never expand
  implicitly.

## Preserve the worktree

Treat every pre-existing change as user-owned. Record the dirty-file allowlist before editing.

- Roll back only with an exact inverse patch for lines written in the current package.
- Never use whole-file restore, reset, checkout, clean, or stash as a convenient rollback.
- If a changed target file already contains foreign work, stop before any broad rewrite and split the edit exactly.

## Handoff rhythm

Each writer completes the accepted proposal/component/proof, runs focused evidence only
for that owned surface, freezes it and sends one compact handoff. The Integration owner
receives the Planner-approved integration manifest, applies only the accepted frozen
inputs, assembles one canonical candidate and runs its related evidence once. The Planner
performs one consolidated review and sends at most one correction package to the
Integration owner.
If the same defect survives correction or a new root cause invalidates the contract, stop
and replan; do not enter a second test-only correction or a third review/repair cycle.

At preliminary handoff the coder freezes the proposal/component/proof and stops. At
candidate handoff the Integration owner freezes the integrated candidate and stops. Each
handoff identifies the base SHA, exact changed manifest, preserved exclusions, and a
recomputable digest of the changed content or patch; the integrated handoff also maps
which frozen inputs were accepted. The coder does not journal in `CURRENT_TASK.md`, rewrite
`PROJECT_STATE.md`, close `BUGS.md`, or add architectural decisions unless those files
were explicitly included in the package. The Planner updates canonical trackers after
acceptance and records confirmed findings at blocker/rejection so they are not lost.

## Blocker

Stop only when the accepted contract is impossible or materially ambiguous. Report:

1. the exact conflicting facts;
2. the smallest reproducer or file/line evidence;
3. safe options and their consequences;
4. the untouched state of out-of-scope files.

Do not silently reinterpret the requirement to keep moving.

## Acceptance and Git

After acceptance, the Planner may update canonical documents. Stage or commit only after
explicit user authorization. A file-level manifest is safe only when the whole file is
owned by the package or explicitly included. If package and foreign hunks share a file,
stop before staging unless the user accepts the whole file; otherwise stage only a
reviewed hunk-level patch and verify the staged diff plus preserved worktree hunks. Never
use broad `git add .`.

Before a two-writer dispatch and again before checkpoint, record `git worktree list`, plus
the path, branch/HEAD and dirty/untracked state of every package worktree. Prove that no
accepted file exists only in a secondary worktree. Never remove a worktree automatically:
remove a clean, integrated worktree only after explicit authorization; a dirty or
untracked one is a STOP/report condition.

The next package starts from the accepted checkpoint SHA, not from memory of the
preceding conversation.
