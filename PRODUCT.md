# Semester Feedback Campaign — Product Brief

## What we are building

A **MoEngage HTML in-app campaign** that pops up inside the Sunstone student app
when a student completes a semester (currently Semester 8), collects structured
feedback, and logs every answer — reliably, per-student — into two places:

1. **MoEngage** — for dashboards, segmentation, funnels and re-targeting
2. **A Google Sheet** — the team's row-level source of truth: who answered what,
   and who completed / started / ignored / never received the campaign

It is a bug-free rebuild of the original `Semester_End_Term_8.js` campaign,
keeping its UX and deployment pattern, fixing its data loss.

## Why we are rebuilding it

The original campaign LOOKED like it worked but lost data three ways:

| # | Original defect | Consequence |
|---|---|---|
| 1 | Zero-rating bug — star rating only logged if student ALSO tapped a chip | Large share of answers recorded as `rating: 0` |
| 2 | Start event called with an undefined variable | Every "feedback started" event silently lost |
| 3 | No external logging at all (no network calls, no user ID in page) | Data existed only inside MoEngage; team resorted to manual Google Sheets |

Result: the team could see clicks happening but "was unable to log the data."

## The user experience (unchanged from original)

```
 ┌─────────────────────────────┐
 │   Semester Feedback Form  ✕ │
 ├─────────────────────────────┤
 │                             │
 │         Hurray!             │      6 questions, one at a time:
 │  Your semester 8 is         │      1. Overall experience
 │       complete              │      2. Academics & Professors
 │  Tell us about your         │      3. Infrastructure & Facilities
 │      experience!            │      4. Extra-curriculars
 │                             │      5. Placements & Internships
 │  ┌───────────────────────┐  │      6. Problem Resolution
 │  │        Start          │  │
 │  └───────────────────────┘  │      Each question:
 └─────────────────────────────┘        ★★★★☆   star rating (1–5)
                                        [chips]  "Choose one or more"
        Start ──▶ Q1 ──▶ … ──▶ Q6 ──▶  "Feedback Submitted ✓"
                  └── every Next click = answers logged immediately
```

## What gets measured

**Per answer (every Next click):** student UID (database user ID), question,
star rating, chips chosen, timestamp.

**Per student (completion funnel):** a four-state flag, auto-maintained:

```
  NR ────────▶ 0 ────────▶ 0.5 ────────▶ 1
  not          shown but    started,      fully
  reached      untouched    abandoned     completed

  targeted ──▶ rendered ──▶ 1st answer ─▶ final submit
```

Flag lives in the Google Sheet (auto-filled dropdown column).
In MoEngage the same funnel is available as derived segments
(e.g. "shown attribute does not exist" = not reached → re-targetable).

## Key principles agreed

1. **UID = our database user ID.** It equals the MoEngage uniqueId the app sets
   at login. No new IDs are invented anywhere.
2. **Log per-step, not at the end.** Partial responses survive drop-off.
3. **Derive, don't detect.** Abandonment/non-delivery are inferred from which
   rows exist, never from fragile client-side timers (idle-time idea dropped).
4. **Flat event attributes** in MoEngage — every attribute filterable in
   dashboards and segments.

## How the form reaches students — delivery options

The form's UI can be delivered four ways. Option 1 (MoEngage's no-code
editor) is ruled out — it cannot build a 6-step stars+chips flow. The real
choice is between options 2, 3 and 4.

### Option 2 — HTML in-app campaign ✅ CHOSEN for v1

The form is a **webpage in disguise**. We write a small webpage (HTML + JS),
hand it to MoEngage, and MoEngage delivers it into the app and shows it
inside an invisible browser window (a WebView) as a popup overlay.

```
us ──▶ upload form files to MoEngage campaign
                 │
MoEngage ──▶ "here's the whole form, show it" ──▶ app's WebView renders popup
                 │                                        │
                 └── targeting, triggering,               ├──▶ answers → MoEngage (JS bridge)
                     frequency, re-targeting              └──▶ answers → Google Sheet (fetch)
```

