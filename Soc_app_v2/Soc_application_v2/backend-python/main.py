import os
import base64
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional, Any, List
from openai import AsyncOpenAI

from wazuh_client import get_recent_alerts, summarize_alerts, get_agent_list, WazuhConnectionError, WazuhAuthError
from wazuh_manager_client import get_all_agents, WazuhManagerError
from vt_client import lookup_ip, lookup_hash, VTError, VTNotFoundError
from chroma_client import store_investigation, search_context, get_context_stats, clear_context, ChromaError
from llm_client import summarize_evidence, summarize_ioc, answer_question, generate_report, LMStudioError

load_dotenv()  # reads .env in this folder into environment variables

# Used only by /api/vision-chat below - the official openai SDK, matching
# exactly how the working reference Chainlit app calls LM Studio for image
# analysis. server.cjs relays vision messages here instead of calling LM
# Studio directly via Node's fetch, since this exact call path is
# confirmed to work reliably on this hardware where the Node path was not.
lm_studio_client = AsyncOpenAI(api_key="lm-studio", base_url="http://127.0.0.1:1234/v1")

# Used only by /api/send-email below. Gmail requires an "App Password"
# for programmatic SMTP access, not the account's normal login password -
# see the setup notes shared alongside this endpoint.
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS", "")
EMAIL_APP_PASSWORD = os.getenv("EMAIL_APP_PASSWORD", "")

