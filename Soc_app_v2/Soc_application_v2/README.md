# SOC AI Platform

A local, privacy-first Security Operations Centre assistant: real-time Wazuh
SIEM investigation, VirusTotal threat intelligence, a local LLM (via LM
Studio) for summarisation and vision-based image analysis, persistent
case context (ChromaDB/RAG), and a chat interface with saved sessions,
email login, a team contacts panel, and a built-in text-to-PDF report
converter.

Everything runs locally — no cloud AI APIs, no data leaving your machine
except the optional VirusTotal lookups and Gmail sending.

---

## ⚠️ Before you do anything else

This repo does **not** include a `.env` file — only `.env.example`, a
template with placeholder values. You must create your own `.env` with
real credentials for your own environment. **Never commit your real
`.env` file** — it's already excluded via `.gitignore`.

---

## What's included vs. what you need to add yourself

This repo contains all the custom application code built for this
project. It does **not** include:

- `frontend/package.json`, `vite.config.js`, `index.html`, `index.css` —
  standard Vite/React scaffolding files, specific to how the project was
  originally set up. If you're cloning this fresh, run a new Vite React
  project (`npm create vite@latest`) and drop the `src/` contents from
  this repo into it, then install the dependencies listed below.
- `node_modules/`, Python `venv/` — regenerate these yourself (see setup
  below), never commit these.
- Your own `.env` with real credentials.

## Dependencies to install

**Frontend** (inside your Vite project):
```
npm install @chakra-ui/react @fortawesome/react-fontawesome @fortawesome/free-solid-svg-icons
```

**Backend** (Python, inside a virtual environment):
```
pip install fastapi "uvicorn[standard]" python-dotenv requests chromadb openai
```

---

## Setup — adding your own configuration

### 1. Copy the env template
```bash
cd backend-python
cp .env.example .env
```

### 2. Fill in `.env` with your own values

| Variable | What it is | Where to get it |
|---|---|---|
| `WAZUH_INDEXER_HOST` | Your Wazuh VM's IP | `hostname -I` / `ip a` on the VM |
| `WAZUH_INDEXER_PORT` | Default `9200` | — |
| `WAZUH_INDEXER_USER` | Default `admin` | — |
| `WAZUH_INDEXER_PASSWORD` | Indexer admin password | Generated at Wazuh install time, or reset via `wazuh-passwords-tool.sh` (under `wazuh-indexer/plugins/opensearch-security/tools/`) |
| `WAZUH_MANAGER_HOST` | Usually same as Indexer host | — |
| `WAZUH_MANAGER_PORT` | Default `55000` | — |
| `WAZUH_MANAGER_USER` | Usually `wazuh-wui` | — |
| `WAZUH_MANAGER_PASSWORD` | Manager API password | Reset via `sudo /var/ossec/bin/rbac_control change-password` on the Wazuh VM if lost |
| `VT_API_KEY` | VirusTotal API key | Free at virustotal.com -> Profile icon -> API Key |
| `EMAIL_ADDRESS` | Gmail address to send from | Your own Gmail account |
| `EMAIL_APP_PASSWORD` | Gmail App Password (NOT your normal password) | myaccount.google.com/apppasswords -- requires 2-Step Verification enabled first |

### 3. LM Studio setup
- Install LM Studio (lmstudio.ai), start its local server (Developer tab -> Start Server), default port `1234`
- Load a vision-capable model for image analysis (this project was built/tested with `qwen/qwen3-vl-4b`)
- If you use a different model, update `VISION_MODEL_ID` in `backend-python/main.py` and the model list in `frontend/src/components/Select_framework.jsx` to match
- **Set "Max Concurrent Predictions" to 1** in the model's Load settings (Advanced section) — running multiple parallel slots multiplies GPU memory usage per model load and can cause out-of-memory crashes on image analysis

### 4. Wazuh setup
- Wazuh VM must be reachable from wherever `uvicorn` runs (same machine, or a VM on a network you can route to — VMware Host-only/Bridged networking, VPNs can interfere with this, see troubleshooting note below)
- The VM needs the Indexer, Manager, and Dashboard services running

### 5. Run it
```bash
# Terminal 1 - backend
cd backend-python
uvicorn main:app --reload --port 8000

# Terminal 2 - frontend
cd frontend
npm run dev
```

---

## If someone else wants to fork/use this with their own setup

Every piece of personal configuration lives in `.env` — nobody needs to
touch the actual code to point this at their own Wazuh instance,
VirusTotal account, or email. Just:

1. Copy `.env.example` to `.env`
2. Fill in your own values per the table above
3. If your vision model isn't `qwen/qwen3-vl-4b`, update the two spots
   mentioned in step 3 above

No hardcoded IPs, hostnames, or credentials exist anywhere in the
application code — everything reads from environment variables with
generic fallback defaults (`localhost`, etc.).

---

## Known limitations (by design, not bugs)

- **Login and chat history are browser-local** (`localStorage`) — no
  backend user database. Fine for a personal/demo tool, not for
  multi-device or multi-user real accounts.
- **VirusTotal free tier**: 4 requests/minute, 500/day.
- **Vision model VRAM**: image analysis needs a vision-capable model
  loaded with enough GPU memory. If you hit `ErrorOutOfDeviceMemory` in
  LM Studio's logs, check the "Max Concurrent Predictions" setting
  mentioned above first — it's the most common cause.

## Architecture overview

```
React (Vite)  ->  FastAPI (main.py)  ->  LM Studio (local LLM)
                       |
              Wazuh Indexer / Manager API
              VirusTotal API
              ChromaDB (local vector store, case context/RAG)
              Gmail SMTP (team contact emails)
```
