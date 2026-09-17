# Hermes Recovery Policy

Recovery should prefer the smallest safe action.

- Inspect the failed job and provider state before retrying.
- Retry a provider at most twice per task.
- Open the circuit breaker after repeated provider failures and fail over to the next healthy route.
- Do not convert a failed free route into paid usage without explicit approval.
- Restart only the `viral-shorts` target when application recovery requires a restart.
- Preserve production data, credentials, unrelated containers and shared services.
- Record the failure, action taken and verification result in the audit log.
