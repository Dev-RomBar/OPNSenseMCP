# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a
vulnerability"). Please don't open a public issue.

## Scope

This fork's read-only changes (the `Fork:` changes listed in the README): read-only mode,
`search*` sent as GET, SSH disabled, the hidden `configure` tool and the Cloudflare Access
JWT check on HTTP transports. A vulnerability in code this fork doesn't change belongs
upstream: report it to [vespo92/OPNSenseMCP](https://github.com/vespo92/OPNSenseMCP).

## Security model

The server can never change the firewall:

- Read-only mode is always on, whatever the environment or a tool says: write tools are
  hidden, and the API client never sends POST, PUT or DELETE (`src/index.ts`
  `getSafetyConfig`, `src/api/client.ts`).
- SSH never sends a command (`src/resources/ssh/executor.ts`): upstream's read-only command
  patterns can be bypassed with shell syntax.
- The connection comes from the environment only; `configure` is hidden.
- Over HTTP, every request but `/health` needs a valid Cloudflare Access JWT, and the server
  refuses to start without its settings unless `ALLOW_WITHOUT_ACCESS_JWT=true`.
- Give it an OPNsense API key with the narrowest privileges you can, as a second safeguard.

A change that weakens any of these is a vulnerability.

## Supported versions

Only `main`.
