import { prisma } from "../db";
import { notificationService, type NotificationType } from "./notification.service";

export type AlertSeverity = "INFO" | "SUCCESS" | "WARNING" | "HIGH" | "CRITICAL" | "SECURITY";

export type AlertActionType =
  | "REVIEW_INTEGRITY"
  | "OPEN_CASE"
  | "OPEN_EVIDENCE"
  | "OPEN_CUSTODY_TIMELINE"
  | "RETRY_OFFLINE_SYNC"
  | "OPEN_OFFLINE_QUEUE"
  | "MARK_READ"
  | "DISMISS_LOW_PRIORITY"
  | "RESOLVE_ALERT";

export interface CreateInvestigationAlertInput {
  userId: string;
  type: NotificationType;
  severity?: AlertSeverity;
  title: string;
  message: string;
  link?: string | null;
  entityType?: "CASE" | "EVIDENCE" | "CUSTODY" | "AUDIT" | "OFFLINE_QUEUE" | "SYSTEM" | null;
  entityId?: string | null;
  actionRequired?: boolean;
  actionType?: AlertActionType | null;
  actionPayload?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  groupingKey?: string | null;
  expiresAt?: Date | null;
}

const VALID_SEVERITIES: Set<AlertSeverity> = new Set([
  "INFO",
  "SUCCESS",
  "WARNING",
  "HIGH",
  "CRITICAL",
  "SECURITY",
]);

