
// FIX: Replaced placeholder content with SVG for the StopIcon component.
import React from 'react';

export const StopIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 0-.75.75v12a.75.75 0 0 0 .75.75h10.5a.75.75 0 0 0 .75-.75v-12a.75.75 0 0 0-.75-.75H6.75z" clipRule="evenodd" />
    </svg>
);
