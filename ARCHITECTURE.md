# Semester Feedback Campaign — Architecture

## 1. File structure

```
moengage/
├── PRODUCT.md                  what we're building & why
├── ARCHITECTURE.md             this file
├── OPEN_QUESTIONS.md           live decisions log
├── README.md                   setup + QA checklist
├── google_apps_script.gs       webhook code → lives in the Google Sheet's
│                               Apps Script editor (not uploaded to MoEngage)
└── campaign/                                        ── to be built ──
    ├── index.html              thin host page  → pasted into MoEngage's
    │                           campaign HTML editor
    └── feedback.js             all form logic  → uploaded as a MoEngage
                                campaign ASSET (hosted on their CDN)
```

### Why split into index.html + feedback.js (the original pattern)

MoEngage personalization (Jinja tokens like the user-ID token) is rendered
**only on the campaign HTML**, server-side, at delivery time. Uploaded assets
are static files on MoEngage's CDN — never personalized. Therefore:

```
index.html  (PERSONALIZED per user at render time)
│   window.MOE_CONFIG = {
│     userId:  "{{UserAttribute[...]}}"  ◀── MoEngage replaces with real DB UID
│     webhook: "https://script.google.com/.../exec",
│     term:    "sem_8"
│   }
│   <div id="root">
│   <script src="feedback.js">   ◀── loads the static logic
│
feedback.js (STATIC on campaign-assets-*.moengage.com — same for every user)
    reads window.MOE_CONFIG → renders form → logs answers
```

This is exactly how the original was deployed (host HTML + CDN-hosted JS
bundle) — minus React/Vite: ours is hand-written plain JS, no build step.

## 2. Runtime environment

```
┌─ Student's phone ────────────────────────────────────────────────┐
│ ┌─ Sunstone app ─────────────────────────────────────────────┐  │
│ │  login ──▶ MoEngage SDK: setUniqueId(DB user ID)           │  │
│ │                     │                                      │  │
│ │  trigger met ──▶ SDK renders campaign in a WebView:        │  │
│ │ ┌─ WebView ────────────────────────────────────────────┐   │  │
│ │ │  index.html (UID already substituted)                │   │  │
│ │ │  feedback.js                                         │   │  │
│ │ │     │                                                │   │  │
│ │ │     ├──▶ window.moengage  (JS bridge → SDK → server) │   │  │
│ │ │     └──▶ fetch()          (→ Apps Script webhook)    │   │  │
│ │ └──────────────────────────────────────────────────────┘   │  │
│ └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## 3. Logging flow — what fires when

```
 EVENT                       MOENGAGE                      GOOGLE SHEET
─────────────────────────────────────────────────────────────────────────────
 form renders            setUserAttribute              POST "shown"
 (impression)            sem8_form_shown=true          → Status: NR ▶ 0

 Start clicked           trackEvent                    POST "started"
                         sem_end_feedback_start

 Next on Q1..Q5          trackEvent sem_end_*_captured POST answer row
                         {rating, review, question_id, → Responses: +1 row
                          question, term, uid}         → Status: 0 ▶ 0.5
                         setUserAttribute
                         <q>_rating, <q>_review

 Submit on Q6            same as Next, PLUS            POST answer row, PLUS
                         trackEvent                    → Status: 0.5 ▶ 1
                         semester_feedback_submitted

 ✕ close / abandon       trackDismiss                  nothing — abandonment
                                                       is DERIVED (see §5)
─────────────────────────────────────────────────────────────────────────────
 All MoEngage event attributes are FLAT (string/number) → dashboard-filterable.
 Every Sheet POST carries the DB UID from MOE_CONFIG.
```

## 4. Google Sheet — two tabs, maintained by Apps Script

```
                       POST (JSON, one per event)
  feedback.js ────────────────────────────────────▶ doPost() in Apps Script
                                                         │
                ┌────────────────────────────────────────┤
                ▼                                        ▼
  Tab "Responses" — append-only raw log     Tab "Status" — one row per UID
  ┌──────┬─────┬────┬──────────┬────────┐   ┌──────┬────────┬───────┬─────────┐
  │ ts   │ uid │ q# │ rating   │ review │   │ uid  │ flag ▾ │ #ans  │ last_ts │
  ├──────┼─────┼────┼──────────┼────────┤   ├──────┼────────┼───────┼─────────┤
  │ ...  │ 123 │ 1  │ 4        │ Wi-Fi  │   │ 123  │ 0.5    │ 3     │ ...     │
  │ ...  │ 123 │ 2  │ 5        │ ...    │   │ 456  │ 1      │ 6     │ ...     │
  └──────┴─────┴────┴──────────┴────────┘   │ 789  │ NR     │ 0     │ —       │
                                            └──────┴────────┴───────┴─────────┘
                                            flag = data-validation dropdown,
                                            auto-selected by Apps Script
```

## 5. The completion flag — a forward-only state machine

```
            roster import        "shown" POST       first answer       Q6 submit
  (no row) ───────────────▶ NR ───────────────▶ 0 ───────────────▶ 0.5 ─────────▶ 1
                            not                 shown,              started,      completed
                            reached             untouched           abandoned*

  * "abandoned" is never signalled — it is what REMAINS when 1 never arrives.
    Principle: DERIVE, DON'T DETECT. No idle timers (dropped by decision).
    Devices that never received the campaign run zero code — hence NR must be
    seeded from the target roster, not written by the form.
```

In MoEngage the same funnel exists as derived segments:

```
  not reached  =  target segment  AND  sem8_form_shown does not exist
  started      =  has sem_end_*_captured event
  completed    =  has semester_feedback_submitted event
```

## 6. Identity — how the UID travels

```
  Sunstone DB ──▶ app login ──▶ MoEngage setUniqueId(UID)
                                      │
              ┌───────────────────────┴──────────────────────┐
              ▼                                              ▼
  MoEngage events: identity attached            index.html Jinja token:
  SERVER-SIDE automatically (the SDK            {{UserAttribute[unique id]}}
  session knows the user — this is why          rendered to the literal UID,
  the original script carried no UID            handed to feedback.js, sent
  and still had per-user data inside            in every Sheet POST
  MoEngage)
```

One verification before launch: insert the token via the campaign editor's
`@` personalization picker (not hand-typed) and confirm on a QA device that
the Sheet shows a real UID, not a literal `{{...}}` string.

## 7. Failure modes & mitigations

| Risk | Mitigation |
|---|---|
| WebView blocks outbound fetch (undocumented in MoEngage docs) | QA test #1. Fallback: MoEngage Connector campaign → same webhook (documented path, `{{EventAttribute[...]}}` templating) — form code unchanged |
| Apps Script can't answer CORS preflight | POST as `text/plain` + `no-cors` (no preflight triggered) |
| App killed right after a click | `keepalive: true` on fetch; and per-step logging means at most the last click is at risk |
| Webhook URL is public | Accepted: low-stakes data; URL is unguessable; can add a shared-secret field validated in doPost |
| Concurrent POSTs racing on Status tab | Apps Script LockService serializes writes |
| moengage bridge absent (browser preview) | Every bridge call null-guarded; form still works, Sheet still logs |
```