| Gain | Cost |
|---|---|
| Full control of UI and logic — it's our code | Code lives as a campaign asset: update = re-upload |
| Zero infrastructure, zero app-team dependency | Runs inside MoEngage's WebView — outbound fetch is undocumented (QA test #1; known fallback) |
| Changes live in minutes (edit campaign, done) | Debugging inside a WebView is clumsy |
| MoEngage bridge events + Jinja UID injection for free | Personalization renders only on the HTML, not the JS asset |
| Native popup feel, same as the original campaign | |

**Why chosen:** the only option with full UX control AND zero infrastructure
AND no app-team dependency. Both logging requirements (MoEngage dashboards +
Sheet) are served. Risks are two pre-launch QA checks, each with a fallback.

#### End-to-end flow (option 2) — in plain words

```
 STEP 0 · BEFORE WE PRESS LAUNCH
 ───────────────────────────────
 ┌───────────────────────────────────┐   ┌───────────────────────────────────┐
 │ We set up the campaign:           │   │ We paste the list of all targeted │
 │ WHO sees it (sem-8 students) and  │   │ students into the Google Sheet.   │
 │ WHEN it pops (e.g. next app open) │   │ Everyone starts marked:           │
 └─────────────────┬─────────────────┘   │ "NR — campaign hasn't reached     │
                   │  launch!            │  this student yet"                │
                   ▼                     └───────────────────────────────────┘

 STEP 1 · THE FORM REACHES THE STUDENT          WHAT THE SHEET SAYS
 ─────────────────────────────────────          ───────────────────
 Student opens the app
        │
        ├─ never opens the app? ──▶ form never appears ──▶  stays "NR —
        │                                                    never reached"
        ▼
 MoEngage prepares the popup and writes the
 student's ID into it (so every answer will
 carry WHO answered — automatically)
        ▼
 The feedback popup appears on screen
        │
        └─ the moment it appears, a note is sent:
           "student #12345 has SEEN the form" ──────────▶  NR changes to "0 —
                                                            saw it, not touched"
 STEP 2 · THE STUDENT DECIDES
 ────────────────────────────
        │
   ┌────┴──────────────────────────┐
   │                               │
 closes it / ignores it      taps "Start"
   │                               │
   ▼                               ▼
 stays "0 — saw it,         STEP 3 · ANSWERING (repeats for all 6 questions)
 not touched"               ─────────────────────────────────────────────────
                            ┌───────────────────────────────────────────────┐
                            │  Question appears                             │
                            │     ★★★★☆   student gives stars (1 to 5)     │
                            │     [ buttons ] student picks what they       │
                            │                 liked / didn't like           │
                            │     taps "Next"                               │
                            │        │                                      │
                            │        └─ that answer is INSTANTLY saved      │
                            │           in BOTH places:                     │
                            │            • MoEngage (for dashboards)        │
                            │            • Google Sheet (one new row:       │
                            │              who, which question, how many    │
                            │              stars, which buttons)            │
                            │                                       ────────┼──▶ "0.5 — started"
                            │                                               │    (from the 1st
                            │  quits halfway through?                       │     answer onwards)
                            │   └─ no problem: every answer given so far    │
                            │      is already saved. Nothing is lost.   ────┼──▶ stays "0.5 —
                            │                                               │    started but
                            │  last question's button says "Submit"         │    didn't finish"
                            │   └─ saves the answer + sends one extra       │
                            │      note: "this student FINISHED"        ────┼──▶ "1 — completed"
                            └───────────────────┬───────────────────────────┘
                                                ▼
                            "Feedback Submitted ✓ All the best
                             for your next semester" — popup
                             closes itself after 2 seconds

 STEP 4 · WHAT WE END UP WITH
 ────────────────────────────
 The Sheet now shows, for EVERY targeted student, one of four words:

   NR  = campaign never reached them
   0   = saw the form, ignored it
   0.5 = started, quit halfway (their partial answers are still saved!)
   1   = completed the whole form

 → and the NR + 0.5 students become the list we chase in round 2
   (see the parked push-notification idea below)
```

### Option 3 — self-hosted form page (the upgrade path)

The form is a **real webpage on our own domain** (e.g.
`feedback.sunstone.in/sem8`). MoEngage no longer carries the form — it only
carries a door to it: a small banner/popup/push whose button opens our URL,
with the student's UID attached as a query parameter via personalization.

