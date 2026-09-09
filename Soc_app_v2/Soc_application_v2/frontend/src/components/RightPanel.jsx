import React, { useState } from "react";
import TeamContacts from "./TeamContacts";
import TextToPdfConverter from "./TextToPdfConverter";
import "./RightPanel.css";

const RightPanel = ({ onClose, userEmail, onLogout }) => {
  const [showContacts, setShowContacts] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPdfTool, setShowPdfTool] = useState(false);

  return (
    <aside className="w-24 min-h-screen bg-[#171717] border-l border-[#2f2f2f] flex flex-col items-center pt-10">
      <button
        onClick={onClose}
        className="mb-4 text-[#cfcfcf] hover:text-white hover:bg-[#2a2a2a] px-3 py-2 rounded-lg cursor-pointer"
      >
        ✕
      </button>

      <div className="flex flex-col justify-center items-center relative transition-all duration-[450ms] ease-in-out w-16">
        <article className="border border-solid border-[#333333] w-full ease-in-out duration-500 rounded-2xl inline-block shadow-lg shadow-black/15 bg-[#171717]">

          <label
            htmlFor="dashboard"
            className="has-[:checked]:shadow-lg relative w-full h-16 p-4 ease-in-out duration-300 border-solid border-white/10 has-[:checked]:border group flex items-center justify-center text-[#dcdcdc] rounded-xl cursor-pointer"
            onClick={() => setShowPdfTool(true)}
          >
            <input
              className="hidden peer/expand"
              type="radio"
              name="path"
              id="dashboard"
              defaultChecked
            />
            <svg
              className="fill-current peer-hover/expand:scale-125 peer-hover/expand:text-blue-400 peer-checked/expand:text-blue-400 peer-checked/expand:scale-125 ease-in-out duration-300"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
            >
              <path d="M4 13h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1zm-1 7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v4zm10 0a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v7zm1-10h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1z" />
            </svg>
          </label>

          <label
            htmlFor="profile"
            className="has-[:checked]:shadow-lg relative w-full h-16 p-4 ease-in-out duration-300 border-solid border-white/10 has-[:checked]:border group flex items-center justify-center text-[#dcdcdc] rounded-xl cursor-pointer"
            onClick={() => setShowProfile(true)}
          >
            <input className="hidden peer/expand" type="radio" name="path" id="profile" />
            <svg
              className="fill-current peer-hover/expand:scale-125 peer-hover/expand:text-blue-400 peer-checked/expand:text-blue-400 peer-checked/expand:scale-125 ease-in-out duration-300"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
            >
              <path d="M12,2C10.34,2 9,3.34 9,5C9,6.66 10.34,8 12,8C13.66,8 15,6.66 15,5C15,3.34 13.66,2 12,2M12,9C9.34,9 7,10.34 7,13V22H9V13C9,11.9 9.9,11 11,11H13C14.1,11 15,11.9 15,13V22H17V13C17,10.34 14.66,9 12,9Z" />
            </svg>
          </label>

          <label
            htmlFor="messages"
            className="has-[:checked]:shadow-lg relative w-full h-16 p-4 ease-in-out duration-300 border-solid border-white/10 has-[:checked]:border group flex items-center justify-center text-[#dcdcdc] rounded-xl cursor-pointer"
            onClick={() => setShowContacts(true)}
          >
            <input className="hidden peer/expand" type="radio" name="path" id="messages" />
            <svg
              className="fill-current peer-hover/expand:scale-125 peer-hover/expand:text-blue-400 peer-checked/expand:text-blue-400 peer-checked/expand:scale-125 ease-in-out duration-300"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
            >
              <path d="M5 18v3.766l1.515-.909L11.277 18H16c1.103 0 2-.897 2-2V8c0-1.103-.897-2-2-2H4c-1.103 0-2 .897-2 2v8c0 1.103.897 2 2 2h1zM4 8h12v8h-5.277L7 18.234V16H4V8z" />
              <path d="M20 2H8c-1.103 0-2 .897-2 2h12c1.103 0 2 .897 2 2v8c1.103 0 2-.897 2-2V4c0-1.103-.897-2-2-2z" />
            </svg>
          </label>

          <label
            htmlFor="help"
            className="has-[:checked]:shadow-lg relative w-full h-16 p-4 ease-in-out duration-300 border-solid border-white/10 has-[:checked]:border group flex items-center justify-center text-[#dcdcdc] rounded-xl cursor-pointer"
          >
            <input className="hidden peer/expand" type="radio" name="path" id="help" />
            <svg
              className="fill-current peer-hover/expand:scale-125 peer-hover/expand:text-blue-400 peer-checked/expand:text-blue-400 peer-checked/expand:scale-125 ease-in-out duration-300"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
            >
              <path d="M11.953 2C6.465 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.493 2 11.953 2zM12 20c-4.411 0-8-3.589-8-8s3.567-8 7.953-8C16.391 4 20 7.589 20 12s-3.589 8-8 8z" />
              <path d="M11 7h2v7h-2zm0 8h2v2h-2z" />
            </svg>
          </label>

          <label
            htmlFor="settings"
            className="has-[:checked]:shadow-lg relative w-full h-16 p-4 ease-in-out duration-300 border-solid border-white/10 has-[:checked]:border group flex items-center justify-center text-[#dcdcdc] rounded-xl cursor-pointer"
          >
            <input className="hidden peer/expand" type="radio" name="path" id="settings" />
            <svg
              className="fill-current peer-hover/expand:scale-125 peer-hover/expand:text-blue-400 peer-checked/expand:text-blue-400 peer-checked/expand:scale-125 ease-in-out duration-300"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
            >
              <path d="M12 16c2.206 0 4-1.794 4-4s-1.794-4-4-4-4 1.794-4 4 1.794 4 4 4zm0-6c1.084 0 2 .916 2 2s-.916 2-2 2-2-.916-2-2 .916-2 2-2z" />
              <path d="m2.845 16.136 1 1.73c.531.917 1.809 1.261 2.73.73l.529-.306A8.1 8.1 0 0 0 9 19.402V20c0 1.103.897 2 2 2h2c1.103 0 2-.897 2-2v-.598a8.132 8.132 0 0 0 1.896-1.111l.529.306c.923.53 2.198.188 2.731-.731l.999-1.729a2.001 2.001 0 0 0-.731-2.732l-.505-.292a7.718 7.718 0 0 0 0-2.224l.505-.292a2.002 2.002 0 0 0 .731-2.732l-.999-1.729c-.531-.92-1.808-1.265-2.731-.732l-.529.306A8.1 8.1 0 0 0 15 4.598V4c0-1.103-.897-2-2-2h-2c-1.103 0-2 .897-2 2v.598a8.132 8.132 0 0 0-1.896 1.111l-.529-.306c-.924-.531-2.2-.187-2.731.732l-.999 1.729a2.001 2.001 0 0 0 .731 2.732l.505.292a7.683 7.683 0 0 0 0 2.223l-.505.292a2.003 2.003 0 0 0-.731 2.733z" />
            </svg>
          </label>
        </article>
      </div>

      {showProfile && (
        <div className="rp-popup-overlay" onClick={() => setShowProfile(false)}>
          <div className="rp-popup-main" onClick={(e) => e.stopPropagation()}>
            <div className="rp-profile-header">
              <div className="rp-profile-avatar">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="#dcdcdc"
                >
                  <path d="M12,2C10.34,2 9,3.34 9,5C9,6.66 10.34,8 12,8C13.66,8 15,6.66 15,5C15,3.34 13.66,2 12,2M12,9C9.34,9 7,10.34 7,13V22H9V13C9,11.9 9.9,11 11,11H13C14.1,11 15,11.9 15,13V22H17V13C17,10.34 14.66,9 12,9Z" />
                </svg>
              </div>
              <span className="rp-profile-email">
                {userEmail || "Not logged in"}
              </span>
            </div>

            <hr className="rp-divider" />

            <button
              className="rp-button rp-quit"
              onClick={() => {
                setShowProfile(false);
                onLogout?.();
              }}
            >
              Log out
            </button>
          </div>
        </div>
      )}

      {showPdfTool && (
        <div className="rp-popup-overlay" onClick={() => setShowPdfTool(false)}>
          <div className="rp-pdf-panel" onClick={(e) => e.stopPropagation()}>
            <div className="rp-pdf-panel-header">
              <button
                className="rp-pdf-panel-close"
                onClick={() => setShowPdfTool(false)}
              >
                ✕
              </button>
            </div>
            <TextToPdfConverter />
          </div>
        </div>
      )}

      <TeamContacts isOpen={showContacts} onClose={() => setShowContacts(false)} />
    </aside>
  );
};

export default RightPanel;
