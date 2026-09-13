# A Generative AI-based SOC Application v2

An AI-augmented SOC platform designed to support analysts, not replace
them — live Wazuh SIEM investigation, VirusTotal lookups, and a local
LLM (vision + RAG) for faster triage, summarisation, and reporting.

This is v2 of my original FYP project
([A-Generative-Ai-based-summariser-to-improve-explainability-of-SOC-incidents](https://github.com/BVillagomez246/A-local-generative-AI-based-incident-summariser-to-improve-explainability-of-SOC-incidents)),
expanded from a summarisation tool into a full real-time investigation
platform with live Wazuh integration, threat intelligence, and local
vision AI.

Everything runs locally — no cloud AI APIs, no data leaving your machine
except the optional VirusTotal lookups and Gmail sending.

---

## Screenshots

**Full layout** — saved chats in the sidebar, model selector, live chat
on the left, real-time Wazuh investigation panel on the right with time
range, agent filter, threat score, and evidence.

![Overview of the full app layout](screenshots/01-overview.png)

**AI image analysis** — attach a screenshot (e.g. a phishing alert) and
the local vision model describes it directly in chat, while the
investigation panel shows a custom time range scoped to a specific agent.

![AI describing an uploaded phishing screenshot, alongside a scoped investigation](screenshots/02-image-analysis.png)

**Evidence detail** — every investigation surfaces the actual underlying
alerts (severity, host, timestamp, description), not just an AI summary,
so the analyst can verify the reasoning behind it.

![Evidence list showing individual Wazuh alerts with severity and timestamps](screenshots/03-evidence-detail.png)

**Blue Team Assistant** — look up an IP address or file hash against
VirusTotal and get both an AI-written reputation summary and the actual
per-engine detections behind it.

![VirusTotal-based IP reputation lookup with per-engine detection breakdown](screenshots/04-blue-team-lookup.png)

**Bringing investigations into chat** — pull any completed investigation
straight into the conversation as context, or ask a cross-investigation
question, or generate a full report, all from the same dropdown.

![Chat dropdown listing completed investigations, Post Question, and Final Report](screenshots/05-chat-context-dropdown.png)

**Text → PDF Converter** — turn a Markdown-style `.txt` report
(including `#IMAGE_HERE:` placeholders for embedding images) into a
downloadable, properly formatted PDF, built entirely client-side.

![Text to PDF converter with text and image upload](screenshots/06-pdf-converter.png)

---

## ⚠️ Before you do anything else

This repo does **not** include a `.env` file — only `.env.example`, a
template with placeholder values. You must create your own `.env` with
your own real credentials. **Never commit your real `.env` file.**

---

## What's included vs. what you need to add yourself

This repo contains all the custom application code built for this
project. It does **not** include:

- `frontend/package.json`, `vite.config.js`, `index.html`, `index.css` —
  standard Vite/React scaffolding, specific to how the project was
  originally set up. If cloning fresh, run a new Vite React project
  (`npm create vite@latest`) and drop this repo's `src/` contents into
  it, then install the dependencies below.
- `node_modules/`, Python `venv/` — regenerate these yourself, never
  commit them.
- Your own `.env` with real credentials.

## Dependencies to install

**Frontend** (inside your Vite project):