app = FastAPI()


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    # FastAPI's default 422 shape is {"detail": [...]}, which our frontend
    # doesn't know how to read (it looks for "error"/"message"), so a real
    # validation problem was showing up as an unhelpful "unknown error".
    # This reformats it so the actual cause is always visible.
    return JSONResponse(
        status_code=422,
        content={"error": "Invalid request", "message": str(exc.errors())},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TimeRangeRequest(BaseModel):
    """
    Optional time-window (and agent filter) for an investigation.

    Send either `hours` (look back N hours from now), or both `start`
    and `end` as ISO 8601 strings for a custom range. If nothing is
    sent at all, endpoints default to the last 24 hours.

    `agent` optionally restricts results to a single agent name (from
    the agent selector dropdown). Leave it unset / empty for all agents.
    """
    hours: Optional[float] = None
    start: Optional[str] = None
    end: Optional[str] = None
    agent: Optional[str] = None


class IOCRequest(BaseModel):
    """Body for IP/hash lookup requests - the value to check on VirusTotal."""
    target: str


class ContextSearchRequest(BaseModel):
    """Body for searching the stored case context."""
    query: str
    n_results: Optional[int] = 8
    key: Optional[str] = None


class PostQuestionRequest(BaseModel):
    """Body for asking a question about the investigation evidence."""
    question: str

summaries = {
    "threatHunting": None,
    "fileIntegrity": None,
    "mitre": None,
    "vulnerability": None,
    "malwareDetection": None,
    "blueTeam": None,
    "finalReport": None,
}

# Separate small store for evidence (Wazuh endpoints return evidence fresh
# each call, but Blue Team Summary needs to re-show the last IOC lookup's
# evidence without re-querying VirusTotal, so it's persisted here).
evidence_store = {
    "blueTeam": None,
}


@app.get("/")
def home():
    return {
        "message": "Python ML and Blue Team backend is running"
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "backend": "python-fastapi"
    }


@app.get("/api/summaries")
def get_summaries():
    return summaries


@app.get("/api/wazuh/agents")
def wazuh_agents():
    """
    Returns the full list of REGISTERED agents from the Wazuh Manager,
    including ones that are disconnected or have never connected - not
    just agents that happen to have alerted recently.
    """
    try:
        agents = get_all_agents()
    except WazuhManagerError as e:
        return {"status": "error", "message": str(e), "agents": []}
    except Exception as e:
        return {"status": "error", "message": f"Unexpected error: {e}", "agents": []}

    return {"status": "available", "agents": agents}


def _run_wazuh_investigation(key: str, time_range: TimeRangeRequest, label: str,
                              rule_group=None, require_mitre: bool = False,
                              exclude_rule_groups=None, exclude_mitre: bool = False):
    """
    Shared logic for every Wazuh-alert-based investigation endpoint:
    query alerts (optionally filtered by rule group / MITRE tagging /
    agent), score them, and generate an AI summary. Falls back
    gracefully to a stats-only summary if LM Studio isn't reachable.
    """
    try:
        if time_range.start and time_range.end:
            alerts = get_recent_alerts(
                start=time_range.start, end=time_range.end, size=200,
                rule_group=rule_group, require_mitre=require_mitre,
                exclude_rule_groups=exclude_rule_groups, exclude_mitre=exclude_mitre,
                agent=time_range.agent,
            )
        else:
            alerts = get_recent_alerts(
                hours=time_range.hours or 24, size=200,
                rule_group=rule_group, require_mitre=require_mitre,
                exclude_rule_groups=exclude_rule_groups, exclude_mitre=exclude_mitre,
                agent=time_range.agent,
            )
    except WazuhConnectionError as e:
        return {"status": "error", "key": key, "message": str(e)}
    except WazuhAuthError as e:
        return {"status": "error", "key": key, "message": str(e)}
    except Exception as e:
        return {"status": "error", "key": key, "message": f"Unexpected error querying Wazuh: {e}"}

    if not alerts:
        return {
            "status": "not_available",
            "key": key,
            "message": f"No {label} alerts found in the selected time range."
        }

    result = summarize_alerts(alerts)

    evidence_lines = [
        f"[{item['timestamp']}] {item['agent']} — level {item['level']} — {item['description']}"
        for item in result["evidence"]
    ]

    try:
        final_summary = summarize_evidence(evidence_lines, result["summary"], investigation_type=label)
    except LMStudioError as e:
        final_summary = f"{result['summary']} (AI summary unavailable: {e})"

    summaries[key] = final_summary

    # Save into the local vector store so this investigation becomes part
    # of the searchable case context (used by Post Question / Final Report).
    # Storage failing shouldn't break the investigation itself, so it's
    # non-fatal - the result still returns either way.
    try:
        time_range_label = (
            f"{time_range.start} to {time_range.end}"
            if time_range.start and time_range.end
            else f"last {time_range.hours or 24}h"
        )
        store_investigation(
            key=key, label=label, summary=final_summary,
            evidence=result["evidence"], agent=time_range.agent,
            time_range=time_range_label,
        )
    except ChromaError:
        pass

    return {
        "status": "available",
        "key": key,
        "summary": final_summary,
        "score": result["score"],
        "evidence": result["evidence"],
    }


@app.post("/api/ml/threat-hunting")
def threat_hunting(time_range: TimeRangeRequest = TimeRangeRequest()):
    # Exclude categories that already have their own dedicated tabs, so
    # Threat Hunting shows genuinely distinct activity instead of
    # duplicating File Integrity / Vulnerability / Malware / SCA / MITRE results
    return _run_wazuh_investigation(
        "threatHunting", time_range, "Threat Hunting",
        exclude_rule_groups=["syscheck", "vulnerability-detector", "sca", "rootcheck", "virustotal", "malware"],
        exclude_mitre=True,
    )


@app.post("/api/ml/file-integrity")
def file_integrity(time_range: TimeRangeRequest = TimeRangeRequest()):
    # Wazuh tags all File Integrity Monitoring alerts with the "syscheck" rule group
    return _run_wazuh_investigation(
        "fileIntegrity", time_range, "File Integrity", rule_group="syscheck"
    )


@app.post("/api/ml/mitre")
def mitre(time_range: TimeRangeRequest = TimeRangeRequest()):
    # Only alerts that Wazuh has enriched with a MITRE ATT&CK technique
    return _run_wazuh_investigation(
        "mitre", time_range, "MITRE ATT&CK", require_mitre=True
    )


@app.post("/api/ml/vulnerability")
def vulnerability(time_range: TimeRangeRequest = TimeRangeRequest()):
    # Wazuh's Vulnerability Detector module tags alerts with this group
    return _run_wazuh_investigation(
        "vulnerability", time_range, "Vulnerability", rule_group="vulnerability-detector"
    )


@app.post("/api/ml/malware-detection")
def malware_detection(time_range: TimeRangeRequest = TimeRangeRequest()):
    # Covers rootcheck (trojaned binaries, hidden processes) and any
    # VirusTotal/malware-tagged groups if that integration is active
    return _run_wazuh_investigation(
        "malwareDetection", time_range, "Malware Detection",
        rule_group=["rootcheck", "virustotal", "malware"],
    )


def _run_ioc_lookup(key: str, target: str, ioc_type: str, lookup_fn):
    """
    Shared logic for IP/hash lookups: query VirusTotal, generate an AI
    summary of the reputation findings, and store the result so the
    Blue Team Summary button can re-show it later without a new lookup.
    """
    target = (target or "").strip()

    if not target:
        return {
            "status": "not_available",
            "key": key,
            "message": f"Enter an {ioc_type} to look up."
        }

    try:
        result = lookup_fn(target)
    except VTNotFoundError as e:
        return {"status": "not_available", "key": key, "message": str(e)}
    except VTError as e:
        return {"status": "error", "key": key, "message": str(e)}
    except Exception as e:
        return {"status": "error", "key": key, "message": f"Unexpected error querying VirusTotal: {e}"}

    try:
        final_summary = summarize_ioc(result, ioc_type=ioc_type)
    except LMStudioError as e:
        stats_summary = (
            f"{result['malicious']} malicious, {result['suspicious']} suspicious, "
            f"{result['harmless']} harmless, {result['undetected']} undetected "
            f"out of {result['total_engines']} engines."
        )
        final_summary = f"{stats_summary} (AI summary unavailable: {e})"

    # Store under this button's own key (so its own display updates
    # immediately) AND under "blueTeam" (so the aggregate Blue Team
    # Summary button can show the most recent lookup too)
    summaries[key] = final_summary
    summaries["blueTeam"] = final_summary
    evidence_store["blueTeam"] = result["evidence"]

    # Add to the searchable case context, same as Wazuh investigations
    try:
        store_investigation(
            key=key, label=f"{ioc_type} lookup ({target})",
            summary=final_summary, evidence=result["evidence"],
        )
    except ChromaError:
        pass

    return {
        "status": "available",
        "key": key,
        "summary": final_summary,
        "evidence": result["evidence"],
    }


@app.post("/api/blue-team/ip")
def blue_team_ip_lookup(payload: IOCRequest):
    return _run_ioc_lookup("ipLookup", payload.target, "IP address", lookup_ip)


@app.post("/api/blue-team/hash")
def blue_team_hash_lookup(payload: IOCRequest):
    return _run_ioc_lookup("hashLookup", payload.target, "file hash", lookup_hash)


@app.post("/api/blue-team/summary")
def blue_team_summary():
    if summaries["blueTeam"] is None:
        return {
            "status": "not_available",
            "key": "blueTeam",
            "message": "Blue Team summary not available yet. Run an IP or Hash lookup first."
        }

    return {
        "status": "available",
        "key": "blueTeam",
        "summary": summaries["blueTeam"],
        "evidence": evidence_store.get("blueTeam") or [],
    }


@app.get("/api/context/stats")
def context_stats():
    """How much case context is stored - lets the UI show whether there's anything to query yet."""
    try:
        stats = get_context_stats()
    except ChromaError as e:
        return {"status": "error", "message": str(e), "documents": 0}

    return {"status": "available", **stats}


@app.post("/api/context/search")
def context_search(payload: ContextSearchRequest):
    """
    Search stored case context by meaning. This is the retrieval half of
    the RAG flow - Phase 6 uses it to answer questions and build reports
    from everything gathered so far, not just the last investigation.
    """
    if not payload.query.strip():
        return {"status": "not_available", "message": "Enter something to search for.", "results": []}

    try:
        results = search_context(payload.query, n_results=payload.n_results or 8, key=payload.key)
    except ChromaError as e:
        return {"status": "error", "message": str(e), "results": []}

    if not results:
        return {
            "status": "not_available",
            "message": "No matching case context found. Run some investigations first.",
            "results": [],
        }

    return {"status": "available", "results": results}


@app.post("/api/context/clear")
def context_clear():
    """Wipe stored case context - for starting a fresh investigation."""
    try:
        clear_context()
    except ChromaError as e:
        return {"status": "error", "message": str(e)}

    return {"status": "available", "message": "Case context cleared."}


@app.post("/api/post-question")
def post_question(payload: PostQuestionRequest):
    """
    Answer a question about the investigation using the stored case
    context. This is the full RAG flow: retrieve relevant evidence from
    the vector store, then have the local LLM answer from it.
    """
    question = (payload.question or "").strip()

    if not question:
        return {
            "status": "not_available",
            "key": "postQuestion",
            "message": "Type a question first, then use Post Question."
        }

    try:
        context_docs = search_context(question, n_results=10)
    except ChromaError as e:
        return {"status": "error", "key": "postQuestion", "message": str(e)}

    if not context_docs:
        return {
            "status": "not_available",
            "key": "postQuestion",
            "message": "No case evidence stored yet. Run an investigation first."
        }

    try:
        answer = answer_question(question, context_docs)
    except LMStudioError as e:
        return {"status": "error", "key": "postQuestion", "message": str(e)}

    return {
        "status": "available",
        "key": "postQuestion",
        "summary": answer,
        "sources": len(context_docs),
    }


@app.post("/api/final-report")
def final_report():
    """
    Generate a structured SOC report from everything gathered so far
    across all investigations and lookups.
    """
    try:
        stats = get_context_stats()
        if stats.get("documents", 0) == 0:
            return {
                "status": "not_available",
                "key": "finalReport",
                "message": "No investigation evidence stored yet. Run some investigations first."
            }

        # Broad query so the report draws on the full picture rather than
        # one narrow topic
        context_docs = search_context(
            "security alerts detections findings severity affected systems",
            n_results=40,
        )
    except ChromaError as e:
        return {"status": "error", "key": "finalReport", "message": str(e)}

    try:
        report = generate_report(context_docs)
    except LMStudioError as e:
        return {"status": "error", "key": "finalReport", "message": str(e)}

    summaries["finalReport"] = report

    return {
        "status": "available",
        "key": "finalReport",
        "summary": report,
        "sources": len(context_docs),
    }


class VisionChatRequest(BaseModel):
    """Body for a single-image chat analysis."""
    question: str
    image_data_url: str


async def _get_lm_studio_model():
    models = await lm_studio_client.models.list()
    if not models.data:
        raise RuntimeError("No model is loaded in LM Studio.")
    return models.data[0].id


@app.post("/api/vision-chat")
async def vision_chat(payload: VisionChatRequest):
    """
    Handles one-off image analysis using the official openai Python SDK -
    matching exactly how the working reference Chainlit app calls LM
    Studio for images, including streaming the response.
    """
    try:
        model_id = await _get_lm_studio_model()

        stream = await lm_studio_client.chat.completions.create(
            model=model_id,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": payload.question},
                        {"type": "image_url", "image_url": {"url": payload.image_data_url}},
                    ],
                }
            ],
            temperature=0.5,
            max_tokens=4000,
            top_p=1,
            frequency_penalty=0.3,
            presence_penalty=0.3,
            stream=True,
        )

        full_reply = ""
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full_reply += delta

        return {"status": "available", "reply": full_reply, "model": model_id}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


