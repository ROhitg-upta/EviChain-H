import { Response } from "express";
import { prisma } from "../db";

export interface NotificationPayload {
  type: "success" | "warning" | "error" | "info" | "transfer" | "mention";
  title: string;
  message: string;
  link?: string | null;
}

class NotificationService {
  // Map of userId -> Set of active SSE Response connections
  private clients = new Map<string, Set<Response>>();

  /**
   * Register a new client SSE connection
   */
  registerClient(userId: string, res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering
    res.flushHeaders();

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    const userClients = this.clients.get(userId)!;
    userClients.add(res);

    // Initial connected heartbeat
    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: new Date().toISOString() })}\n\n`);

    // Keep-alive heartbeat every 25 seconds to prevent timeout
    const keepAlive = setInterval(() => {
      res.write(": heartbeat\n\n");
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
   * Persist notification in DB and push via SSE if user is online
   */
  async emitNotification(userId: string, payload: NotificationPayload) {
    try {
      const record = await prisma.notification.create({
        data: {
          userId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          link: payload.link ?? null,
        },
      });

      const userClients = this.clients.get(userId);
      if (userClients && userClients.size > 0) {
        const sseMessage = `event: notification\ndata: ${JSON.stringify(record)}\n\n`;
        for (const client of userClients) {
          client.write(sseMessage);
        }
      }

      return record;
    } catch (error) {
      console.error("Failed to emit notification:", error);
      return null;
    }
  }

  /**
   * Broadcast notification to all users or all users with a specific role
   */
  async broadcastNotification(payload: NotificationPayload, role?: "ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "CUSTODIAN") {
    try {
      const users = await prisma.user.findMany({
        where: role ? { role } : undefined,
        select: { id: true },
      });

      const notifications = await Promise.all(
        users.map((u) => this.emitNotification(u.id, payload))
      );

      return notifications;
    } catch (error) {
      console.error("Failed to broadcast notification:", error);
      return [];
    }
  }
}

export const notificationService = new NotificationService();
