'use client';
import React from 'react';

export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  className?: string;
}

function getStatusColor(status: string) {
  const lower = status.toLowerCase();
  if (lower === 'active') return 'var(--accent-active, #22d3ee)';
  if (lower === 'review') return 'var(--accent-pending, #fbbf24)';
  if (lower === 'closed') return 'var(--text-secondary, #7a7d82)';
  if (lower === 'archived') return 'var(--border-strong, rgba(255,255,255,0.16))';
  return 'var(--text-secondary, #7a7d82)';
}

export function StatusBadge({ status, size = 'sm', className = '' }: StatusBadgeProps) {
  const color = getStatusColor(status);
  
  return (
    <div 
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${size === 'sm' ? 'text-xs' : 'text-sm'} ${className}`}
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        textTransform: 'uppercase',
        backgroundColor: 'var(--surface-raised, #181b20)',
        borderColor: 'var(--border-subtle, rgba(255,255,255,0.06))',
        color: 'var(--text-primary, #e8e6e3)'
      }}
    >
      <span 
        className="block rounded-full" 
        style={{ 
          width: size === 'sm' ? '6px' : '8px', 
          height: size === 'sm' ? '6px' : '8px', 
          backgroundColor: color 
        }} 
      />
      {status}
    </div>
  );
}
