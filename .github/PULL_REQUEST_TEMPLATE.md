## Summary
<!-- What changes and why, in 2–4 lines. -->

Closes #

## Changes
<!-- Bullet list of the main changes (modules touched). -->
-

## Test plan (executed)
<!-- Commands run and results. Not "tests pass" — paste the evidence. -->
- [ ] `pnpm check` →
- [ ] `pnpm test` →
- [ ] Issue-specific tests (list) →
- [ ] E2E / manual steps →

## Screenshots / GIF
<!-- Required for UI or rendering changes. -->

## Performance impact
<!-- If it touches rendering: renderer.info (calls / triangles / programs / geometries / textures) before → after, and FPS notes. Otherwise "n/a". -->

## Risks / follow-ups
<!-- Known limitations, follow-up issues created (#n). -->

## Definition of Done
- [ ] Acceptance criteria of the issue verified (checked in the issue)
- [ ] Tests written and passing; `core` coverage not below threshold
- [ ] No new debt without an issue; no TODO without issue link
- [ ] No `core` → react/three/DOM imports; module boundaries respected
- [ ] No `setState` / allocations in hot paths; `invalidate()` where needed
- [ ] New dependencies justified (size, maintenance, license, alternative)
- [ ] Docs / ADR updated if a decision changed
- [ ] Codex review requested (`@codex review`); P0/P1 findings resolved or escalated
- [ ] PR title is a Conventional Commit; size ≤ 400 net lines
