import { z } from "zod";

import { AppError } from "@/lib/errors";
import { requireActor } from "@/server/auth/guards";
import * as ttsService from "@/server/services/tts.service";

/**
 * 디오의 목소리 (`DEC-072`).
 *
 * - `GET`  — 서버 목소리가 있는지, 몇 개인지. 화면이 설정 창을 그릴 때 묻습니다
 * - `POST` — 글을 WAV 로. `{ text, voice }`
 *
 * 로그인은 필수입니다. 합성은 CPU 를 쓰는 일이라, 열어 두면 로그인 안 한
 * 사람이 서버를 바쁘게 만들 수 있습니다.
 */

const bodySchema = z.object({
  text: z.string().trim().min(1).max(ttsService.TEXT_MAX),
  voice: z.number().int().min(0).default(0),
  speed: z.number().min(0.5).max(2).default(1),
});

function fail(e: unknown): Response {
  if (e instanceof AppError) {
    const status =
      e.code === "UNAUTHENTICATED"
        ? 401
        : e.code === "NOT_FOUND"
          ? 404
          : e.code === "VALIDATION_ERROR"
            ? 400
            : e.code === "RATE_LIMITED"
              ? 429
              : 403;
    return Response.json({ message: e.message }, { status });
  }
  return Response.json({ message: "목소리를 만들지 못했습니다." }, { status: 500 });
}

export async function GET(): Promise<Response> {
  try {
    await requireActor();
    const v = await ttsService.info();
    return Response.json(
      v ? { available: true, ...v } : { available: false, voices: 0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await requireActor();
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "읽을 글과 목소리를 확인해 주세요.");
    }
    const { text, voice, speed } = parsed.data;
    const { wav, seconds } = await ttsService.synthesize(text, voice, speed);
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        "Cache-Control": "no-store",
        "X-Audio-Seconds": seconds.toFixed(2),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
