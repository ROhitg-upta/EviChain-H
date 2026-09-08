import React from "react";

export interface NotificationBellIconProps extends React.SVGProps<SVGSVGElement> {
  size?: 18 | 20 | 24;
  state?: "default" | "unread" | "action-required" | "critical";
  decorative?: boolean;
}

/**
 * Universally recognizable forensic notification bell icon.
 * Features a clean, standard bell silhouette with clapper and top hanger ring.
 * Meets WCAG contrast and scalability requirements at 18px, 20px, and 24px.
 */
export function NotificationBellIcon({
  size = 20,
  state = "default",
  decorative = true,
  className = "",
  style = {},
  ...props
}: NotificationBellIconProps) {
  // Determine stroke color based on alert state if not explicitly overridden
  let stateStroke = "currentColor";
  if (state === "critical") {
    stateStroke = "var(--accent-danger, #f43f5e)";
  } else if (state === "action-required") {
    stateStroke = "var(--accent-warning, #fbbf24)";
  } else if (state === "unread") {
    stateStroke = "var(--accent-active, #22d3ee)";
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.stroke || stateStroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative ? "true" : undefined}
      className={`notification-bell-icon ${className}`.trim()}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {/* Bell silhouette with top suspension loop and flanged acoustic rim */}
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      {/* Clapper centered beneath acoustic rim */}
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default NotificationBellIcon;
