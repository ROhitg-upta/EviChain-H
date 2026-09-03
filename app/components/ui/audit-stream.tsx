import React from 'react';

export interface AuditStreamEvent {
  id: string;
  action: string;
  userId: string;
  userName?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface AuditStreamProps {
  events: AuditStreamEvent[];
  maxVisible?: number;
  className?: string;
  loading?: boolean;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(iso));
}

export function AuditStream({ events, maxVisible = 8, className = '', loading = false }: AuditStreamProps) {
  if (loading) {
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        {Array.from({ length: maxVisible }).map((_, i) => (
          <div 
            key={i} 
            className="h-10 rounded-md animate-pulse"
            style={{ backgroundColor: 'var(--surface-overlay)' }}
          ></div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div 
        className={`flex flex-col items-center justify-center p-6 text-center border rounded-md ${className}`}
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--surface-raised)', color: 'var(--text-secondary)' }}
      >
        <span className="text-2xl mb-2" aria-hidden="true">📋</span>
        <p className="text-sm">No audit events yet</p>
      </div>
    );
  }

  const visibleEvents = events.slice(0, maxVisible);

  const getActionColor = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('create')) return 'var(--accent-active)'; // cyan
    if (act.includes('update')) return 'var(--accent-pending)'; // amber
    if (act.includes('delete')) return 'var(--accent-alert)'; // coral
    return 'var(--text-secondary)'; // neutral for access/other
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {visibleEvents.map((event, index) => {
        const dotColor = getActionColor(event.action);
        return (
          <div 
            key={event.id}
            className="flex items-center justify-between p-3 rounded-md border text-sm group animate-fade-in"
            style={{ 
              backgroundColor: 'var(--surface-raised)', 
              borderColor: 'var(--border-subtle)',
              animationDelay: `${index * 50}ms`
            }}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div 
                className="w-2 h-2 rounded-full shrink-0" 
                style={{ backgroundColor: dotColor }}
                aria-hidden="true"
              ></div>
              <div className="flex items-center gap-2 truncate">
                <span 
                  className="font-mono font-medium truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {event.action}
                </span>
                <span 
                  className="truncate text-xs px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
                  title={event.ipAddress ? `IP: ${event.ipAddress}` : undefined}
                >
                  {event.userName || event.userId}
                </span>
              </div>
            </div>
            
            <span 
              className="text-xs whitespace-nowrap shrink-0 ml-4 font-mono"
              style={{ color: 'var(--text-secondary)' }}
              title={new Date(event.timestamp).toISOString()}
            >
              {relativeTime(event.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
