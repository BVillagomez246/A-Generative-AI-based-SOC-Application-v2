import React, { useRef, useState } from 'react';
import {
    Center,
    Heading,
    VStack,
} from '@chakra-ui/react';
import './Features.css';

const MAX_TEXT_FILE_CHARS = 20000;

const MiddleSection = ({
    isLoggedIn,
    onAuthRequired,
    summaries = {},
    selectedModel,
    messages = [],
    onMessagesChange,
}) => {
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const [editingIndex, setEditingIndex] = useState(null);
    const [editingText, setEditingText] = useState('');

    const [attachedFiles, setAttachedFiles] = useState([]);

    // messages now lives in App.jsx (so the sidebar can list/load/delete
    // saved chats) - this local wrapper mimics useState's setter API
    // (both direct-value and functional-update forms) so every existing
    // setMessages(...) call below keeps working unchanged.
    const setMessages = (updater) => {
        const newMessages = typeof updater === 'function' ? updater(messages) : updater;
        onMessagesChange?.(newMessages);
    };

    const fileInputRef = useRef(null);
    const abortControllerRef = useRef(null);

    const summaryActions = [
        { key: 'threatHunting', label: 'Threat Hunting' },
        { key: 'fileIntegrity', label: 'File Integrity' },
        { key: 'mitre', label: 'MITRE' },
        { key: 'vulnerability', label: 'Vulnerability' },
        { key: 'malwareDetection', label: 'Malware Detection' },
        { key: 'blueTeam', label: 'Blue Team Summary' },
        { key: 'postQuestion', label: 'Post Question' },
        { key: 'finalReport', label: 'Final Report' },
    ];

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
    };

    const handleInputFocus = () => {
        if (!isLoggedIn) {
            onAuthRequired();
        }
    };

    const handlePlusClick = () => {
        if (!isLoggedIn) {
            onAuthRequired();
            return;
        }

        fileInputRef.current?.click();
    };

    // Resizes an image file down to a reasonable max dimension and
    // compresses it to JPEG before it's ever turned into base64. Full-
    // resolution screenshots are often far larger than any vision model
    // needs, and sending them raw is what causes GPU memory exhaustion
    // (and some backends reject oversized images outright with a 400).
    const resizeImageFile = (file, maxDimension = 1536, quality = 0.92) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                const img = new Image();

                img.onload = () => {
                    let { width, height } = img;

                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = Math.round((height * maxDimension) / width);
                            width = maxDimension;
                        } else {
                            width = Math.round((width * maxDimension) / height);
                            height = maxDimension;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    resolve(canvas.toDataURL('image/jpeg', quality));
                };

                img.onerror = () => reject(new Error('Could not decode image'));
                img.src = event.target.result;
            };

            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files || []);

        if (files.length === 0) {
            return;
        }

        files.forEach((file) => {
            const isImage = file.type.startsWith('image/');

            // Images are capped at 1536px / high quality (92%) - generous
            // enough that small text stays readable, but bounded so a
            // large raw screenshot can't exceed available GPU memory the
            // way a fully unmodified upload just did. Most screenshots
            // are well under this cap anyway and pass through untouched.
            if (isImage) {
                resizeImageFile(file)
                    .then((resizedDataUrl) => {
                        setAttachedFiles((prev) => [
                            ...prev,
                            {
                                id: `${file.name}-${Date.now()}-${Math.random()}`,
                                name: file.name,
                                type: 'image',
                                content: resizedDataUrl,
                                truncated: false,
                            },
                        ]);
                    })
                    .catch(() => {
                        setErrorMessage(`Could not process image: ${file.name}`);
                    });
                return;
            }

            const reader = new FileReader();

            reader.onload = (event) => {
                let content = event.target.result;
                let truncated = false;

                if (typeof content === 'string' && content.length > MAX_TEXT_FILE_CHARS) {
                    content = content.slice(0, MAX_TEXT_FILE_CHARS);
                    truncated = true;
                }

                setAttachedFiles((prev) => [
                    ...prev,
                    {
                        id: `${file.name}-${Date.now()}-${Math.random()}`,
                        name: file.name,
                        type: 'text',
                        content,
                        truncated,
                    },
                ]);
            };

            reader.onerror = () => {
                setErrorMessage(`Could not read file: ${file.name}`);
            };

            reader.readAsText(file);
        });

        e.target.value = '';
    };

    const removeAttachedFile = (id) => {
        setAttachedFiles((prev) => prev.filter((file) => file.id !== id));
    };

    // Builds the message actually sent to the LLM (content: text with any
    // text-file content folded in, or a vision-style array if images are
    // attached) AND separately keeps displayText (just what the user typed)
    // plus displayAttachments (name/thumbnail for clean chat-bubble
    // rendering) - so the visible bubble stays clean instead of showing
    // the raw dumped file content.
    const buildOutgoingMessage = (text, files) => {
        const imageFiles = files.filter((file) => file.type === 'image');
        const textFiles = files.filter((file) => file.type === 'text');

        let combinedText = text;

        textFiles.forEach((file) => {
            combinedText +=
                `\n\n--- Attached file: ${file.name}` +
                `${file.truncated ? ' (truncated to first 20,000 characters)' : ''} ---\n` +
                `${file.content}`;
        });

        const displayAttachments =
            files.length > 0
                ? files.map((file) => ({
                      name: file.name,
                      type: file.type,
                      thumbnail: file.type === 'image' ? file.content : null,
                  }))
                : undefined;

        const base = {
            role: 'user',
            displayText: text,
            displayAttachments,
        };

        if (imageFiles.length === 0) {
            return { ...base, content: combinedText };
        }

        const contentParts = [{ type: 'text', text: combinedText || 'Describe this image.' }];

        imageFiles.forEach((file) => {
            contentParts.push({
                type: 'image_url',
                image_url: { url: file.content },
            });
        });

        return { ...base, content: contentParts };
    };

    const handleStopGeneration = () => {
        abortControllerRef.current?.abort();
    };

    // Only the most recent message keeps its full image data. Older
    // messages have any image content replaced with a lightweight text
    // placeholder - otherwise every request resends every image ever
    // attached in the conversation, and that compounds fast: local vision
    // models can run out of GPU memory once two or three images are held
    // in context at once, even though each one alone is fine.
    //
    // Every returned message is guaranteed to have non-empty content -
    // a message with undefined/missing content gets silently dropped by
    // JSON.stringify, which the backend then rejects as invalid. Anything
    // that would end up empty is filtered out entirely instead.
    const buildPayloadMessages = (allMessages) => {
        const lastIndex = allMessages.length - 1;

        return allMessages
            .map(({ role, content }, index) => {
                if (Array.isArray(content) && index === lastIndex) {
                    return { role, content };
                }

                if (Array.isArray(content)) {
                    const textPart = content.find((part) => part.type === 'text');
                    const imageCount = content.filter((part) => part.type === 'image_url').length;

                    const placeholder =
                        imageCount > 0
                            ? `\n[${imageCount} image(s) were attached here earlier in the conversation]`
                            : '';

                    return { role, content: (textPart?.text || '') + placeholder };
                }

                return { role, content: content || '' };
            })
            .filter((m) => m.content !== '' && m.content !== undefined && m.content !== null);
    };

    // Shared send-to-backend logic. Strips the UI-only displayText /
    // displayAttachments fields before sending - the LLM only ever needs
    // role/content, not display metadata.
    const sendToAI = async (updatedMessages) => {
        setMessages(updatedMessages);
        setErrorMessage('');
        setIsLoading(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const payloadMessages = buildPayloadMessages(updatedMessages);

        try {
            const response = await fetch('http://localhost:8000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: payloadMessages,
                    model: selectedModel || undefined,
                }),
                signal: controller.signal,
            });

            const data = await response.json().catch(() => null);

            if (!data) {
                throw new Error(
                    `Server returned an unreadable response (status ${response.status}). ` +
                    `This often means the request was too large, e.g. a big image.`
                );
            }

            if (!response.ok) {
                throw new Error(
                    `Server error (${response.status}): ${data.message || data.error || 'unknown error'}`
                );
            }

            const aiMessage = {
                role: 'assistant',
                content: data.reply,
            };

            setMessages([...updatedMessages, aiMessage]);
        } catch (error) {
            if (error.name === 'AbortError') {
                // Stopped by the user - the message they sent stays,
                // we just don't add an AI reply for it.
            } else {
                setErrorMessage(error.message || 'Something went wrong talking to the AI.');
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };

    const handleSendClick = async () => {
        if (!isLoggedIn) {
            onAuthRequired();
            return;
        }

        const userText = inputValue.trim();

        if (userText === '' && attachedFiles.length === 0) {
            return;
        }

        const newMessage = buildOutgoingMessage(userText, attachedFiles);
        const updatedMessages = [...messages, newMessage];

        setInputValue('');
        setAttachedFiles([]);
        sendToAI(updatedMessages);
    };

    // For editing: prefer the clean displayText (what the user actually
    // typed) over the raw content, which may have file dumps folded in.
    const getMessageText = (message) => {
        if (typeof message.displayText === 'string') {
            return message.displayText;
        }

        if (typeof message.content === 'string') {
            return message.content;
        }

        const textPart = message.content.find((part) => part.type === 'text');
        return textPart ? textPart.text : '';
    };

    const startEditingMessage = (index) => {
        setEditingIndex(index);
        setEditingText(getMessageText(messages[index]));
    };

    const cancelEditingMessage = () => {
        setEditingIndex(null);
        setEditingText('');
    };

    const saveEditedMessage = (index) => {
        const trimmed = editingText.trim();

        if (trimmed === '') {
            return;
        }

        const messagesBefore = messages.slice(0, index);
        const updatedMessages = [
            ...messagesBefore,
            { role: 'user', content: trimmed, displayText: trimmed },
        ];

        setEditingIndex(null);
        setEditingText('');
        sendToAI(updatedMessages);
    };

    const addSummaryToChat = (summaryKey, label) => {
        if (!isLoggedIn) {
            onAuthRequired();
            return;
        }

        const summary = summaries[summaryKey];

        if (!summary) {
            setMessages((prevMessages) => [
                ...prevMessages,
                {
                    role: 'assistant',
                    content: `${label} summary not available yet.`,
                },
            ]);
            return;
        }

        setMessages((prevMessages) => [
            ...prevMessages,
            {
                role: 'assistant',
                content: `${label} summary added to chat context:\n\n${summary}`,
            },
        ]);
    };

    const runContextAction = async (summaryKey, label) => {
        if (!isLoggedIn) {
            onAuthRequired();
            return;
        }

        const isQuestion = summaryKey === 'postQuestion';
        const question = inputValue.trim();

        if (isQuestion && question === '') {
            setMessages((prevMessages) => [
                ...prevMessages,
                {
                    role: 'assistant',
                    content:
                        'Type your question in the box first, then choose Post Question.',
                },
            ]);
            return;
        }

        if (isQuestion) {
            setMessages((prevMessages) => [
                ...prevMessages,
                { role: 'user', content: question, displayText: question },
            ]);
            setInputValue('');
        }

        setErrorMessage('');
        setIsLoading(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const endpoint = isQuestion
            ? 'http://localhost:8000/api/post-question'
            : 'http://localhost:8000/api/final-report';

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(isQuestion ? { question } : {}),
                signal: controller.signal,
            });

            const data = await response.json();

            setMessages((prevMessages) => [
                ...prevMessages,
                {
                    role: 'assistant',
                    content:
                        data.status === 'available'
                            ? data.summary
                            : data.message || `${label} is not available yet.`,
                },
            ]);
        } catch (error) {
            if (error.name === 'AbortError') {
                // Stopped by the user - no reply added.
            } else {
                setErrorMessage(
                    'Could not connect to the Python backend. Make sure FastAPI is running on port 8000.'
                );
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };

    const handleDropdownToggle = () => {
        if (!isLoggedIn) {
            onAuthRequired();
            return;
        }

        setDropdownOpen((prev) => !prev);
    };

    const handleActionClick = (summaryKey, label) => {
        if (summaryKey === 'postQuestion' || summaryKey === 'finalReport') {
            runContextAction(summaryKey, label);
        } else {
            addSummaryToChat(summaryKey, label);
        }

        setDropdownOpen(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendClick();
        }
    };

    const handleTextareaInput = (e) => {
        handleInputChange(e);
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
    };

    return (
        <Center
            flex="1"
            className="grow"
            style={{
                width: '100%',
                height: '100%',
            }}
        >
            <VStack
                gap="4"
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '24px',
                    justifyContent: 'space-between',
                }}
            >
                <Heading size="2xl">SOC AI Chat</Heading>

                <div
                    style={{
                        width: '100%',
                        maxWidth: '620px',
                        flex: 1,
                        overflowY: 'auto',
                        padding: '10px',
                    }}
                >
                    {messages.length === 0 && (
                        <p
                            style={{
                                color: '#b5b5b5',
                                fontSize: '14px',
                                textAlign: 'center',
                                marginTop: '40px',
                            }}
                        >
                            Ask your local LM Studio model something.
                            <br />
                            Example: “Summarise this suspicious login alert.”
                        </p>
                    )}

                    {messages.map((message, index) => {
                        const isUser = message.role === 'user';
                        const isEditingThis = editingIndex === index;

                        const fallbackText = Array.isArray(message.content)
                            ? message.content.find((part) => part.type === 'text')?.text || ''
                            : message.content;

                        const bubbleText =
                            message.displayText !== undefined
                                ? message.displayText
                                : fallbackText;

                        const attachments = message.displayAttachments || [];

                        return (
                            <div
                                key={index}
                                style={{
                                    display: 'flex',
                                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                                    marginBottom: '14px',
                                }}
                            >
                                {isEditingThis ? (
                                    <div style={{ maxWidth: '80%', width: '100%' }}>
                                        <textarea
                                            className="chat-edit-textarea"
                                            value={editingText}
                                            onChange={(e) =>
                                                setEditingText(e.target.value)
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    saveEditedMessage(index);
                                                } else if (e.key === 'Escape') {
                                                    cancelEditingMessage();
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <div className="chat-edit-actions">
                                            <button
                                                type="button"
                                                className="chat-edit-btn"
                                                onClick={cancelEditingMessage}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                className="chat-edit-btn primary"
                                                onClick={() => saveEditedMessage(index)}
                                            >
                                                Save &amp; Resend
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="chat-message-bubble"
                                        style={{
                                            maxWidth: '80%',
                                            backgroundColor: isUser
                                                ? '#3a3a3a'
                                                : '#242424',
                                            color: 'white',
                                            padding: '10px 14px',
                                            borderRadius: '14px',
                                            fontSize: '14px',
                                            lineHeight: '1.5',
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        {attachments.length > 0 && (
                                            <div className="chat-message-attachments">
                                                {attachments.map((att, i) =>
                                                    att.type === 'image' ? (
                                                        <div
                                                            key={i}
                                                            className="chat-message-image-block"
                                                        >
                                                            <img
                                                                src={att.thumbnail}
                                                                alt={att.name}
                                                                className="chat-message-image"
                                                            />
                                                            <span className="chat-message-image-caption">
                                                                {att.name}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            key={i}
                                                            className="chat-message-attachment-chip"
                                                        >
                                                            <span className="chat-attachment-icon">
                                                                📄
                                                            </span>
                                                            <span className="chat-attachment-name">
                                                                {att.name}
                                                            </span>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        )}

                                        {bubbleText}

                                        {isUser && (
                                            <button
                                                type="button"
                                                className="edit-message-btn"
                                                title="Edit message"
                                                onClick={() =>
                                                    startEditingMessage(index)
                                                }
                                            >
                                                ✎
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {isLoading && (
                        <div className="chat-thinking-row">
                            <span className="chat-thinking-text">AI is thinking...</span>
                            <button
                                type="button"
                                className="chat-stop-inline-btn"
                                onClick={handleStopGeneration}
                            >
                                ■ Stop
                            </button>
                        </div>
                    )}

                    {errorMessage && (
                        <p
                            style={{
                                color: '#ef4444',
                                fontSize: '13px',
                                textAlign: 'center',
                            }}
                        >
                            {errorMessage}
                        </p>
                    )}
                </div>

                <div
                    style={{
                        width: '100%',
                        maxWidth: '620px',
                        position: 'relative',
                    }}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.txt,.csv,.log,.json,.md"
                        onChange={handleFileChange}
                        style={{
                            display: 'none',
                        }}
                    />

                    {attachedFiles.length > 0 && (
                        <div className="chat-attachments-preview">
                            {attachedFiles.map((file) => (
                                <div key={file.id} className="chat-attachment-chip">
                                    {file.type === 'image' ? (
                                        <img
                                            src={file.content}
                                            alt={file.name}
                                            className="chat-attachment-thumb"
                                        />
                                    ) : (
                                        <span className="chat-attachment-icon">📄</span>
                                    )}
                                    <span className="chat-attachment-name">
                                        {file.name}
                                    </span>
                                    <button
                                        type="button"
                                        className="chat-attachment-remove"
                                        onClick={() => removeAttachedFile(file.id)}
                                        title="Remove"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {dropdownOpen && (
                        <div
                            style={{
                                position: 'absolute',
                                left: '0',
                                bottom: '96px',
                                width: '230px',
                                maxHeight: '260px',
                                overflowY: 'auto',
                                backgroundColor: '#171717',
                                border: '1px solid #3a3a3a',
                                borderRadius: '12px',
                                padding: '8px',
                                zIndex: 100,
                                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                            }}
                        >
                            {summaryActions.map((action) => (
                                <div
                                    key={action.key}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                        handleActionClick(action.key, action.label)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleActionClick(action.key, action.label);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        backgroundColor: 'transparent',
                                        color: 'white',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        fontSize: '13px',
                                        lineHeight: '1.3',
                                        cursor: 'pointer',
                                        boxSizing: 'border-box',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#242424';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                >
                                    {action.label}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="chainlit-input-container">
                        <textarea
                            className="chainlit-textarea"
                            placeholder={
                                isLoggedIn
                                    ? 'Type your message here...'
                                    : 'Login or sign in first to begin...'
                            }
                            value={inputValue}
                            onChange={handleTextareaInput}
                            onFocus={handleInputFocus}
                            onKeyDown={handleKeyDown}
                            readOnly={!isLoggedIn}
                            rows={1}
                        />

                        <div className="chainlit-input-toolbar">
                            <div className="chainlit-input-icons">
                                <button
                                    type="button"
                                    className="chainlit-icon-btn"
                                    onClick={handlePlusClick}
                                    title="Attach file"
                                >
                                    📎
                                </button>

                                <button
                                    type="button"
                                    className="chainlit-icon-btn"
                                    onClick={handleDropdownToggle}
                                    title="More options"
                                >
                                    ⚙
                                </button>
                            </div>

                            {isLoading ? (
                                <button
                                    type="button"
                                    onClick={handleStopGeneration}
                                    className="chainlit-send-btn stop"
                                    title="Stop generating"
                                >
                                    ■
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleSendClick}
                                    disabled={
                                        inputValue.trim() === '' && attachedFiles.length === 0
                                    }
                                    className="chainlit-send-btn"
                                    title="Send"
                                >
                                    ↑
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </VStack>
        </Center>
    );
};

export default MiddleSection;
