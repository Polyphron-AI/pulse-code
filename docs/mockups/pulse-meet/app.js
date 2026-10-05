// Mockup interactions only. No real audio, storage, or network.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const icon = (id) => `<svg><use href="#${id}"/></svg>`;

// Header recorder on the Meetings list: idle -> starting -> recording -> saving -> idle.
const slot = $("[data-recorder]");
let timer = null;
function renderRecorder(phase, segments = 0) {
  clearInterval(timer);
  if (phase === "idle") {
    slot.innerHTML = `<button class="btn">${icon("i-mic")}Record meeting</button>`;
    slot.firstChild.onclick = () => {
      renderRecorder("starting");
      setTimeout(() => renderRecorder("recording", 0), 700);
    };
  } else if (phase === "starting") {
    slot.innerHTML = `<button class="btn" disabled>${icon("i-mic")}Starting…</button>`;
  } else if (phase === "recording") {
    slot.innerHTML = `<span style="display:flex;gap:10px;align-items:center"><span class="status"><span class="rec-dot"></span><span data-count>Recording · ${segments} segments</span></span><button class="btn danger">${icon("i-square")}Stop</button></span>`;
    let n = segments;
    timer = setInterval(() => ($("[data-count]", slot).textContent = `Recording · ${++n} segments`), 1500);
    $("button", slot).onclick = () => {
      renderRecorder("saving");
      setTimeout(() => renderRecorder("idle"), 1200);
    };
  } else if (phase === "saving") {
    slot.innerHTML = `<span style="display:flex;gap:10px;align-items:center"><span class="status">Saving…</span><button class="btn danger" disabled>${icon("i-square")}Stop</button></span>`;
  }
}
if (slot) renderRecorder("idle");

// Dialogs on the meeting detail.
$$("[data-open]").forEach((b) => (b.onclick = () => ($("#" + b.dataset.open).hidden = false)));
$$("[data-close]").forEach((b) => (b.onclick = () => (b.closest(".modal-wrap").hidden = true)));

// Settings checkboxes that reveal their options.
$$("[data-toggle]").forEach((c) => {
  const sync = () => ($("#" + c.dataset.toggle).hidden = !c.checked);
  c.onchange = sync;
  sync();
});

// Voice pill states.
const pill = $("#pill-el");
const pillLabel = $("#pill-label");
const npInsert = $("#np-insert");
$$("[data-pill]").forEach((b) => {
  b.onclick = () => {
    const s = b.dataset.pill;
    if (s === "pasted") {
      pill.hidden = true;
      npInsert.textContent = "- Send Sam the rollout plan by Friday. ";
      return;
    }
    pill.hidden = false;
    pill.className = "pill " + s;
    pillLabel.textContent =
      s === "recording" ? "Listening" : s === "transcribing" ? "Transcribing" : "Microphone unavailable";
  };
});

// Composer microphone: record, then the text lands in the composer for review.
const dictate = $("[data-dictate]");
const composerText = $("#composer-text");
if (dictate) {
  let on = false;
  dictate.onclick = () => {
    on = !on;
    if (on) {
      dictate.innerHTML = icon("i-square");
      dictate.classList.add("danger");
      composerText.textContent = "Recording… click again to stop";
    } else {
      dictate.innerHTML = icon("i-mic");
      dictate.classList.remove("danger");
      composerText.style.color = "var(--text)";
      composerText.textContent =
        "Also check what happens when the focused window spans both monitors.";
    }
  };
}

// Dictation history: filter by chat or app, plus search.
const filters = $("[data-filters]");
const list = $("[data-list]");
const search = $("[data-search]");
let filter = "all";
function applyHistory() {
  const q = (search?.value || "").toLowerCase();
  let shown = 0;
  $$(".dict", list).forEach((d) => {
    const ok = (filter === "all" || d.dataset.k === filter) && d.textContent.toLowerCase().includes(q);
    d.hidden = !ok;
    if (ok) shown++;
  });
  // Hide day headings with no visible entries under them.
  $$(".day", list).forEach((h) => {
    let el = h.nextElementSibling;
    let any = false;
    while (el && el.classList.contains("dict")) {
      if (!el.hidden) any = true;
      el = el.nextElementSibling;
    }
    h.hidden = !any;
  });
  $("[data-empty]", list).hidden = shown > 0;
}
if (filters) {
  $$("button", filters).forEach((b) => {
    b.onclick = () => {
      $$("button", filters).forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      filter = b.dataset.filter;
      applyHistory();
    };
  });
  search.oninput = applyHistory;
  $$(".dict-actions .btn", list).forEach((b) => {
    if (b.textContent.trim() === "Copy") {
      b.onclick = () => {
        const old = b.innerHTML;
        b.textContent = "Copied";
        setTimeout(() => (b.innerHTML = old), 1000);
      };
    }
    if (b.getAttribute("aria-label") === "Delete") {
      b.onclick = () => {
        b.closest(".dict").remove();
        applyHistory();
      };
    }
  });
}
