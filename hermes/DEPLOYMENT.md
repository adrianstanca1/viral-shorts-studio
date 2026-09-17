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

## Production VPS sync

The production sync must use the existing SSH recovery identity without committing any private key, passphrase, password, API token, or `.env` secret to Git.

Runtime-only environment variables:
- `VPS_HOST`
- `VPS_USER` (defaults to `administrator`)
- `VPS_KEY_PATH`
- `VPS_KEY_PASSPHRASE`

The passphrase must be supplied only at execution time and must never be echoed, logged, written to the repository, or persisted in project memory.

Before deployment, verify all of the following:
- the SSH host key is already trusted in `known_hosts`;
- the remote Git origin matches `adrianstanca1/viral-shorts-studio`;
- the working tree is clean;
- `node hermes/validate.mjs` passes;
- `node hermes/policy-test.mjs` passes;
- `docker compose config -q` passes.

Deploy only services whose Compose service name is `viral-shorts` or starts with `viral-shorts-`. Do not rebuild or restart unrelated containers.

Post-deploy verification must include:
- target service/container status;
- the unauthenticated local health endpoint;
- recent target logs if health is not immediately green;
- the deployed Git commit SHA.

Remote Desktop Commander recovery is a separate host-management action and must only be attempted after the application deployment is healthy. Preserve any existing pairing/auth configuration rather than creating a second unmanaged pairing.
