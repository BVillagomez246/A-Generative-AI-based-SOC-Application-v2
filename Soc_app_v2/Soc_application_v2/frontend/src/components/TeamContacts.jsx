import React, { useState, useEffect, useRef } from 'react';
import './TeamContacts.css';

const STORAGE_KEY = 'soc_team_contacts';

const AVATAR_GRADIENTS = [
    'linear-gradient(295deg, rgba(22,19,70,1) 41%, rgba(89,177,237,1) 100%)',
    'linear-gradient(295deg, rgba(70,19,60,1) 41%, rgba(237,120,89,1) 100%)',
    'linear-gradient(295deg, rgba(19,70,40,1) 41%, rgba(89,237,177,1) 100%)',
    'linear-gradient(295deg, rgba(70,60,19,1) 41%, rgba(237,89,187,1) 100%)',
];

const getAvatarGradient = (seed) => {
    const index =
        seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
        AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[index];
};

const TeamContacts = ({ isOpen, onClose }) => {
    const [contacts, setContacts] = useState([]);
    const [nameInput, setNameInput] = useState('');
    const [emailInput, setEmailInput] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);

    // Compose view (opened by clicking a contact)
    const [selectedContact, setSelectedContact] = useState(null);
    const [emailSubject, setEmailSubject] = useState('');
    const [emailMessage, setEmailMessage] = useState('');
    const [emailAttachment, setEmailAttachment] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const [sendStatus, setSendStatus] = useState('');

    const fileInputRef = useRef(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setContacts(JSON.parse(stored));
            }
        } catch (e) {
            // corrupt/unavailable storage - just start empty
        }
    }, []);

    const saveContacts = (updated) => {
        setContacts(updated);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            // storage unavailable - list still works for this session
        }
    };

    const handleAddContact = () => {
        const trimmedName = nameInput.trim();
        const trimmedEmail = emailInput.trim();

        if (trimmedName === '' || trimmedEmail === '') {
            return;
        }

        const newContact = {
            id: `${Date.now()}-${Math.random()}`,
            name: trimmedName,
            email: trimmedEmail,
        };

        saveContacts([...contacts, newContact]);
        setNameInput('');
        setEmailInput('');
        setShowAddForm(false);
    };

    const handleRemoveContact = (id) => {
        saveContacts(contacts.filter((c) => c.id !== id));
    };

    const openCompose = (contact) => {
        setSelectedContact(contact);
        setEmailSubject('');
        setEmailMessage('');
        setEmailAttachment(null);
        setSendStatus('');
    };

    const closeCompose = () => {
        setSelectedContact(null);
    };

    const handleAttachClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
            setEmailAttachment({
                name: file.name,
                dataUrl: event.target.result,
            });
        };

        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleSendEmail = async () => {
        if (!selectedContact || emailMessage.trim() === '') {
            return;
        }

        setIsSending(true);
        setSendStatus('');

        try {
            const response = await fetch('http://localhost:8000/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to_email: selectedContact.email,
                    subject: emailSubject.trim() || 'Message from SOC AI Chat',
                    message: emailMessage,
                    attachment_name: emailAttachment?.name || null,
                    attachment_data_url: emailAttachment?.dataUrl || null,
                }),
            });

            const data = await response.json();

            if (!response.ok || data.status !== 'available') {
                throw new Error(data.message || 'Could not send email.');
            }

            setSendStatus('Sent.');
            setEmailSubject('');
            setEmailMessage('');
            setEmailAttachment(null);
        } catch (error) {
            setSendStatus(error.message || 'Could not connect to the backend.');
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="team-contacts-overlay" onClick={onClose}>
            <div className="team-contacts-card" onClick={(e) => e.stopPropagation()}>
                {selectedContact ? (
                    <>
                        <div className="team-contacts-title">
                            <button className="team-contacts-back" onClick={closeCompose}>
                                ←
                            </button>
                            <span>{selectedContact.name}</span>
                            <button className="team-contacts-close" onClick={onClose}>
                                ✕
                            </button>
                        </div>

                        <div className="team-contacts-compose">
                            <p className="team-contacts-compose-to">
                                To: {selectedContact.email}
                            </p>

                            <input
                                type="text"
                                placeholder="Subject"
                                value={emailSubject}
                                onChange={(e) => setEmailSubject(e.target.value)}
                                className="team-contacts-input"
                            />

                            <textarea
                                placeholder="Type your message..."
                                value={emailMessage}
                                onChange={(e) => setEmailMessage(e.target.value)}
                                className="team-contacts-textarea"
                                rows={5}
                            />

                            <input
                                ref={fileInputRef}
                                type="file"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />

                            {emailAttachment && (
                                <div className="team-contacts-attachment-chip">
                                    📄 {emailAttachment.name}
                                    <button
                                        onClick={() => setEmailAttachment(null)}
                                        className="team-contacts-attachment-remove"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}

                            {sendStatus && (
                                <p className="team-contacts-send-status">{sendStatus}</p>
                            )}

                            <div className="team-contacts-compose-actions">
                                <button
                                    className="team-contacts-attach-btn"
                                    onClick={handleAttachClick}
                                    title="Attach file"
                                >
                                    📎
                                </button>
                                <button
                                    className="team-contacts-save-btn"
                                    onClick={handleSendEmail}
                                    disabled={isSending || emailMessage.trim() === ''}
                                >
                                    {isSending ? 'Sending...' : 'Send'}
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="team-contacts-title">
                            Team
                            <button className="team-contacts-close" onClick={onClose}>
                                ✕
                            </button>
                        </div>

                        <div className="team-contacts-list">
                            {contacts.length === 0 && (
                                <p className="team-contacts-empty">
                                    No coworkers added yet.
                                </p>
                            )}

                            {contacts.map((contact) => (
                                <div
                                    className="team-contacts-user"
                                    key={contact.id}
                                    onClick={() => openCompose(contact)}
                                >
                                    <div className="team-contacts-user__content">
                                        <div
                                            className="team-contacts-image"
                                            style={{
                                                background: getAvatarGradient(contact.name),
                                            }}
                                        />
                                        <div className="team-contacts-user__container">
                                            <span className="team-contacts-name">
                                                {contact.name}
                                            </span>
                                            <span className="team-contacts-email">
                                                {contact.email}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        className="team-contacts-remove"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveContact(contact.id);
                                        }}
                                        title="Remove"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>

                        {showAddForm ? (
                            <div className="team-contacts-add-form">
                                <input
                                    type="text"
                                    placeholder="Name"
                                    value={nameInput}
                                    onChange={(e) => setNameInput(e.target.value)}
                                    className="team-contacts-input"
                                    autoComplete="off"
                                    autoFocus
                                />
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    className="team-contacts-input"
                                    autoComplete="off"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAddContact();
                                        }
                                    }}
                                />
                                <div className="team-contacts-add-actions">
                                    <button
                                        className="team-contacts-cancel-btn"
                                        onClick={() => {
                                            setShowAddForm(false);
                                            setNameInput('');
                                            setEmailInput('');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="team-contacts-save-btn"
                                        onClick={handleAddContact}
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                className="team-contacts-more"
                                onClick={() => setShowAddForm(true)}
                            >
                                + Add coworker
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default TeamContacts;
