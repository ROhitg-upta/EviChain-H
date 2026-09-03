import { Response } from "express";
import { prisma } from "../db";

export type NotificationType =
  | "CASE_CREATED"
  | "CASE_UPDATED"
  | "CASE_DELETED"
  | "EVIDENCE_UPLOADED"
  | "CUSTODY_TRANSFER_RECEIVED"
  | "CUSTODY_TRANSFER_COMPLETED"
  | "EVIDENCE_ACCESSED"
  | "EVIDENCE_DOWNLOADED"
  | "INTEGRITY_VERIFIED"
  | "INTEGRITY_ALERT"
  | "REPORT_READY"
  | "AUDIT_EXPORT_READY"
  | "SECURITY_EVENT"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "transfer"
  | "mention";

export type NotificationPreferenceKey =
  | "caseUpdates"
  | "evidenceUploads"
  | "custodyTransfers"
  | "securityAlerts"
  | "auditActivity"
  | "reportReady"
  | "weeklyDigest";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadataJson?: Record<string, unknown> | null;
  dedupeKey?: string | null;
}

export interface NotificationPreferences {
  caseUpdates: boolean;
  evidenceUploads: boolean;
  custodyTransfers: boolean;
  securityAlerts: boolean;
  auditActivity: boolean;
  reportReady: boolean;
  weeklyDigest: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  caseUpdates: true,
  evidenceUploads: true,
  custodyTransfers: true,
  securityAlerts: true,
  auditActivity: false,
  reportReady: true,
  weeklyDigest: false,
};

// Map notification types to their corresponding preference key
const TYPE_TO_PREFERENCE_MAP: Partial<Record<NotificationType, NotificationPreferenceKey>> = {
  CASE_CREATED: "caseUpdates",
  CASE_UPDATED: "caseUpdates",
  CASE_DELETED: "caseUpdates",
  EVIDENCE_UPLOADED: "evidenceUploads",
  CUSTODY_TRANSFER_RECEIVED: "custodyTransfers",
  CUSTODY_TRANSFER_COMPLETED: "custodyTransfers",
  transfer: "custodyTransfers",
  EVIDENCE_ACCESSED: "evidenceUploads",
  EVIDENCE_DOWNLOADED: "evidenceUploads",
  INTEGRITY_VERIFIED: "securityAlerts",
  INTEGRITY_ALERT: "securityAlerts",
  SECURITY_EVENT: "securityAlerts",
  REPORT_READY: "reportReady",
  AUDIT_EXPORT_READY: "auditActivity",
};

class NotificationService {
  private clients = new Map<string, Set<Response>>();

  /**
   * Register a new client SSE connection for real-time notification delivery
   */
  registerClient(userId: string, res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    const userClients = this.clients.get(userId)!;
    userClients.add(res);

    // Initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: new Date().toISOString() })}\n\n`);

    // Heartbeat every 25s
    const keepAlive = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    res.on("close", () => {
      clearInterval(keepAlive);
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    });
  }

