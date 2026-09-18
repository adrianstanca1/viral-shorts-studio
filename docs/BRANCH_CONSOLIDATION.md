# Branch Consolidation

This file records the reconciliation of all branches that existed in `viral-shorts-studio` when the repository was consolidated into `main`.

- `add-production-deploy-workflow`: production deployment workflow already represented in main; its patch is equivalent/superseded.
- `simplify-production-credentials`: credential simplification already represented in main.
- `fix-hermes-safety-invariants`: all validator and policy assertions are present in main.
- `global-hermes-enforcement`: Hermes policy runs globally on main/PRs and Hermes checks are part of the release gate.
- `hermes-runtime-v1`: superseded by the current Hermes runtime and safety policy in main.
- `integrate-related-repositories`: squash-merged into main; tree content already represented.
- `diagnose-vps-secret-scope`: temporary credential-presence diagnostic; its findings were used to repair deployment, and the temporary workflow has been removed from main.
- `fix-live-production-deploy`: squash-merged into main; its pipefail-safe discovery, remote health URL definition, target-only rollback, and no-dependency governance checks are canonical.
- `repair-desktop-commander`: recovery findings are now preserved as `ops/check-desktop-commander.sh` and `ops/DESKTOP_COMMANDER_RECOVERY.md`; the temporary inspection workflow is not part of production main.
- `review-provider-config-drift`: Firecrawl compatibility and disabled SendGrid/Vercel defaults are already present. OpenRouter example configuration is reconciled to opt-in while retaining the free-only router.
- `v39-creator-funnel`: fully contained in main.
- `v40-project-journey`: fully contained in main.
- `finalize-branch-integration`: final reconciliation branch used to remove temporary diagnostics and preserve permanent recovery tooling.
- `main`: canonical branch.

No obsolete branch was allowed to overwrite newer runtime, security, provider-routing, deployment, or recovery code. Branch histories remain available for audit; main is the authoritative integrated product.
