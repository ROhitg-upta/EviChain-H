'use client';
import React from 'react';

export interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

function getPriorityConfig(priority: string) {
  const lower = priority.toLowerCase();
  if (lower === 'critical') return { color: 'var(--accent-danger, #f43f5e)', pulse: true };
  if (lower === 'high') return { color: 'var(--accent-pending, #fbbf24)', pulse: false };
  if (lower === 'medium') return { color: 'var(--text-secondary, #7a7d82)', pulse: false };
  if (lower === 'low') return { color: 'var(--border-strong, rgba(255,255,255,0.16))', pulse: false };
  return { color: 'var(--text-secondary, #7a7d82)', pulse: false };
}

export function PriorityBadge({ priority, className = '' }: PriorityBadgeProps) {
  const { color, pulse } = getPriorityConfig(priority);
  
  return (
    <div 
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs ${className}`}
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        textTransform: 'uppercase',
        backgroundColor: 'var(--surface-raised, #181b20)',
        borderColor: 'var(--border-subtle, rgba(255,255,255,0.06))',
        color: 'var(--text-primary, #e8e6e3)'
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span 
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: color }}
          ></span>
        )}
        <span 
          className="relative inline-flex rounded-full h-1.5 w-1.5"
          style={{ backgroundColor: color }}
        ></span>
      </span>
      {priority}
    </div>
  );
}
