import { z } from "zod";

/**
 * 인증 입력 검증 (REQ-02 · 2.6절, NFR-SEC-006).
 *
 * **클라이언트와 서버가 같은 파일을 import 합니다** (`DEV-06 · 6.4절`).
 * 규칙이 두 곳에 있으면 반드시 어긋납니다.
 *
 * `server-only` 를 넣지 않은 이유: 폼에서도 써야 합니다.
 * 여기에는 비밀이 없고 규칙만 있습니다.
 */

/** 영문 소문자·숫자·`_`·`.` 4~20자, 첫 글자는 영문 */
const USERNAME_PATTERN = /^[a-z][a-z0-9_.]{3,19}$/;

export const usernameSchema = z
  .string()
  .trim()
  // 대소문자 구분 없이 유일하므로 **검증 전에** 소문자로 접는다.
  // 저장도 이 값으로 한다 — 정규화를 한 곳에서만 한다 (DEV-02 · TBL-users).
  .toLowerCase()
  .regex(
    USERNAME_PATTERN,
    "아이디는 영문 소문자로 시작하고, 영문·숫자·_·. 조합 4~20자여야 합니다."
  );

/**
 * 최소 10자 · 영문·숫자·특수문자 중 2종 이상.
 *
 * 「2종 이상」을 정규식 하나로 쓰면 읽을 수 없어서 세어서 판정합니다.
 * 오류 메시지가 어떤 조건에 걸렸는지 알려줘야 사용자가 고칠 수 있습니다.
 */
/** 비밀번호 규칙 검증 (`FR-AUTH-004`) — 화면과 서버가 이 하나를 함께 본다 */
export const passwordSchema = z
  .string()
  .min(10, "비밀번호는 10자 이상이어야 합니다.")
  .max(200, "비밀번호가 너무 깁니다.")
  .refine(
    (v) => {
      const kinds = [/[A-Za-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
        re.test(v)
      ).length;
      return kinds >= 2;
    },
    { message: "영문·숫자·특수문자 중 2종 이상을 섞어 주세요." }
  );

export const signInSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
  /** 「로그인 상태 유지」 미체크 시 브라우저 세션 쿠키 (REQ-02 · 2.7절) */
  remember: z.boolean().default(false),
});

/**
 * 가입 신청 (`FR-AUTH-001`).
 *
 * ## 필수·선택이 **요구사항과 뒤집혀** 있었습니다
 *
 * `FR-AUTH-001` 은 「필수: 아이디, 비밀번호, **비밀번호 확인**, 이름,
 * **소속(팀)**, 동의 / 선택: **가입 사유**(200자)」입니다. 그런데 이 스키마는
 * 소속을 `optional()`, 가입 사유를 `min(5)` 필수로 두고 있었습니다 —
 * **정확히 반대**였습니다.
 *
 * 그래서 화면 라벨(소속 `*`, 사유 `*` 없음)은 요구사항대로였는데 서버가
 * 다르게 판정했고, 사유를 비운 사람은 **「입력값을 확인해 주세요」만 보고
 * 어디가 문제인지 알 수 없었습니다.** 실제로 그렇게 막혔습니다.
 *
 * `비밀번호 확인` 은 **아예 없었습니다.** 화면에 칸은 있는데 어디에도 실리지
 * 않아, 서로 다른 값을 넣어도 그대로 가입됐습니다 — 사용자는 자기가 무엇을
 * 비밀번호로 정했는지 모른 채 승인을 기다리게 됩니다.
 */
export const signUpSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    passwordConfirm: z.string().min(1, "비밀번호를 한 번 더 입력해 주세요."),
    name: z.string().trim().min(2, "이름을 입력해 주세요.").max(50),
    department: z.string().trim().min(1, "소속 팀을 입력해 주세요.").max(50),
    /** 선택 — 관리자가 승인 여부를 판단하는 데 참고합니다 (`FR-AUTH-001`, 200자) */
    signupReason: z
      .string()
      .trim()
      .max(200, "가입 사유는 200자까지입니다.")
      .optional()
      // 빈 칸은 «안 적은 것»이지 «빈 문자열»이 아닙니다
      .transform((v) => (v ? v : undefined)),
    /** 개인정보 수집·이용 동의 (NFR-PRIV-002) */
    agreed: z.literal(true, {
      message: "개인정보 수집·이용에 동의해야 가입할 수 있습니다.",
    }),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "비밀번호가 서로 다릅니다.",
    path: ["passwordConfirm"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "현재 비밀번호를 입력해 주세요."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "새 비밀번호가 서로 다릅니다.",
    path: ["confirmPassword"],
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "현재 비밀번호와 다른 값을 써 주세요.",
    path: ["newPassword"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
