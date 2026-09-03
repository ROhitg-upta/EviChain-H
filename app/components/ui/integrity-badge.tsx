'use client';
import React from 'react';

export type IntegrityStatus = 'VERIFIED' | 'PENDING' | 'FLAGGED' | 'SEALED' | 'MISSING';

export interface IntegrityBadgeProps {
  status: IntegrityStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const statusConfig: Record<IntegrityStatus, { color: string; label: string }> = {
  VERIFIED: { color: 'var(--accent-verified, #b5f542)', label: 'VERIFIED' },
  PENDING: { color: 'var(--accent-pending, #fbbf24)', label: 'PENDING' },
  FLAGGED: { color: 'var(--accent-danger, #f43f5e)', label: 'FLAGGED' },
  SEALED: { color: 'var(--accent-active, #22d3ee)', label: 'SEALED' },
  MISSING: { color: 'var(--text-secondary, #7a7d82)', label: 'MISSING' }
};

export function IntegrityBadge({ status, size = 'sm', className = '' }: IntegrityBadgeProps) {
  const config = statusConfig[status] || statusConfig.MISSING;
  
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
          backgroundColor: config.color 
        }} 
      />
      {config.label}
    </div>
  );
}
