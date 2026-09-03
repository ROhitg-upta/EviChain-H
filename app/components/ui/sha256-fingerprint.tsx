'use client';
import React from 'react';
import { CopyButton } from './copy-button';

export interface Sha256FingerprintProps {
  hash: string;
  truncate?: boolean;
  className?: string;
}

export function Sha256Fingerprint({ hash, truncate = true, className = '' }: Sha256FingerprintProps) {
  const displayHash = truncate && hash.length > 24
    ? `${hash.substring(0, 16)}…${hash.substring(hash.length - 8)}`
    : hash;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs uppercase font-semibold tracking-wider" style={{ color: 'var(--text-secondary, #7a7d82)' }}>
        SHA-256
      </span>
      <div className="flex items-center gap-2">
        <span 
          className="text-sm"
          title={hash}
          style={{ 
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--neutral-700, #e8e6e3)'
          }}
        >
          {displayHash}
        </span>
        <CopyButton value={hash} />
      </div>
    </div>
  );
}
