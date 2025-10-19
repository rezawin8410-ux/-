
// FIX: Replaced placeholder content with SVG for the MicrophoneIcon component.
import React from 'react';

export const MicrophoneIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3.75 3.75 0 00-3.75 3.75v6.75a3.75 3.75 0 007.5 0V4.75A3.75 3.75 0 0012 1z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5v1.5a7.5 7.5 0 01-15 0v-1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75v2.25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21h7.5" />
    </svg>
);
