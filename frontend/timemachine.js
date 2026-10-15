/* The Time Machine: one tile per file, a slider from now to 2036,
   and two modes: "Do nothing" and "Follow the plan". */

/* What "the plan" changes. Edit these to try other plans. */
const CONVERTIBLE_FORMATS = ["Old Office file", "AVI video", "HEIC image"];
const PLAN_COPIES = 3;

let plan = false; // false = "Do nothing", true = "Follow the plan"

const tmSection = document.getElementById("time-machine");
const tmGrid = document.getElementById("tile-grid");
const tmSlider = document.getElementById("year-slider");
const tmYear = document.getElementById("year-label");
const tmCounter = document.getElementById("tm-counter");
const tmNothing = document.getElementById("btn-nothing");
const tmPlan = document.getElementById("btn-plan");
const tmPlanNote = document.getElementById("plan-note");

// The slider runs from this year to 2036
tmSlider.min = START_YEAR;
tmSlider.max = TARGET_YEAR;
tmSlider.step = 1;
tmSlider.value = START_YEAR;

/* Rate a file, applying the plan's fixes first if the plan is on. */
function assessWithPlan(file, context, year) {
  if (!plan) return assessFile(file, context, year);

  const fixedFile = Object.assign({}, file);
  if (CONVERTIBLE_FORMATS.includes(file.format)) fixedFile.format = "Open format (converted)";
  if (file.check === "mismatch") fixedFile.check = "ok";

  const fixedContext = Object.assign({}, context, { copies: PLAN_COPIES });
  return assessFile(fixedFile, context.copies === undefined ? context : fixedContext, year);
}

/* Make one tile per scanned file. */
function buildTiles() {
  tmGrid.replaceChildren();
  for (let i = 0; i < scanResults.length; i++) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tmGrid.appendChild(tile);
  }
}

/* Recolour every tile for the year on the slider.
   wave = true makes tiles change one after another (used when switching modes). */
function updateTiles(wave) {
  const context = currentContext();
  const year = Number(tmSlider.value);
  const tiles = tmGrid.children;
  let okInYear = 0;
  let okNow = 0;

  for (let i = 0; i < scanResults.length; i++) {
    const r = scanResults[i];
    const a = assessWithPlan(r, context, year);
    const tile = tiles[i];

    tile.className = "tile tile-" + a.status;
    tile.textContent = RISK_LABELS[a.status].icon;
    tile.title = r.path + ": " + RISK_LABELS[a.status].word + " (" + a.score + ")";
    tile.style.transitionDelay = wave ? Math.min(i * 25, 900) + "ms" : "0ms";

    if (a.status !== "risk") okInYear++;
    if (assessFile(r, context, START_YEAR).status !== "risk") okNow++;
  }

  const total = scanResults.length;
  tmYear.textContent = year;
  tmCounter.textContent =
    "Files not at risk: " + okNow + " of " + total + " now → " + okInYear + " of " + total + " in " + year;
}

function setMode(usePlan) {
  plan = usePlan;
  tmNothing.setAttribute("aria-pressed", String(!usePlan));
  tmPlan.setAttribute("aria-pressed", String(usePlan));
  tmPlanNote.hidden = !usePlan;
  updateTiles(true);
}

/* Called by scanner.js every time results are drawn. */
function refreshTimeMachine() {
  tmSection.hidden = false;
  buildTiles();
  updateTiles(false);
}

tmSlider.addEventListener("input", () => updateTiles(false));
tmNothing.addEventListener("click", () => setMode(false));
tmPlan.addEventListener("click", () => setMode(true));