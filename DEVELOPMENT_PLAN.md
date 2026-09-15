# Viral Shorts Studio Development Plan

## Product Goal
Ship a launch-ready Creator OS that can safely move from idea to research, production, QA, approval and publishing while defaulting to local/verified-free resources and never using paid fallbacks without explicit approval.

## Phase 1 — Correctness and Production Safety
- [x] Fix renderer aspect support for 9:16, 16:9 and 1:1 end-to-end.
- [x] Make final media QA aspect-aware instead of vertical-only.
- [ ] Keep captions/overlays inside aspect-safe zones.
- [x] Preserve approval gates, free-only routing, recovery and scene reuse.
- [x] Add regression tests for aspect/dimension selection.

## Phase 2 — Creator Agent Orchestration
- [x] Persistent creator runs and tool plans.
- [x] Research, product, website and image steps.
- [x] Real video jobs launched from Creator Agent.
- [x] Advance creator runs automatically from render -> QA -> approval-pending.
- [ ] Add resumable workflow checkpoints and idempotency.
- [ ] Surface failed workflow steps and targeted retry.

## Phase 3 — Real Asset Generation
- [x] Make Image Maker provider jobs first-class assets rather than pseudo-projects.
- [x] Persist provider result files/URLs into creator-assets records.
- [ ] Add verified-free image and video provider capability registry.
- [ ] Add local/verified-free model recommendations discovered through Hugging Face.
- [ ] Add safe provider smoke tests before enabling a route.

## Phase 4 — Product and Website Exports
- [x] Generate downloadable HTML/CSS website bundles and previews.
- [x] Generate ebook/planner HTML/PDF and spreadsheet CSV/XLSX exports locally.
- [x] Add versioning and export history.
- [x] Connect Brand Brain styles to generated exports.

## Phase 5 — Analytics and Learning
- [ ] Add production analytics from projects, QA and publishing outcomes.
- [ ] Feed successful patterns into Brand Brain without overwriting user-defined identity.
- [ ] Add title/thumbnail experiment tracking.
- [ ] Add YouTube analytics only after scopes and connector are explicitly configured.

## Phase 6 — Performance and Launch Hardening
- [ ] Benchmark short, 5 min and 20 min projects without blocking live work.
- [ ] Add chapter-level checkpoints for long-form projects.
- [ ] Profile FFmpeg/CPU/memory bottlenecks and tune concurrency.
- [ ] Verify exact GitHub CI status for release commits.
- [ ] Run public-domain, auth, recovery, approval and publish-gate smoke tests.

## Development Rules
1. Inspect Git status/worktrees/stashes before every change.
2. Preserve unrelated services, shared Ollama, runtime secrets and production data.
3. Use focused commits by subsystem and run `npm run release:check` before push.
4. Pull/rebase before push, then deploy only `viral-shorts`.
5. Verify internal health, Docker healthy state and Git 0/0 divergence after deploy.
6. Never claim provider availability until smoke-tested and verified free.
