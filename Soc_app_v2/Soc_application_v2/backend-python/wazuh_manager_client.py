"""
wazuh_manager_client.py

Client for the Wazuh Manager REST API (default port 55000) - separate
from wazuh_client.py, which talks to the Indexer (port 9200).

This is used specifically to get the full list of REGISTERED agents,
including ones that are disconnected or have never connected. The
Indexer alone can't tell us that - it only knows about agents that
have actually generated an alert.

Configuration (falls back to the Indexer host if not set separately,
since they're often the same VM):

    WAZUH_MANAGER_HOST      default: same as WAZUH_INDEXER_HOST
    WAZUH_MANAGER_PORT      default: 55000
    WAZUH_MANAGER_USER      default: wazuh-wui
    WAZUH_MANAGER_PASSWORD  (no default - must be set)

Where to find the password: it was generated during Wazuh install,
usually saved alongside the Indexer's admin password (same archive/
notes you already used for WAZUH_INDEXER_PASSWORD). The default
manager API user is typically "wazuh-wui" or "wazuh" depending on
your install method.

The Manager API doesn't use basic auth for regular requests - you log
in once with username/password to get a JWT token, then send that
token (Bearer auth) on every subsequent request.
"""

import os

import requests
from dotenv import load_dotenv
import urllib3

load_dotenv()

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

WAZUH_MANAGER_HOST = os.getenv("WAZUH_MANAGER_HOST", os.getenv("WAZUH_INDEXER_HOST", "localhost"))
WAZUH_MANAGER_PORT = os.getenv("WAZUH_MANAGER_PORT", "55000")
WAZUH_MANAGER_USER = os.getenv("WAZUH_MANAGER_USER", "wazuh-wui")
WAZUH_MANAGER_PASSWORD = os.getenv("WAZUH_MANAGER_PASSWORD", "")

BASE_URL = f"https://{WAZUH_MANAGER_HOST}:{WAZUH_MANAGER_PORT}"


class WazuhManagerError(Exception):
    """Raised when the Manager API can't be reached, rejects auth, or errors out."""


def _get_token():
    """Log in with username/password and get back a JWT token."""
    try:
        response = requests.post(
            f"{BASE_URL}/security/user/authenticate",
            auth=(WAZUH_MANAGER_USER, WAZUH_MANAGER_PASSWORD),
            verify=False,
            timeout=15,
        )
    except requests.exceptions.ConnectionError as e:
        raise WazuhManagerError(
            f"Could not reach the Wazuh Manager API at {BASE_URL}. "
            f"Check the VM is running and port 55000 is reachable "
            f"(same kind of check we did for port 9200)."
        ) from e

    if response.status_code in (401, 403):
        raise WazuhManagerError(
            "Wazuh Manager API rejected the credentials. "
            "Check WAZUH_MANAGER_USER / WAZUH_MANAGER_PASSWORD in .env."
        )

    response.raise_for_status()
    data = response.json()

    try:
        return data["data"]["token"]
    except KeyError as e:
        raise WazuhManagerError(f"Unexpected auth response from Manager API: {data}") from e


def get_all_agents():
    """
    Returns the FULL list of registered agents from the Wazuh Manager,
    regardless of whether they've alerted recently - including their
    real connection status.

    Returns a list of dicts like:
        {"id": "001", "name": "kali", "status": "active",
         "os": "Linux", "ip": "192.168.1.100"}

    status will be one of: "active", "disconnected", "never_connected", "pending"
    """
    token = _get_token()

    try:
        response = requests.get(
            f"{BASE_URL}/agents",
            headers={"Authorization": f"Bearer {token}"},
            params={"select": "id,name,status,os.platform,ip"},
            verify=False,
            timeout=15,
        )
    except requests.exceptions.ConnectionError as e:
        raise WazuhManagerError(
            f"Could not reach the Wazuh Manager API at {BASE_URL}."
        ) from e

    response.raise_for_status()
    data = response.json()

    try:
        items = data["data"]["affected_items"]
    except KeyError as e:
        raise WazuhManagerError(f"Unexpected response from Manager API: {data}") from e

    agents = []
    for item in items:
        agents.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "status": item.get("status", "unknown"),
            "os": (item.get("os") or {}).get("platform", ""),
            "ip": item.get("ip", ""),
        })

    return agents
