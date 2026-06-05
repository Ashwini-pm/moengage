# Open questions — Semester Feedback Campaign

## Q1. What happens when a student half-fills the form? (raised 2026-06-05, to discuss with stakeholders)

A student answers some questions and leaves → status flag 0.5. Then what?

| Option | Effort | Trade-off |
|---|---|---|
| A. Log partials, move on | None | 0.5 is final; partial data already captured per-Next |
| B. Re-show full form later | Campaign setting only | Student re-answers earlier questions → duplicates in Sheet (handle as "latest wins") |
| C. Resume from question left off | Engineering + QA | Store `sem8_last_q` as MoEngage user attribute, Jinja-inject on re-render, skip answered. Caveat: user attributes update async — a fast re-show may see a stale value |

Decision: ___________

## ~~Q2. Distinguish "never delivered" from "shown but ignored"?~~ — DECIDED 2026-06-05

Yes. "Not reached" becomes an explicit flag in both systems:
- **Sheet:** import target roster before launch → every UID starts at **NR**; state machine is NR → 0 → 0.5 → 1 (auto-filled dropdown).
- **MoEngage:** shown ping also sets user attribute `sem8_form_shown = true`; "not reached" = target segment AND attribute does not exist (derived segment, re-targetable). No stored false flag possible — unreached devices run no code.
- Roster source to decide: MoEngage segment export vs DB query. Decision: ___________

## Earlier decisions still open (from planning)

1. Sheet layout: one row per question-answer (recommended) vs one wide row per student
2. Re-show frequency setting in MoEngage (related to Q1)
3. Hardcode `sem_8` vs config value reused per term

# Agreed so far

- Split build matching original pattern: thin `index.html` (holds Jinja UID token + config) + `feedback.js` asset
- UID = database user ID (= MoEngage uniqueId set by app at login). No new IDs.
- Dual logging on every Next: MoEngage (flat attrs) + Google Sheet via Apps Script webhook
- Completion flag NR / 0 / 0.5 / 1 lives in the Sheet (Status tab, auto-filled dropdown column, Apps Script state machine NR → 0 → 0.5 → 1; "derive, don't detect" — abandonment = partial rows with no submit)
- Idle-time/pagehide ping idea DROPPED (2026-06-05) — status derived purely from row presence
- Flag 0 written on form impression ("shown" ping when HTML renders); same ping sets `sem8_form_shown = true` in MoEngage for the not-reached derived segment
