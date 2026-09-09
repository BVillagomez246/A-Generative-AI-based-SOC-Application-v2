"""
wazuh_client.py

Small client for talking to the Wazuh Indexer (OpenSearch) REST API.
This is used by the /api/ml/threat-hunting endpoint (and later, the other
Wazuh-backed endpoints) to pull real alert data instead of returning
placeholder responses.

Configuration is read from environment variables so credentials never
live in source code:

    WAZUH_INDEXER_HOST      e.g. 192.168.56.10   (your VM's IP)
    WAZUH_INDEXER_PORT      default: 9200
    WAZUH_INDEXER_USER      default: admin
    WAZUH_INDEXER_PASSWORD  (no default - must be set)

Put these in a .env file next to main.py (see .env.example) and load
them with python-dotenv, or export them in your shell before running
uvicorn.
"""

import os
from datetime import datetime, timedelta, timezone

import requests
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv
import urllib3

# Load .env HERE, before reading any environment variables below.
# This must happen at the top of this module (not just in main.py) so
# the values are guaranteed to be set no matter what order main.py
# imports things in.
load_dotenv()

# The Wazuh Indexer uses a self-signed certificate by default, so we
# disable the (correct, but noisy) warning requests prints about that.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

WAZUH_INDEXER_HOST = os.getenv("WAZUH_INDEXER_HOST", "localhost")
WAZUH_INDEXER_PORT = os.getenv("WAZUH_INDEXER_PORT", "9200")
WAZUH_INDEXER_USER = os.getenv("WAZUH_INDEXER_USER", "admin")
WAZUH_INDEXER_PASSWORD = os.getenv("WAZUH_INDEXER_PASSWORD", "")

BASE_URL = f"https://{WAZUH_INDEXER_HOST}:{WAZUH_INDEXER_PORT}"


class WazuhConnectionError(Exception):
    """Raised when the Indexer can't be reached at all (network/DNS/refused)."""


class WazuhAuthError(Exception):
    """Raised when the Indexer rejects the credentials (401/403)."""


def get_recent_alerts(hours: float = None, start: str = None, end: str = None, size: int = 200,
                       rule_group=None, require_mitre: bool = False, exclude_rule_groups=None,
                       exclude_mitre: bool = False, agent: str = None):
    """
    Query the Wazuh Indexer for alerts.

    Either provide `hours` (look back N hours from now), or explicit
    `start` / `end` ISO 8601 timestamps for a custom range. If neither
    is given, defaults to the last 24 hours.

    Optional filters:
        rule_group: a Wazuh rule group name (e.g. "syscheck"), or a
                    list of group names to match ANY of (e.g.
                    ["rootcheck", "virustotal"]). Matches against the
                    rule.groups field that every Wazuh alert has.
        require_mitre: if True, only return alerts that have a MITRE
                       ATT&CK technique attached (rule.mitre.id exists).
                       Used for the MITRE investigation view.
        exclude_rule_groups: a list of rule group names to EXCLUDE.
                             Used so broad views (like Threat Hunting)
                             don't duplicate alerts already covered by
                             more specific tabs (File Integrity,
                             Vulnerability, Malware Detection, SCA).
        exclude_mitre: if True, exclude alerts that have a MITRE
                       ATT&CK technique attached. Used so Threat
                       Hunting doesn't duplicate the MITRE tab.
        agent: only return alerts from this specific agent name.

    Returns a list of raw alert documents (the "_source" field of each
    search hit) - each one is a dict shaped like a normal Wazuh alert
    (rule, agent, timestamp, full_log, etc).

    Raises:
        WazuhConnectionError: if the Indexer can't be reached at all.
        WazuhAuthError: if credentials are rejected.
        requests.exceptions.HTTPError: for other non-2xx responses.
    """
    if start and end:
        start_time = start
        end_time = end
    else:
        hours = hours if hours is not None else 24
        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(hours=hours)
        start_time = start_dt.isoformat()
        end_time = end_dt.isoformat()

    filters = [
        {
            "range": {
                "@timestamp": {
                    "gte": start_time,
                    "lte": end_time,
                }
            }
        }
    ]

    if rule_group:
        if isinstance(rule_group, (list, tuple)):
            filters.append({"terms": {"rule.groups": list(rule_group)}})
        else:
            filters.append({"term": {"rule.groups": rule_group}})

    if require_mitre:
        filters.append({"exists": {"field": "rule.mitre.id"}})

    if agent:
        filters.append({"term": {"agent.name": agent}})

    bool_query = {"filter": filters}

    must_not_filters = []
    if exclude_rule_groups:
        must_not_filters.append({"terms": {"rule.groups": list(exclude_rule_groups)}})
    if exclude_mitre:
        must_not_filters.append({"exists": {"field": "rule.mitre.id"}})

    if must_not_filters:
        bool_query["must_not"] = must_not_filters

    query = {
        "size": size,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "query": {
            "bool": bool_query
        },
    }

    try:
        response = requests.post(
            f"{BASE_URL}/wazuh-alerts-*/_search",
            json=query,
            auth=HTTPBasicAuth(WAZUH_INDEXER_USER, WAZUH_INDEXER_PASSWORD),
            verify=False,  # self-signed cert
            timeout=15,
        )
    except requests.exceptions.ConnectionError as e:
        raise WazuhConnectionError(
            f"Could not reach the Wazuh Indexer at {BASE_URL}. "
            f"Check the VM is running, reachable, and the port is open."
        ) from e
    except requests.exceptions.Timeout as e:
        raise WazuhConnectionError(
            f"Connection to {BASE_URL} timed out."
        ) from e

    if response.status_code in (401, 403):
        raise WazuhAuthError(
            "Wazuh Indexer rejected the credentials. "
            "Check WAZUH_INDEXER_USER / WAZUH_INDEXER_PASSWORD."
        )

    response.raise_for_status()

    data = response.json()
    hits = data.get("hits", {}).get("hits", [])

    return [hit["_source"] for hit in hits]


