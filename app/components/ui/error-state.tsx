'use client';
import React from 'react';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ 
  title = 'Something went wrong', 
  message, 
  onRetry,
  className = '' 
}: ErrorStateProps) {
  return (
    <div 
      className={`flex flex-col items-center justify-center p-8 text-center min-h-[200px] rounded-lg ${className}`}
      style={{
        backgroundColor: 'var(--surface-raised, #181b20)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))'
      }}
    >
      <div 
        className="mb-4"
        style={{ color: 'var(--accent-danger, #f43f5e)' }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h3 
        className="text-lg font-medium mb-1"
        style={{ color: 'var(--text-primary, #e8e6e3)' }}
      >
        {title}
      </h3>
      {message && (
        <p 
          className="text-sm max-w-md mx-auto mb-6"
          style={{ color: 'var(--text-secondary, #7a7d82)' }}
        >
          {message}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded text-sm font-medium transition-colors hover:bg-white/10"
          style={{
            backgroundColor: 'var(--surface-overlay, #1e2228)',
            color: 'var(--text-primary, #e8e6e3)',
            border: '1px solid var(--border-default, rgba(255,255,255,0.1))'
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}
