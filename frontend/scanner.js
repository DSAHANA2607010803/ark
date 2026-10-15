const MAX_HASH_BYTES = 200 * 1024 * 1024; // files bigger than 200 MB are not fingerprinted yet

const TEXT_EXTS = ["txt", "md", "csv", "json", "html", "css", "js", "py", "xml", "log"];

/* ---------- helpers ---------- */

function starts(bytes, sig, offset = 0) {
  return sig.every((value, i) => bytes[offset + i] === value);
}

function ascii(bytes, from, to) {
  return String.fromCharCode(...bytes.slice(from, to));
}

function getExt(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

/* ---------- format detection ---------- */
/* Each entry: a name, the file extensions that are normal for it,
   and a test that looks at the first bytes of the file.
   Order matters: specific tests come before general ones. */

const SIGNATURES = [
  { name: "JPEG image", exts: ["jpg", "jpeg", "jpe"], test: b => starts(b, [0xFF, 0xD8, 0xFF]) },
  { name: "PNG image", exts: ["png"], test: b => starts(b, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) },
  { name: "GIF image", exts: ["gif"], test: b => ascii(b, 0, 4) === "GIF8" },
  { name: "BMP image", exts: ["bmp"], test: b => ascii(b, 0, 2) === "BM" },
  { name: "TIFF image", exts: ["tif", "tiff"], test: b => starts(b, [0x49, 0x49, 0x2A, 0x00]) || starts(b, [0x4D, 0x4D, 0x00, 0x2A]) },
  { name: "WebP image", exts: ["webp"], test: b => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  { name: "WAV audio", exts: ["wav"], test: b => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE" },
  { name: "AVI video", exts: ["avi"], test: b => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "AVI " },
  { name: "HEIC image", exts: ["heic", "heif"], test: b => ascii(b, 4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1"].includes(ascii(b, 8, 12)) },
  { name: "QuickTime video", exts: ["mov", "qt"], test: b => ascii(b, 4, 8) === "ftyp" && ascii(b, 8, 12) === "qt  " },
  { name: "M4A audio", exts: ["m4a"], test: b => ascii(b, 4, 8) === "ftyp" && ascii(b, 8, 12) === "M4A " },
  { name: "MP4 video", exts: ["mp4", "m4v", "3gp"], test: b => ascii(b, 4, 8) === "ftyp" },
  { name: "Matroska/WebM video", exts: ["mkv", "webm"], test: b => starts(b, [0x1A, 0x45, 0xDF, 0xA3]) },
  { name: "MP3 audio", exts: ["mp3"], test: b => ascii(b, 0, 3) === "ID3" || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) },
  { name: "OGG audio/video", exts: ["ogg", "oga", "ogv"], test: b => ascii(b, 0, 4) === "OggS" },
  { name: "FLAC audio", exts: ["flac"], test: b => ascii(b, 0, 4) === "fLaC" },
  { name: "PDF document", exts: ["pdf"], test: b => ascii(b, 0, 4) === "%PDF" },
  { name: "Flash (SWF)", exts: ["swf"], test: b => ["FWS", "CWS", "ZWS"].includes(ascii(b, 0, 3)) },
  { name: "Old Office file", exts: ["doc", "xls", "ppt", "msi"], test: b => starts(b, [0xD0, 0xCF, 0x11, 0xE0]) },
  { name: "ZIP-based (zip, docx, xlsx...)", exts: ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub", "jar", "apk"], test: b => starts(b, [0x50, 0x4B, 0x03, 0x04]) },
  { name: "7-Zip archive", exts: ["7z"], test: b => starts(b, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) },
  { name: "RAR archive", exts: ["rar"], test: b => ascii(b, 0, 4) === "Rar!" },
  { name: "GZIP archive", exts: ["gz", "tgz"], test: b => starts(b, [0x1F, 0x8B]) },
  { name: "Windows program", exts: ["exe", "dll"], test: b => ascii(b, 0, 2) === "MZ" },
];

function detectFormat(bytes, ext) {
  for (const sig of SIGNATURES) {
    if (sig.test(bytes)) return sig;
  }
  if (TEXT_EXTS.includes(ext)) return { name: "Plain text", exts: TEXT_EXTS };
  return null; // unknown
}

/* ---------- fingerprint ---------- */

async function sha256(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

/* ---------- scanning ---------- */

async function scanFile(file) {
  const ext = getExt(file.name);
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const sig = detectFormat(head, ext);

  let hash = null;
  if (file.size <= MAX_HASH_BYTES) {
    try {
      hash = await sha256(file);
    } catch (error) {
      hash = null;
    }
  }

  let check = "unknown";
  if (sig) check = sig.exts.includes(ext) ? "ok" : "mismatch";

  return {
    path: file.webkitRelativePath || file.name,
    size: file.size,
    format: sig ? sig.name : "Unknown format",
    check,
    hash,
  };
}

/* ---------- showing results on the page ---------- */
/* We use textContent (not innerHTML) so odd file names can never inject code. */

/* ---------- showing results on the page ---------- */
/* We use textContent (not innerHTML) so odd file names can never inject code. */

let scanResults = []; // remembered, so ratings can update when the dropdowns change

function makeCell(text, className, title) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  if (title) td.title = title;
  return td;
}

const RISK_LABELS = {
  safe:  { icon: "✓", word: "Safe",    css: "risk-safe" },
  watch: { icon: "!", word: "Watch",   css: "risk-watch" },
  risk:  { icon: "✕", word: "At risk", css: "risk-high" },
};

function riskCell(assessment) {
  const label = RISK_LABELS[assessment.status];
  return makeCell(label.icon + " " + label.word + " (" + assessment.score + ")", label.css);
}

function whyCell(reasons) {
  const td = document.createElement("td");
  td.className = "why";
  if (reasons.length === 0) {
    td.textContent = "No problems found";
    return td;
  }
  const list = document.createElement("ul");
  for (const text of reasons) {
    const item = document.createElement("li");
    item.textContent = text;
    list.appendChild(item);
  }
  td.appendChild(list);
  return td;
}

function currentContext() {
  return {
    location: document.getElementById("location-select").value,
    copies: Number(document.getElementById("copies-select").value),
  };
}

function render() {
  if (scanResults.length === 0) return;

  const context = currentContext();
  const body = document.getElementById("results-body");
  body.replaceChildren();

  const nowList = [];
  const futureList = [];

  for (const r of scanResults) {
    const now = assessFile(r, context, START_YEAR);
    const future = assessFile(r, context, TARGET_YEAR);
    nowList.push(now);
    futureList.push(future);

    const row = document.createElement("tr");
    row.appendChild(makeCell(r.path));
    row.appendChild(makeCell(r.format));
    row.appendChild(riskCell(now));
    row.appendChild(riskCell(future));
    row.appendChild(whyCell(future.reasons));

    const hashText = r.hash ? r.hash.slice(0, 12) + "…" : "too large";
    row.appendChild(makeCell(hashText, "mono", r.hash || ""));
    body.appendChild(row);
  }

  const countNow = status => nowList.filter(a => a.status === status).length;
  const totalBytes = scanResults.reduce((sum, r) => sum + r.size, 0);

  const summary = document.getElementById("summary");
  summary.replaceChildren();
  const cards = [
    ["Files", scanResults.length],
    ["Total size", formatSize(totalBytes)],
    ["✓ Safe now", countNow("safe")],
    ["! Watch now", countNow("watch")],
    ["✕ At risk now", countNow("risk")],
    ["Survival Score now", survivalScore(nowList)],
    ["Score in 2036 (estimate)", survivalScore(futureList)],
  ];
  for (const [label, value] of cards) {
    const card = document.createElement("div");
    card.className = "card";
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.appendChild(strong);
    card.appendChild(document.createTextNode(label));
    summary.appendChild(card);
  }

  summary.hidden = false;
  document.getElementById("results").hidden = false;
refreshTimeMachine();
}

/* ---------- wiring it to the buttons ---------- */

const folderInput = document.getElementById("folder-input");
const chooseBtn = document.getElementById("choose-btn");
const progressBox = document.getElementById("progress");
const barFill = document.getElementById("bar-fill");
const progressText = document.getElementById("progress-text");
const messageBox = document.getElementById("message");

chooseBtn.addEventListener("click", () => folderInput.click());

// Changing a dropdown re-rates the files that were already scanned
document.getElementById("location-select").addEventListener("change", render);
document.getElementById("copies-select").addEventListener("change", render);

folderInput.addEventListener("change", async () => {
  const files = Array.from(folderInput.files);

  messageBox.hidden = true;
  document.getElementById("summary").hidden = true;
  document.getElementById("results").hidden = true;

  if (files.length === 0) return;

  if (!(window.crypto && crypto.subtle)) {
    messageBox.textContent = "This browser can't create fingerprints here. Open Ark at http://127.0.0.1:8000 in Chrome or Edge.";
    messageBox.hidden = false;
    return;
  }

  chooseBtn.disabled = true;
  progressBox.hidden = false;

  const results = [];
  for (let i = 0; i < files.length; i++) {
    progressText.textContent = "Scanning " + (i + 1) + " of " + files.length + ": " + files[i].name;
    barFill.style.width = ((i + 1) / files.length * 100) + "%";
    results.push(await scanFile(files[i]));
  }

  progressText.textContent = "Done. " + files.length + " files checked.";
  scanResults = results;
  render();
  chooseBtn.disabled = false;
  folderInput.value = ""; // lets you pick the same folder again later
});