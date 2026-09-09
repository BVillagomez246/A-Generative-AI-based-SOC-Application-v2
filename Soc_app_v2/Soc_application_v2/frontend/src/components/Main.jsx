import React from 'react';
import MiddleSection from './Middle_section';

const Main = ({ isLoggedIn, onAuthRequired, summaries, selectedModel, messages, onMessagesChange }) => {
    return (
        <div className="grow flex">
            <MiddleSection
                isLoggedIn={isLoggedIn}
                onAuthRequired={onAuthRequired}
                summaries={summaries}
                selectedModel={selectedModel}
                messages={messages}
                onMessagesChange={onMessagesChange}
            />
        </div>
    );
};

export default Main;
