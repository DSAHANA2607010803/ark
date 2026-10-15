/* Saving scans, listing them, deleting them, and Re-verify.
   Scans are stored in this browser (localStorage), so nothing leaves the computer. */

const saveBtn = document.getElementById("save-btn");
const saveMsg = document.getElementById("save-msg");
const historyList = document.getElementById("history-list");
const historyMsg = document.getElementById("history-msg");
const verifyInput = document.getElementById("verify-input");
const verifyBox = document.getElementById("verify-result");

let verifyScanId = null; // which saved scan we are re-verifying

/* ---------- browser storage ---------- */

const STORAGE_KEY = "ark.scans";
const STORAGE_PROBLEM = "Ark couldn't use this browser's storage. A private window or a full disk can cause this.";

function readScans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function writeScans(scans) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scans)); // throws if storage is full
}

/* ---------- comparing a saved scan with a new one ---------- */

function relativeKey(path) {
  // "demo-files/bp.jpg" becomes "bp.jpg", so renaming the top folder doesn't matter
  const slash = path.indexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function compareFiles(savedFiles, currentFiles) {
  const saved = new Map(savedFiles.map((f) => [relativeKey(f.path), f]));
  const current = new Map(currentFiles.map((f) => [relativeKey(f.path), f]));

  const changed = [];
  const missing = [];
  const added = [];
  let unchanged = 0;

  for (const [key, old] of saved) {
    const now = current.get(key);
    if (!now) {
      missing.push(key);
    } else if (old.hash && now.hash) {
      if (old.hash !== now.hash) changed.push(key);
      else unchanged++;
    } else if (old.size !== now.size) { // no fingerprint to compare: fall back to size
      changed.push(key);
    } else {
      unchanged++;
    }
  }

  for (const key of current.keys()) {
    if (!saved.has(key)) added.push(key);
  }

  return { changed, missing, added, unchanged };
}

/* ---------- saving ---------- */

saveBtn.addEventListener("click", () => {
  if (scanResults.length === 0) {
    saveMsg.textContent = " Scan a folder first, then save it.";
    return;
  }
  const context = currentContext();
  const folderName = scanResults[0].path.split("/")[0];

  // keep only what Re-verify needs, so the saved scan stays small
  const files = scanResults.map((f) => ({
    path: f.path,
    size: f.size,
    format: f.format,
    check: f.check,
    hash: f.hash || null,
  }));

  try {
    const scans = readScans();
    const newId = scans.length ? Math.max(...scans.map((s) => s.id)) + 1 : 1;
    scans.unshift({
      id: newId,
      folder_name: folderName,
      location: context.location,
      copies: Number(context.copies),
      file_count: files.length,
      created_at: new Date().toISOString(),
      files: files,
    });
    writeScans(scans);
    saveMsg.textContent = " Scan saved. " + files.length + " files checked.";
    loadHistory();
  } catch (error) {
    saveMsg.textContent = " " + STORAGE_PROBLEM;
  }
});

/* ---------- the history list ---------- */

function locationLabel(key) {
  const option = document.querySelector('#location-select option[value="' + key + '"]');
  return option ? option.textContent : key;
}

function copiesLabel(copies) {
  if (copies === 1) return "1 copy";
  if (copies >= 3) return "3 or more copies";
  return copies + " copies";
}

function makeHistoryItem(scan) {
  const item = document.createElement("div");
  item.className = "history-item";

  const info = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = scan.folder_name + " · " + new Date(scan.created_at).toLocaleString();
  const detail = document.createElement("div");
  detail.className = "note";
  detail.textContent =
    scan.file_count + " files · " + locationLabel(scan.location) + " · " + copiesLabel(scan.copies);
  info.append(title, detail);

  const buttons = document.createElement("div");
  buttons.className = "history-buttons";

  const verifyBtn = document.createElement("button");
  verifyBtn.type = "button";
  verifyBtn.className = "btn-toggle";
  verifyBtn.textContent = "Re-verify";
  verifyBtn.addEventListener("click", () => {
    verifyScanId = scan.id;
    verifyInput.click(); // opens the folder picker
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn-toggle";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    if (!confirm("Delete this saved scan?")) return;
    try {
      writeScans(readScans().filter((s) => s.id !== scan.id));
      loadHistory();
    } catch (error) {
      historyMsg.textContent = STORAGE_PROBLEM;
    }
  });

  buttons.append(verifyBtn, deleteBtn);
  item.append(info, buttons);
  return item;
}

function loadHistory() {
  const scans = readScans();
  historyList.replaceChildren();
  historyMsg.textContent =
    scans.length === 0 ? "No saved scans yet. Scan a folder, then press Save this scan." : "";
  for (const scan of scans) {
    historyList.appendChild(makeHistoryItem(scan));
  }
}

/* ---------- Re-verify ---------- */

function addLine(className, text) {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  verifyBox.appendChild(line);
}

function showVerifyResult(outcome) {
  verifyBox.replaceChildren();

  addLine("note",
    outcome.unchanged + " unchanged, " + outcome.changed.length + " changed, " +
    outcome.missing.length + " missing, " + outcome.added.length + " new.");

  if (outcome.changed.length + outcome.missing.length + outcome.added.length === 0) {
    addLine("verify-item verify-ok", "✓ Nothing has changed since this scan was saved.");
    return;
  }
  for (const path of outcome.changed) addLine("verify-item verify-changed", "✕ Fingerprint changed: " + path);
  for (const path of outcome.missing) addLine("verify-item verify-missing", "! Missing: " + path);
  for (const path of outcome.added) addLine("verify-item verify-new", "+ New file: " + path);
}

verifyInput.addEventListener("change", async () => {
  const files = Array.from(verifyInput.files);
  if (files.length === 0 || verifyScanId === null) return;

  verifyBox.hidden = false;
  verifyBox.replaceChildren();
  addLine("note", "Re-checking…");

  try {
    const saved = readScans().find((s) => s.id === verifyScanId);
    if (!saved) throw new Error("Saved scan not found");

    const results = [];
    for (let i = 0; i < files.length; i++) {
      verifyBox.firstChild.textContent = "Re-checking " + (i + 1) + " of " + files.length + ": " + files[i].name;
      results.push(await scanFile(files[i]));
    }
    showVerifyResult(compareFiles(saved.files, results));
  } catch (error) {
    verifyBox.replaceChildren();
    addLine("note", "Something went wrong while re-checking. Please try again.");
  }
  verifyInput.value = ""; // lets you pick the same folder again
});

loadHistory(); // show saved scans as soon as the page opens