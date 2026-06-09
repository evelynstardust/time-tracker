
src/con.STORAGE_KEY = "showclock.polished.v1";

const GROUPS = [
  "House/SM/LD",
  "Rigging",
  "Forks",
  "Loaders",
  "Stagehands",
  "Show Call",
  "Load Out",
  "Other"
];

const blankState = {
  show: {
    name: "Blank Show",
    venue: "",
    date: "",
    employer: "",
    notes: ""
  },
  rows: []
};

const demoRows = [
  ["Alex Rivera", "Stage Manager", "08:00 am", "House/SM/LD"],
  ["Jamie Cole", "LD", "08:00 am", "House/SM/LD"],
  ["Sam Miller", "Fork Op", "08:45 am", "Forks"],
  ["Taylor Green", "Loader", "08:45 am", "Loaders"],
  ["Morgan Lee", "Stagehand Grip", "08:45 am", "Stagehands"],
  ["Jordan Kim", "Stagehand Grip", "06:00 pm", "Show Call"],
  ["Taylor Green", "Loader", "09:30 pm", "Load Out"],
  ["Morgan Lee", "Stagehand Grip", "09:30 pm", "Load Out"]
];

let state = loadState();
let activeGroup = "All";
let searchTerm = "";
let sortMode = "call";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const els = {
  showLine: $("#showLine"),
  clock: $("#clock"),
  visibleCount: $("#visibleCount"),
  selectedCount: $("#selectedCount"),
  crewHours: $("#crewHours"),
  flagCount: $("#flagCount"),
  searchInput: $("#searchInput"),
  sortSelect: $("#sortSelect"),
  nextDue: $("#nextDue"),
  groupTabs: $("#groupTabs"),
  crewGrid: $("#crewGrid"),
  bulkStatus: $("#bulkStatus"),
  toolsModal: $("#toolsModal"),
  showModal: $("#showModal"),
  template: $("#crewCardTemplate"),
  newGroup: $("#newGroup"),
  newName: $("#newName"),
  newPosition: $("#newPosition"),
  newCall: $("#newCall"),
  bulkNote: $("#bulkNote"),
  showName: $("#showName"),
  showVenue: $("#showVenue"),
  showDate: $("#showDate"),
  showEmployer: $("#showEmployer"),
  showNotes: $("#showNotes")
};

boot();

