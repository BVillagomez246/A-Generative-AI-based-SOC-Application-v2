import React from 'react';
import SelectFramework from './Select_framework';
import './Login.css';

const Header = ({ onLoginClick, onLogout, isLoggedIn, selectedModel, onModelChange }) => {
    return (
        <div className="header">
            <div className="header-left">
                <SelectFramework value={selectedModel} onChange={onModelChange} />
            </div>

            {isLoggedIn ? (
                <button className="login-small-btn" onClick={onLogout}>
                    Logout
                </button>
            ) : (
                <button className="login-small-btn" onClick={onLoginClick}>
                    Login
                </button>
            )}
        </div>
    );
};

export default Header;
