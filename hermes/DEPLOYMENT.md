# Hermes Deployment Guardrails

Hermes deployment actions are limited to the `viral-shorts` stack.

Required sequence:
1. Create or confirm a rollback point.
2. Run pre-deploy tests.
3. Pull the intended revision.
4. Build only the target stack.
5. Restart only `viral-shorts` services.
6. Run health checks and inspect target logs.
7. Roll back if health verification fails.

Hermes must not mutate unrelated VPS services, users, firewall rules, disks, or host security settings as part of an application deploy.