VISION_MODEL_ID = "qwen/qwen3-vl-4b"


class ChatMessage(BaseModel):
    role: str
    content: Any  # str for plain text, or list[dict] for a vision message


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = None  # from the model selector dropdown


@app.post("/api/chat")
async def chat(payload: ChatRequest):
    """
    Direct SOC AI Chat endpoint - replaces the old Node/server.cjs backend
    entirely, so there's one fewer server to run and no more risk of a
    stray Node process silently serving stale code (which caused most of
    today's confusion). Handles both plain text chat and image messages
    with the same isolation logic server.cjs used: an image message is
    sent alone, with no system prompt and no prior history, matching the
    working reference Chainlit app's call pattern exactly - including
    using AsyncOpenAI, the same client class the reference app uses.

    `payload.model` lets the frontend's model selector pick which loaded
    model to use. Vision messages always use VISION_MODEL_ID regardless
    of what's selected, since the non-vision model can't process images
    at all - picking it for an image message would just fail outright.
    """
    if not payload.messages:
        return JSONResponse(status_code=400, content={"error": "Messages must be a non-empty array"})

    last_message = payload.messages[-1]
    is_vision_message = isinstance(last_message.content, list) and any(
        part.get("type") == "image_url" for part in last_message.content
    )

    if is_vision_message:
        model_id = VISION_MODEL_ID
    elif payload.model:
        model_id = payload.model
    else:
        try:
            model_id = await _get_lm_studio_model()
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": "Could not connect to LM Studio.", "message": str(e)})

    if is_vision_message:
        text_part = next(
            (p for p in last_message.content if p.get("type") == "text"), None
        )
        image_part = next(
            (p for p in last_message.content if p.get("type") == "image_url"), None
        )

        image_url_value = image_part["image_url"]["url"] if image_part else ""
        print(f">>> IMAGE PAYLOAD SIZE: {len(image_url_value)} chars <<<")

        try:
            stream = await lm_studio_client.chat.completions.create(
                model=model_id,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (text_part or {}).get("text") or "Describe this image.",
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": image_part["image_url"]["url"]},
                            },
                        ],
                    }
                ],
                temperature=0.5,
                max_tokens=4000,
                top_p=1,
                frequency_penalty=0.3,
                presence_penalty=0.3,
                stream=True,
            )

            full_reply = ""
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_reply += delta

            return {"reply": full_reply, "model": model_id}
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": "Vision analysis failed", "message": str(e)})

    # Plain text chat: system prompt + full conversation history
    try:
        outgoing_messages = [
            {
                "role": "system",
                "content": (
                    "You are a helpful cybersecurity SOC assistant. Help the "
                    "user analyse alerts, logs, suspicious behaviour, "
                    "evidence, and incident summaries in simple clear language."
                ),
            }
        ] + [{"role": m.role, "content": m.content} for m in payload.messages]

        response = await lm_studio_client.chat.completions.create(
            model=model_id,
            messages=outgoing_messages,
            temperature=0.5,
            max_tokens=4000,
            top_p=1,
            frequency_penalty=0,
            presence_penalty=0,
        )

        reply = response.choices[0].message.content
        return {"reply": reply, "model": model_id}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "Chat request failed", "message": str(e)})


