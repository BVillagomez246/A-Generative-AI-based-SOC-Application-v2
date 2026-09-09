"""
chroma_client.py

Local vector store for SOC case context, using ChromaDB.

Everything an investigation produces - Wazuh summaries, VirusTotal
lookups, evidence - gets stored here so it can be searched later by
meaning rather than exact keywords. This is what makes Phase 6 (Post
Question / Final Report) possible: instead of only seeing the last
thing you clicked, the AI can pull relevant evidence from the whole
case.

Everything runs locally:
  - Storage is a folder on disk (./chroma_db by default), so results
    survive restarts.
  - Embeddings use ChromaDB's built-in all-MiniLM-L6-v2 model, which
    runs on your machine. No API key, no data leaving the laptop.

The embedding model (~80MB) downloads automatically the first time
this module is used, then is cached locally.

Configuration:
    CHROMA_PATH   default: ./chroma_db
"""

import os
from datetime import datetime, timezone

import chromadb
from dotenv import load_dotenv

load_dotenv()

CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")
COLLECTION_NAME = "soc_case_context"


class ChromaError(Exception):
    """Raised when the vector store can't be reached or a query fails."""


_client = None
_collection = None


def _get_collection():
    """
    Lazily create the client/collection on first use rather than at
    import time - so if ChromaDB has a problem, it surfaces as a clean
    error on the endpoint that needed it instead of stopping the whole
    FastAPI app from starting.
    """
    global _client, _collection

    if _collection is not None:
        return _collection

    try:
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
        _collection = _client.get_or_create_collection(name=COLLECTION_NAME)
    except Exception as e:
        raise ChromaError(f"Could not open the local vector store at {CHROMA_PATH}: {e}") from e

    return _collection


def store_investigation(key: str, label: str, summary: str, evidence=None,
                         agent: str = None, time_range: str = None):
    """
    Store one completed investigation (or IOC lookup) in the case context.

    Each call adds two kinds of document:
      - the summary itself (the analyst-readable conclusion)
      - one document per evidence item (so specific alerts/detections
        can be found individually later)

    Args:
        key: investigation key, e.g. "threatHunting", "ipLookup"
        label: human label, e.g. "Threat Hunting"
        summary: the AI-written summary text
        evidence: list of evidence dicts from the investigation
        agent: agent name the investigation was scoped to, if any
        time_range: description of the window investigated, if any
    """
    collection = _get_collection()

    timestamp = datetime.now(timezone.utc).isoformat()
    base_metadata = {
        "key": key,
        "label": label,
        "stored_at": timestamp,
        "agent": agent or "all",
        "time_range": time_range or "unspecified",
    }

    documents = [f"{label} summary: {summary}"]
    metadatas = [{**base_metadata, "doc_type": "summary"}]
    ids = [f"{key}-summary-{timestamp}"]

    for index, item in enumerate(evidence or []):
        # Evidence shape differs between Wazuh alerts and VirusTotal
        # results, so build the text from whichever fields are present.
        if "engine" in item:
            text = (
                f"{label} evidence - {item.get('engine')} flagged this as "
                f"{item.get('category')}: {item.get('result')}"
            )
        else:
            text = (
                f"{label} evidence - [{item.get('timestamp')}] "
                f"{item.get('agent')} level {item.get('level')}: "
                f"{item.get('description')}"
            )

        documents.append(text)
        metadatas.append({**base_metadata, "doc_type": "evidence"})
        ids.append(f"{key}-evidence-{index}-{timestamp}")

    try:
        collection.add(documents=documents, metadatas=metadatas, ids=ids)
    except Exception as e:
        raise ChromaError(f"Could not store investigation in the vector store: {e}") from e

    return len(documents)


def search_context(query: str, n_results: int = 8, key: str = None):
    """
    Search the stored case context by meaning.

    Args:
        query: what to look for, in plain language
        n_results: how many matching documents to return
        key: optionally restrict to one investigation type

    Returns a list of dicts: {"text": ..., "metadata": {...}}
    """
    collection = _get_collection()

    where = {"key": key} if key else None

    try:
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where,
        )
    except Exception as e:
        raise ChromaError(f"Vector store search failed: {e}") from e

    documents = (results.get("documents") or [[]])[0]
    metadatas = (results.get("metadatas") or [[]])[0]

    return [
        {"text": text, "metadata": metadata}
        for text, metadata in zip(documents, metadatas)
    ]


def get_context_stats():
    """
    How much case context is currently stored - used by the UI to show
    whether there's anything to ask questions about yet.
    """
    collection = _get_collection()

    try:
        count = collection.count()
    except Exception as e:
        raise ChromaError(f"Could not read the vector store: {e}") from e

    return {"documents": count}


def clear_context():
    """
    Wipe all stored case context - useful when starting a fresh
    investigation and you don't want old evidence bleeding in.
    """
    global _collection

    collection = _get_collection()

    try:
        _client.delete_collection(name=COLLECTION_NAME)
        _collection = _client.get_or_create_collection(name=COLLECTION_NAME)
    except Exception as e:
        raise ChromaError(f"Could not clear the vector store: {e}") from e

    return True
