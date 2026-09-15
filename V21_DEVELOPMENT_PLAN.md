# Creator OS V21 Development Plan

## V21.1 Incident triage
- [x] Count only time-bounded execution failures as recent incidents.
- [x] Add incident severity, reasons and recent failure detail without exposing request bodies or secrets.
- [x] Escalate health to critical for stale production/runs or repeated recent failures.

## V21.2 Guarded maintenance preview
- [x] Add an owner-only dry-run preview for maintenance.
- [x] Limit maintenance mutations to the exact stale backlog candidates surfaced by preview.
- [x] Preserve no-auto-recovery and no-auto-publish guarantees.

## V21.3 Command-center UX
- [x] Preview the exact maintenance scope before confirmation.
- [x] Surface health reasons and recent failure counts in the command center.

## V21.4 Release assurance
- [x] Extend self-tests for time-windowed failures and preview safety.
- [x] Run release checks, commit, push, deploy only viral-shorts and verify health/CI.
