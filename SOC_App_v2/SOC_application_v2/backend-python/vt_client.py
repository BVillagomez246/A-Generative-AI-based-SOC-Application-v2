"""
vt_client.py

Client for the VirusTotal Public API v3 - used for IP address and file
hash reputation lookups in the Blue Team Assistant tab.

Configuration:
    VT_API_KEY   (no default - must be set)

Get a free key at https://www.virustotal.com (sign up, then Profile
icon -> API Key).

Note: the free/public API is limited to 4 requests/minute and 500
requests/day, and its terms restrict it to non-commercial use - fine
for this project, just don't hammer it with rapid repeated lookups.
"""

import os

import requests
from dotenv import load_dotenv

load_dotenv()

VT_API_KEY = os.getenv("VT_API_KEY", "")

BASE_URL = "https://www.virustotal.com/api/v3"


class VTError(Exception):
    """Raised when VirusTotal can't be reached, rejects the key, rate-limits, or errors out."""


class VTNotFoundError(Exception):
    """Raised when VirusTotal has no record of this target (never scanned/seen) - not a failure, just no data."""


def _headers():
    if not VT_API_KEY:
        raise VTError(
            "No VirusTotal API key configured. Set VT_API_KEY in your .env file."
        )
    return {"x-apikey": VT_API_KEY}


def _normalize_result(response_json, target: str, target_type: str, top_n: int = 10):
    """
    Turn VirusTotal's raw API v3 response into a simple, consistent
    shape our endpoints/frontend can work with regardless of whether
    it came from an IP or file hash lookup.
    """
    attributes = response_json.get("data", {}).get("attributes", {})
    stats = attributes.get("last_analysis_stats", {}) or {}
    results = attributes.get("last_analysis_results", {}) or {}

    flagged = [
        {
            "engine": engine_name,
            "category": info.get("category", "unknown"),
            "result": info.get("result") or "-",
        }
        for engine_name, info in results.items()
        if info.get("category") in ("malicious", "suspicious")
    ]
    # Malicious first, then suspicious
    flagged.sort(key=lambda item: 0 if item["category"] == "malicious" else 1)

    if target_type == "ip":
        extra = {
            "country": attributes.get("country", "unknown"),
            "as_owner": attributes.get("as_owner", "unknown"),
            "reputation": attributes.get("reputation", 0),
        }
    else:
        extra = {
            "meaningful_name": attributes.get("meaningful_name", "unknown"),
            "type_description": attributes.get("type_description", "unknown"),
            "size": attributes.get("size", 0),
        }

    return {
        "target": target,
        "type": target_type,
        "malicious": stats.get("malicious", 0),
        "suspicious": stats.get("suspicious", 0),
        "harmless": stats.get("harmless", 0),
        "undetected": stats.get("undetected", 0),
        "total_engines": sum(stats.values()) if stats else 0,
        "extra": extra,
        "evidence": flagged[:top_n],
    }


def _get(endpoint: str, target: str, target_type: str):
    try:
        response = requests.get(
            f"{BASE_URL}/{endpoint}/{target}",
            headers=_headers(),
            timeout=30,
        )
    except requests.exceptions.ConnectionError as e:
        raise VTError(
            "Could not reach VirusTotal - check your internet connection."
        ) from e
    except requests.exceptions.Timeout as e:
        raise VTError("VirusTotal took too long to respond.") from e

    if response.status_code == 404:
        raise VTNotFoundError(
            f"VirusTotal has no record of this {target_type} - "
            f"it may never have been scanned or seen before."
        )

    if response.status_code == 401:
        raise VTError("VirusTotal rejected the API key. Check VT_API_KEY in .env.")

    if response.status_code == 429:
        raise VTError(
            "VirusTotal rate limit hit (free tier: 4 requests/minute, "
            "500/day). Wait a moment and try again."
        )

    response.raise_for_status()

    return _normalize_result(response.json(), target, target_type)


def lookup_ip(ip: str):
    """Look up an IP address's reputation on VirusTotal."""
    return _get("ip_addresses", ip, "ip")


def lookup_hash(file_hash: str):
    """Look up a file hash's reputation on VirusTotal (MD5, SHA1, or SHA256)."""
    return _get("files", file_hash, "file")
