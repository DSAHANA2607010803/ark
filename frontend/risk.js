/* Ark's risk rules.
   Every file starts at 100 points. Each risk takes points off.
   70+ = Safe, 40-69 = Watch, below 40 = At risk.
   The numbers are rough assumptions: change them and see what happens. */

const START_YEAR = new Date().getFullYear();
const TARGET_YEAR = 2036;

/* Where the files live. The penalty grows every year: base + perYear * years. */
const LOCATION_RISKS = {
  computer: { base: 5,  perYear: 2.5, reason: "Hard drives wear out and eventually fail" },
  external: { base: 5,  perYear: 3,   reason: "External drives wear out and are easy to lose or forget" },
  usb:      { base: 10, perYear: 3.5, reason: "Flash storage can lose data over the years when left unused" },
  disc:     { base: 15, perYear: 4,   reason: "Discs degrade, and new computers rarely have disc drives" },
  phone:    { base: 10, perYear: 3.5, reason: "Old devices fail and their data is hard to get out" },
  cloud:    { base: 0,  perYear: 1.5, reason: "Online accounts can be lost, locked, or shut down" },
};

/* More copies shrink the storage risk: if one copy fails, another survives. */
const COPY_FACTOR = { 1: 1, 2: 0.5, 3: 0.25 };

/* Formats that are risky on their own. Open formats (JPEG, PNG, PDF, MP3...) score 0. */
const FORMAT_RISKS = {
  "Flash (SWF)":     { penalty: 70, reason: "Flash support ended in 2020 and browsers no longer run it" },
  "Old Office file": { penalty: 25, reason: "Old Word/Excel/PowerPoint format that newer software may open badly" },
  "AVI video":       { penalty: 15, reason: "Old video format: the codec inside may stop playing" },
  "Windows program": { penalty: 20, reason: "Programs stop working as operating systems change" },
  "HEIC image":      { penalty: 10, reason: "Needs newer software and is not supported everywhere" },
};

function statusFromScore(score) {
  if (score >= 70) return "safe";
  if (score >= 40) return "watch";
  return "risk";
}

/* Rate one file for a given year.
   file    = one scan result (path, format, check, hash)
   context = { location: "usb", copies: 1 }
   Returns { score, status, reasons } */
function assessFile(file, context, year) {
  const yearsAhead = Math.max(0, year - START_YEAR);
  const found = [];
  const add = (points, text) => {
    if (points > 0) found.push({ points, text });
  };

  // 1. The file itself
  const formatRisk = FORMAT_RISKS[file.format];
  if (formatRisk) add(formatRisk.penalty, formatRisk.reason);

  if (file.check === "mismatch") {
    add(25, "Its name says ." + getExt(file.path) + " but the contents are " + file.format + ", so some programs may refuse to open it");
  }
  if (file.check === "unknown") {
    add(30, "Ark could not identify this file's format");
  }
  if (file.hash === null) {
    add(5, "Too large to fingerprint yet, so changes can't be detected");
  }

  // 2. Where it lives and how many copies exist
  const location = LOCATION_RISKS[context.location];
  const copyFactor = COPY_FACTOR[context.copies] ?? 0.25;
  if (location) {
    add(Math.round((location.base + location.perYear * yearsAhead) * copyFactor), location.reason);
  }
  if (context.copies === 1) {
    add(20, "Only one copy exists, so if it is lost or damaged it is gone");
  }

  // 3. Add it up
  const total = found.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, 100 - total);

  found.sort((a, b) => b.points - a.points); // biggest problem first

  return {
    score: score,
    status: statusFromScore(score),
    reasons: found.map(item => item.text),
  };
}

/* The whole folder's Survival Score = average of its files' scores. */
function survivalScore(assessments) {
  if (assessments.length === 0) return 0;
  const sum = assessments.reduce((total, a) => total + a.score, 0);
  return Math.round(sum / assessments.length);
}