  /**
   * Get user preferences or return safe defaults
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const record = await prisma.notificationPreference.findUnique({
        where: { userId },
      });

      if (!record) {
        return { ...DEFAULT_PREFERENCES };
      }

      return {
        caseUpdates: record.caseUpdates,
        evidenceUploads: record.evidenceUploads,
        custodyTransfers: record.custodyTransfers,
        securityAlerts: record.securityAlerts,
        auditActivity: record.auditActivity,
        reportReady: record.reportReady,
        weeklyDigest: record.weeklyDigest,
      };
    } catch (err) {
      console.error(`[NotificationService] Error fetching preferences for ${userId}:`, err);
      return { ...DEFAULT_PREFERENCES };
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const updatedData = {
      caseUpdates: updates.caseUpdates !== undefined ? Boolean(updates.caseUpdates) : current.caseUpdates,
      evidenceUploads: updates.evidenceUploads !== undefined ? Boolean(updates.evidenceUploads) : current.evidenceUploads,
      custodyTransfers: updates.custodyTransfers !== undefined ? Boolean(updates.custodyTransfers) : current.custodyTransfers,
      // Security alerts cannot be disabled according to platform policy
      securityAlerts: true,
      auditActivity: updates.auditActivity !== undefined ? Boolean(updates.auditActivity) : current.auditActivity,
      reportReady: updates.reportReady !== undefined ? Boolean(updates.reportReady) : current.reportReady,
      weeklyDigest: updates.weeklyDigest !== undefined ? Boolean(updates.weeklyDigest) : current.weeklyDigest,
    };

    const saved = await prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...updatedData,
      },
      update: updatedData,
    });

    return {
      caseUpdates: saved.caseUpdates,
      evidenceUploads: saved.evidenceUploads,
      custodyTransfers: saved.custodyTransfers,
      securityAlerts: saved.securityAlerts,
      auditActivity: saved.auditActivity,
      reportReady: saved.reportReady,
      weeklyDigest: saved.weeklyDigest,
    };
  }

  /**
   * Check if a notification type is enabled for a given user
   */
  async isNotificationEnabled(userId: string, type: NotificationType): Promise<boolean> {
    const prefKey = TYPE_TO_PREFERENCE_MAP[type];
    if (!prefKey) return true; // Default to true if unmapped
    if (prefKey === "securityAlerts") return true; // Security alerts are always active

    const prefs = await this.getPreferences(userId);
    return prefs[prefKey];
  }

  /**
   * Create a single persistent notification with deduplication & preference checks
   */
  async createNotification(input: CreateNotificationInput) {
    try {
      // 1. Verify user exists
      const userExists = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });
      if (!userExists) {
        return null;
      }

      // 2. Check user preferences
      const isEnabled = await this.isNotificationEnabled(input.userId, input.type);
      if (!isEnabled) {
        return null;
      }

      // 3. Deduplication check
      const dedupeKey = input.dedupeKey || null;
      if (dedupeKey) {
        const existing = await prisma.notification.findUnique({
          where: { dedupeKey },
        });
        if (existing) {
          return existing; // Idempotent return without duplicate insert
        }
      }

      // 4. Create persistent record
      const record = await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          message: input.message,
          link: input.link ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          metadataJson: (input.metadataJson as unknown as object) ?? undefined,
          dedupeKey,
          read: false,
        },
      });

      // 5. Broadcast to active SSE streams if user is connected
      const userClients = this.clients.get(input.userId);
      if (userClients && userClients.size > 0) {
        const sseMessage = `event: notification\ndata: ${JSON.stringify(record)}\n\n`;
        for (const client of userClients) {
          try {
            client.write(sseMessage);
          } catch {
            userClients.delete(client);
          }
        }
      }

      return record;
    } catch (error) {
      // If unique constraint error on dedupeKey occurs concurrently, return existing
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
        if (input.dedupeKey) {
          return prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
        }
      }
      console.error("[NotificationService] Failed to create notification:", error);
      return null;
    }
  }

  /**
   * Helper to emit notifications to multiple recipients safely
   */
  async createNotificationsForRecipients(inputs: CreateNotificationInput[]) {
    const results = await Promise.all(inputs.map((inp) => this.createNotification(inp)));
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  }

  /**
   * Mark a single notification as read (idempotent)
   */
  async markNotificationRead(userId: string, notificationId: string) {
    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif || notif.userId !== userId) {
      return null;
    }

    if (notif.read && notif.readAt) {
      return notif;
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all unread notifications for a user as read
   */
  async markAllNotificationsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });
  }

  /**
   * Broadcast notification to all administrators or all users
   */
  async broadcastNotification(
    payload: { type: NotificationType; title: string; message: string; link?: string | null },
    role?: "ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "CUSTODIAN",
  ) {
    try {
      const users = await prisma.user.findMany({
        where: role ? { role } : undefined,
        select: { id: true },
      });

      return this.createNotificationsForRecipients(
        users.map((u) => ({
          userId: u.id,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          link: payload.link,
        })),
      );
    } catch (error) {
      console.error("[NotificationService] Broadcast error:", error);
      return [];
    }
  }

  /**
   * Backward compatible emitNotification
   */
  async emitNotification(
    userId: string,
    payload: { type: NotificationType; title: string; message: string; link?: string | null },
  ) {
    return this.createNotification({
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link,
    });
  }
}

export const notificationService = new NotificationService();
