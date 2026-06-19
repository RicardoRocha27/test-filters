# UX Conventions

Team-wide conventions that apply beyond any single feature. (Proposed — to align on
as a team; captured here so it isn't lost.)

## Handling invalid / inconsistent input

Where you correct vs. reject bad input depends on the **layer**, not the feature:

| Layer | Behavior | Example |
| --- | --- | --- |
| **Interactive pickers** (during selection) | **Forgiving / auto-correct** | a date-range picker reassigns or swaps when you click an end before the start |
| **Validation / submit layer** | **Surface the error** (don't silently fix) | a loaded/submitted state with `end < start` shows a validation message via the normal error surface |
| **Backend** | **Rejects it** | API returns 400 for an inverted range |

Rationale: auto-correcting is good UX *while a user is actively choosing*, but at the
submit/validation layer silently "fixing" input hides mistakes and renders something
other than what was asked for. Surface it instead — and reuse the **same error surface
as a backend error** (e.g. the existing toast/error state) rather than bespoke handling.

> Note: this is distinct from values that have **no valid interpretation** (an unknown
> enum, a non-sortable `orderBy`), which are simply dropped/ignored at parse time. The
> convention above is for **cross-field / relational** invalidity (e.g. `start > end`),
> where both values are individually valid and "fixing" it would be a guess.
