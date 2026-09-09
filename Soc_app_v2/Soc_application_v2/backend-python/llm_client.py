"""
llm_client.py

Client for talking to a local LM Studio server (OpenAI-compatible API)
to turn raw Wazuh alert evidence into a readable, analyst-style summary
- similar to pasting a file into chat and asking "summarize this."

LM Studio must be open with a model loaded and its local server started
(Developer tab -> Start Server) for this to work. By default it listens
on http://localhost:1234.

Configuration (optional - defaults match LM Studio's defaults):

    LM_STUDIO_HOST   default: localhost
    LM_STUDIO_PORT   default: 1234
"""

import os

import requests
from dotenv import load_dotenv

load_dotenv()

LM_STUDIO_HOST = os.getenv("LM_STUDIO_HOST", "localhost")
LM_STUDIO_PORT = os.getenv("LM_STUDIO_PORT", "1234")

BASE_URL = f"http://{LM_STUDIO_HOST}:{LM_STUDIO_PORT}"


class LMStudioError(Exception):
    """Raised when LM Studio can't be reached, has no model loaded, or errors out."""


def _get_loaded_model_id():
    """
    Ask LM Studio which model is currently loaded, so we don't have to
    hardcode a model name that might not match what's actually running.
    """
    try:
        response = requests.get(f"{BASE_URL}/v1/models", timeout=5)
    except requests.exceptions.ConnectionError as e:
        raise LMStudioError(
            f"Could not reach LM Studio at {BASE_URL}. "
            f"Make sure LM Studio is open and the local server is started "
            f"(Developer tab -> Start Server)."
        ) from e

    response.raise_for_status()
    data = response.json()
    models = data.get("data", [])

    if not models:
        raise LMStudioError(
            "LM Studio server is running but no model is loaded. "
            "Load a model in LM Studio first."
        )

    return models[0]["id"]


def _call_llm_messages(messages, max_tokens=4000):
    """
    Lower-level LLM call accepting a full messages array and an optional
    max_tokens override - used when a separate system prompt or unlimited
    output length is needed (e.g. Final Report), rather than the single
    combined user-prompt style _call_llm() uses.
    """
    model_id = _get_loaded_model_id()

    payload = {
        "model": model_id,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": max_tokens,
        "top_p": 1,
        "frequency_penalty": 0,
        "presence_penalty": 0,
    }

    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            timeout=None,
        )
    except requests.exceptions.ConnectionError as e:
        raise LMStudioError(
            f"Could not reach LM Studio at {BASE_URL} to generate the summary."
        ) from e

    if response.status_code != 200:
        raise LMStudioError(
            f"LM Studio returned an error (status {response.status_code}): {response.text[:200]}"
        )

    data = response.json()

    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as e:
        raise LMStudioError(
            f"Unexpected response format from LM Studio: {data}"
        ) from e


def _call_llm(prompt: str):
    """
    Shared low-level call to LM Studio's chat completions endpoint, using
    a single combined user prompt (no separate system message). Used by
    summarize_evidence(), summarize_ioc(), and answer_question().
    """
    return _call_llm_messages([{"role": "user", "content": prompt}])


def summarize_evidence(evidence_lines, stats_summary, investigation_type="Threat Hunting"):
    """
    Send Wazuh evidence to the local LLM and get back a readable,
    analyst-style summary.

    Args:
        evidence_lines: list of short strings, one per alert
        stats_summary: the rule-based stats summary (count/severity),
                        given as extra context to the model
        investigation_type: label for the prompt (e.g. "Threat Hunting")

    Returns:
        A string containing the LLM's summary.

    Raises:
        LMStudioError: if LM Studio can't be reached, has no model
                       loaded, or returns an error.
    """
    evidence_text = "\n".join(evidence_lines) if evidence_lines else "No alert evidence available."

    prompt = (
        f"You are a SOC analyst assistant. Below is real Wazuh alert data "
        f"from a {investigation_type} investigation.\n\n"
        f"Stats: {stats_summary}\n\n"
        f"Alerts:\n{evidence_text}\n\n"
        f"Write a concise, plain-English summary (3-5 sentences) of what "
        f"is happening, highlighting the most severe or suspicious "
        f"activity. Only use the data given above - do not invent "
        f"details that aren't present in it."
    )

    return _call_llm(prompt)


