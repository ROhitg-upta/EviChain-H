'use client';
import React, { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div 
      className={`flex flex-col items-center justify-center p-8 text-center min-h-[200px] rounded-lg ${className}`}
      style={{
        backgroundColor: 'var(--surface-sunken, #0a0c0e)',
        border: '1px dashed var(--border-subtle, rgba(255,255,255,0.06))'
      }}
    >
      {icon && (
        <div 
          className="mb-4 flex items-center justify-center w-12 h-12"
          style={{ color: 'var(--text-secondary, #7a7d82)', opacity: 0.8 }}
        >
          {icon}
        </div>
      )}
      <h3 
        className="text-lg font-medium mb-1"
        style={{ color: 'var(--text-primary, #e8e6e3)' }}
      >
        {title}
      </h3>
      {description && (
        <p 
          className="text-sm max-w-sm mx-auto mb-4"
          style={{ color: 'var(--text-secondary, #7a7d82)' }}
        >
          {description}
        </p>
      )}
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}
