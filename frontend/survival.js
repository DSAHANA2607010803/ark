/* The Survival Package: builds a ZIP with a README, checksums, and a risk report.
   Everything happens in the browser: no files are uploaded anywhere. */

const packageBtn = document.getElementById("package-btn");
const packageMsg = document.getElementById("package-msg");

/* ---------- a tiny ZIP maker (no compression, no libraries) ---------- */

const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/* files = [{ name: "README.txt", text: "..." }, ...]  ->  a ZIP Blob */
function makeZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
    const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034B50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);   // file names are UTF-8
    local.setUint16(8, 0, true);        // stored (not compressed)
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);   // date: 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014B50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, dosTime, true);
    entry.setUint16(14, dosDate, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint16(30, 0, true);
    entry.setUint16(32, 0, true);
    entry.setUint16(34, 0, true);
    entry.setUint16(36, 0, true);
    entry.setUint32(38, 0, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- helpers ---------- */

function relativePath(path) {
  // "demo-files/bp.jpg" -> "bp.jpg"
  return path.includes("/") ? path.slice(path.indexOf("/") + 1) : path;
}

function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;   // stops spreadsheets running a file name as a formula
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function listLines(items, limit) {
  const out = items.slice(0, limit).map(text => "   - " + text);
  if (items.length > limit) {
    out.push("   ...and " + (items.length - limit) + " more (see risk-report.csv)");
  }
  return out;
}

/* Rate a file as if the plan had been followed (same rules as the Time Machine). */
function assessPlanned(file, context, year) {
  const fixedFile = Object.assign({}, file);
  if (CONVERTIBLE_FORMATS.includes(file.format)) fixedFile.format = "Open format (converted)";
  if (file.check === "mismatch") fixedFile.check = "ok";
  return assessFile(fixedFile, Object.assign({}, context, { copies: PLAN_COPIES }), year);
}

const CONVERSION_ADVICE = {
  "Old Office file": "Open each one in a current Word, Excel, or PowerPoint, save it as .docx, .xlsx, or .pptx, and also save a PDF copy.",
  "AVI video": "Convert to MP4 (H.264) with a free tool such as HandBrake or VLC.",
  "HEIC image": "Export as JPEG or PNG from your phone or photo app.",
  "Flash (SWF)": "These cannot be converted reliably. Keep the originals and use a Flash emulator (for example Ruffle) to view them, or record them as video.",
  "Windows program": "Copying alone does not preserve programs. Keep the installer and note which Windows version it needs.",
};

/* ---------- the three files inside the package ---------- */

function buildChecksums(files) {
  return files
    .filter(f => f.hash)
    .map(f => f.hash + "  " + relativePath(f.path))
    .join("\n") + "\n";
}

function buildCsv(files, context) {
  const rows = [[
    "File", "Real format", "Size (bytes)",
    "Risk now", "Score now",
    "Risk in 2036 (do nothing)", "Score 2036 (do nothing)",
    "Risk in 2036 (with plan)", "Score 2036 (with plan)",
    "Why",
  ]];
  for (const f of files) {
    const now = assessFile(f, context, START_YEAR);
    const later = assessFile(f, context, TARGET_YEAR);
    const planned = assessPlanned(f, context, TARGET_YEAR);
    rows.push([
      relativePath(f.path), f.format, f.size,
      RISK_LABELS[now.status].word, now.score,
      RISK_LABELS[later.status].word, later.score,
      RISK_LABELS[planned.status].word, planned.score,
      later.reasons.join("; "),
    ]);
  }
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function buildReadme(files, context) {
  const nowList = files.map(f => assessFile(f, context, START_YEAR));
  const laterList = files.map(f => assessFile(f, context, TARGET_YEAR));
  const plannedList = files.map(f => assessPlanned(f, context, TARGET_YEAR));
  const count = (list, status) => list.filter(a => a.status === status).length;
  const summaryLine = list =>
    count(list, "safe") + " safe, " + count(list, "watch") + " watch, " + count(list, "risk") + " at risk (Survival Score " + survivalScore(list) + ")";

  const folder = files[0].path.split("/")[0];
  const lines = [];
  const add = (...text) => lines.push(...text);

  add("ARK SURVIVAL PACKAGE", "====================", "");
  add("Created:         " + new Date().toLocaleString());
  add("Folder scanned:  " + folder);
  add("Files scanned:   " + files.length);
  add("You told Ark:    files live on: " + locationLabel(context.location) + "; copies: " + copiesLabel(context.copies));
  add("");

  add("1. WHERE THINGS STAND (estimates)", "");
  add("   Today:                    " + summaryLine(nowList));
  add("   In " + TARGET_YEAR + ", doing nothing:   " + summaryLine(laterList));
  add("   In " + TARGET_YEAR + ", following plan:  " + summaryLine(plannedList));
  add("");

  add("2. WHAT TO DO", "");
  let step = 1;
  add(step++ + ". Keep at least " + PLAN_COPIES + " copies in different places, for example your computer, an external drive, and an online account. A single copy is the biggest risk Ark looks for.", "");

  const mismatched = files.filter(f => f.check === "mismatch").map(f => relativePath(f.path) + "  (really a " + f.format + ")");
  if (mismatched.length > 0) {
    add(step++ + ". Fix wrongly named files. The name says one format, the contents are another:", ...listLines(mismatched, 20));
    add("   Rename each one so its ending matches what it really is.", "");
  }

  for (const [format, advice] of Object.entries(CONVERSION_ADVICE)) {
    const matches = files.filter(f => f.format === format).map(f => relativePath(f.path));
    if (matches.length > 0) {
      add(step++ + ". " + format + " files. " + advice, ...listLines(matches, 20), "");
    }
  }

  const unknown = files.filter(f => f.check === "unknown").map(f => relativePath(f.path));
  if (unknown.length > 0) {
    add(step++ + ". Ark could not identify these files. Check that they still open:", ...listLines(unknown, 20), "");
  }

  add(step++ + ". Check again every six months. Open Ark, scan the same folder, and press Re-verify on your saved scan. Any file whose fingerprint changed has been damaged or edited.", "");

  add("3. HOW TO CHECK A FILE YOURSELF", "");
  add("   checksums.sha256 lists a fingerprint (SHA-256) for each file. If a file's fingerprint");
  add("   changes, the file changed.");
  add("   Windows (PowerShell):    Get-FileHash \"path\\to\\file\" -Algorithm SHA256");
  add("   Mac or Linux (Terminal): shasum -a 256 \"path/to/file\"");
  add("   Compare the result with that file's line in checksums.sha256. Capital or small");
  add("   letters do not matter.");
  add("");

  add("4. HONEST LIMITS", "");
  add("   - Ratings are estimates from simple rules, not measured predictions.");
  add("   - Ark does not fix files by itself. Converting and copying are steps you do.");
  add("   - Ark only knows about the folder you scanned and the answers you gave it.");
  add("");

  add("5. FILES IN THIS PACKAGE", "");
  add("   README.txt         this guide");
  add("   checksums.sha256   a fingerprint for every file");
  add("   risk-report.csv    every file's rating, openable in Excel");

  return lines.join("\r\n") + "\r\n";
}

/* ---------- the button ---------- */

packageBtn.addEventListener("click", () => {
  if (scanResults.length === 0) {
    packageMsg.textContent = "Scan a folder first.";
    return;
  }
  const context = currentContext();
  const zip = makeZip([
    { name: "README.txt", text: buildReadme(scanResults, context) },
    { name: "checksums.sha256", text: buildChecksums(scanResults) },
    { name: "risk-report.csv", text: buildCsv(scanResults, context) },
  ]);

  const folder = scanResults[0].path.split("/")[0].replace(/[^A-Za-z0-9_-]/g, "-");
  downloadBlob(zip, "Ark-Survival-Package-" + folder + ".zip");
  packageMsg.textContent = "Downloaded. Check your Downloads folder.";
});