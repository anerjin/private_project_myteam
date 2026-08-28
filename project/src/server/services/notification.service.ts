import "server-only";

import type { NotificationType, Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * 인앱 알림 (FR-NOTI-001~004).
 *
 * **메일도 메신저도 보내지 않습니다** (`DEC-015`). 알림함과 배지가 전부입니다.
 * 그래서 «알림을 못 봤다»가 곧 «모른다»가 되므로, 알림은 **상태가 바뀐 사실 자체**를
 * 담아야 하고 링크로 확인 경로를 반드시 줍니다.
 *
 * 감사 로그와 마찬가지로 **기록 실패가 본 작업을 되돌리지 않습니다.**
 * 승인은 됐는데 알림을 못 남겼다고 승인을 취소하면 더 나쁩니다.
 */

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** 눌렀을 때 갈 곳. 사용자가 결과를 직접 확인할 수 있어야 한다 */
  linkUrl?: string;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await db.notification.create({ data: input });
  } catch (e) {
    console.error("[notify] 실패 — 본 작업은 유지됩니다:", input.type, e);
  }
}

/** 여러 명에게 같은 알림 (일괄 승인 등) */
export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await db.notification.createMany({ data: inputs });
  } catch (e) {
    console.error("[notify] 일괄 실패 — 본 작업은 유지됩니다:", e);
  }
}

/**
 * 관리자 전원에게 (가입 신청 등 — `FR-NOTI-001`).
 *
 * 정지된 관리자는 제외합니다. 볼 수 없는 사람의 알림함을 채울 이유가 없습니다.
 */
export async function notifyAdmins(
  input: Omit<NotifyInput, "userId">
): Promise<void> {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
  await notifyMany(admins.map((a) => ({ ...input, userId: a.id })));
}

export function listFor(
  userId: string,
  limit = 20
): Promise<Prisma.NotificationGetPayload<object>[]> {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export function countUnread(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(
  userId: string,
  notificationId?: string
): Promise<void> {
  await db.notification.updateMany({
    // id 를 주면 그것만, 안 주면 전부. **항상 userId 로 한정**한다 —
    // 남의 알림을 읽음 처리할 수 있으면 안 된다.
    where: {
      userId,
      readAt: null,
      ...(notificationId ? { id: notificationId } : {}),
    },
    data: { readAt: new Date() },
  });
}
