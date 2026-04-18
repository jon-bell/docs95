# ADR-0014: Hyperlink scheme allowlist (not blocklist)

- Status: Accepted
- Date: 2026-04-18

## Context

`docs/requirements/non-functional.md:506` and `docs/architecture/persistence.md:2154, 2269-2278` currently enumerate hyperlink schemes as a blocklist (`javascript`, `data`, `vbscript`, `intent`, `smb`, `ftp`). Blocklists are a known-bad pattern in 2026 security review: any scheme not listed becomes an open door, and novel schemes added by OS or browser vendors silently inherit "permitted" status.

Review Phase 4 P4-C1 escalated this to Critical.

## Decision

Hyperlink click-to-open uses an **allowlist**:

- `http://`, `https://` — open via `shell.openExternal` with user confirmation per session unless "always open for http(s)" opted in.
- `mailto:` — open via `shell.openExternal` with user confirmation.
- `#bookmark`, `#anchor` (intra-doc) — handled in-app.
- `file://` — extra confirmation; gated entirely in a future enterprise-policy toggle.

Every other scheme requires an explicit confirmation dialog naming the scheme; users may unlock specific schemes per-session or persistently via `Tools → Options → Privacy → Hyperlink schemes`.

On save, we **strip** `javascript:` and `data:text/html` URLs from hyperlink targets even if the imported document had them, and emit a machine-readable warning log entry per strip. We never emit such URLs in files we write.

## Consequences

### Positive

- Novel schemes default to safe.
- Security audits answer "what can we open?" from a single, reviewable list.
- Supply-chain poisoning of a DOCX corpus cannot silently introduce new active schemes.

### Negative

- Legitimate users of less-common schemes (`tel:`, `callto:`, internal enterprise schemes) face one extra click the first time.
- Enterprise may need per-deployment allowlist expansion via GPO/config — deferred but anticipated.

### Follow-up required

- Specify the per-session and persistent confirmation UX in `docs/requirements/ux.md`.
- Specify the enterprise-policy config key for unlocking additional schemes.

## Alternatives considered

- **Blocklist (status quo).** Rejected: insecure by construction; future schemes default open.
- **Deny all non-intra-doc.** Rejected: breaks `mailto`, which is ubiquitous in Word docs.

## References

- `docs/requirements/non-functional.md:500-510`
- `docs/architecture/persistence.md:2154, 2269-2278`
- Review Phase 4 P4-C1
