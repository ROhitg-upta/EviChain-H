'use client';
import React from 'react';

export interface LoadingSkeletonProps {
  variant: 'text' | 'card' | 'table-row' | 'stat' | 'timeline';
  count?: number;
  className?: string;
}

export function LoadingSkeleton({ variant, count = 1, className = '' }: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);
  
  const baseBg = 'var(--surface-raised, #181b20)';
  
  const renderItem = (index: number) => {
    switch (variant) {
      case 'text':
        const width = 60 + Math.random() * 40;
        return (
          <div 
            key={index} 
            className={`skeleton rounded mb-2 ${className}`} 
            style={{ height: '14px', width: `${width}%`, backgroundColor: baseBg }}
          />
        );
      
      case 'card':
        return (
          <div 
            key={index} 
            className={`skeleton rounded-lg mb-4 w-full ${className}`} 
            style={{ height: '120px', backgroundColor: baseBg }}
          />
        );
        
      case 'table-row':
        return (
          <div key={index} className={`flex items-center gap-4 p-4 border-b ${className}`} style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.06))' }}>
            <div className="skeleton rounded" style={{ height: '20px', width: '25%', backgroundColor: baseBg }} />
            <div className="skeleton rounded" style={{ height: '20px', width: '35%', backgroundColor: baseBg }} />
            <div className="skeleton rounded" style={{ height: '20px', width: '20%', backgroundColor: baseBg }} />
            <div className="skeleton rounded" style={{ height: '20px', width: '20%', backgroundColor: baseBg }} />
          </div>
        );
        
      case 'stat':
        return (
          <div key={index} className={`p-4 rounded-lg flex flex-col gap-2 ${className}`} style={{ backgroundColor: 'var(--surface-sunken, #0a0c0e)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
            <div className="skeleton rounded" style={{ height: '12px', width: '40%', backgroundColor: baseBg }} />
            <div className="skeleton rounded" style={{ height: '32px', width: '70%', backgroundColor: baseBg }} />
          </div>
        );
        
      case 'timeline':
        return (
          <div key={index} className={`flex gap-4 ${className}`}>
            <div className="flex flex-col items-center">
              <div className="skeleton rounded-full" style={{ height: '12px', width: '12px', backgroundColor: baseBg }} />
              <div className="flex-1 w-px my-2" style={{ backgroundColor: 'var(--border-default, rgba(255,255,255,0.1))' }} />
            </div>
            <div className="flex-1 pb-8">
              <div className="skeleton rounded mb-2" style={{ height: '16px', width: '30%', backgroundColor: baseBg }} />
              <div className="skeleton rounded" style={{ height: '12px', width: '80%', backgroundColor: baseBg }} />
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <>
      {items.map(renderItem)}
    </>
  );
}
