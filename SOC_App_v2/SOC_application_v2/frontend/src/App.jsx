import { useRef, useState, useEffect } from 'react';
import Header from './components/Header';
import Main from './components/Main';
import Sidebar from './components/Sidebar';
import MLDisplay from './components/MLDisplay';
import Login from './components/Login';
import Register from './components/Register';
import RightPanel from './components/RightPanel';

const CHAT_SESSIONS_KEY = 'soc_chat_sessions';

const deriveChatTitle = (messages) => {
    const firstUserMessage = messages.find((m) => m.role === 'user');

    if (!firstUserMessage) {
        return 'New chat';
    }

    const text =
        typeof firstUserMessage.displayText === 'string'
            ? firstUserMessage.displayText
            : typeof firstUserMessage.content === 'string'
            ? firstUserMessage.content
            : '';

    if (!text.trim()) {
        return 'New chat';
    }

    return text.trim().slice(0, 40) + (text.trim().length > 40 ? '...' : '');
};

const App = () => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [rightPanelOpen, setRightPanelOpen] = useState(true);

    const [page, setPage] = useState('home');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState('');
    const [toastMessage, setToastMessage] = useState('');

    const [summaries, setSummaries] = useState({});
    const [selectedModel, setSelectedModel] = useState('');

    // Chat sessions: the currently active conversation, plus a saved list
    // in the sidebar that can be reopened or deleted.
    const [activeMessages, setActiveMessages] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [chatSessions, setChatSessions] = useState([]);

    const toastTimer = useRef(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(CHAT_SESSIONS_KEY);
            if (stored) {
                setChatSessions(JSON.parse(stored));
            }
        } catch (e) {
            // corrupt/unavailable storage - just start with no saved chats
        }
    }, []);

    const persistSessions = (updated) => {
        setChatSessions(updated);
        try {
            localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(updated));
        } catch (e) {
            // storage unavailable - sessions still work for this session
        }
    };

    const showToast = (message) => {
        setToastMessage(message);

        if (toastTimer.current) {
            clearTimeout(toastTimer.current);
        }

        toastTimer.current = setTimeout(() => {
            setToastMessage('');
        }, 2500);
    };

    const handleSummaryUpdate = (key, summary) => {
        setSummaries((prev) => ({
            ...prev,
            [key]: summary,
        }));
    };

    // Saves the current conversation (if it has anything in it) as a
    // session in the sidebar, then clears the active view for a fresh one.
    const handleNewChat = () => {
        if (activeMessages.length > 0) {
            const existingIndex = chatSessions.findIndex((s) => s.id === activeChatId);

            const sessionData = {
                id: activeChatId || `${Date.now()}-${Math.random()}`,
                title: deriveChatTitle(activeMessages),
                messages: activeMessages,
                updatedAt: Date.now(),
            };

            if (existingIndex >= 0) {
                const updated = [...chatSessions];
                updated[existingIndex] = sessionData;
                persistSessions(updated);
            } else {
                persistSessions([sessionData, ...chatSessions]);
            }
        }

        setActiveMessages([]);
        setActiveChatId(null);
    };

    // Saves the current chat's latest state (called whenever messages
    // change) so switching away and back doesn't lose anything, and a
    // chat already in the sidebar stays up to date rather than only
    // being saved once via "New chat".
    const handleMessagesChange = (updatedMessages) => {
        setActiveMessages(updatedMessages);

        if (updatedMessages.length === 0) {
            return;
        }

        const sessionData = {
            id: activeChatId || `${Date.now()}-${Math.random()}`,
            title: deriveChatTitle(updatedMessages),
            messages: updatedMessages,
            updatedAt: Date.now(),
        };

        if (!activeChatId) {
            setActiveChatId(sessionData.id);
            persistSessions([sessionData, ...chatSessions]);
            return;
        }

        const existingIndex = chatSessions.findIndex((s) => s.id === activeChatId);

        if (existingIndex >= 0) {
            const updated = [...chatSessions];
            updated[existingIndex] = sessionData;
            persistSessions(updated);
        } else {
            persistSessions([sessionData, ...chatSessions]);
        }
    };

    const handleLoadChat = (id) => {
        const session = chatSessions.find((s) => s.id === id);

        if (session) {
            setActiveMessages(session.messages);
            setActiveChatId(id);
        }
    };

    const handleDeleteChat = (id) => {
        persistSessions(chatSessions.filter((s) => s.id !== id));

        if (activeChatId === id) {
            setActiveMessages([]);
            setActiveChatId(null);
        }
    };

    const showAuthMessage = () => {
        showToast('Please login or sign in first.');
    };

    const handleLoginClick = () => {
        setPage('login');
    };

    const handleRegisterClick = () => {
        setPage('register');
    };

    const handleHomeAfterLogin = (email) => {
        setIsLoggedIn(true);
        setCurrentUserEmail(email || '');
        setPage('home');
        showToast('You are logged in. You can begin now.');
    };

    const handleLogout = () => {
        setIsLoggedIn(false);
        setCurrentUserEmail('');
        setPage('home');
        showToast('You have logged out.');
    };

    if (page === 'login') {
        return (
            <Login
                onRegisterClick={handleRegisterClick}
                onHomeClick={handleHomeAfterLogin}
            />
        );
    }

    if (page === 'register') {
        return (
            <Register
                onLoginClick={handleLoginClick}
            />
        );
    }

    return (
        <div className="flex min-h-screen bg-color text-white">
            {sidebarOpen ? (
                <Sidebar
                    onClose={() => setSidebarOpen(false)}
                    chatSessions={chatSessions}
                    activeChatId={activeChatId}
                    onNewChat={handleNewChat}
                    onLoadChat={handleLoadChat}
                    onDeleteChat={handleDeleteChat}
                />
            ) : (
                <button
                    className="side-toggle left-toggle"
                    onClick={() => setSidebarOpen(true)}
                >
                    ☰
                </button>
            )}

            <div className="middle-layout">
                <Header
                    onLoginClick={handleLoginClick}
                    onLogout={handleLogout}
                    isLoggedIn={isLoggedIn}
                    selectedModel={selectedModel}
                    onModelChange={setSelectedModel}
                />

                <div className="middle-split">
                    <section className="middle-section chat-section">
                        <Main
                            isLoggedIn={isLoggedIn}
                            onAuthRequired={showAuthMessage}
                            summaries={summaries}
                            selectedModel={selectedModel}
                            messages={activeMessages}
                            onMessagesChange={handleMessagesChange}
                        />
                    </section>

                    <section className="middle-section ml-section">
                        <MLDisplay onSummaryUpdate={handleSummaryUpdate} />
                    </section>
                </div>
            </div>

            {rightPanelOpen ? (
                <RightPanel
                    onClose={() => setRightPanelOpen(false)}
                    userEmail={currentUserEmail}
                    onLogout={handleLogout}
                />
            ) : (
                <button
                    className="side-toggle right-toggle"
                    onClick={() => setRightPanelOpen(true)}
                >
                    ☰
                </button>
            )}

            {toastMessage && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: '#7c3aed',
                        color: 'white',
                        padding: '12px 20px',
                        borderRadius: '10px',
                        fontSize: '14px',
                        fontWeight: '600',
                        zIndex: 9999,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                    }}
                >
                    {toastMessage}
                </div>
            )}
        </div>
    );
};

export default App;
