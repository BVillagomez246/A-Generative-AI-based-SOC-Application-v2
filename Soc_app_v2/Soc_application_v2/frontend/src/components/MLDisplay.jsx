import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:8000';

const PRESET_OPTIONS = [
    { label: '15m', hours: 0.25 },
    { label: '1h', hours: 1 },
    { label: '24h', hours: 24 },
    { label: '7d', hours: 168 },
    { label: '30d', hours: 720 },
];

const formatAgentStatus = (status) => {
    switch (status) {
        case 'active':
            return 'Active';
        case 'disconnected':
            return 'Disconnected';
        case 'never_connected':
            return 'Never connected';
        case 'pending':
            return 'Pending';
        default:
            return status || 'Unknown';
    }
};

const MLDisplay = ({ summaries = {}, onSummaryUpdate }) => {
    const [activeView, setActiveView] = useState('ml');
    const [selectedSection, setSelectedSection] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [localSummaries, setLocalSummaries] = useState(summaries);
    const [localEvidence, setLocalEvidence] = useState({});

    // Time range picker state
    const [timeRangeMode, setTimeRangeMode] = useState('preset'); // 'preset' | 'custom'
    const [selectedPreset, setSelectedPreset] = useState('24h');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // Agent selector state
    const [agents, setAgents] = useState([]);
    const [selectedAgent, setSelectedAgent] = useState('');

    // Blue Team IOC lookup state
    const [iocTarget, setIocTarget] = useState('');

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/wazuh/agents`);
                const data = await response.json();
                if (data.status === 'available' && Array.isArray(data.agents)) {
                    setAgents(data.agents);
                }
            } catch (error) {
                // Silently ignore - the agent selector just stays on "All agents"
                // if the backend/Wazuh isn't reachable yet.
            }
        };

        fetchAgents();
    }, []);

    const endpointMap = {
        threatHunting: '/api/ml/threat-hunting',
        fileIntegrity: '/api/ml/file-integrity',
        mitre: '/api/ml/mitre',
        vulnerability: '/api/ml/vulnerability',
        malwareDetection: '/api/ml/malware-detection',
        blueTeam: '/api/blue-team/summary',
        ipLookup: '/api/blue-team/ip',
        hashLookup: '/api/blue-team/hash',
        virusTotal: '/api/blue-team/summary',
    };

    const getTimeRangePayload = () => {
        let payload;

        if (timeRangeMode === 'custom' && customStart && customEnd) {
            payload = {
                start: new Date(customStart).toISOString(),
                end: new Date(customEnd).toISOString(),
            };
        } else {
            const preset =
                PRESET_OPTIONS.find((p) => p.label === selectedPreset) ||
                PRESET_OPTIONS[2];
            payload = { hours: preset.hours };
        }

        if (selectedAgent) {
            payload.agent = selectedAgent;
        }

        return payload;
    };

    const getTimeRangeLabel = () => {
        if (timeRangeMode === 'custom' && customStart && customEnd) {
            return `${new Date(customStart).toLocaleString()} → ${new Date(
                customEnd
            ).toLocaleString()}`;
        }
        return `Last ${selectedPreset}`;
    };

    const handleSummaryClick = async (summaryKey, label) => {
        setSelectedSection(summaryKey);
        setStatusMessage('');
        setIsLoading(true);

        const endpoint = endpointMap[summaryKey];

        if (!endpoint) {
            setStatusMessage(`${label} endpoint not found.`);
            setIsLoading(false);
            return;
        }

        const isIocLookup = summaryKey === 'ipLookup' || summaryKey === 'hashLookup';

        if (isIocLookup && !iocTarget.trim()) {
            setStatusMessage(
                `Enter an ${summaryKey === 'ipLookup' ? 'IP address' : 'file hash'} above first.`
            );
            setIsLoading(false);
            return;
        }

        const requestBody = isIocLookup
            ? { target: iocTarget.trim() }
            : getTimeRangePayload();

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }

            if (data.status === 'available') {
                const newSummary = data.summary;

                setLocalSummaries((prev) => ({
                    ...prev,
                    [data.key]: newSummary,
                    ...(typeof data.score !== 'undefined'
                        ? { threatScore: data.score }
                        : {}),
                }));

                if (Array.isArray(data.evidence)) {
                    setLocalEvidence((prev) => ({
                        ...prev,
                        [data.key]: data.evidence,
                    }));
                }

                if (onSummaryUpdate) {
                    onSummaryUpdate(data.key, newSummary);

                    // IP/Hash lookups come back keyed as ipLookup/hashLookup,
                    // but the chat dropdown lists them under "Blue Team
                    // Summary", so register them there too.
                    if (data.key === 'ipLookup' || data.key === 'hashLookup') {
                        onSummaryUpdate('blueTeam', newSummary);
                    }

                    if (typeof data.score !== 'undefined') {
                        onSummaryUpdate('threatScore', data.score);
                    }
                }

                setStatusMessage('');
            } else {
                setStatusMessage(data.message || `${label} summary not available yet.`);
            }
        } catch (error) {
            setStatusMessage(
                'Could not connect to the Python backend. Make sure FastAPI is running on port 8000.'
            );
        } finally {
            setIsLoading(false);
        }
    };

    const selectedSummary =
        localSummaries[selectedSection] || summaries[selectedSection];

    const selectedEvidence = localEvidence[selectedSection];

    return (
        <div className="ml-display">
            <div className="ml-display-header">
                <div>
                    <h2>ML Display</h2>
                    <span>Analysis Output</span>
                </div>
            </div>

            <div className="panel-tabs">
                <button
                    type="button"
                    className={activeView === 'ml' ? 'tab-active' : ''}
                    onClick={() => {
                        setActiveView('ml');
                        setStatusMessage('');
                        setSelectedSection('');
                    }}
                >
                    ML / Wazuh
                </button>

                <button
                    type="button"
                    className={activeView === 'blueTeam' ? 'tab-active' : ''}
                    onClick={() => {
                        setActiveView('blueTeam');
                        setStatusMessage('');
                        setSelectedSection('');
                    }}
                >
                    Blue Team Assistant
                </button>

                <select
                    className="agent-selector"
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    title="Focus on a specific agent"
                >
                    <option value="">All agents</option>
                    {agents.map((agent) => (
                        <option key={agent.id || agent.name} value={agent.name}>
                            {agent.name} — {formatAgentStatus(agent.status)}
                        </option>
                    ))}
                </select>
            </div>

            <div className="ml-display-content">
                {activeView === 'ml' && (
                    <>
                        <div className="ml-card">
                            <h3>Time Range</h3>

                            <div className="panel-button-grid">
                                {PRESET_OPTIONS.map((preset) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        className={
                                            timeRangeMode === 'preset' &&
                                            selectedPreset === preset.label
                                                ? 'active'
                                                : ''
                                        }
                                        onClick={() => {
                                            setTimeRangeMode('preset');
                                            setSelectedPreset(preset.label);
                                        }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}

                                <button
                                    type="button"
                                    className={timeRangeMode === 'custom' ? 'active' : ''}
                                    onClick={() => setTimeRangeMode('custom')}
                                >
                                    Custom
                                </button>
                            </div>

                            {timeRangeMode === 'custom' && (
                                <div className="time-range-custom">
                                    <div className="time-range-field">
                                        <label htmlFor="customStart">From</label>
                                        <input
                                            type="datetime-local"
                                            id="customStart"
                                            value={customStart}
                                            onChange={(e) => setCustomStart(e.target.value)}
                                        />
                                    </div>

                                    <div className="time-range-field">
                                        <label htmlFor="customEnd">To</label>
                                        <input
                                            type="datetime-local"
                                            id="customEnd"
                                            value={customEnd}
                                            onChange={(e) => setCustomEnd(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            <p className="muted-text time-range-status">
                                Investigating: {getTimeRangeLabel()}
                            </p>
                        </div>

                        <div className="ml-card">
                            <h3>Wazuh Investigation Areas</h3>

                            <div className="panel-button-grid">
                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick(
                                            'threatHunting',
                                            'Threat Hunting'
                                        )
                                    }
                                >
                                    Threat Hunting
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick(
                                            'fileIntegrity',
                                            'File Integrity'
                                        )
                                    }
                                >
                                    File Integrity
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick('mitre', 'MITRE')
                                    }
                                >
                                    MITRE
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick(
                                            'vulnerability',
                                            'Vulnerability'
                                        )
                                    }
                                >
                                    Vulnerability
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick(
                                            'malwareDetection',
                                            'Malware Detection'
                                        )
                                    }
                                >
                                    Malware Detection
                                </button>
                            </div>
                        </div>

                        <div className="ml-card">
                            <h3>Threat Score</h3>
                            <p className="score">
                                {localSummaries.threatScore ||
                                    summaries.threatScore ||
                                    '--'}
                            </p>
                            <p className="muted-text">
                                {localSummaries.threatScore || summaries.threatScore
                                    ? 'Highest severity level from the most recent investigation.'
                                    : 'The ML result will appear here after Wazuh data is connected.'}
                            </p>
                        </div>

                        <div className="ml-card">
                            <h3>Summary</h3>

                            {isLoading ? (
                                <p className="muted-text">Checking Python backend...</p>
                            ) : selectedSummary ? (
                                <p>{selectedSummary}</p>
                            ) : (
                                <p className="muted-text">
                                    {statusMessage || 'No summary available yet.'}
                                </p>
                            )}
                        </div>

                        <div className="ml-card">
                            <h3>Evidence</h3>

                            {isLoading ? (
                                <p className="muted-text">Checking Python backend...</p>
                            ) : selectedEvidence && selectedEvidence.length > 0 ? (
                                selectedSection === 'mitre' ? (
                                    <div className="mitre-table-wrapper">
                                        <table className="mitre-table">
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>Technique(s)</th>
                                                    <th>Tactic(s)</th>
                                                    <th>Description</th>
                                                    <th>Level</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedEvidence.map((item, index) => (
                                                    <tr key={index}>
                                                        <td className="mitre-time">
                                                            {item.timestamp}
                                                        </td>
                                                        <td>
                                                            {item.mitre_techniques &&
                                                            item.mitre_techniques.length > 0
                                                                ? item.mitre_techniques.join(', ')
                                                                : '—'}
                                                        </td>
                                                        <td>
                                                            {item.mitre_tactics &&
                                                            item.mitre_tactics.length > 0
                                                                ? item.mitre_tactics.join(', ')
                                                                : '—'}
                                                        </td>
                                                        <td>{item.description}</td>
                                                        <td>
                                                            <span className="evidence-level">
                                                                {item.level}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <ul className="evidence-list">
                                        {selectedEvidence.map((item, index) => (
                                            <li key={index} className="evidence-item">
                                                <div className="evidence-meta">
                                                    <span className="evidence-level">
                                                        Level {item.level}
                                                    </span>
                                                    <span className="evidence-agent">
                                                        {item.agent}
                                                    </span>
                                                    <span className="evidence-time">
                                                        {item.timestamp}
                                                    </span>
                                                </div>
                                                <p className="evidence-desc">
                                                    {item.description}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                )
                            ) : (
                                <p className="muted-text">
                                    Log entries, timestamps, usernames, hosts, and suspicious
                                    activity evidence will appear here once Wazuh is connected.
                                </p>
                            )}
                        </div>
                    </>
                )}

                {activeView === 'blueTeam' && (
                    <>
                        <div className="ml-card">
                            <h3>Blue Team Assistant</h3>

                            <div className="ioc-input-row">
                                <input
                                    type="text"
                                    className="ioc-input"
                                    placeholder="Enter an IP address or file hash (MD5/SHA1/SHA256)"
                                    value={iocTarget}
                                    onChange={(e) => setIocTarget(e.target.value)}
                                />
                            </div>

                            <div className="panel-button-grid">
                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick(
                                            'blueTeam',
                                            'Blue Team Summary'
                                        )
                                    }
                                >
                                    Blue Team Summary
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick('ipLookup', 'IP Lookup')
                                    }
                                >
                                    IP Lookup
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick('hashLookup', 'Hash Lookup')
                                    }
                                >
                                    Hash Lookup
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSummaryClick(
                                            'virusTotal',
                                            'VirusTotal Result'
                                        )
                                    }
                                >
                                    VirusTotal Result
                                </button>
                            </div>
                        </div>

                        <div className="ml-card">
                            <h3>Blue Team Summary</h3>

                            {isLoading ? (
                                <p className="muted-text">Checking Python backend...</p>
                            ) : localSummaries[selectedSection] || localSummaries.blueTeam || summaries.blueTeam ? (
                                <p>
                                    {localSummaries[selectedSection] ||
                                        localSummaries.blueTeam ||
                                        summaries.blueTeam}
                                </p>
                            ) : (
                                <p className="muted-text">
                                    {statusMessage ||
                                        'Blue Team Assistant summary not available yet.'}
                                </p>
                            )}
                        </div>

                        <div className="ml-card">
                            <h3>Malware / IOC Notes</h3>

                            {isLoading ? (
                                <p className="muted-text">Checking Python backend...</p>
                            ) : (localEvidence[selectedSection] || localEvidence.blueTeam) &&
                              (localEvidence[selectedSection] || localEvidence.blueTeam).length > 0 ? (
                                <ul className="evidence-list">
                                    {(localEvidence[selectedSection] || localEvidence.blueTeam).map(
                                        (item, index) => (
                                            <li key={index} className="evidence-item">
                                                <div className="evidence-meta">
                                                    <span
                                                        className={`evidence-category evidence-category-${item.category}`}
                                                    >
                                                        {item.category}
                                                    </span>
                                                    <span className="evidence-agent">
                                                        {item.engine}
                                                    </span>
                                                </div>
                                                <p className="evidence-desc">{item.result}</p>
                                            </li>
                                        )
                                    )}
                                </ul>
                            ) : (
                                <p className="muted-text">
                                    IP, hash, domain, VirusTotal, and malware investigation
                                    results will appear here once connected.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default MLDisplay;
