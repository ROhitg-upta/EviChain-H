import React, { useState } from 'react';

export interface CustodyTimelineEvent {
  id: string;
  action: string;
  actor?: { name: string; role: string } | null;
  fromUser?: { name: string; role: string } | null;
  toUser?: { name: string; role: string } | null;
  note?: string;
  timestamp: string;
  ipAddress?: string | null;
}

interface CustodyTimelineProps {
  events: CustodyTimelineEvent[];
  maxVisible?: number;
  className?: string;
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

export function CustodyTimeline({ events, maxVisible = 5, className = '' }: CustodyTimelineProps) {
  const [showAll, setShowAll] = useState(false);

  if (!events || events.length === 0) {
    return (
      <div 
        className={`flex flex-col items-center justify-center p-8 text-center border rounded-md ${className}`}
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--surface-raised)', color: 'var(--text-secondary)' }}
      >
        <span className="text-3xl mb-2" aria-hidden="true">⏱</span>
        <p>No custody events recorded</p>
      </div>
    );
  }

  const visibleEvents = showAll ? events : events.slice(0, maxVisible);
  const hasMore = events.length > maxVisible;

  // Icons and colors for actions
  const getActionConfig = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATED':
        return { color: 'var(--accent-active)', icon: '📁' };
      case 'TRANSFERRED':
        return { color: 'var(--accent-pending)', icon: '⇄' };
      case 'ACCESSED':
        return { color: 'var(--text-secondary)', icon: '👁' };
      case 'DOWNLOADED':
        return { color: 'var(--accent-safe)', icon: '⤓' };
      default:
        return { color: 'var(--text-secondary)', icon: '●' };
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div 
        className="absolute left-4 top-0 bottom-0 w-0.5"
        style={{ backgroundColor: 'var(--border-default)' }}
      ></div>
      
      <div className="flex flex-col gap-6">
        {visibleEvents.map((event, index) => {
          const config = getActionConfig(event.action);
          return (
            <div 
              key={event.id} 
              className="relative pl-10 animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Node */}
              <div 
                className="absolute left-[0.4375rem] top-1 w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 z-10"
                style={{ 
                  backgroundColor: 'var(--surface-base)', 
                  borderColor: config.color,
                  color: config.color
                }}
                aria-hidden="true"
              >
                {config.icon}
              </div>

              {/* Content */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span 
                      className="font-bold text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {event.action}
                    </span>
                    {event.actor && (
                      <span 
                        className="px-2 py-0.5 rounded text-xs"
                        style={{ backgroundColor: 'var(--surface-overlay)', color: 'var(--text-secondary)' }}
                      >
                        {event.actor.name} ({event.actor.role})
                      </span>
                    )}
                  </div>
                  <span 
                    className="text-xs whitespace-nowrap cursor-help font-mono"
                    style={{ color: 'var(--text-secondary)' }}
                    title={new Date(event.timestamp).toISOString()}
                  >
                    {relativeTime(event.timestamp)}
                  </span>
                </div>

                {event.action.toUpperCase() === 'TRANSFERRED' && event.fromUser && event.toUser && (
                  <div 
                    className="text-sm mt-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    From <span className="font-medium">{event.fromUser.name}</span> → To <span className="font-medium">{event.toUser.name}</span>
                  </div>
                )}

                {event.note && (
                  <p 
                    className="text-sm mt-1 p-2 rounded"
                    style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
                  >
                    {event.note}
                  </p>
                )}

                {event.ipAddress && (
                  <div 
                    className="text-xs mt-1 font-mono"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    IP: {event.ipAddress}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-6 pl-10">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm hover:underline px-3 py-1.5 rounded-md transition-colors"
            style={{ 
              color: 'var(--accent-active)', 
              backgroundColor: 'var(--surface-overlay)' 
            }}
          >
            {showAll ? 'Show less' : `Show all ${events.length} events`}
          </button>
        </div>
      )}
    </div>
  );
}