def get_agent_list():
    """
    Get the list of distinct agent names seen in the Wazuh alerts index,
    used to populate the agent selector dropdown in the UI.

    Looks back 30 days by default so agents that reported recently but
    not in the last few hours still show up in the list.
    """
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=30)

    query = {
        "size": 0,
        "query": {
            "range": {
                "@timestamp": {
                    "gte": start_dt.isoformat(),
                    "lte": end_dt.isoformat(),
                }
            }
        },
        "aggs": {
            "agents": {
                "terms": {
                    "field": "agent.name",
                    "size": 200
                }
            }
        }
    }

    try:
        response = requests.post(
            f"{BASE_URL}/wazuh-alerts-*/_search",
            json=query,
            auth=HTTPBasicAuth(WAZUH_INDEXER_USER, WAZUH_INDEXER_PASSWORD),
            verify=False,
            timeout=15,
        )
    except requests.exceptions.ConnectionError as e:
        raise WazuhConnectionError(
            f"Could not reach the Wazuh Indexer at {BASE_URL}. "
            f"Check the VM is running, reachable, and the port is open."
        ) from e
    except requests.exceptions.Timeout as e:
        raise WazuhConnectionError(
            f"Connection to {BASE_URL} timed out."
        ) from e

    if response.status_code in (401, 403):
        raise WazuhAuthError(
            "Wazuh Indexer rejected the credentials. "
            "Check WAZUH_INDEXER_USER / WAZUH_INDEXER_PASSWORD."
        )

    response.raise_for_status()

    data = response.json()
    buckets = data.get("aggregations", {}).get("agents", {}).get("buckets", [])

    return sorted(bucket["key"] for bucket in buckets)


def summarize_alerts(alerts, top_n: int = 5):
    """
    Turn a list of raw Wazuh alert dicts into a simple score + summary +
    evidence list. This is a rule-based pass for now (no ML/LLM yet) -
    that comes in the next Phase 2 steps.
    """
    if not alerts:
        return {
            "score": 0,
            "summary": "No alerts found in the selected time range.",
            "evidence": [],
        }

    levels = [a.get("rule", {}).get("level", 0) for a in alerts]
    max_level = max(levels)
    avg_level = round(sum(levels) / len(levels), 1)

    top_alerts = sorted(
        alerts, key=lambda a: a.get("rule", {}).get("level", 0), reverse=True
    )[:top_n]

    evidence = []
    for alert in top_alerts:
        mitre = alert.get("rule", {}).get("mitre", {})
        evidence.append(
            {
                "timestamp": alert.get("timestamp", "unknown time"),
                "agent": alert.get("agent", {}).get("name", "unknown agent"),
                "rule_id": alert.get("rule", {}).get("id", "?"),
                "level": alert.get("rule", {}).get("level", "?"),
                "description": alert.get("rule", {}).get(
                    "description", "no description"
                ),
                "mitre_techniques": mitre.get("id", []),
                "mitre_tactics": mitre.get("tactic", []),
            }
        )

    summary = (
        f"{len(alerts)} alerts found. "
        f"Highest severity level: {max_level}. "
        f"Average level: {avg_level}."
    )

    return {
        "score": max_level,
        "summary": summary,
        "evidence": evidence,
    }
