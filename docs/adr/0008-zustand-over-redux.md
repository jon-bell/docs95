# ADR-0008: Engine-owned document state + Zustand UI/prefs stores, bridged by events

- Status: Accepted
- Date: 2026-04-18

## Context

UI-ephemeral state, user preferences, and domain state have different volatilities, different persistence rules, and different undo semantics. One store for all of them causes re-render cascades and entangles undoable with non-undoable state. React's built-in Context is not a store; subscribing the whole tree re-renders the subtree on every change.

## Decision

Three stores.

1. **Engine** owns domain state. Holds the `CommandBus`, produces invertible patches, emits `stateChanged` exactly once per committed transaction. Authoritative; transactional; undoable.
2. **UIStore** (Zustand) owns ephemeral UI state: open dialogs, focus holders, ruler drag state, transient selection.
3. **PrefsStore** (Zustand) owns durable user preferences, persisted via `electron-store`.

An `EngineBridge` (provided via React Context, not a module-scoped singleton — review Phase 2 P2-C6) wires React subscriptions to engine events through memoized selectors.

## Consequences

### Positive
- Fine-grained reactivity; React renders only affected slices (`docs/architecture/ui-components.md:268-287`).
- Domain undo remains pure: no UI state accidentally inside a patch.
- Stores segregate by volatility, matching the context-splitting guidance in `ui-components.md:3094-3106`.

### Negative
- Three subscribe paths for contributors to learn.
- Cross-store invariants (theme → prefs → engine typography port) require explicit orchestration.

### Follow-up required
- `EngineBridge` must be provided via React Context at the composition root; `getEngineBridge()` singleton pattern (`ui-components.md:3201-3204`) is removed.

## Alternatives considered

- **Redux + Redux Toolkit for everything.** Rejected: boilerplate tax; selector discipline is required anyway; store monolith invites entanglement.
- **MobX.** Rejected: observable proxies collide with our immutable-patch model.
- **React Context as store.** Rejected: not a store; re-renders the entire subtree on change.

## References

- `docs/architecture/ui-components.md:268-287, 3088-3106, 3197-3226`
- Review Phase 2 P2-C6
- Related: ADR-0015