class SendEmailRequest(BaseModel):
    """Body for sending an email to a coworker from the Team panel."""
    to_email: str
    subject: Optional[str] = "Message from SOC AI Chat"
    message: str
    attachment_name: Optional[str] = None
    attachment_data_url: Optional[str] = None  # e.g. "data:text/plain;base64,...."


@app.post("/api/send-email")
def send_email(payload: SendEmailRequest):
    """
    Sends a real email via Gmail SMTP using an App Password (Gmail
    requires this for programmatic SMTP login - a normal account
    password won't work). Set EMAIL_ADDRESS and EMAIL_APP_PASSWORD
    in .env to enable this.
    """
    if not EMAIL_ADDRESS or not EMAIL_APP_PASSWORD:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": (
                    "Email sending isn't configured yet. Set EMAIL_ADDRESS "
                    "and EMAIL_APP_PASSWORD in .env."
                ),
            },
        )

    try:
        msg = MIMEMultipart()
        msg["From"] = EMAIL_ADDRESS
        msg["To"] = payload.to_email
        msg["Subject"] = payload.subject or "Message from SOC AI Chat"

        msg.attach(MIMEText(payload.message, "plain"))

        if payload.attachment_data_url and payload.attachment_name:
            try:
                _, encoded = payload.attachment_data_url.split(",", 1)
                file_bytes = base64.b64decode(encoded)
            except Exception:
                file_bytes = None

            if file_bytes is not None:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(file_bytes)
                encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    f'attachment; filename="{payload.attachment_name}"',
                )
                msg.attach(part)

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(EMAIL_ADDRESS, EMAIL_APP_PASSWORD)
            server.send_message(msg)

        return {"status": "available", "message": "Email sent."}
    except smtplib.SMTPAuthenticationError:
        return JSONResponse(
            status_code=401,
            content={
                "status": "error",
                "message": (
                    "Gmail rejected the credentials. Check EMAIL_ADDRESS and "
                    "EMAIL_APP_PASSWORD - it must be an App Password, not "
                    "your normal Gmail password."
                ),
            },
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
