import React from "react";
import "./Features.css";

const Sidebar = ({
  onClose,
  chatSessions = [],
  activeChatId,
  onNewChat,
  onLoadChat,
  onDeleteChat,
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-header">
          <button className="close-sidebar-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <button className="new-chat-btn" onClick={onNewChat}>
          + New chat
        </button>

        <div className="sidebar-section">
          <p className="section-title">Today</p>

          {chatSessions.length === 0 && (
            <p className="sidebar-empty-text">No saved chats yet.</p>
          )}

          {chatSessions.map((session) => (
            <div
              key={session.id}
              className={`sidebar-chat-item${
                session.id === activeChatId ? " sidebar-chat-item-active" : ""
              }`}
              onClick={() => onLoadChat(session.id)}
            >
              <span className="sidebar-chat-title">{session.title}</span>
              <button
                className="sidebar-chat-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(session.id);
                }}
                title="Delete chat"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
