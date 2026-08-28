import "server-only";

import type { UserStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { consume, loginLimits, reset } from "@/lib/rate-limit";
import {
  burnPasswordTime,
  hashPassword,
  verifyPassword,
} from "@/server/auth/password";
import { destroy, issue, revokeAllFor } from "@/server/auth/session";
import * as userRepo from "@/server/repositories/user.repository";
import * as audit from "@/server/services/audit.service";

/**
 * 인증 비즈니스 규칙 (REQ-02 · 2.6절).
 *
 * **요청 컨텍스트에 의존하지 않습니다** (`DEV-06 · 6.6절`) — 쿠키를 읽거나 쓰지 않고,
 * 필요한 값은 파라미터로 받습니다. 그래야 워커·스크립트에서도 재사용됩니다.
 */

export interface SignInMeta {
  ip?: string;
  userAgent?: string;
}

export interface SignInResult {
  token: string;
  expires: Date;
  mustChangePassword: boolean;
}

/** 상태별 안내 — 인증 성공 후에 판정한다 (REQ-02 · 2.6절) */
const BLOCKED_MESSAGE: Partial<Record<UserStatus, string>> = {
  PENDING: "아직 승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다.",
  REJECTED: "가입이 거부된 계정입니다. 관리자에게 문의해 주세요.",
  SUSPENDED: "이용이 정지된 계정입니다. 관리자에게 문의해 주세요.",
  WITHDRAWN: "탈퇴한 계정입니다.",
};

const BLOCKED_CODE: Partial<
  Record<UserStatus, "ACCOUNT_PENDING" | "ACCOUNT_BLOCKED">
> = {
  PENDING: "ACCOUNT_PENDING",
  REJECTED: "ACCOUNT_BLOCKED",
  SUSPENDED: "ACCOUNT_BLOCKED",
  WITHDRAWN: "ACCOUNT_BLOCKED",
};

export async function signIn(
  username: string,
  password: string,
  /** 요청에 딸려온 기존 세션 토큰. 있으면 지운다 (세션 고정 방지) */
  existingToken: string | undefined,
  meta: SignInMeta
): Promise<SignInResult> {
  // ── 시도 제한 (NFR-SEC-002) ──────────────────────────
  const account = loginLimits.account(username);
  const accountLimit = await consume(
    account.key,
    account.limit,
    account.windowSeconds
  );
  if (!accountLimit.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `로그인 시도가 너무 많습니다. ${Math.ceil(accountLimit.retryAfter / 60)}분 후 다시 시도해 주세요.`
    );
  }
  if (meta.ip) {
    const byIp = loginLimits.ip(meta.ip);
    const ipLimit = await consume(byIp.key, byIp.limit, byIp.windowSeconds);
    if (!ipLimit.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  }

  const user = await userRepo.findByUsername(username);

  // 아이디가 없어도 **해시 검증과 같은 시간**을 쓴다. 응답 시간으로
  // 아이디 존재 여부가 새어 나가면 실패 메시지를 통일한 의미가 없다.
  const valid = user
    ? await verifyPassword(user.passwordHash, password)
    : await burnPasswordTime();

  if (!user || !valid) {
    await audit.logAnonymous({
      action: "USER_SIGNIN_FAILED",
      attemptedUsername: username,
      summary: `로그인 실패 — ${username}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    // 아이디·비밀번호를 구분하지 않는다 (REQ-02 · 2.6절)
    throw new AppError(
      "UNAUTHENTICATED",
      "아이디 또는 비밀번호가 올바르지 않습니다."
    );
  }

  // 상태 차단은 **인증 성공 후**에 판정한다 — 그래야 상태별 안내를 줄 수 있다
  if (user.status !== "ACTIVE") {
    // **비밀번호는 맞았다.** 정지된 계정에 올바른 자격 증명으로 들어오려는 시도는
    // 「퇴사자 자격 증명이 유출됐다」의 신호라 반드시 남긴다 (FR-AUDIT-001).
    await audit.log(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        via: "WEB",
        ...meta,
      },
      {
        action: "USER_SIGNIN_BLOCKED",
        targetType: "user",
        targetId: user.id,
        summary: `상태 차단 로그인 시도 — ${user.username} (${user.status})`,
      }
    );
    throw new AppError(
      BLOCKED_CODE[user.status] ?? "ACCOUNT_BLOCKED",
      BLOCKED_MESSAGE[user.status] ?? "이용할 수 없는 계정입니다."
    );
  }

  // 성공했으니 실패 카운터를 지운다
  await reset(account.key);

  /*
   * 세션 고정 방지 — 들고 온 세션이 있으면 버리고 새로 발급한다.
   *
   * **`db.session.deleteMany` 로 질러가지 않습니다.** 그러면 캐시가 남아
   * 옛 토큰이 최대 15분 더 살아남습니다. 캐시 정리까지 하는 함수를 씁니다.
   */
  if (existingToken) {
    await destroy(existingToken).catch(() => undefined);
  }

  const { token, expires } = await issue(user.id, meta);
  await userRepo.touchLastLogin(user.id);

  await audit.log(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      via: "WEB",
      ...meta,
    },
    { action: "USER_SIGNIN", summary: `로그인 — ${user.username}` }
  );

  return { token, expires, mustChangePassword: user.mustChangePassword };
}

export async function signUp(input: {
  username: string;
  password: string;
  name: string;
  department?: string;
  signupReason: string;
}): Promise<{ id: string }> {
  // 관리자가 가입을 닫아 두면 받지 않는다 (FR-ADM-015, system_settings)
  const setting = await db.systemSetting.findUnique({
    where: { key: "signup.enabled" },
  });
  if (setting && setting.value === false) {
    throw new AppError("FORBIDDEN", "현재 신규 가입을 받지 않습니다.");
  }

  // users 와 reserved_usernames 를 **모두** 본다 (DEC-021, FR-AUTH-002)
  if (await userRepo.isUsernameTaken(input.username)) {
    throw new AppError("DUPLICATE", "이미 사용 중인 아이디입니다.", {
      username: ["이미 사용 중인 아이디입니다."],
    });
  }

  const user = await userRepo.create({
    username: input.username,
    passwordHash: await hashPassword(input.password),
    name: input.name,
    department: input.department,
    signupReason: input.signupReason,
    // 관리자 승인 전까지 PENDING (DEC-014)
    status: "PENDING",
    role: "MEMBER",
  });

  await audit.logAnonymous({
    action: "USER_SIGNUP",
    attemptedUsername: user.username,
    targetType: "user",
    targetId: user.id,
    summary: `가입 신청 — ${user.username} (${user.name})`,
  });

  return { id: user.id };
}

/**
 * 비밀번호 변경.
 *
 * **성공하면 본인의 다른 세션을 전부 끊습니다.** 비밀번호를 바꾸는 이유 중 하나가
 * 「남이 내 계정을 쓰고 있는 것 같다」이기 때문입니다. 현재 세션은 남깁니다.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  /** 남길 현재 세션. 나머지는 전부 끊는다 */
  currentSessionId: string,
  meta: SignInMeta = {}
): Promise<void> {
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError("NOT_FOUND", "계정을 찾을 수 없습니다.");

  /*
   * 현재 비밀번호 대입도 제한한다. 세션을 탈취한 공격자가 여기서 무제한으로
   * 옛 비밀번호를 찾아낼 수 있으면 `NFR-SEC-002` 의 취지가 무너진다.
   */
  const limit = await consume(`rl:pwchange:${userId}`, 5, 10 * 60);
  if (!limit.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요."
    );
  }

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError(
      "VALIDATION_ERROR",
      "현재 비밀번호가 올바르지 않습니다.",
      {
        currentPassword: ["현재 비밀번호가 올바르지 않습니다."],
      }
    );
  }

  // 직전 3개 재사용 금지 (REQ-02 · 2.6절)
  const history = await db.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  for (const h of history) {
    if (await verifyPassword(h.passwordHash, newPassword)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "최근에 사용한 비밀번호는 다시 쓸 수 없습니다.",
        { newPassword: ["최근에 사용한 비밀번호는 다시 쓸 수 없습니다."] }
      );
    }
  }

  const nextHash = await hashPassword(newPassword);

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        passwordHash: nextHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    }),
    db.passwordHistory.create({
      data: { userId, passwordHash: user.passwordHash },
    }),
  ]);

  // 보관은 최근 3개까지
  const stale = await db.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: 3,
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.passwordHistory.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
  }

  // 본인의 **다른** 세션을 전부 끊는다. 현재 세션은 DB 행만 남고 캐시는 무효화되므로
  // 방금 바꾼 `mustChangePassword: false` 가 다음 요청에 바로 반영된다.
  await revokeAllFor(userId, currentSessionId);

  await audit.log(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      via: "WEB",
      ...meta,
    },
    {
      action: "USER_PASSWORD_CHANGE",
      summary: `비밀번호 변경 — ${user.username}`,
    }
  );
}
