# ADR-0017: CSP `style-src 'unsafe-inline'` permitted; `script-src` strict

- Status: Accepted
- Date: 2026-04-18
- Aliases: `ADR-security-001` (legacy name in `docs/requirements/non-functional.md:427`)

## Context

Our baseline CSP is `default-src 'none'` with narrow exceptions per resource type (`docs/requirements/non-functional.md:411-428`). React 18 emits inline `style=""` attributes for dynamically computed values: selection overlays, caret positioning, per-line decoration layers, absolute-positioned floats, and layout-driven transforms. A strict `style-src 'self'` without `'unsafe-inline'` would require either a runtime CSS-in-JS injector (adds a bundle, defeats determinism) or nonce-rotation per render (React 18 does not propagate nonces into inline attributes reliably), or hash-based CSP (impossible for values computed from layout).

## Decision

The shipped CSP allows `style-src 'self' 'unsafe-inline'`. `script-src 'self'` remains strict — no `'unsafe-inline'`, no `'unsafe-eval'`, no remote scripts, no data URLs for scripts. Styles are never executable; the attack class permitted by `'unsafe-inline'` on styles is cosmetic (CSS injection for visual confusion / disclosure). We mitigate with the following:

- Every HTML import is sanitized by the HTML-IO plugin before any node touches the DOM.
- `dangerouslySetInnerHTML` is banned by lint outside a reviewed allowlist.
- CSS injection from attacker-controlled strings is blocked at the persistence boundary: imported styles are parsed through a whitelisting CSS tokenizer, not inlined raw.
- Trusted Types are enforced on `script` and `scriptURL` sinks via `require-trusted-types-for 'script'` (already in the `default-src 'none'` posture).

## Consequences

### Positive

- React stays simple; no CSS-in-JS runtime injector; no nonce plumbing.
- Dynamic decorations (selection highlights, caret, ruler guides) work without per-decoration CSP exceptions.
- Supply-chain-induced CSS injection is bounded by the sanitizer, not by CSP alone.

### Negative

- A successful CSS-injection attack can exfiltrate some content via `background-image: url("https://evil")` — but `img-src 'self' data: blob:` (no remote) blocks this for HTTP exfiltration, so the practical exfil surface is narrow.
- The "no `'unsafe-inline'` anywhere" bar is not met; reviewers must understand the asymmetry between style and script.

### Follow-up required

- Land the `dangerouslySetInnerHTML` lint rule (`tooling/eslint-config`).
- Add a CSS tokenizer sanitizer to `@word/html-io`.
- Penetration-test the sanitizer against the OWASP CSS injection corpus.

## Alternatives considered

- **Pure external stylesheet, no inline styles.** Rejected: cannot express dynamic per-node layout-driven styles (caret, selection geometry) without a runtime injector.
- **Nonce-per-page inline styles.** Rejected: React 18's nonce propagation for inline `style=""` is unreliable; nonce churn on every render.
- **Hash-based CSP for inline styles.** Rejected: impossible given arbitrary computed style strings.
- **CSS-in-JS (Emotion/Linaria/vanilla-extract).** Rejected: adds runtime overhead for the hot path; Linaria is compile-time only but still can't express layout-driven absolute positioning without inline styles.

## References

- `docs/requirements/non-functional.md:409-428`
- `docs/architecture/electron.md:198-223`
- Related: none
