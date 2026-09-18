# Desktop Commander Recovery

The production VPS runs Desktop Commander as the systemd service `desktop-commander.service`.

## Normal state

A healthy installation should report:

- service enabled
- service active
- remote MCP endpoint reachable
- no recent invalid-refresh-token or expired-device-code messages

Run:

```bash
bash ops/check-desktop-commander.sh
```

Exit code `0` means the local service and remote endpoint checks pass. Exit code `1` means the service or network path needs repair. Exit code `2` means the persisted Desktop Commander session requires device re-authorization.

## Re-authorization recovery

If logs show `Invalid Refresh Token`, `Persisted session invalid`, or `Device code has expired`, do not delete the service or replace the VPS installation. The local agent may still be healthy.

1. Confirm `desktop-commander.service` is enabled and active.
2. Confirm `https://mcp.desktopcommander.app/mcp` is reachable. An unauthenticated HTTP 401 response confirms network/TLS reachability.
3. Read the latest Desktop Commander service log and locate the fresh device verification URL/code.
4. Approve that code in the authorized browser session before it expires.
5. Re-run the health check and verify the registered device is online.

The production recovery performed on 2026-09-18 confirmed that the VPS service and network path were healthy; the failure was an invalid persisted refresh token and was resolved by device re-authorization.

## Safety

Do not commit refresh tokens, device tokens, VPS passwords, SSH private keys, or authorization codes. Keep production credentials in protected runtime/Actions secrets.
