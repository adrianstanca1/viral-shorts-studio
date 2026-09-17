# Hermes Creator OS

This directory defines the production-safe orchestration policy for Viral Shorts Studio.

## Roles
- Orchestrator: plans, delegates, verifies and records work.
- Builder: code, tests, Docker builds, Git commits and PRs.
- Research: search, fetch and source verification.
- Media: scripts, storyboard, image/video/voice/whiteboard generation and composition.
- Deployment: restricted to the `viral-shorts` stack.
- Recovery: retries, provider failover and target service restart.
- Security: policy checks, audit, secret redaction and checkpoints.

## Routing policy
Local first, then verified-free cloud, then included subscription capacity, then paid resources only with explicit approval. Paid fallback is disabled by default.

## Approval gates
External publishing, spending money, persistent deletion, security/access changes and destructive infrastructure actions require explicit human approval.

## Validation
Run:

```bash
node hermes/validate.mjs
node hermes/policy-test.mjs
```

GitHub Actions also enforces both checks when Hermes policy files change.