function boot() {
  normalizeState();
  markLikelyAllDayHands();
  populateGroups();
  bindEvents();
  render();
  updateClock();
  setInterval(() => {
    updateClock();
    render();
    runReminderChecks();
  }, 60000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function bindEvents() {
  $("#quickBreak").addEventListener("click", () => bulkBreak(15));
  $("#quickLunch").addEventListener("click", bulkLunch);
  $("#quickCheck").addEventListener("click", bulkCheckIn);
  $("#quickAllDay").addEventListener("click", selectAllDayHands);

  $("#selectVisible").addEventListener("click", selectVisible);
  $("#bulkBreak").addEventListener("click", () => bulkBreak(15));
  $("#bulkOut").addEventListener("click", bulkClockOut);
  $("#openTools").addEventListener("click", () => els.toolsModal.showModal());

  $("#enableNotifications").addEventListener("click", requestNotifications);
  $("#editShow").addEventListener("click", openShowModal);
  $("#newShow").addEventListener("click", newShow);
  $("#selectAllDay").addEventListener("click", selectAllDayHands);
  $("#clearSelection").addEventListener("click", clearSelection);
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#copySummary").addEventListener("click", copySummary);
  $("#importCsv").addEventListener("click", importCsvPrompt);
  $("#loadDemo").addEventListener("click", loadDemo);
  $("#clearData").addEventListener("click", clearData);
  $("#addCrew").addEventListener("click", addCrew);
  $("#addBulkNote").addEventListener("click", addBulkNote);
  $("#saveShow").addEventListener("click", saveShow);

  els.searchInput.addEventListener("input", event => {
    searchTerm = event.target.value;
    render();
  });

  els.sortSelect.addEventListener("change", event => {
    sortMode = event.target.value;
    render();
  });
}

function populateGroups() {
  els.newGroup.innerHTML = GROUPS.map(group => `<option>${escapeHtml(group)}</option>`).join("");
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(blankState);
  } catch {
    return structuredClone(blankState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeState() {
  state.show = { ...blankState.show, ...(state.show || {}) };
  state.rows = Array.isArray(state.rows) ? state.rows : [];
  state.rows.forEach(row => {
    row.id ??= nextId();
    row.name ??= "";
    row.position ??= "";
    row.group ??= inferGroup(row.position, row.scheduledIn);
    row.scheduledIn ??= "";
    row.actualIn ??= row.scheduledIn || "";
    row.actualOut ??= "";
    row.breakMin = Number(row.breakMin || 0);
    row.lunchTaken = Boolean(row.lunchTaken);
    row.allDayHand = Boolean(row.allDayHand);
    row.lastCheckIn ??= "";
    row.notes ??= "";
    row.selected = Boolean(row.selected);
    row.reminded ??= {};
  });
}

function nextId() {
  return state.rows.length ? Math.max(...state.rows.map(row => Number(row.id) || 0)) + 1 : 1;
}

function inferGroup(position = "", callTime = "") {
  const p = String(position).toLowerCase();
  if (p.includes("stage manager") || p === "sm" || p.includes("ld")) return "House/SM/LD";
  if (p.includes("rigger") || p.includes("rig")) return "Rigging";
  if (p.includes("fork")) return "Forks";
  if (p.includes("loader")) return "Loaders";
  if (String(callTime).trim().toLowerCase() === "06:00 pm") return "Show Call";
  if (String(callTime).trim().toLowerCase() === "09:30 pm") return "Load Out";
  return "Stagehands";
}

function parseTime(value) {
  if (!value) return null;
  const text = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const ampm = match[3];

  if (ampm === "pm" && hour !== 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function nowLabel() {
  const now = new Date();
  let hour = now.getHours();
  const minute = String(now.getMinutes()).padStart(2, "0");
  const ampm = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, "0")}:${minute} ${ampm}`;
}

function hoursFor(row) {
  const start = parseTime(row.actualIn);
  if (start === null) return 0;

  let end = parseTime(row.actualOut);
  if (end === null) end = nowMinutes();
  if (end < start) end += 1440;

  return Math.max(0, (end - start - Number(row.breakMin || 0)) / 60);
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markLikelyAllDayHands() {
  const grouped = new Map();

  state.rows.forEach(row => {
    const key = normalizeName(row.name);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  grouped.forEach(rows => {
    const times = rows.map(row => parseTime(row.scheduledIn)).filter(time => time !== null);
    const early = times.some(time => time <= parseTime("08:45 am"));
    const late = times.some(time => time >= parseTime("09:30 pm"));

    if (early && late) rows.forEach(row => row.allDayHand = true);
  });
}

function flagsFor(row) {
  const hours = hoursFor(row);
  const breakMin = Number(row.breakMin || 0);
  const flags = [];

  if (!row.actualOut) flags.push(["Open", "good"]);
  if (hours >= 2 && hours < 3 && breakMin < 15) flags.push(["15 due", "warn"]);
  if (hours >= 3 && breakMin < 15) flags.push(["15 missed", "bad"]);
  if (hours >= 4.5 && hours < 5 && !row.lunchTaken) flags.push(["Lunch soon", "warn"]);
  if (hours >= 5 && !row.lunchTaken) flags.push(["Lunch due", "bad"]);
  if (hours >= 8) flags.push(["8+", "warn"]);
  if (hours >= 10) flags.push(["10+", "warn"]);
  if (hours >= 12) flags.push(["12+", "bad"]);
  if (row.allDayHand) flags.push(["All-day", "allday"]);
  if (row.lastCheckIn) flags.push(["Checked", "good"]);

  return flags;
}

function rowSeverity(row) {
  const flags = flagsFor(row);
  if (flags.some(flag => flag[1] === "bad")) return "bad";
  if (flags.some(flag => flag[1] === "warn")) return "warn";
  return "";
}

function isActionFlagged(row) {
  return flagsFor(row).some(flag => flag[1] === "warn" || flag[1] === "bad");
}

function getVisibleRows() {
  const query = searchTerm.trim().toLowerCase();

  const rows = state.rows.filter(row => {
    const groupMatch = activeGroup === "All" || row.group === activeGroup;
    const text = [row.name, row.position, row.group, row.scheduledIn, row.actualIn, row.actualOut, row.notes]
      .join(" ")
      .toLowerCase();
    return groupMatch && text.includes(query);
  });

  rows.sort((a, b) => {
    if (sortMode === "name") return a.name.localeCompare(b.name);
    if (sortMode === "flags") return Number(isActionFlagged(b)) - Number(isActionFlagged(a)) || hoursFor(b) - hoursFor(a);
    if (sortMode === "open") return Number(!b.actualOut) - Number(!a.actualOut) || byCallThenName(a, b);
    if (sortMode === "allday") return Number(b.allDayHand) - Number(a.allDayHand) || byCallThenName(a, b);
    return byCallThenName(a, b);
  });

  return rows;
}

function byCallThenName(a, b) {
  return (parseTime(a.scheduledIn) ?? 99999) - (parseTime(b.scheduledIn) ?? 99999)
    || a.name.localeCompare(b.name);
}

function selectedRows() {
  return state.rows.filter(row => row.selected);
}

function targetRows() {
  const selected = selectedRows();
  return selected.length ? selected : getVisibleRows();
}

function render() {
  renderHeader();
  renderTabs();
  renderCards();
  renderStats();
  renderNextDue();
}

function renderHeader() {
  const parts = [state.show.name || "Blank Show", state.show.venue, formatDate(state.show.date)].filter(Boolean);
  els.showLine.textContent = parts.join(" • ");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function renderTabs() {
  const allGroups = ["All", ...GROUPS];
  els.groupTabs.innerHTML = allGroups.map(group => {
    const count = group === "All" ? state.rows.length : state.rows.filter(row => row.group === group).length;
    return `<button class="tab ${group === activeGroup ? "is-active" : ""}" data-group="${escapeHtml(group)}">${escapeHtml(group)} <span>${count}</span></button>`;
  }).join("");

  $$("#groupTabs .tab").forEach(button => {
    button.addEventListener("click", () => {
      activeGroup = button.dataset.group;
      render();
    });
  });
}

function renderCards() {
  const rows = getVisibleRows();
  els.crewGrid.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    empty.innerHTML = `
      <h2>No crew yet</h2>
      <p>Open Tools to add crew, import a CSV, or load fake demo data. Production starts blank so real names do not ship with the app.</p>
      <button class="btn btn--blue" type="button">Open tools</button>
    `;
    empty.querySelector("button").addEventListener("click", () => els.toolsModal.showModal());
    els.crewGrid.append(empty);
    return;
  }

  rows.forEach(row => els.crewGrid.append(renderCard(row)));
}

function renderCard(row) {
  const card = els.template.content.firstElementChild.cloneNode(true);
  const severity = rowSeverity(row);
  const flags = flagsFor(row);

  card.dataset.id = row.id;
  card.classList.toggle("is-selected", row.selected);
  if (severity) card.classList.add(`is-${severity}`);

  card.querySelector(".select-row").checked = row.selected;
  card.querySelector(".crew-card__identity h2").textContent = row.name || "(No name)";
  card.querySelector(".crew-card__identity p").textContent = [
    row.position || "No position",
    row.group || "Other",
    `Call ${row.scheduledIn || "--"}`,
    row.lastCheckIn ? `Check ${row.lastCheckIn}` : ""
  ].filter(Boolean).join(" • ");
  card.querySelector(".hour-stack strong").textContent = hoursFor(row).toFixed(2);
  card.querySelector(".badge-row").innerHTML = flags.map(([label, type]) => {
    return `<span class="badge badge--${type}">${escapeHtml(label)}</span>`;
  }).join("");

  const actualIn = card.querySelector(".actual-in");
  const actualOut = card.querySelector(".actual-out");
  const breakMin = card.querySelector(".break-min");
  const notes = card.querySelector(".row-notes");

  actualIn.value = row.actualIn;
  actualOut.value = row.actualOut;
  breakMin.value = row.breakMin;
  notes.value = row.notes;

  card.addEventListener("click", event => {
    if (event.target.closest("button,input,textarea,select,summary,details,label")) return;
    row.selected = !row.selected;
    saveAndRender();
  });

  card.querySelector(".select-row").addEventListener("change", event => {
    row.selected = event.target.checked;
    saveAndRender();
  });

  actualIn.addEventListener("change", event => updateRow(row, { actualIn: event.target.value }));
  actualOut.addEventListener("change", event => updateRow(row, { actualOut: event.target.value }));
  breakMin.addEventListener("change", event => updateRow(row, { breakMin: Number(event.target.value || 0) }));
  notes.addEventListener("change", event => updateRow(row, { notes: event.target.value }));

  card.querySelector(".add-break").addEventListener("click", () => addBreak(row, 15));
  card.querySelector(".mark-lunch").addEventListener("click", () => markLunch(row));
  card.querySelector(".clock-out").addEventListener("click", () => updateRow(row, { actualOut: nowLabel() }));
  card.querySelector(".toggle-all-day").addEventListener("click", () => toggleAllDayForPerson(row));
  card.querySelector(".duplicate-row").addEventListener("click", () => duplicateRow(row));
  card.querySelector(".delete-row").addEventListener("click", () => deleteRow(row));

  return card;
}

function renderStats() {
  const rows = getVisibleRows();
  const flagCount = rows.reduce((sum, row) => sum + flagsFor(row).filter(flag => flag[1] === "warn" || flag[1] === "bad").length, 0);
  const totalHours = rows.reduce((sum, row) => sum + hoursFor(row), 0);
  const selected = selectedRows().length;

  els.visibleCount.textContent = rows.length;
  els.selectedCount.textContent = selected;
  els.crewHours.textContent = totalHours.toFixed(1);
  els.flagCount.textContent = flagCount;
  els.bulkStatus.textContent = selected ? `${selected} selected` : "No crew selected — actions apply to visible rows";
}

function renderNextDue() {
  const due = [];

  state.rows
    .filter(row => !row.actualOut && parseTime(row.actualIn) !== null)
    .forEach(row => {
      const hours = hoursFor(row);
      const breakMin = Number(row.breakMin || 0);

      if (breakMin < 15) {
        if (hours < 2) due.push({ row, minutes: Math.round((2 - hours) * 60), label: "15" });
        else if (hours < 3) due.push({ row, minutes: 0, label: "15 now" });
        else due.push({ row, minutes: 0, label: "15 missed" });
      } else if (!row.lunchTaken) {
        if (hours < 5) due.push({ row, minutes: Math.round((5 - hours) * 60), label: "lunch" });
        else due.push({ row, minutes: 0, label: "lunch now" });
      }
    });

  due.sort((a, b) => a.minutes - b.minutes);

  if (!due.length) {
    els.nextDue.textContent = "Next due: clear";
    return;
  }

  const next = due[0];
  els.nextDue.textContent = next.minutes <= 0
    ? `${next.label}: ${next.row.name}`
    : `${next.label} in ${next.minutes}m: ${next.row.name}`;
}

function updateClock() {
  els.clock.textContent = nowLabel().replace(" ", "");
}

function updateRow(row, patch) {
  Object.assign(row, patch);
  saveAndRender();
}

function saveAndRender() {
  normalizeState();
  markLikelyAllDayHands();
  saveState();
  render();
}

function addBreak(row, minutes) {
  row.breakMin = Number(row.breakMin || 0) + minutes;
  row.lastCheckIn = nowLabel();
  saveAndRender();
}

function markLunch(row) {
  row.lunchTaken = true;
  row.breakMin = Math.max(Number(row.breakMin || 0), 30);
  row.lastCheckIn = nowLabel();
  saveAndRender();
}

function bulkBreak(minutes) {
  targetRows().forEach(row => {
    row.breakMin = Number(row.breakMin || 0) + minutes;
    row.lastCheckIn = nowLabel();
  });
  saveAndRender();
}

function bulkLunch() {
  targetRows().forEach(row => {
    row.lunchTaken = true;
    row.breakMin = Math.max(Number(row.breakMin || 0), 30);
    row.lastCheckIn = nowLabel();
  });
  saveAndRender();
}

function bulkCheckIn() {
  targetRows().forEach(row => row.lastCheckIn = nowLabel());
  saveAndRender();
}

function bulkClockOut() {
  const time = nowLabel();
  targetRows().forEach(row => {
    if (!row.actualOut) row.actualOut = time;
  });
  saveAndRender();
}

function selectVisible() {
  const ids = new Set(getVisibleRows().map(row => row.id));
  state.rows.forEach(row => {
    if (ids.has(row.id)) row.selected = true;
  });
  saveAndRender();
}

function clearSelection() {
  state.rows.forEach(row => row.selected = false);
  saveAndRender();
}

function selectAllDayHands() {
  state.rows.forEach(row => row.selected = Boolean(row.allDayHand));
  activeGroup = "All";
  sortMode = "allday";
  els.sortSelect.value = "allday";
  saveAndRender();
}

function toggleAllDayForPerson(row) {
  const key = normalizeName(row.name);
  const next = !row.allDayHand;
  state.rows.forEach(candidate => {
    if (normalizeName(candidate.name) === key) candidate.allDayHand = next;
  });
  saveAndRender();
}

function duplicateRow(row) {
  const copy = structuredClone(row);
  copy.id = nextId();
  copy.actualOut = "";
  copy.selected = false;
  copy.notes = "";
  copy.reminded = {};
  state.rows.push(copy);
  saveAndRender();
}

function deleteRow(row) {
  if (!confirm(`Delete ${row.name || "this crew row"}?`)) return;
  state.rows = state.rows.filter(candidate => candidate.id !== row.id);
  saveAndRender();
}

function addCrew() {
  const name = els.newName.value.trim();
  if (!name) {
    alert("Add a name first.");
    return;
  }

  const position = els.newPosition.value.trim();
  const scheduledIn = els.newCall.value.trim();

  state.rows.push({
    id: nextId(),
    name,
    position,
    group: els.newGroup.value || inferGroup(position, scheduledIn),
    scheduledIn,
    actualIn: scheduledIn,
    actualOut: "",
    breakMin: 0,
    lunchTaken: false,
    allDayHand: false,
    lastCheckIn: "",
    notes: "",
    selected: false,
    reminded: {}
  });

  els.newName.value = "";
  els.newPosition.value = "";
  els.newCall.value = "";
  saveAndRender();
}

function addBulkNote() {
  const note = els.bulkNote.value.trim();
  if (!note) return;

  targetRows().forEach(row => {
    row.notes = row.notes ? `${row.notes}; ${note}` : note;
  });

  els.bulkNote.value = "";
  saveAndRender();
}

function openShowModal() {
  els.showName.value = state.show.name || "";
  els.showVenue.value = state.show.venue || "";
  els.showDate.value = state.show.date || "";
  els.showEmployer.value = state.show.employer || "";
  els.showNotes.value = state.show.notes || "";
  els.toolsModal.close();
  els.showModal.showModal();
}

function saveShow() {
  state.show.name = els.showName.value.trim() || "Blank Show";
  state.show.venue = els.showVenue.value.trim();
  state.show.date = els.showDate.value;
  state.show.employer = els.showEmployer.value.trim();
  state.show.notes = els.showNotes.value.trim();
  saveAndRender();
  els.showModal.close();
}

function newShow() {
  if (!confirm("Start a new blank show? Current local rows will be cleared.")) return;
  state = structuredClone(blankState);
  saveAndRender();
  els.toolsModal.close();
  openShowModal();
}

function loadDemo() {
  if (!confirm("Load fake demo crew rows into this show?")) return;

  demoRows.forEach(([name, position, scheduledIn, group]) => {
    state.rows.push({
      id: nextId(),
      name,
      position,
      group,
      scheduledIn,
      actualIn: scheduledIn,
      actualOut: "",
      breakMin: 0,
      lunchTaken: false,
      allDayHand: false,
      lastCheckIn: "",
      notes: "",
      selected: false,
      reminded: {}
    });
  });

  saveAndRender();
}

function clearData() {
  if (!confirm("Clear all ShowClock data from this browser?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(blankState);
  searchTerm = "";
  sortMode = "call";
  activeGroup = "All";
  els.searchInput.value = "";
  els.sortSelect.value = "call";
  saveAndRender();
}

function exportCsv() {
  const header = [
    "row id", "show name", "date", "venue", "employer/client",
    "name", "group", "position", "scheduled in", "actual in", "actual out",
    "break minutes", "lunch taken", "all-day hand", "last check-in", "hours", "flags", "notes"
  ];

  const rows = state.rows.map(row => [
    row.id,
    state.show.name,
    state.show.date,
    state.show.venue,
    state.show.employer,
    row.name,
    row.group,
    row.position,
    row.scheduledIn,
    row.actualIn,
    row.actualOut,
    row.breakMin,
    row.lunchTaken ? "yes" : "no",
    row.allDayHand ? "yes" : "no",
    row.lastCheckIn,
    hoursFor(row).toFixed(2),
    flagsFor(row).map(flag => flag[0]).join(" "),
    row.notes
  ]);

  download(`${slugify(state.show.name || "showclock")}-timesheet.csv`, [header, ...rows].map(csvLine).join("\n"), "text/csv;charset=utf-8");
}

function importCsvPrompt() {
  const pasted = prompt("Paste CSV rows:\nname, position, call time, group(optional)");
  if (!pasted) return;

  let added = 0;
  pasted.split(/\n+/).map(line => line.trim()).filter(Boolean).forEach(line => {
    const [name, position, scheduledIn, group] = parseCsvLine(line).map(value => value.trim());
    if (!name || !position || !scheduledIn) return;

    state.rows.push({
      id: nextId(),
      name,
      position,
      group: group || inferGroup(position, scheduledIn),
      scheduledIn,
      actualIn: scheduledIn,
      actualOut: "",
      breakMin: 0,
      lunchTaken: false,
      allDayHand: false,
      lastCheckIn: "",
      notes: "",
      selected: false,
      reminded: {}
    });
    added++;
  });

  alert(`Imported ${added} row(s).`);
  saveAndRender();
}

function copySummary() {
  const flagged = state.rows.filter(isActionFlagged);
  const summary = [
    "ShowClock Summary",
    `Show: ${state.show.name || "Blank Show"}`,
    `Venue: ${state.show.venue || ""}`,
    `Date: ${state.show.date || ""}`,
    `Open rows: ${state.rows.filter(row => !row.actualOut).length}`,
    `Total crew hours: ${state.rows.reduce((sum, row) => sum + hoursFor(row), 0).toFixed(2)}`,
    "",
    "Flags:",
    flagged.length ? flagged.map(row => `- ${row.name}: ${hoursFor(row).toFixed(2)} hr, ${flagsFor(row).map(flag => flag[0]).join(", ")}`).join("\n") : "None"
  ].join("\n");

  navigator.clipboard.writeText(summary)
    .then(() => alert("Summary copied."))
    .catch(() => prompt("Copy summary:", summary));
}

function requestNotifications() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }

  Notification.requestPermission().then(permission => {
    alert(permission === "granted" ? "Reminders enabled." : "Notifications were not enabled.");
  });
}

function runReminderChecks() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  state.rows.forEach(row => {
    if (row.actualOut) return;
    const hours = hoursFor(row);
    const breakMin = Number(row.breakMin || 0);

    const checks = [
      { key: "2", mark: 2, message: "15-minute break window is open", skip: breakMin >= 15 },
      { key: "3", mark: 3, message: "15-minute break window may be missed", skip: breakMin >= 15 },
      { key: "4.5", mark: 4.5, message: "Lunch due soon", skip: row.lunchTaken },
      { key: "5", mark: 5, message: "Lunch due now", skip: row.lunchTaken },
      { key: "8", mark: 8, message: "8+ hours", skip: false },
      { key: "10", mark: 10, message: "10+ hours", skip: false },
      { key: "12", mark: 12, message: "12+ hours — verify handling", skip: false }
    ];

    checks.forEach(check => {
      if (hours >= check.mark && !row.reminded[check.key] && !check.skip) {
        new Notification("ShowClock", { body: `${row.name}: ${check.message}` });
        row.reminded[check.key] = true;
      }
    });
  });

  saveState();
}

function csvLine(values) {
  return values.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return String(value || "showclock").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
