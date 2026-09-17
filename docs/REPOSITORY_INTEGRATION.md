# Repository Integration Map

This repository is the canonical mainline for the Creator OS / video studio product.

## Integrated sources

- **viral-shorts-studio** — canonical application, provider routing, creator UX, publishing, safety policy and deployment.
- **Facelessvideogen** — reviewed as the older local-first long-form implementation. Its useful concepts already present here include Wikimedia media, Piper/Flite narration, whiteboard rendering, captions, recovery/checkpoints and local-first rendering. The remaining useful resilience concept, a single-instance data-directory lock, is now implemented natively in `app/runtime-lock.mjs`.
- **vps-setup** — the Desktop Commander systemd unit is preserved in `ops/desktop-commander.service` for reproducible VPS recovery.
- **hermes-agent-os** — orchestration concepts are represented by the safer `hermes/` runtime. The old runtime is not copied wholesale because it assumes broad code/browser execution, paid-provider fallbacks and model availability that conflict with the current free/local-first and approval-gated policy.
- **hermes-config-backup** — treated as backup/reference material, not an active runtime source.
- **omni-agent** — separate Expo mobile client; not merged into the server application.
- **deployment-dashboard** — separate infrastructure dashboard; not merged into the creator runtime to avoid a second web/server stack.

## Conflict resolution

The integration rule is to port unique behavior into the canonical architecture instead of importing duplicate servers, Docker Compose files, credential stores or obsolete provider configuration. Runtime secrets remain external to Git. External publishing, paid usage, destructive infrastructure changes and security/access changes remain approval-gated.

## Mainline policy

New Creator OS/video work should target this repository's `main` branch. Older related repositories remain historical/reference sources unless a specific feature is explicitly ported and validated here.
