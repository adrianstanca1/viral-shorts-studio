# Creator OS V6 Development Plan

## V6.1 Agent Marketplace
- [x] Built-in installable agent catalogue using only guarded Creator OS tools.
- [x] Agent-specific planning and execution without arbitrary remote code execution.
- [x] Owner enable/disable control and free-only declarations.

## V6.2 API / MCP Ecosystem
- [x] Keep scoped API keys, MCP tools and plugin registry as first-class ecosystem surfaces.
- [x] Expose capability metadata for external clients without secrets.
- [x] Preserve owner approval for publishing and paid usage.

## V6.3 Observability
- [x] Request success/error/latency telemetry without request-body logging.
- [x] P50/P95 latency and observed availability snapshot.
- [x] Surface health, queue, recovery and provider state in one operations endpoint.

## V6.4 Release Assurance
- [x] Add V6 marketplace/observability checks to the competitive release gate.
- [x] Keep all V1-V6 plan files at zero unchecked items before final release.
- [x] Production deploy, public smoke test and exact GitHub Actions verification.
