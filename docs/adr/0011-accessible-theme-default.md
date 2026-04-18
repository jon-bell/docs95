# ADR-0011: Accessible (Modern) theme is the default; Word 95 fidelity is opt-in

- Status: Accepted
- Date: 2026-04-18

## Context

Our accessibility commitment (`docs/requirements/non-functional.md:686-691`, VPAT pledge at `NFR-7-3`) and the Word 95 visual spec (`docs/requirements/ux.md:1939, 2021, 2050, 2521, 2720-2732, 2025-2032`) cannot both be the default. Word 95 fidelity ships: 1 px dotted focus ring, 22×22 px toolbar buttons, 16×16 px scrollbar arrows, audio-only "OS beep on error", color-only spell-status indicators, 6 fps animated icons without a `prefers-reduced-motion` guard, #C0C0C0 chrome with ~3.5:1 contrast, no dark mode.

The **beneficiaries** of strict Win95 fidelity (nostalgia users) and the **cost-bearers** (users with low-vision, motor, hearing, cognitive, or photosensitivity needs) are different populations. A Win95 default silently redistributes accessibility cost onto the users least served by it.

## Decision

The first-run default theme is **Modern (accessible)**, meeting WCAG 2.1 AA out of the box: ≥ 4.5:1 text contrast, ≥ 3:1 focus ring, `prefers-reduced-motion` honored, no color-only meaning (spell status uses both color and shape), dark-mode support. **Classic Win95** theme is available from v1 behind `Tools → Options → View → Theme`; enabling it displays a plain-language notice that certain accessibility features are relaxed. The published VPAT describes the default theme only.

## Consequences

### Positive

- VPAT pledge keepable in good faith.
- Accessibility commitment honored without toggling.
- Nostalgia users retain access to the Win95 theme with one opt-in click.

### Negative

- Some Word-95 purists will consider the default inauthentic.
- Visual-regression, axe-core, and Storybook runs cover both themes; ~1.3× CI cost on visual suites.

### Follow-up required

- Draft "Accessibility Mode" notice text and a keyboard-reachable toggle UX.
- Both themes must pass axe-core gate (`non-functional.md:967`); Win95 theme is allowed targeted exemptions documented here.

## Alternatives considered

- **Win95 default, accessibility theme opt-in.** Rejected: violates WCAG commitment out of the box; VPAT becomes a promise we break.
- **Drop Win95 theme entirely.** Rejected: abandons the mission's fidelity goal.
- **Compromise single theme blending both.** Rejected: loses accessibility compliance _and_ fidelity.

## References

- `docs/requirements/non-functional.md:681-754`
- `docs/requirements/ux.md:1935-2053, 2521-2523, 2590-2624, 2720-2749`
- Review Phase 1 P1-C4; Review Phase 4 P4-C5
- Related: ADR-0004
