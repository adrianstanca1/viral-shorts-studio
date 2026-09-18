# V41 Development Plan

## V41.1 Live generation feedback
- [x] Map UI progress to the real pipeline stages: queued, researching, storyboarding, generating scenes, assembling, complete/failed.
- [x] Show a live progress panel with stage label, explanation and percentage.
- [x] Poll only the selected project while generation is active.
- [x] Stop polling automatically when the project completes or fails.

## V41.2 Contextual next action
- [x] Derive one primary project action from actual project state.
- [x] Surface Retry for recoverable failures.
- [x] Surface Review when generation finishes but QA needs attention.
- [x] Surface Approve only after launch readiness passes.
- [x] Surface Publishing only after owner approval.

## V41.3 Mobile workflow
- [x] Add a sticky contextual action bar above the existing bottom navigation.
- [x] Reuse existing workspaces and tools instead of adding another navigation layer.
- [x] Automatically open the project detail view after generation starts.

## V41.4 Safety and performance
- [x] Use existing project APIs; no new privileged backend endpoint.
- [x] Use fresh reads only for the active project.
- [x] Keep external publishing approval-gated.
- [x] Keep paid fallback behavior unchanged.