def summarize_ioc(result, ioc_type="IP address"):
    """
    Send a VirusTotal lookup result to the local LLM and get back a
    readable, analyst-style summary of the reputation findings.

    Args:
        result: the normalized dict returned by vt_client.lookup_ip()
                or vt_client.lookup_hash()
        ioc_type: label for the prompt (e.g. "IP address", "file hash")

    Returns:
        A string containing the LLM's summary.

    Raises:
        LMStudioError: if LM Studio can't be reached, has no model
                       loaded, or returns an error.
    """
    evidence_lines = [
        f"{item['engine']}: {item['category']} ({item['result']})"
        for item in result.get("evidence", [])
    ]
    evidence_text = "\n".join(evidence_lines) if evidence_lines else "No engines flagged this as malicious or suspicious."

    stats_summary = (
        f"{result['malicious']} malicious, {result['suspicious']} suspicious, "
        f"{result['harmless']} harmless, {result['undetected']} undetected "
        f"out of {result['total_engines']} engines."
    )

    prompt = (
        f"You are a SOC analyst assistant. Below is a VirusTotal reputation "
        f"lookup for a {ioc_type}: {result['target']}.\n\n"
        f"Stats: {stats_summary}\n\n"
        f"Flagged by:\n{evidence_text}\n\n"
        f"Write a concise, plain-English summary (2-4 sentences) of the "
        f"reputation and risk level of this {ioc_type}. Only use the data "
        f"given above - do not invent details that aren't present in it."
    )

    return _call_llm(prompt)


def answer_question(question: str, context_docs):
    """
    Answer a question about the investigation using retrieved case
    context (the RAG step): the relevant evidence is pulled from the
    vector store first, then handed to the model as grounding.

    Uses the exact system prompt/rules from the reference implementation's
    "Report Question" feature - "answer using ONLY the evidence, do not
    guess or fill gaps, say clearly when something isn't found" - adapted
    only to reference "evidence" rather than "the saved final report",
    since this pulls fresh from the vector store rather than a single
    previously-generated report text.

    Args:
        question: the analyst's question
        context_docs: list of {"text": ..., "metadata": {...}} from
                      chroma_client.search_context()

    Returns:
        A string containing the LLM's answer.
    """
    context_text = "\n".join(
        f"- [{doc['metadata'].get('label', 'unknown')}] {doc['text']}"
        for doc in context_docs
    ) or "No case context available."

    messages = [
        {
            "role": "system",
            "content": (
                "Answer using ONLY the evidence below. "
                "Do not use outside knowledge. "
                "Do not guess or fill gaps. "
                "If the answer is not clearly supported by the evidence, say: Not found in the evidence."
            ),
        },
        {
            "role": "user",
            "content": f"Evidence:\n\n{context_text}\n\nQuestion: {question}",
        },
    ]

    return _call_llm_messages(messages)


FINAL_REPORT_SYSTEM_PROMPT = (
    "You are an expert SOC analyst. Use ONLY the provided summaries. "
    "Do not invent missing evidence."
)

FINAL_REPORT_PROMPT = """
You are an expert SOC analyst writing a readable investigation report.

Output format (Markdown):
- Use Markdown headings for every section (use "#", "##").
- Write narrative paragraphs (no bullet points), EXCEPT the 5Ws can be bullet points.
- Do NOT wrap the report in code fences (no ```).

Accuracy rules:
- Use ONLY the provided summaries. Do NOT invent IPs/hosts/users/timestamps/actions.
- If something is missing, say "Unknown (not present in the file)."

Writing rules:
- Each section must be at least 4 sentences (detailed and readable).

Structure (use these as Markdown headings):
# Investigation Report

## 1. Validation / Detection

## 5Ws
(You may use bullet points here only.)

## 2. Methodologies / Steps

## 3. Findings
Images:
- If any "Image Evidence" is present and the provided summaries for the image are available, you may reference them.
- Use a placeholder on its own line where relevant:
#IMAGE_HERE: <image filename or FIGURE id>
- Immediately follow with "Image note:" summarising ONLY what is written in the Image Evidence text.

## 4. Scope
Include lateral movement, privilege escalation, unidentified earlier events, and subsequent relevant events if present.
If not present, say Unknown (not present in the file).

## Impact Assessment
(If applicable based on the provided summaries.)

## Conclusion
Classify as True Positive / False Positive / Benign (based only on provided summaries).
If True Positive, include remediation steps taken (with evidence if possible).

## Next Steps / Call to Action
Include immediate actions and future actions.

## Final Summary
The final summary should be concise but detailed enough to capture the main ideas.
"""


def generate_report(context_docs):
    """
    Generate a structured SOC investigation report from everything
    stored in the case context - using the exact prompt, system message,
    and structure from the reference implementation (Markdown headings,
    5Ws section, image placeholder convention, True/False Positive
    classification, unlimited output length).

    Args:
        context_docs: list of {"text": ..., "metadata": {...}} from
                      chroma_client.search_context()

    Returns:
        A string containing the Markdown report.
    """
    context_text = "\n\n".join(
        f"Summary {i}\n"
        f"Source: {doc['metadata'].get('label', 'unknown')}\n"
        f"Content:\n{doc['text']}"
        for i, doc in enumerate(context_docs, start=1)
    ) or "No case context available."

    messages = [
        {"role": "system", "content": FINAL_REPORT_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Provided summaries:\n\n{context_text}\n\n{FINAL_REPORT_PROMPT}",
        },
    ]

    # Reports can run long - matching the reference app's unlimited
    # output length for this call specifically, rather than the normal
    # 4000-token cap used elsewhere.
    return _call_llm_messages(messages, max_tokens=-1)