// Sanitize internal navigation link (prevent open redirects / malicious URLs)
export function sanitizeInternalLink(link?: string | null): string | null {
  if (!link || typeof link !== "string") return null;
  const trimmed = link.trim();
  // Must start with single slash and contain only allowed path characters
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || /^[a-zA-Z]+:/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

// Strip any sensitive credentials or tokens from payload
export function sanitizeActionPayload(payload?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const cleaned: Record<string, unknown> = {};
  const forbiddenKeys = new Set(["password", "token", "jwt", "secret", "cookie", "storagekey", "privatekey", "fileblob"]);

  for (const [key, val] of Object.entries(payload)) {
    if (forbiddenKeys.has(key.toLowerCase())) continue;
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean" || val === null) {
      cleaned[key] = val;
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      cleaned[key] = sanitizeActionPayload(val as Record<string, unknown>);
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

class AlertIntelligenceService {
  /**
   * Determine default severity based on notification type if not explicitly supplied
   */
  calculateAlertSeverity(type: NotificationType, explicit?: AlertSeverity): AlertSeverity {
    if (explicit && VALID_SEVERITIES.has(explicit)) {
      return explicit;
    }
    switch (type) {
      case "INTEGRITY_ALERT":
      case "error":
        return "CRITICAL";
      case "SECURITY_EVENT":
        return "SECURITY";
      case "CUSTODY_TRANSFER_RECEIVED":
      case "transfer":
        return "HIGH";
      case "warning":
        return "WARNING";
      case "INTEGRITY_VERIFIED":
      case "CUSTODY_TRANSFER_COMPLETED":
      case "success":
        return "SUCCESS";
      case "CASE_CREATED":
      case "CASE_UPDATED":
      case "EVIDENCE_UPLOADED":
      case "EVIDENCE_ACCESSED":
      case "EVIDENCE_DOWNLOADED":
      case "REPORT_READY":
      case "AUDIT_EXPORT_READY":
      case "info":
      default:
        return "INFO";
    }
  }

  /**
   * Determine whether an alert requires investigator action
   */
  isActionRequired(severity: AlertSeverity, explicit?: boolean): boolean {
    if (typeof explicit === "boolean") return explicit;
    return severity === "CRITICAL" || severity === "SECURITY" || severity === "HIGH";
  }

  /**
   * Create an investigation alert with full forensic intelligence metadata
   */
  async createInvestigationAlert(input: CreateInvestigationAlertInput) {
    const severity = this.calculateAlertSeverity(input.type, input.severity);
    const actionRequired = this.isActionRequired(severity, input.actionRequired);
    const safeLink = sanitizeInternalLink(input.link);
    const safePayload = sanitizeActionPayload(input.actionPayload);

    return notificationService.createNotification({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: safeLink,
      entityType: input.entityType,
      entityId: input.entityId,
      severity,
      actionRequired,
      actionType: input.actionType ?? (actionRequired ? "REVIEW_INTEGRITY" : null),
      actionPayload: safePayload,
      dedupeKey: input.dedupeKey,
      groupingKey: input.groupingKey,
      expiresAt: input.expiresAt,
    });
  }

  /**
   * Generate Needs Attention Queue from real system state:
   * 1. FLAGGED Evidence records accessible to the user
   * 2. Active cases led by the user with no updates in > 14 days
   * 3. Stored action-required, unresolved notifications
   */
  async getNeedsAttentionQueue(userId: string, userRole: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return [];
    }

    const activeAlerts = await prisma.notification.findMany({
      where: {
        userId,
        actionRequired: true,
        resolvedAt: null,
        dismissedAt: null,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    });

    const results: Array<{
      id: string;
      source: "NOTIFICATION" | "FLAGGED_EVIDENCE" | "INACTIVE_CASE";
      severity: AlertSeverity;
      actionRequired: boolean;
      actionType: AlertActionType;
      title: string;
      message: string;
      entityType: string;
      entityId: string;
      link: string;
      createdAt: string;
      actionPayload?: Record<string, unknown> | null;
    }> = [];

    const coveredEntityIds = new Set<string>();

    for (const alert of activeAlerts) {
      if (alert.entityId) coveredEntityIds.add(alert.entityId);
      results.push({
        id: alert.id,
        source: "NOTIFICATION",
        severity: (alert.severity as AlertSeverity) || "HIGH",
        actionRequired: true,
        actionType: (alert.actionType as AlertActionType) || "REVIEW_INTEGRITY",
        title: alert.title,
        message: alert.message,
        entityType: alert.entityType || "SYSTEM",
        entityId: alert.entityId || alert.id,
        link: alert.link || "/notifications",
        createdAt: alert.createdAt.toISOString(),
        actionPayload: (alert.actionPayload as Record<string, unknown>) || null,
      });
    }

    let evidenceFilter: Record<string, unknown> = { status: "FLAGGED" };
    if (userRole === "INVESTIGATOR" || userRole === "CUSTODIAN") {
      evidenceFilter = {
        status: "FLAGGED",
        OR: [
          { collectedById: userId },
          { currentCustodianId: userId },
          { case: { leadUserId: userId } },
        ],
      };
    }

    const flaggedEvidence = await prisma.evidence.findMany({
      where: evidenceFilter,
      select: {
        id: true,
        name: true,
        sha256: true,
        updatedAt: true,
        caseId: true,
        case: { select: { id: true, title: true } },
      },
      take: 10,
    });

    for (const ev of flaggedEvidence) {
      if (!coveredEntityIds.has(ev.id)) {
        coveredEntityIds.add(ev.id);
        results.push({
          id: `derived-integrity-${ev.id}`,
          source: "FLAGGED_EVIDENCE",
          severity: "CRITICAL",
          actionRequired: true,
          actionType: "REVIEW_INTEGRITY",
          title: `Integrity Anomaly: ${ev.name}`,
          message: `Evidence fingerprint or tamper check was flagged. Immediate forensic review required.`,
          entityType: "EVIDENCE",
          entityId: ev.id,
          link: `/evidence/${ev.id}`,
          createdAt: ev.updatedAt.toISOString(),
          actionPayload: { evidenceId: ev.id, sha256: ev.sha256, caseTitle: ev.case?.title },
        });
      }
    }

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const inactiveCases = await prisma.case.findMany({
      where: {
        leadUserId: userId,
        status: { not: "CLOSED" },
        updatedAt: { lte: fourteenDaysAgo },
      },
      select: { id: true, title: true, status: true, updatedAt: true },
      take: 5,
    });

    for (const cs of inactiveCases) {
      if (!coveredEntityIds.has(cs.id)) {
        coveredEntityIds.add(cs.id);
        results.push({
          id: `derived-case-${cs.id}`,
          source: "INACTIVE_CASE",
          severity: "WARNING",
          actionRequired: true,
          actionType: "OPEN_CASE",
          title: `Dormant Case Review: ${cs.title}`,
          message: `Case has had no updates or evidence logged in over 14 days.`,
          entityType: "CASE",
          entityId: cs.id,
          link: `/cases/${cs.id}`,
          createdAt: cs.updatedAt.toISOString(),
          actionPayload: { caseId: cs.id, status: cs.status },
        });
      }
    }

    const severityRank: Record<AlertSeverity, number> = {
      CRITICAL: 0,
      SECURITY: 0,
      HIGH: 1,
      WARNING: 2,
      SUCCESS: 3,
      INFO: 4,
    };

    return results.sort((a, b) => {
      const rankDiff = (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Execute triage action on an alert (with authorization and audit logging)
   */
  async resolveNotificationAction(
    userId: string,
    userRole: string,
    notificationId: string,
    actionType: AlertActionType,
    clientIp?: string,
    userAgent?: string,
  ) {
    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif) {
      return { status: 404, error: "Notification not found" };
    }

    if (notif.userId !== userId && userRole !== "ADMINISTRATOR") {
      return { status: 403, error: "Forbidden: You cannot modify another user's alerts." };
    }

    const now = new Date();
    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        read: true,
        readAt: notif.readAt ?? now,
        resolvedAt: now,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: "alert.triage_action",
        resourceType: "notification",
        resourceId: notificationId,
        detailJson: {
          actionType,
          notificationType: notif.type,
          severity: notif.severity,
          entityType: notif.entityType,
          entityId: notif.entityId,
          resolvedAt: now.toISOString(),
        },
        ipAddress: clientIp ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return { status: 200, data: updated };
  }

  /**
   * Dismiss notification (soft dismissal for user UI preference)
   */
  async dismissNotification(userId: string, notificationId: string) {
    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif) {
      return { status: 404, error: "Notification not found" };
    }

    if (notif.userId !== userId) {
      return { status: 403, error: "Forbidden: You cannot dismiss another user's alert." };
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        dismissedAt: new Date(),
        read: true,
        readAt: notif.readAt ?? new Date(),
      },
    });

    return { status: 200, data: updated };
  }

  /**
   * Group related notifications for anti-fatigue feeds
   */
  groupNotifications<T extends { groupingKey?: string | null; type: string; entityId?: string | null }>(
    items: T[],
  ): Array<{ groupKey: string; count: number; latest: T; items: T[] }> {
    const groups = new Map<string, T[]>();

    for (const item of items) {
      const key = item.groupingKey || `${item.type}:${item.entityId || "global"}`;
      const existing = groups.get(key) || [];
      existing.push(item);
      groups.set(key, existing);
    }

    const result: Array<{ groupKey: string; count: number; latest: T; items: T[] }> = [];
    for (const [groupKey, groupItems] of groups.entries()) {
      result.push({
        groupKey,
        count: groupItems.length,
        latest: groupItems[0],
        items: groupItems,
      });
    }

    return result;
  }
}

export const alertIntelligenceService = new AlertIntelligenceService();
