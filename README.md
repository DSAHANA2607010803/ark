# Ark: Digital Survival Forecaster

**Know which of your files will still open in 2036, and save the ones that won't.**

Built for the challenge theme: *"Future Problem, Present Solution."*

## The problem

Digital files feel permanent, but they depend on things that don't last: file formats lose support (Flash ended in 2020), storage wears out, and files can be silently corrupted. People usually find out only when they need the file.

## What Ark does

- **Scans a folder privately.** Files are read in your browser and are never uploaded.
- **Detects the real file format** from the file's contents, not its extension, and flags mismatches.
- **Fingerprints every file** with SHA-256.
- **Rates each file's risk** now and in 2036, with plain-language reasons.
- **Time Machine:** drag from 2026 to 2036 and compare "do nothing" with "follow the plan".
- **Survival Package:** download a ZIP with a file list and fingerprints.
- **History and Re-verify:** save a scan, scan the folder again later, and see which files changed.

## How to run it

You need Python 3.9 or higher.

```
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

On Mac or Linux, activate with `source venv/bin/activate`. Then open http://127.0.0.1:8000 in Chrome or Edge and try the `demo-files` folder.

## Tech stack

- Frontend: HTML, CSS, JavaScript (browser SHA-256 via `crypto.subtle`)
- Backend: Python, FastAPI, Uvicorn
- Database: SQLite
- No AI and no paid APIs. The forecast is rule-based so every rating can be explained.

## Honest limits

- The risk scores come from simple rules and our own assumptions. They are **estimates, not measured predictions**.
- Re-verify can show that a file changed, but not **why**.
- Ark does not repair or convert files. It tells you what to do.
- Ark only knows about the folder you scan.
- This is a **working prototype**, not production software.
- Folder picking works best in Chrome or Edge.