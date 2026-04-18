# ADR-0018: i18next + react-i18next for UI localization

- Status: Accepted
- Date: 2026-04-18
- Aliases: `ADR-i18n-001` (legacy name in `docs/requirements/non-functional.md:830`)

## Context

String localization needs plurals, gendering, ICU MessageFormat, locale fallback chains, and idiomatic React hooks. Built-in `Intl` handles numbers/dates/collation (and we use it per `non-functional.md:822-825`) but is insufficient for translated UI strings. v1 ships English only; v1.1+ adds locale packs; pseudo-localization is required for CI (`NFR-9-180`).

## Decision

`i18next` + `react-i18next`. Strings live in `src/i18n/<locale>/<namespace>.json`. The ICU MessageFormat parser is enabled for plurals and gendered forms (`NFR-8-93, NFR-8-94`). Namespaces split by package: `ui`, `engine-errors`, `dialogs`, `field-templates`. No string concatenation anywhere; every user-visible literal goes through `t()`. Pseudo-localization is a hidden flag per `non-functional.md:832, NFR-9-180`.

Menu mnemonics remain English-only (`ux.md:167-171`, `P1-W4` in the review) as a documented Word-95 parity non-goal for v1 localization.

## Consequences

### Positive
- Well-trodden library; React integration stable; MIT-licensed.
- Plural/gender support aligned with ICU; interpolation syntax familiar to translators.
- Hot-reloadable for dev; lazy-loadable per namespace in prod.
- Pseudo-loc with `+40%` string expansion and accented characters is a one-flag enable (`non-functional.md:975`).

### Negative
- Another dependency in the UI bundle (~40 KB gzipped with ICU plugin); acceptable against the 2 MB bundle budget (`non-functional.md:183`).
- Translators must understand ICU MessageFormat, not just `printf` placeholders.

### Follow-up required
- Add a lint rule that flags English string literals outside `src/i18n/`.
- Commit a `pseudo-loc` CI job per `NFR-9-180`.
- Document the translator's style guide (tone, placeholder conventions, mnemonic non-goal).

## Alternatives considered

- **`formatjs` / `react-intl`.** Rejected: comparable capabilities, heavier runtime, less ergonomic namespace split for our package layout.
- **Custom MessageFormat implementation.** Rejected: reinvents the wheel; maintenance burden for no benefit.
- **Intl.MessageFormat (ECMAScript proposal).** Rejected: proposal not stabilized as of 2026-04; not ready to ship against.
- **`lingui`.** Rejected: macro-heavy at build time; friction with our TypeScript strictness and Vite build.

## References

- `docs/requirements/non-functional.md:826-835, 965-977`
- `docs/requirements/ux.md:2135-2143`
- Related: ADR-0011
