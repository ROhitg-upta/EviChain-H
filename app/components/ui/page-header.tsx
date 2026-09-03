'use client';
import React, { ReactNode } from 'react';

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
  className = ''
}: PageHeaderProps) {
  return (
    <div 
      className={`pb-5 mb-6 ${className}`}
      style={{
        borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
      }}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-4 flex items-center text-sm" style={{ color: 'var(--text-secondary, #7a7d82)' }}>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={idx}>
                {isLast || !crumb.href ? (
                  <span style={{ color: isLast ? 'var(--text-primary, #e8e6e3)' : undefined }}>
                    {crumb.label}
                  </span>
                ) : (
                  <a 
                    href={crumb.href} 
                    className="hover:underline transition-colors"
                    style={{ color: 'var(--text-secondary, #7a7d82)' }}
                  >
                    {crumb.label}
                  </a>
                )}
                {!isLast && (
                  <span className="mx-2 opacity-50">/</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1">
          {eyebrow && (
            <p 
              className="text-xs uppercase font-medium mb-1 tracking-wider"
              style={{ 
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-secondary, #7a7d82)'
              }}
            >
              {eyebrow}
            </p>
          )}
          <h1 
            className="text-xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary, #e8e6e3)' }}
          >
            {title}
          </h1>
          {description && (
            <p 
              className="text-sm mt-1 max-w-2xl"
              style={{ color: 'var(--text-secondary, #7a7d82)' }}
            >
              {description}
            </p>
          )}
        </div>
        
        {actions && (
          <div className="flex items-center gap-3 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
