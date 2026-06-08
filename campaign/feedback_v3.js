/**
 * Semester Feedback Form — MoEngage HTML in-app campaign asset
 * ------------------------------------------------------------
 * Bug-free rebuild of Semester_End_Term_8.js (original React bundle).
 * Plain JS, no build step. Reads config from window.MOE_CONFIG (set in
 * index.html, where MoEngage personalization injects the student's UID).
 *
 * Logging (per ARCHITECTURE.md §3) — on EVERY user milestone, two
 * destinations:
 *   - MoEngage JS bridge: trackEvent (flat attrs) + setUserAttribute
 *   - Google Sheet via Apps Script webhook: one POST per milestone
 *
 * Original bugs fixed:
 *   1. zero-rating bug (rating now lives in ONE state object)
 *   2. start event fired with undefined identifier (now a string)
 *   3. unguarded moengage calls (all bridge calls null-guarded)
 *   4. nested event payload (now flat attributes)
 *   5. inconsistent event naming (sem_end_*_captured for all questions)
 */
(function () {
  "use strict";

  /* ----------------------------------------------------------------
     CONFIG
     ---------------------------------------------------------------- */
  var CFG = window.MOE_CONFIG || {};
  var WEBHOOK = CFG.sheetWebhookUrl || "";
  var TERM = CFG.term || "sem_unknown";
  // Start-screen copy comes from config so the same package is reusable
  // term after term — only index.html's config block changes per campaign.
  var START_TITLE = CFG.startTitle || "Hurray!";
  var START_LINE1 = CFG.startLine1 || "Your semester is complete";
  var START_LINE2 = CFG.startLine2 || "Tell us about your experience!";

  // Reads the user id from config. If MoEngage didn't fill it, avoid logging
  // a literal "{{...}}" string.
  var USER_ID = CFG.userId || "";
  if (!USER_ID || USER_ID.indexOf("{{") !== -1) USER_ID = "TEST_PREVIEW";

  var CDN = "https://d3s27eh1wskpwv.cloudfront.net/hub/static/";

  // Original close (X) icon — same base64 PNG the original bundle shipped.
  var CLOSE_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAABwSURBVHgBldIBCsAgCAXQ2Ak7SjeoG2w3qJu6ZG3I8KsFgZmPQkxElOduKbhmbWXDQaFn9QDqq7a8ieZhgdr/AmKILOwiBZ+rET5SMEQHsiA2X/u+N/e14hpFQ+SGiTXkYgtBLEYOIgUXPuwOOTct3+CwCS8ie7HmAAAAAElFTkSuQmCC";

  /* ----------------------------------------------------------------
     QUESTIONS — same content as the original campaign
     ---------------------------------------------------------------- */
  var QUESTIONS = [
    { id: 1, question: "How would you rate your overall semester experience?",
      options: ["Academics & Professors", "Extra-curriculars", "Infrastructure & Facilities", "Placements and Internships", "Problem Resolution"],
      event_name: "sem_end_experience_captured", attribute: "semester_experience" },
    { id: 2, question: "Rate your experience with Academic & Professors",
      options: ["Course Content", "Timetable", "Practical Learning", "Faculty Behaviour"],
      event_name: "sem_end_academic_experience_captured", attribute: "semester_end_academics" },
    { id: 3, question: "Rate your experience on Infrastructure & Facilities",
      options: ["Classroom Infrastructure", "Wi-Fi", "Lab Access", "Library Access", "Auditorium and Sports Ground Access"],
      event_name: "sem_end_infra_experience_captured", attribute: "semester_end_infra" },
    { id: 4, question: "Rate your experience on Extra-curriculars",
      options: ["Events Organised in Campus", "Ace Academy", "Industry Visits", "Clubs"],
      event_name: "sem_end_ec_experience_captured", attribute: "semester_end_ec" },
    { id: 5, question: "Rate your experience on Placements and Internships",
      options: ["Job Profiles", "Company Brands", "CTC offered", "Placement Support"],
      event_name: "sem_end_placements_experience_captured", attribute: "semester_end_placements" },
    { id: 6, question: "Rate your experience on Problem Resolution",
      options: ["After-class availability", "Response Time", "Satisfactory Resolution", "Attentive and Considerate"],
      event_name: "sem_end_problem_resolution_captured", attribute: "semester_end_problem_resolution" }
  ];

  // Original rating colors / labels / icons (1..5)
  var STAR_COLORS = { 1: "#B90808", 2: "#FF6464", 3: "#FFC37D", 4: "#AFE75A", 5: "#68A906" };
  var RATING_META = {
    1: { value: "Very Poor !", icon: CDN + "very_poor1684746065563.svg" },
    2: { value: "Poor !", icon: CDN + "poor1684746065490.svg" },
    3: { value: "Average !", icon: CDN + "average_icon1684746065417.svg" },
    4: { value: "Good !", icon: CDN + "good1684746065347.svg" },
    5: { value: "Excellent!", icon: CDN + "excellent1684746065269.svg" }
  };

  /* ----------------------------------------------------------------
     STYLES — original campaign CSS (extracted from the React bundle),
     plus minimal additions for the no-FontAwesome stars and chips.
     ---------------------------------------------------------------- */
  var CSS = ":root{font-family:Public Sans,sans-serif;font-style:normal}" +
    /* --- cross-platform (Android WebView / iOS WKWebView) hardening --- */
    "*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}" +          // Android grey tap-flash
    "button{font-family:inherit;-webkit-appearance:none;appearance:none}" +       // iOS buttons don't inherit font + get system styling
    "button,.review-tags span,.start-icon{touch-action:manipulation;" +           // kill 300ms delay + double-tap zoom on rapid star taps
    "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}" +     // no text-select / long-press callout on controls

    ".mrg-t-20-b-50{margin-top:20px;margin-bottom:50px}" +
    ".close-button{display:flex;justify-content:flex-end}" +
    ".close-button img{margin-bottom:15px;margin-right:10px}" +
    ".heading-contaner{text-align:center;color:#0c0c0cb3;padding-bottom:10px}" +
    ".wraper-container{position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;overflow:hidden}" +
    ".wrapper-overlay{position:absolute;top:0;left:0;width:100%;height:100%;z-index:9;overflow:auto;background:rgba(0,0,0,.7)}" +
    ".content-container{width:100%;position:absolute;bottom:0;z-index:99;transition:bottom .9s cubic-bezier(.17,.04,.03,.94);" +
    "left:0;right:0;margin:0 auto;max-width:480px;" +                             // tablets: centered sheet, not full-bleed
    "max-height:92vh;overflow-y:auto;-webkit-overflow-scrolling:touch}" +         // small phones (SE etc): card scrolls instead of clipping

    ".close-anim{bottom:-80vh}" +
    ".start-feedback-container{background-color:#22366a}" +
    ".start-text-container{text-align:center;padding:20px 20px 55px}" +
    ".start-text-container h1{color:#fff;font-weight:700;font-size:24px;line-height:28px}" +
    ".start-text-container p{color:#dec79e;margin:20px;font-weight:600;font-size:16px;line-height:20px}" +
    ".start-text-container p:last-child{font-weight:700;font-size:20px;line-height:24px}" +
    ".start-button{background-color:#fff;width:100%;border:none;padding:10px;border-radius:4px;font-weight:600;color:#22366a;cursor:pointer}" +
    ".image-container{position:relative;overflow:hidden;max-height:32vh}" +          // cap the hero: image + text + Start must fit one screen
    ".image-container img{width:100%;max-height:32vh;object-fit:cover;object-position:center;display:block}" +
    ".start-text-container{padding-top:12px}" +
    ".inner-image-container{width:150%;height:100%;background:linear-gradient(360deg,rgba(145,200,239,.28) -7.09%,rgba(64,87,146,0) 73.58%);border-radius:100%;top:0;left:-25%;right:0;position:absolute}" +
    ".feedback-form-container{position:relative;background:#fff;padding:8px 20px 110px;border-radius:15px 8px 0 0}" +
    ".rating-container>p{font-weight:600;font-size:20px;line-height:24px;color:#0c0c0c;margin-top:30px}" +
    ".start-rating-container{display:flex;justify-content:space-evenly;width:90%;margin:25px 0}" +
    ".start-icon{font-size:35px;font-weight:400;cursor:pointer;margin:0 auto 0 0;background:none;border:none;line-height:1}" +
    ".feedback-rating-detail>div{margin-top:24px}" +
    ".emogi-container{display:flex;align-items:center}" +
    ".emogi-container span{font-weight:400;font-size:16px;color:#0c0c0cb3}" +
    ".emogi-container img{margin-left:13px;height:24px}" +
    ".chooese-one-more{margin-top:35px}" +
    ".chooese-one-more span{font-size:16px;color:#0c0c0c}" +
    ".chooese-one-more small{margin-left:8px;font-size:12px;font-weight:600;color:#0c0c0c66}" +
    ".review-tags{margin-top:16px}" +
    ".review-tags span{border-radius:4px;display:inline-block;padding:4px 8px;margin:0 10px 15px 0;background:#f5f6fa;color:#22366a;cursor:pointer;user-select:none}" +
    ".active{background-color:#22366a!important;color:#fff!important}" +
    ".navbar{text-align:center}" +
    ".btn-group{border-radius:1rem;display:flex;justify-content:space-between}" +
    ".btn-group__item{border:none;background-color:#fff;width:15%;border-bottom:5px solid rgba(12,12,12,.1)}" +
    ".activeTab{border-bottom:5px solid #22366a}" +
    ".success-container{background:#fff;padding:15px;border-radius:8px 8px 0 0;display:flex;justify-content:center;align-items:center;height:440px}" +
    ".success-text-container{text-align:center}" +
    ".success-text-container p{font-weight:400;font-size:16px;line-height:19px;color:#22366a}" +
    ".form-submitted{font-weight:700;font-size:20px;line-height:24px;color:#1f8b24;margin-top:32px}" +
    ".submit-button{position:absolute;width:calc(100% - 40px);height:44px;bottom:0;margin-bottom:50px;background:#22366a;border-radius:4px;color:#fff;border:none;padding:10px;cursor:pointer}" +
    ".submit-button{margin-bottom:calc(50px + env(safe-area-inset-bottom))}" +    // iPhone home-indicator clearance (older WebViews drop this line, keep 50px)
    ".submit-button:disabled{opacity:.7}" +
    ".start-text-container{padding-bottom:calc(55px + env(safe-area-inset-bottom))}" +
    ".not-rated{display:block;color:#0c0c0cb3;font-size:16px;margin-bottom:50px}" +
    ".anchor-container{display:flex;justify-content:center;margin-bottom:12px}" +
    ".close-anchor{display:inline-block;border:none;cursor:pointer;width:15%;height:4px;border-radius:10px;background:rgba(12,12,12,.2)}";

  /* ----------------------------------------------------------------
     LOGGING
     ---------------------------------------------------------------- */
  function mo() {
    return (typeof moengage !== "undefined" && moengage) ? moengage : null;
  }

  // --- MoEngage destination (null-guarded; never blocks the UI) ---
  function moTrackEvent(name, attrs) {
    var m = mo();
    if (!m || !m.trackEvent) return;
    try { m.trackEvent(name, attrs, {}, {}, false, true); } catch (e) {}
  }
  function moSetAttr(name, value) {
    var m = mo();
    if (!m || !m.setUserAttribute) return;
    try { m.setUserAttribute(name, value); } catch (e) {}
  }
  function moTrackClick() {
    var m = mo();
    if (!m || !m.trackClick) return;
    try { m.trackClick(); } catch (e) {}
  }

  // --- Google Sheet destination ---
  // type: "shown" | "started" | "answer" | "dismissed"
  function postSheet(type, extra) {
    if (!WEBHOOK || WEBHOOK.indexOf("PASTE_") === 0) return;
    var payload = { type: type, user_id: USER_ID, term: TERM, client_ts: new Date().toISOString() };
    if (extra) for (var k in extra) payload[k] = extra[k];
    var body = JSON.stringify(payload);
    try {
      // text/plain → no CORS preflight (Apps Script can't answer OPTIONS).
      // keepalive → request survives the popup closing right after.
      fetch(WEBHOOK, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body
      });
    } catch (e) {
      try { if (navigator.sendBeacon) navigator.sendBeacon(WEBHOOK, body); } catch (e2) {}
    }
  }

  // Milestone: form rendered (impression). NR -> 0 in the Sheet;
  // sem8_form_shown powers the "not reached" derived segment in MoEngage.
  function logShown() {
    moSetAttr(TERM + "_form_shown", true);
    moTrackEvent("sem_end_feedback_shown", { term: TERM, user_id: USER_ID });
    postSheet("shown");
  }

  // Milestone: Start tapped.
  function logStarted() {
    moTrackClick();
    moTrackEvent("sem_end_feedback_start", { term: TERM, user_id: USER_ID });
    postSheet("started");
  }

  // Milestone: a question answered (every Next/Submit click).
  function logAnswer(q, rating, review, isFinal) {
    moTrackClick();
    moTrackEvent(q.event_name, {
      rating: rating,
      review: review.join(","),
      question_id: q.id,
      question: q.question,
      term: TERM,
      user_id: USER_ID
    });
    moSetAttr(q.attribute + "_rating", rating);
    moSetAttr(q.attribute + "_review", review.join(","));
    if (isFinal) {
      moTrackEvent("semester_feedback_submitted", { term: TERM, user_id: USER_ID });
    }
    postSheet("answer", {
      question_id: q.id,
      question: q.question,
      attribute: q.attribute,
      rating: rating,
      review: review,
      event_name: q.event_name,
      is_final: !!isFinal
    });
  }

  // Milestone: dismissed via close anchor (no Sheet write — status is derived).
  function logDismissed() {
    var m = mo();
    if (m && m.trackDismiss) { try { m.trackDismiss(); } catch (e) {} }
  }

  /* ----------------------------------------------------------------
     STATE  (single source of truth — this is what killed bug #1)
     ---------------------------------------------------------------- */
  var state = {
    step: "START",   // START | RATING | SUCCESS
    index: 0,        // current question (0-based)
    rating: 0,       // current question's stars — written by star click
    review: []       // current question's selected tags
  };

  /* ----------------------------------------------------------------
     DOM helpers
     ---------------------------------------------------------------- */
  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ----------------------------------------------------------------
     SCREENS
     ---------------------------------------------------------------- */
  var root, card, screen;

  function renderStart() {
    screen.innerHTML = "";

    // close (X) above the card — same as original
    var closeRow = el("div", "close-button");
    var closeImg = el("img");
    closeImg.src = CLOSE_ICON;
    closeImg.alt = "close";
    closeImg.style.cursor = "pointer";
    closeImg.onclick = function () { logDismissed(); closeWidget(); };
    closeRow.appendChild(closeImg);
    screen.appendChild(closeRow);

    // original structure: navy container > hero GIF with gradient glow > text > Start
    var box = el("div", "start-feedback-container");

    var imageWrap = el("div", "image-container");
    imageWrap.appendChild(el("div", "inner-image-container"));
    var gif = el("img");
    gif.src = CDN + "animation1684738499182.gif";
    gif.alt = "feedback gif";
    gif.onerror = function () { imageWrap.style.display = "none"; };
    imageWrap.appendChild(gif);
    box.appendChild(imageWrap);

    var textWrap = el("div", "start-text-container");
    textWrap.appendChild(el("div", null,
      "<h1>" + escapeHtml(START_TITLE) + "</h1>" +
      "<p>" + escapeHtml(START_LINE1) + "</p>" +
      "<p>" + escapeHtml(START_LINE2) + "</p>"));
    var btn = el("button", "start-button", "Start");
    btn.onclick = function () {
      if (btn.disabled) return;          // double-tap guard
      btn.disabled = true;
      logStarted();
      state.step = "RATING";
      render();
    };
    textWrap.appendChild(btn);
    box.appendChild(textWrap);

    screen.appendChild(box);
  }

  function renderQuestion() {
    var q = QUESTIONS[state.index];
    screen.innerHTML = "";

    var form = el("div", "feedback-form-container");

    // drag anchor + close
    var anchor = el("div", "anchor-container");
    var closer = el("button", "close-anchor");
    closer.setAttribute("aria-label", "Close");
    closer.onclick = function () { logDismissed(); closeWidget(); };
    anchor.appendChild(closer);
    form.appendChild(anchor);

    form.appendChild(el("div", "heading-contaner", "<span>Semester Feedback Form</span>"));

    // progress tabs
    var nav = el("nav", "navbar");
    var group = el("div", "btn-group");
    for (var i = 0; i < QUESTIONS.length; i++) {
      group.appendChild(el("div", "btn-group__item" + (i <= state.index ? " activeTab" : "")));
    }
    nav.appendChild(group);
    form.appendChild(nav);

    var container = el("div", "rating-container");
    container.appendChild(el("p", null, escapeHtml(q.question)));

    // stars — BUG FIX #1: writing state.rating directly; the same object
    // is read at log time. No shadow copy that can go stale.
    var starRow = el("div", "start-rating-container");
    for (var v = 1; v <= 5; v++) {
      (function (val) {
        var filled = state.rating >= val;
        var star = el("button", "start-icon", filled ? "&#9733;" : "&#9734;");
        star.style.color = filled ? STAR_COLORS[state.rating] : "rgba(12,12,12,.2)";
        star.onclick = function () {
          state.rating = val;
          render();
        };
        starRow.appendChild(star);
      })(v);
    }
    container.appendChild(starRow);

    var detail = el("div", "mrg-t-20-b-50");
    if (state.rating > 0) {
      var meta = RATING_META[state.rating];
      var d = el("div", "feedback-rating-detail");
      d.appendChild(el("div", "emogi-container",
        "<span>" + escapeHtml(meta.value) + "</span>" +
        '<img src="' + meta.icon + '" alt="" onerror="this.style.display=\'none\'">'));

      var choose = el("div", "chooese-one-more",
        "<span><strong>" + (state.rating >= 4 ? "What did you like?" : "What did you not like?") +
        "</strong><small>Choose one or more</small></span>");
      var tags = el("div", "review-tags");
      q.options.forEach(function (opt) {
        var selected = state.review.indexOf(opt) !== -1;
        var tag = el("span", selected ? "active" : null, escapeHtml(opt));
        tag.onclick = function () {
          var idx = state.review.indexOf(opt);
          if (idx === -1) state.review.push(opt); else state.review.splice(idx, 1);
          render();
        };
        tags.appendChild(tag);
      });
      choose.appendChild(tags);
      d.appendChild(choose);
      detail.appendChild(d);

      var isFinal = state.index === QUESTIONS.length - 1;
      var submit = el("button", "submit-button", isFinal ? "Submit" : "Next");
      submit.onclick = function () {
        if (submit.disabled) return;     // double-tap guard: one click = one log
        submit.disabled = true;
        // logs rating + review TOGETHER, then advances
        logAnswer(q, state.rating, state.review.slice(), isFinal);
        if (isFinal) {
          state.step = "SUCCESS";
        } else {
          state.index += 1;
          state.rating = 0;
          state.review = [];
        }
        render();
      };
      form.appendChild(submit);
    } else {
      detail.appendChild(el("span", "not-rated", "Not rated"));
    }
    container.appendChild(detail);
    form.appendChild(container);
    screen.appendChild(form);
  }

  function renderSuccess() {
    screen.innerHTML = "";
    var box = el("div", "success-container");
    box.appendChild(el("div", "success-text-container",
      '<img src="' + CDN + 'success_icon1684746181291.svg" alt="" onerror="this.style.display=\'none\'">' +
      '<h3 class="form-submitted">Feedback Submitted</h3>' +
      "<p>All the best for your next semester</p>"));
    screen.appendChild(box);
    setTimeout(closeWidget, 2500);
  }

  function render() {
    if (state.step === "START") renderStart();
    else if (state.step === "RATING") renderQuestion();
    else renderSuccess();
  }

  function closeWidget() {
    card.className = "content-container close-anim";
    setTimeout(function () {
      root.style.display = "none";
      var m = mo();
      if (m && m.dismissMessage) { try { m.dismissMessage(); } catch (e) {} }
    }, 900);
  }

  /* ----------------------------------------------------------------
     BOOT
     ---------------------------------------------------------------- */
  function boot() {
    var mount = document.getElementById("root");
    if (!mount) return;

    var style = document.createElement("style");
    style.appendChild(document.createTextNode(CSS));
    document.head.appendChild(style);

    root = el("section", "wraper-container");
    root.appendChild(el("section", "wrapper-overlay"));
    card = el("section", "content-container");
    screen = el("div");
    card.appendChild(screen);
    root.appendChild(card);
    mount.appendChild(root);

    render();
    logShown();   // impression: NR -> 0, sets <term>_form_shown in MoEngage
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
