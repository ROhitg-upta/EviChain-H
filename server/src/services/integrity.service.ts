import { prisma } from "../db";

export interface IntegrityAuditResult {
  timestamp: string;
  totalChecks: number;
  anomaliesFound: number;
  details: {
    evidenceWithoutValidCase: number;
    evidenceWithoutValidUploader: number;
    custodyEventsOrphaned: number;
    commentsOrphanedFromCase: number;
    commentRepliesOrphaned: number;
    commentMentionsOrphaned: number;
    annotationsOrphaned: number;
    sessionsOrphaned: number;
    notificationsOrphaned: number;
    anomalies: string[];
  };
}

export async function runDataIntegrityAudit(): Promise<IntegrityAuditResult> {
  const anomalies: string[] = [];

  // 1. Evidence caseId check: Every non-null caseId must point to an existing Case
  const evidenceList = await prisma.evidence.findMany({
    select: { id: true, caseId: true, collectedById: true },
  });

  const validCaseIds = new Set((await prisma.case.findMany({ select: { id: true } })).map((c) => c.id));
  const validUserIds = new Set((await prisma.user.findMany({ select: { id: true } })).map((u) => u.id));
  const validEvidenceIds = new Set(evidenceList.map((e) => e.id));

  let evidenceWithoutValidCase = 0;
  let evidenceWithoutValidUploader = 0;

  for (const ev of evidenceList) {
    if (ev.caseId && !validCaseIds.has(ev.caseId)) {
      evidenceWithoutValidCase++;
      anomalies.push(`Evidence [${ev.id}] references non-existent caseId [${ev.caseId}]`);
    }
    if (!validUserIds.has(ev.collectedById)) {
      evidenceWithoutValidUploader++;
      anomalies.push(`Evidence [${ev.id}] references non-existent uploaderId [${ev.collectedById}]`);
    }
  }

  // 2. CustodyEvent evidence check: Every custody event must point to existing Evidence
  const custodyEvents = await prisma.custodyEvent.findMany({
    select: { id: true, evidenceId: true, actorUserId: true },
  });

  let custodyEventsOrphaned = 0;
  for (const ce of custodyEvents) {
    if (!validEvidenceIds.has(ce.evidenceId)) {
      custodyEventsOrphaned++;
      anomalies.push(`CustodyEvent [${ce.id}] references non-existent evidenceId [${ce.evidenceId}]`);
    }
  }

  // 3. Comments check: caseId exists, parentId exists if populated
  const comments = await prisma.caseComment.findMany({
    select: { id: true, caseId: true, parentId: true, userId: true },
  });
  const validCommentIds = new Set(comments.map((c) => c.id));

  let commentsOrphanedFromCase = 0;
  let commentRepliesOrphaned = 0;
  for (const c of comments) {
    if (!validCaseIds.has(c.caseId)) {
      commentsOrphanedFromCase++;
      anomalies.push(`CaseComment [${c.id}] references non-existent caseId [${c.caseId}]`);
    }
    if (c.parentId && !validCommentIds.has(c.parentId)) {
      commentRepliesOrphaned++;
      anomalies.push(`CaseComment [${c.id}] references non-existent parentId [${c.parentId}]`);
    }
  }

  // 4. Comment mentions check: commentId exists and mentioned userId exists
  const mentions = await prisma.commentMention.findMany({
    select: { id: true, commentId: true, userId: true },
  });
  let commentMentionsOrphaned = 0;
  for (const m of mentions) {
    if (!validCommentIds.has(m.commentId)) {
      commentMentionsOrphaned++;
      anomalies.push(`CommentMention [${m.id}] references non-existent commentId [${m.commentId}]`);
    }
    if (!validUserIds.has(m.userId)) {
      commentMentionsOrphaned++;
      anomalies.push(`CommentMention [${m.id}] references non-existent userId [${m.userId}]`);
    }
  }

  // 5. Annotations check: evidenceId exists and userId exists
  const annotations = await prisma.evidenceAnnotation.findMany({
    select: { id: true, evidenceId: true, userId: true },
  });
  let annotationsOrphaned = 0;
  for (const a of annotations) {
    if (!validEvidenceIds.has(a.evidenceId)) {
      annotationsOrphaned++;
      anomalies.push(`EvidenceAnnotation [${a.id}] references non-existent evidenceId [${a.evidenceId}]`);
    }
    if (!validUserIds.has(a.userId)) {
      annotationsOrphaned++;
      anomalies.push(`EvidenceAnnotation [${a.id}] references non-existent userId [${a.userId}]`);
    }
  }

  // 6. Session checks: userId exists
  const sessions = await prisma.session.findMany({
    select: { id: true, userId: true },
  });
  let sessionsOrphaned = 0;
  for (const s of sessions) {
    if (!validUserIds.has(s.userId)) {
      sessionsOrphaned++;
      anomalies.push(`Session [${s.id}] references non-existent userId [${s.userId}]`);
    }
  }

  // 7. Notification checks: userId exists
  const notifications = await prisma.notification.findMany({
    select: { id: true, userId: true },
  });
  let notificationsOrphaned = 0;
  for (const n of notifications) {
    if (!validUserIds.has(n.userId)) {
      notificationsOrphaned++;
      anomalies.push(`Notification [${n.id}] references non-existent userId [${n.userId}]`);
    }
  }

  const totalAnomalies =
    evidenceWithoutValidCase +
    evidenceWithoutValidUploader +
    custodyEventsOrphaned +
    commentsOrphanedFromCase +
    commentRepliesOrphaned +
    commentMentionsOrphaned +
    annotationsOrphaned +
    sessionsOrphaned +
    notificationsOrphaned;

  return {
    timestamp: new Date().toISOString(),
    totalChecks:
      evidenceList.length +
      custodyEvents.length +
      comments.length +
      mentions.length +
      annotations.length +
      sessions.length +
      notifications.length,
    anomaliesFound: totalAnomalies,
    details: {
      evidenceWithoutValidCase,
      evidenceWithoutValidUploader,
      custodyEventsOrphaned,
      commentsOrphanedFromCase,
      commentRepliesOrphaned,
      commentMentionsOrphaned,
      annotationsOrphaned,
      sessionsOrphaned,
      notificationsOrphaned,
      anomalies,
    },
  };
}
