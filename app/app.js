(() => {
  "use strict";

  const STORE_KEY = "samwise-garden-v1";
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const REGIONS = { perth: "Perth, WA", north: "Northern hemisphere (temperate)", south: "Southern hemisphere (temperate)" };

  // ---------- state ----------
  function normalizeSettings(s) {
    return {
      region: REGIONS[s?.region] ? s.region : "perth",
      sprinklerDays: Array.isArray(s?.sprinklerDays) ? s.sprinklerDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.garden) { s.settings = normalizeSettings(s.settings); return s; }
    } catch {}
    return { settings: normalizeSettings(), garden: [], tasks: [], journal: [] };
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { toast("Couldn't save — storage is unavailable"); }
  }

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const parse = (iso) => new Date(iso + "T00:00:00");
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtDate = (iso) => parse(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: parse(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  const plantById = (id) => PLANTS.find((p) => p.id === id);
  const isPerth = () => state.settings.region === "perth";
  const shiftMonth = (m) => state.settings.region === "south" ? ((m + 5) % 12) + 1 : m;
  const sowMonths = (p) => isPerth() ? p.perth.sow : p.sow.map(shiftMonth);
  const harvestMonths = (p) => isPerth() ? p.perth.harvest : p.harvest.map(shiftMonth);
  const currentMonth = () => new Date().getMonth() + 1;
  // Perth summers dry pots and sandy beds out fast; winter rain does much of the work.
  function suggestWater(p) {
    if (!isPerth()) return p.water;
    const m = currentMonth();
    if ([12, 1, 2].includes(m)) return Math.max(1, Math.ceil(p.water / 2));
    if ([6, 7, 8].includes(m)) return p.water * 2;
    return p.water;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- derived plant info ----------
  function info(gp) {
    const lib = plantById(gp.plantId);
    const today = todayISO();
    const nextWater = addDays(gp.lastWatered || gp.plantedOn, gp.waterEvery);
    const waterIn = daysBetween(today, nextWater);
    const days = lib?.days;
    const harvestOn = days ? addDays(gp.plantedOn, days) : null;
    const age = Math.max(0, daysBetween(gp.plantedOn, today));
    const progress = days ? Math.min(100, Math.round((age / days) * 100)) : null;
    return { lib, emoji: lib?.emoji || "🌱", nextWater, waterIn, harvestOn, harvestIn: harvestOn ? daysBetween(today, harvestOn) : null, age, progress };
  }
  function waterLabel(n) {
    if (n < 0) return `<span class="pill bad">Overdue ${plural(-n, "day")}</span>`;
    if (n === 0) return `<span class="pill warn">Water today</span>`;
    if (n === 1) return `<span class="pill">Water tomorrow</span>`;
    return `<span class="pill ok">Water in ${n} days</span>`;
  }

  // ---------- views ----------
  let tab = "today";
  const libFilter = { q: "", cat: "All" };
  let calMine = false;

  const views = {
    today() {
      const t = todayISO();
      const growing = state.garden.filter((g) => !g.harvested);
      const thirsty = growing.map((g) => ({ g, i: info(g) })).filter((x) => x.i.waterIn <= 0).sort((a, b) => a.i.waterIn - b.i.waterIn);
      const harvestSoon = growing.map((g) => ({ g, i: info(g) })).filter((x) => x.i.harvestIn !== null && x.i.harvestIn <= 14).sort((a, b) => a.i.harvestIn - b.i.harvestIn);
      const m = currentMonth();
      const sowNow = PLANTS.filter((p) => sowMonths(p).includes(m));
      const tasks = [...state.tasks].sort((a, b) => (a.done - b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
      const hour = new Date().getHours();
      const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

      return `
        <section class="hero">
          <h1>${hello}, gardener 🌤️</h1>
          <p>${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          <div class="stats">
            <div><b>${growing.length}</b><span>growing</span></div>
            <div><b>${thirsty.length}</b><span>need water</span></div>
            <div><b>${state.tasks.filter((x) => !x.done).length}</b><span>jobs to do</span></div>
          </div>
        </section>

        ${isPerth() ? perthCard(m) : ""}

        <section class="card">
          <div class="card-head"><h2>💧 Needs watering</h2>
            ${thirsty.length > 1 ? `<button class="btn small" data-action="water-all">Water all</button>` : ""}</div>
          ${thirsty.length ? `<ul class="list">${thirsty.map(({ g, i }) => `
            <li><span class="emoji">${i.emoji}</span>
              <div class="grow"><b>${esc(g.name)}</b>${g.location ? `<small>${esc(g.location)}</small>` : ""}</div>
              ${waterLabel(i.waterIn)}
              <button class="btn small" data-action="water" data-id="${g.id}">Water</button></li>`).join("")}</ul>`
            : `<p class="empty">${growing.length ? "Everything's had a drink. Nice work! 🎉" : "Add plants in <b>My Garden</b> to get watering reminders."}</p>`}
        </section>

        ${harvestSoon.length ? `<section class="card">
          <h2>🧺 Ready to harvest soon</h2>
          <ul class="list">${harvestSoon.map(({ g, i }) => `
            <li><span class="emoji">${i.emoji}</span>
              <div class="grow"><b>${esc(g.name)}</b><small>${i.harvestIn <= 0 ? "Ready now (estimated)" : `In about ${plural(i.harvestIn, "day")}`}</small></div>
              <button class="btn small" data-action="harvest" data-id="${g.id}">Harvested</button></li>`).join("")}</ul>
        </section>` : ""}

        <section class="card">
          <h2>✅ Garden jobs</h2>
          <form class="inline-form" data-form="task">
            <input name="text" placeholder="e.g. Mulch the tomatoes" required maxlength="120">
            <input name="due" type="date" value="${t}" aria-label="Due date">
            <button class="btn">Add</button>
          </form>
          ${tasks.length ? `<ul class="list tasks">${tasks.map((k) => `
            <li class="${k.done ? "done" : ""}">
              <input type="checkbox" ${k.done ? "checked" : ""} data-action="toggle-task" data-id="${k.id}" aria-label="Done">
              <div class="grow"><span>${esc(k.text)}</span>${k.due ? `<small class="${!k.done && k.due < t ? "overdue" : ""}">${k.due === t ? "Today" : fmtDate(k.due)}</small>` : ""}</div>
              <button class="icon-btn" data-action="del-task" data-id="${k.id}" aria-label="Delete">✕</button></li>`).join("")}</ul>`
            : `<p class="empty">No jobs yet.</p>`}
          ${state.tasks.some((k) => k.done) ? `<button class="link" data-action="clear-done">Clear completed</button>` : ""}
        </section>

        <section class="card">
          <h2>🌱 Good to sow in ${MONTHS[m - 1]}</h2>
          <div class="chips">${sowNow.map((p) => `<button class="chip" data-action="show-plant" data-id="${p.id}">${p.emoji} ${esc(p.name)}</button>`).join("") || `<p class="empty">A quiet month — plan, prune and tidy.</p>`}</div>
        </section>`;
    },

    garden() {
      const growing = state.garden.filter((g) => !g.harvested);
      const done = state.garden.filter((g) => g.harvested);
      const card = (g) => {
        const i = info(g);
        return `<article class="plant-card ${g.harvested ? "harvested" : ""}">
          <div class="plant-top">
            <span class="emoji big">${i.emoji}</span>
            <div class="grow">
              <h3>${esc(g.name)}</h3>
              <small>${g.location ? esc(g.location) + " · " : ""}Planted ${fmtDate(g.plantedOn)} · ${plural(i.age, "day")} old</small>
            </div>
          </div>
          ${g.harvested ? `<p class="muted">Harvested ${fmtDate(g.harvested)}</p>` : `
            <div class="row">${waterLabel(i.waterIn)}${i.harvestOn ? `<span class="pill">🧺 ~${fmtDate(i.harvestOn)}</span>` : ""}</div>
            ${i.progress !== null ? `<div class="bar" title="${i.progress}% of the way to harvest"><div style="width:${i.progress}%"></div></div>` : ""}`}
          ${g.notes ? `<p class="notes">${esc(g.notes)}</p>` : ""}
          <div class="actions">
            ${g.harvested ? "" : `<button class="btn small" data-action="water" data-id="${g.id}">💧 Water</button>
            <button class="btn small ghost" data-action="harvest" data-id="${g.id}">🧺 Harvested</button>`}
            <button class="btn small ghost" data-action="edit-plant" data-id="${g.id}">Edit</button>
          </div>
        </article>`;
      };
      return `
        <div class="page-head"><h1>My Garden</h1><button class="btn" data-action="add-plant">+ Add plant</button></div>
        ${growing.length ? `<div class="grid">${growing.map(card).join("")}</div>`
          : `<div class="card empty-state"><div class="emoji huge">🪴</div><p>Your garden is empty.</p><button class="btn" data-action="add-plant">Add your first plant</button></div>`}
        ${done.length ? `<details class="past"><summary>Past harvests (${done.length})</summary><div class="grid">${done.map(card).join("")}</div></details>` : ""}`;
    },

    library() {
      const cats = ["All", ...new Set(PLANTS.map((p) => p.category))];
      const q = libFilter.q.trim().toLowerCase();
      const m = currentMonth();
      const list = PLANTS.filter((p) => (libFilter.cat === "All" || p.category === libFilter.cat) && (!q || p.name.toLowerCase().includes(q)));
      return `
        <div class="page-head"><h1>Plant Guide</h1></div>
        <div class="filters">
          <input type="search" placeholder="Search plants…" value="${esc(libFilter.q)}" data-input="lib-q" aria-label="Search plants">
          <div class="seg">${cats.map((c) => `<button class="${c === libFilter.cat ? "on" : ""}" data-action="lib-cat" data-cat="${c}">${c}</button>`).join("")}</div>
        </div>
        <div class="grid lib">${list.map((p) => `
          <button class="lib-card" data-action="show-plant" data-id="${p.id}">
            <span class="emoji big">${p.emoji}</span>
            <b>${esc(p.name)}</b>
            <small>${p.category} · ${p.sun}</small>
            ${sowMonths(p).includes(m) ? `<span class="pill ok">Sow now</span>` : harvestMonths(p).includes(m) ? `<span class="pill">In season</span>` : ""}
          </button>`).join("") || `<p class="empty">No plants match.</p>`}</div>`;
    },

    calendar() {
      const m = currentMonth();
      const mine = new Set(state.garden.filter((g) => !g.harvested).map((g) => g.plantId));
      const list = calMine ? PLANTS.filter((p) => mine.has(p.id)) : PLANTS;
      return `
        <div class="page-head"><h1>Planting Calendar</h1></div>
        <p class="muted">${isPerth()
          ? "Tailored for Perth's Mediterranean climate: hot, dry summers and mild, wet winters. The main planting seasons are autumn (Mar–May) and spring (Sep–Nov)."
          : `For a temperate ${state.settings.region === "south" ? "southern" : "northern"} hemisphere garden. Adjust a few weeks for your local frost dates.`}
          <button class="link" data-action="settings">Change location</button></p>
        <div class="row legend">
          <span><i class="sw sow"></i>Sow / plant</span><span><i class="sw harv"></i>Harvest</span><span><i class="sw both"></i>Both</span>
          <label class="toggle"><input type="checkbox" data-action="cal-mine" ${calMine ? "checked" : ""}> Only my plants</label>
        </div>
        <div class="cal-wrap"><table class="cal">
          <thead><tr><th></th>${MONTHS.map((n, i) => `<th class="${i + 1 === m ? "now" : ""}">${n[0]}<span>${n.slice(1)}</span></th>`).join("")}</tr></thead>
          <tbody>${list.map((p) => {
            const s = sowMonths(p), h = harvestMonths(p);
            return `<tr><th><button class="link" data-action="show-plant" data-id="${p.id}">${p.emoji} ${esc(p.name)}</button></th>${MONTHS.map((_, i) => {
              const mo = i + 1, a = s.includes(mo), b = h.includes(mo);
              return `<td class="${a && b ? "both" : a ? "sow" : b ? "harv" : ""} ${mo === m ? "now" : ""}"></td>`;
            }).join("")}</tr>`;
          }).join("") || `<tr><td colspan="13" class="empty">No plants in your garden yet.</td></tr>`}</tbody>
        </table></div>`;
    },

    journal() {
      const entries = [...state.journal].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
      return `
        <div class="page-head"><h1>Garden Journal</h1></div>
        <form class="card journal-form" data-form="journal">
          <textarea name="text" rows="3" placeholder="What happened in the garden today? First tomato flower? Slugs on the lettuce?" required maxlength="2000"></textarea>
          <div class="row">
            <input type="date" name="date" value="${todayISO()}" aria-label="Date">
            <select name="plant" aria-label="Related plant"><option value="">— no plant —</option>${state.garden.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select>
            <button class="btn">Save entry</button>
          </div>
        </form>
        ${entries.length ? entries.map((e) => {
          const g = state.garden.find((x) => x.id === e.plant);
          return `<article class="card entry">
            <div class="entry-head"><b>${fmtDate(e.date)}</b>${g ? `<span class="pill">${info(g).emoji} ${esc(g.name)}</span>` : ""}
              <button class="icon-btn" data-action="del-entry" data-id="${e.id}" aria-label="Delete entry">✕</button></div>
            <p>${esc(e.text).replace(/\n/g, "<br>")}</p></article>`;
        }).join("") : `<p class="empty">No entries yet. Notes now make next season easier!</p>`}`;
    },
  };

  function perthCard(m) {
    const days = state.settings.sprinklerDays;
    const dow = new Date().getDay();
    let sprinkler;
    if ([6, 7, 8].includes(m)) {
      sprinkler = "🚫 <b>Winter sprinkler switch-off</b> (1 Jun – 31 Aug). Hand water only if there's a dry spell.";
    } else if (!days.length) {
      sprinkler = `💦 <button class="link" data-action="settings">Set your sprinkler roster days</button> to get a reminder on the day.`;
    } else if (days.includes(dow)) {
      sprinkler = "💦 <b>Today is a sprinkler day.</b> Run them before 9am or after 6pm.";
    } else {
      const next = [1, 2, 3, 4, 5, 6, 7].map((n) => (dow + n) % 7).find((d) => days.includes(d));
      sprinkler = `💦 Next sprinkler day: <b>${new Date(Date.now() + (((next - dow + 7) % 7) * 86400000)).toLocaleDateString(undefined, { weekday: "long" })}</b>.`;
    }
    return `<section class="card perth">
      <h2>📍 Perth in ${new Date().toLocaleDateString(undefined, { month: "long" })}</h2>
      <p>${PERTH_MONTHS[m - 1]}</p>
      <p class="sprinkler">${sprinkler}</p>
    </section>`;
  }

  function render() {
    $("#place").textContent = isPerth() ? "Perth, WA" : "";
    $("#view").innerHTML = views[tab]();
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }
  function go(t) { tab = t; render(); window.scrollTo(0, 0); }

  // ---------- modals ----------
  const modal = $("#modal");
  function openModal(html) {
    $("#modalBody").innerHTML = `<button class="icon-btn close" data-action="close" aria-label="Close">✕</button>${html}`;
    if (!modal.open) modal.showModal();
  }
  function closeModal() { modal.close(); }
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  function showPlant(id) {
    const p = plantById(id);
    const monthList = (arr) => arr.slice().sort((a, b) => a - b).map((x) => MONTHS[x - 1]).join(", ");
    openModal(`
      <div class="detail-head"><span class="emoji huge">${p.emoji}</span><div><h2>${esc(p.name)}</h2><small>${p.category}</small></div></div>
      <dl class="facts">
        <div><dt>☀️ Sun</dt><dd>${p.sun}</dd></div>
        <div><dt>💧 Water</dt><dd>Every ${plural(suggestWater(p), "day")}${isPerth() && suggestWater(p) !== p.water ? " this season" : ""}</dd></div>
        <div><dt>📏 Spacing</dt><dd>${p.spacing} cm</dd></div>
        <div><dt>⏱️ To harvest</dt><dd>~${p.days} days</dd></div>
        <div><dt>🌱 Sow</dt><dd>${monthList(sowMonths(p))}</dd></div>
        <div><dt>🧺 Harvest</dt><dd>${monthList(harvestMonths(p))}</dd></div>
      </dl>
      <p>${esc(p.tips)}</p>
      ${isPerth() && p.perthTip ? `<p class="perth-tip">📍 <b>Perth:</b> ${esc(p.perthTip)}</p>` : ""}
      ${p.companions.length ? `<p><b>👍 Good neighbours:</b> ${p.companions.map(esc).join(", ")}</p>` : ""}
      ${p.avoid.length ? `<p><b>👎 Keep apart from:</b> ${p.avoid.map(esc).join(", ")}</p>` : ""}
      <button class="btn wide" data-action="add-plant" data-id="${p.id}">+ Add to my garden</button>`);
  }

  function plantForm(existing, presetId) {
    const g = existing || { plantId: presetId || "", name: presetId ? plantById(presetId).name : "", location: "", plantedOn: todayISO(), waterEvery: presetId ? suggestWater(plantById(presetId)) : 3, notes: "" };
    openModal(`
      <h2>${existing ? "Edit plant" : "Add a plant"}</h2>
      <form data-form="plant" data-id="${existing ? existing.id : ""}" class="stack">
        <label>Type of plant
          <select name="plantId" data-action="pick-type">
            <option value="">Other / custom</option>
            ${PLANTS.map((p) => `<option value="${p.id}" ${p.id === g.plantId ? "selected" : ""}>${p.emoji} ${esc(p.name)}</option>`).join("")}
          </select></label>
        <label>Name <input name="name" required maxlength="60" value="${esc(g.name)}" placeholder="e.g. Cherry tomatoes"></label>
        <label>Where is it? <input name="location" maxlength="60" value="${esc(g.location)}" placeholder="e.g. Back bed, balcony pot"></label>
        <div class="two">
          <label>Planted on <input type="date" name="plantedOn" required value="${g.plantedOn}" max="${todayISO()}"></label>
          <label>Water every (days) <input type="number" name="waterEvery" min="1" max="60" required value="${g.waterEvery}"></label>
        </div>
        <label>Notes <textarea name="notes" rows="2" maxlength="500">${esc(g.notes)}</textarea></label>
        <button class="btn wide">${existing ? "Save changes" : "Add to garden"}</button>
        ${existing ? `<button type="button" class="btn wide danger" data-action="del-plant" data-id="${existing.id}">Remove plant</button>` : ""}
      </form>`);
  }

  function settings() {
    openModal(`
      <h2>Settings</h2>
      <div class="stack">
        <label>Location (sets the planting calendar)
          <select data-action="region">
            ${Object.entries(REGIONS).map(([k, v]) => `<option value="${k}" ${state.settings.region === k ? "selected" : ""}>${v}</option>`).join("")}
          </select></label>
        ${isPerth() ? `<fieldset class="days"><legend>My sprinkler roster days</legend>
          <div class="seg">${WEEKDAYS.map((d, i) => `<label><input type="checkbox" data-action="sprinkler-day" data-day="${i}" ${state.settings.sprinklerDays.includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div>
          <small>Your days depend on your house number. Look them up on the <a href="https://www.watercorporation.com.au" target="_blank" rel="noopener">Water Corporation</a> website. Hand watering is allowed any day.</small>
        </fieldset>` : ""}
        <p class="muted">Your garden is saved in this browser only. Export a backup to move it to another device.</p>
        <button class="btn wide" data-action="export">⬇️ Export backup</button>
        <label class="btn wide ghost file">⬆️ Import backup<input type="file" accept="application/json,.json" data-action="import" hidden></label>
        <button class="btn wide danger" data-action="reset">Delete all data</button>
      </div>`);
  }

  // ---------- actions ----------
  function water(id) {
    const g = state.garden.find((x) => x.id === id);
    if (g) { g.lastWatered = todayISO(); save(); toast(`💧 Watered ${g.name}`); }
  }

  const actions = {
    water: (el) => { water(el.dataset.id); render(); },
    "water-all": () => {
      state.garden.filter((g) => !g.harvested && info(g).waterIn <= 0).forEach((g) => { g.lastWatered = todayISO(); });
      save(); render(); toast("💧 All watered");
    },
    harvest: (el) => {
      const g = state.garden.find((x) => x.id === el.dataset.id);
      if (!g) return;
      g.harvested = todayISO(); save(); render(); toast(`🧺 Enjoy your ${g.name}!`);
    },
    "add-plant": (el) => plantForm(null, el.dataset.id),
    "edit-plant": (el) => plantForm(state.garden.find((x) => x.id === el.dataset.id)),
    "del-plant": (el) => {
      if (!confirm("Remove this plant from your garden?")) return;
      state.garden = state.garden.filter((x) => x.id !== el.dataset.id);
      save(); closeModal(); render();
    },
    "show-plant": (el) => showPlant(el.dataset.id),
    "toggle-task": (el) => {
      const k = state.tasks.find((x) => x.id === el.dataset.id);
      if (k) { k.done = !k.done; save(); render(); }
    },
    "del-task": (el) => { state.tasks = state.tasks.filter((x) => x.id !== el.dataset.id); save(); render(); },
    "clear-done": () => { state.tasks = state.tasks.filter((x) => !x.done); save(); render(); },
    "del-entry": (el) => {
      if (!confirm("Delete this journal entry?")) return;
      state.journal = state.journal.filter((x) => x.id !== el.dataset.id); save(); render();
    },
    "lib-cat": (el) => { libFilter.cat = el.dataset.cat; render(); },
    "cal-mine": (el) => { calMine = el.checked; render(); },
    settings: () => settings(),
    close: () => closeModal(),
    export: () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `samwise-garden-${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    reset: () => {
      if (!confirm("Delete ALL plants, jobs and journal entries? This can't be undone.")) return;
      state = { settings: state.settings, garden: [], tasks: [], journal: [] };
      save(); closeModal(); render(); toast("Garden cleared");
    },
  };

  function onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "button")) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el); }
  }
  function onChange(e) {
    const el = e.target;
    const a = el.dataset.action;
    if (a === "toggle-task" || a === "cal-mine") actions[a](el);
    else if (a === "region") { state.settings.region = el.value; save(); render(); settings(); toast("Calendar updated"); }
    else if (a === "sprinkler-day") {
      const d = Number(el.dataset.day), days = state.settings.sprinklerDays;
      state.settings.sprinklerDays = el.checked ? [...new Set([...days, d])].sort() : days.filter((x) => x !== d);
      save(); render();
    }
    else if (a === "pick-type") {
      const p = plantById(el.value), f = el.form;
      if (p) { if (!f.name.value || PLANTS.some((x) => x.name === f.name.value)) f.name.value = p.name; f.waterEvery.value = suggestWater(p); }
    } else if (a === "import" && el.files[0]) {
      el.files[0].text().then((txt) => {
        const data = JSON.parse(txt);
        if (!Array.isArray(data.garden) || !Array.isArray(data.tasks) || !Array.isArray(data.journal)) throw new Error("bad file");
        state = { settings: normalizeSettings(data.settings), garden: data.garden, tasks: data.tasks, journal: data.journal };
        save(); closeModal(); render(); toast("Backup restored 🌿");
      }).catch(() => toast("That doesn't look like a garden backup"));
    }
  }
  function onInput(e) {
    if (e.target.dataset.input === "lib-q") {
      libFilter.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const s = $('[data-input="lib-q"]'); s.focus(); s.setSelectionRange(pos, pos);
    }
  }
  function onSubmit(e) {
    const f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (f.dataset.form === "task") {
      state.tasks.push({ id: uid(), text: d.text.trim(), due: d.due || "", done: false });
    } else if (f.dataset.form === "journal") {
      state.journal.push({ id: uid(), date: d.date || todayISO(), text: d.text.trim(), plant: d.plant || "", created: Date.now() });
      toast("📓 Entry saved");
    } else if (f.dataset.form === "plant") {
      const fields = { plantId: d.plantId, name: d.name.trim(), location: d.location.trim(), plantedOn: d.plantedOn, waterEvery: Math.max(1, parseInt(d.waterEvery, 10) || 3), notes: d.notes.trim() };
      const existing = state.garden.find((x) => x.id === f.dataset.id);
      if (existing) Object.assign(existing, fields);
      else { state.garden.push({ id: uid(), ...fields, lastWatered: todayISO(), harvested: "" }); toast(`🌱 ${fields.name} planted`); }
      closeModal();
      if (!existing && tab !== "garden") { save(); go("garden"); return; }
    }
    save(); render();
  }

  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("submit", onSubmit);
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  $("#settingsBtn").addEventListener("click", settings);

  render();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
