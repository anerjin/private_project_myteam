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

export const signUpSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  name: z.string().trim().min(2, "이름을 입력해 주세요.").max(50),
  department: z.string().trim().max(50).optional(),
  signupReason: z
    .string()
    .trim()
    .min(5, "가입 사유를 한 줄 이상 적어 주세요.")
    .max(500),
  /** 개인정보 수집·이용 동의 (NFR-PRIV-002) */
  agreed: z.literal(true, {
    message: "개인정보 수집·이용에 동의해야 가입할 수 있습니다.",
  }),
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
