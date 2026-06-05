# MoEngage Semester Feedback Campaign (bug-free rebuild)

Rebuild of `Semester_End_Term_8.js` as a single self-contained HTML file for a
MoEngage **custom HTML in-app campaign**, plus a Google Apps Script webhook
that logs every response row into a Google Sheet.

## Files

| File | Purpose |
|---|---|
| `semester_feedback.html` | The campaign — paste/upload into MoEngage custom HTML in-app |
| `google_apps_script.gs` | Webhook that appends one row per answer to a Google Sheet |

## Bugs in the original that are fixed here

1. **Zero-rating bug** — the original only copied the star rating into the
   logged payload when a chip was selected; stars alone logged `rating: 0`.
   Now there is a single state object and the star click writes the rating
   directly into what gets logged.
2. **Nested event attributes** — original sent `{ semester_feedback: {rating, review[]} }`,
   which MoEngage can't filter/segment on. Now all event attributes are flat:
   `rating`, `review` (csv), `question_id`, `question`, `term`, `user_id`.
3. **Start event crash** — original called `trackEvent(sem_end_feedback_start, …)`
   with an undefined identifier instead of a string. Fixed.
4. **Unguarded `moengage` calls** — the close button crashed outside the
   MoEngage container. Every bridge call is now null-guarded, so the form
   works in plain-browser preview too.
5. **Naming consistency** — all six per-question events follow
   `sem_end_*_captured`; the final completion event is `semester_feedback_submitted`.

## Logging behavior

Fires on **every Next/Submit click** (per-step, so partial responses survive
drop-off). Each step logs to BOTH destinations:

- **MoEngage**: `trackEvent` (flat attributes) + `setUserAttribute`
  (`<attribute>_rating`, `<attribute>_review`)
- **Google Sheet**: one row — server + client timestamp, user_id, term,
  question_id, question, attribute, rating, review, event_name

## Setup

### 1. Google Sheet webhook
Follow the steps in the header comment of `google_apps_script.gs`
(create Sheet → Apps Script → deploy as Web app, access: *Anyone* → copy the
`/exec` URL). Verify it by opening the URL in a browser — it should print
`OK — webhook is live`.

### 2. Configure the HTML
In `semester_feedback.html`, set:

- `SHEET_WEBHOOK_URL` — the `/exec` URL from step 1.
- `USER_ID` — currently `{{UserAttribute['USER_ATTRIBUTE_UNIQUE_ID']}}`.
  This is a MoEngage personalization token replaced at render time with the
  user's unique ID. **Confirm the exact token in your MoEngage dashboard**
  (use the *Personalize* picker in the campaign editor → User attribute →
  Unique ID) — token names can differ by workspace setup.

### 3. Create the campaign
MoEngage → Engage → In-app → Create → **Custom HTML (self-handled / HTML)**
→ paste the file contents → set audience/trigger (e.g. event
`semester_8_completed` or an app-open trigger with a segment filter)
→ test on a QA device → launch.

### 4. Verify end-to-end (do this before launch)
1. Trigger the campaign on a test device.
2. Rate stars **without** selecting chips, hit Next → the Sheet row and the
   MoEngage event must both show the real rating (this was the original bug).
3. Check the user profile in MoEngage for `semester_experience_rating` etc.
4. Confirm `user_id` in the Sheet is the real ID, not the literal
   `{{UserAttribute[...]}}` string — if you see the literal string, the
   personalization token name is wrong for your workspace.

## Caveats

- Apps Script web apps accept anonymous POSTs — the webhook URL is
  effectively public. Fine for low-stakes feedback; don't reuse the pattern
  for sensitive data.
- The Sheet write uses `no-cors`, so the client can't read the response;
  failures are silent. MoEngage events remain the source of truth — the
  Sheet is the convenient row-level copy.
- Apps Script quota is ~20k URL-fetch-free POSTs/day on a consumer account —
  more than enough for a feedback form (6 rows max per student).