```
MoEngage ──▶ "tap to give feedback" banner ──▶ opens https://feedback.sunstone.in/sem8?uid=12345
                 │                                        │
                 └── targeting, triggering,               ▼
                     re-targeting                  OUR page, OUR server
                                                          │
                                                          ├──▶ Google Sheet (our backend writes it)
                                                          └──▶ MoEngage via server-to-server
                                                               Data API (documented, no JS bridge)
```

| Gain | Cost |
|---|---|
| Total control: our hosting, instant updates, real debugging tools, our analytics | We own infrastructure: a domain, hosting, a small backend API, uptime |
| No WebView fetch uncertainty — it's our page talking to our server | One extra tap for the student (banner → page) instead of an instant overlay |
| Data path is stronger: backend writes Sheet AND pushes events to MoEngage via documented S2S API | "Shown but ignored" tracking is weaker — if the banner isn't tapped, our page never loads (MoEngage impression events partly cover this) |
| Same form code, Sheet schema, state machine and event taxonomy carry over from option 2 unchanged | |

**When to switch:** if QA shows the WebView blocks outbound fetch, or when
this grows into a recurring multi-campaign feedback system worth owning
infrastructure for. Nothing designed for v1 is thrown away — only the
transport changes (WebView fetch + JS bridge → our backend + S2S API).

## Future considerations

### Option 4 — native in-app feedback screen (not for v1)

Today the form is a webpage in disguise: MoEngage delivers HTML that the app
shows inside a WebView. The native alternative: the app team builds the
feedback screen as a real part of the Sunstone app, and MoEngage's role
shrinks to messenger — it just tells the app "show the feedback screen now."

```
v1 (HTML in-app):
  MoEngage ──▶ "here's the whole form (HTML)" ──▶ WebView renders it

Future (native):
  MoEngage ──▶ "show feedback screen, sem_8" ──▶ app opens ITS OWN screen
              (tiny instruction, no UI)            answers → our DB directly
```

| Gain | Cost |
|---|---|
| Smoothest UX (native screen, no WebView quirks) | Needs the app dev team — campaign team loses self-serve |
| No WebView fetch/CSP uncertainty | Every copy/question change = app release + store approval + update lag |
| Answers land straight in our own DB | Old app versions keep the old form forever |
| MoEngage still does targeting/triggers/re-targeting | |

**When to revisit:** if feedback collection becomes a permanent, every-semester
product surface rather than a per-campaign effort. Until then, the HTML in-app
(zero infra, zero app-team dependency, changes live in minutes) is the right
trade. Intermediate upgrade path if WebView limits bite: self-hosted form page
+ server-to-server MoEngage Data API (see ARCHITECTURE.md §7 fallback).

## Parked idea — push notification → self-hosted form (wave 2 re-targeting)

A push notification whose click-action URL opens the self-hosted form page
directly, with the student's UID personalized into the link **at send time**
via Jinja — no app-open-to-fetch-UID hack needed (MoEngage already knows the
recipient of every push):

```
Click URL in campaign:  https://feedback.sunstone.in/sem8?uid={{UserAttribute[...]}}
Student receives:       https://feedback.sunstone.in/sem8?uid=12345

push lands ──▶ tap ──▶ browser/rich-landing opens form, UID already in link
                              │
                              ▼
                       our server → Sheet + MoEngage S2S API
```

**Role:** NOT the primary channel — push reach is poor (notification permission
opt-outs, single-digit CTRs) vs in-app's near-guaranteed delivery on app open.
Its sweet spot is **wave 2**: chasing the NR (never reached) and 0.5
(abandoned) students after the in-app wave:

```
Wave 1: in-app HTML popup (option 2)   → everyone who opens the app
Wave 2: push → feedback.sunstone.in    → only NR + 0.5 students
```

**Dependencies / notes:**
- Presupposes the option-3 self-hosted page exists (this is the main reason
  to eventually build it)
- Funnel flags remap cleanly: push delivered/clicked = NR/0 boundary,
  page load = 0, first answer = 0.5, submit = 1
- Raw UID in a URL is shareable/guessable — acceptable for low-stakes
  feedback; if not, template a hashed token instead and verify server-side

## Open product questions

See `OPEN_QUESTIONS.md` — chiefly: what to do with 0.5 (half-filled) students:
log-and-done vs re-show full form vs resume where they left off.
