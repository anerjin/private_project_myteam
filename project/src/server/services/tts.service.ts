import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * 디오의 목소리 — **이 PC 에서 도는 Supertonic** (`DEC-072`).
 *
 * ## 왜 서버에서 만드는가
 *
 * 브라우저 내장 목소리(`speechSynthesis`)는 딱딱합니다 — 운영자의 말입니다.
 * 자연스러운 오픈소스 TTS 는 모델 파일이 100~300MB 라, 사람마다 브라우저에
 * 내려받게 하면 20명이 20번 받습니다. 서버에 **한 번** 두고 소리만 보냅니다.
 *
 * ## 왜 Supertonic 인가
 *
 * 한국어가 모국어인 회사(Supertone)의 모델이고, ONNX 라 파이썬 없이 **Node
 * 애드온**(`sherpa-onnx-node`)으로 돕니다. 파이썬 프로세스가 하나 더 생기지
 * 않습니다 — 서버가 하루 세 번 죽는 날에 움직이는 부품을 늘리지 않습니다.
 * 상류 저장소가 아카이브를 예고했지만 sherpa-onnx 가 이어받았고, 우리 손에
 * 남는 것은 ONNX 파일 한 벌입니다(간트를 복사해 넣은 것과 같은 성질).
 *
 * ## 한 번에 하나씩
 *
 * 합성은 CPU 를 다 씁니다. 동시에 여럿 돌리면 전부 느려지고 서버의 다른
 * 일도 밀립니다. **줄을 세웁니다** — 그리고 줄이 길면 기다리게 하지 않고
 * 거절합니다. 그러면 브라우저 목소리로 물러나므로 소리가 «안 나는» 일은
 * 없습니다.
 */

/** 모델 폴더에 있어야 하는 파일 — 하나라도 없으면 «없는 것»으로 칩니다 */
const FILES = {
  durationPredictor: "duration_predictor.int8.onnx",
  textEncoder: "text_encoder.int8.onnx",
  vectorEstimator: "vector_estimator.int8.onnx",
  vocoder: "vocoder.int8.onnx",
  ttsJson: "tts.json",
  unicodeIndexer: "unicode_indexer.bin",
  voiceStyle: "voice.bin",
} as const;

/** 한 번에 읽어 줄 글의 상한. 그 이상은 화면이 잘라서 보냅니다 */
export const TEXT_MAX = 1_500;
const LANG = "ko";
/** 확산 단계 — 예제의 값. 줄이면 빨라지고 거칠어집니다 */
const NUM_STEPS = 8;
const THREADS = 4;
/**
 * 이보다 줄이 길면 거절합니다. 화면이 답 하나를 서너 덩어리로 나눠 **앞당겨**
 * 받으므로 사람 하나가 둘씩 차지합니다 — 네 명이 동시에 말하면 여덟입니다
 */
const MAX_WAITING = 8;

function modelDir(): string | null {
  const dir = env.TTS_MODEL_DIR;
  if (!dir) return null;
  const complete = Object.values(FILES).every((f) =>
    existsSync(path.join(dir, f))
  );
  return complete ? dir : null;
}

/** 모델이 **있는가** — 화면이 이걸로 «서버 목소리»와 «브라우저 목소리»를 가릅니다 */
export function isAvailable(): boolean {
  return modelDir() !== null;
}

type Sherpa = typeof import("sherpa-onnx-node");
type Engine = InstanceType<Sherpa["OfflineTts"]>;

let sherpa: Sherpa | null = null;
let engine: Promise<Engine> | null = null;

/**
 * 모델을 **처음 부를 때** 읽습니다. 기동 때 읽으면 목소리를 안 쓰는 날에도
 * 메모리를 쥐고 있고, 파일이 없으면 서버가 안 뜹니다.
 */
async function load(): Promise<Engine> {
  if (engine) return engine;
  engine = (async () => {
    const dir = modelDir();
    if (!dir) {
      throw new AppError("NOT_FOUND", "서버에 목소리 모델이 없습니다.");
    }
    sherpa = await import("sherpa-onnx-node");
    const at = (f: string) => path.join(dir, f);
    return sherpa.OfflineTts.createAsync({
      model: {
        supertonic: {
          durationPredictor: at(FILES.durationPredictor),
          textEncoder: at(FILES.textEncoder),
          vectorEstimator: at(FILES.vectorEstimator),
          vocoder: at(FILES.vocoder),
          ttsJson: at(FILES.ttsJson),
          unicodeIndexer: at(FILES.unicodeIndexer),
          voiceStyle: at(FILES.voiceStyle),
        },
        debug: false,
        numThreads: THREADS,
        provider: "cpu",
      },
      maxNumSentences: 1,
    });
  })();
  // 실패했으면 다음 호출이 다시 시도하게 — 깨진 약속을 붙들고 있지 않습니다
  engine.catch(() => {
    engine = null;
  });
  return engine;
}

export interface VoiceInfo {
  /** 고를 수 있는 목소리 수. `sid` 는 `0 … voices-1` */
  voices: number;
  sampleRate: number;
}

export async function info(): Promise<VoiceInfo | null> {
  if (!isAvailable()) return null;
  const e = await load();
  return { voices: e.numSpeakers, sampleRate: e.sampleRate };
}

let queue: Promise<unknown> = Promise.resolve();
let waiting = 0;

/**
 * 16-bit PCM WAV — 브라우저의 `<audio>` 가 그대로 읽는 형식.
 *
 * sherpa 가 `writeWave` 를 주지만 그건 **파일에** 씁니다. 디스크를 거칠
 * 이유가 없어 메모리에서 바로 만듭니다.
 */
function toWav(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    data.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * 글을 소리로. **줄을 서서** 하나씩.
 *
 * @returns WAV 바이트와 재생 길이(초)
 */
export async function synthesize(
  text: string,
  sid: number,
  speed = 1.0
): Promise<{ wav: Buffer; seconds: number }> {
  const trimmed = text.trim();
  if (!trimmed) throw new AppError("VALIDATION_ERROR", "읽을 글이 없습니다.");
  if (trimmed.length > TEXT_MAX) {
    throw new AppError("VALIDATION_ERROR", `한 번에 ${TEXT_MAX}자까지 읽습니다.`);
  }
  if (waiting >= MAX_WAITING) {
    throw new AppError("RATE_LIMITED", "지금 목소리를 만드는 줄이 깁니다.");
  }

  waiting += 1;
  const run = queue.then(async () => {
    const e = await load();
    if (!Number.isInteger(sid) || sid < 0 || sid >= e.numSpeakers) {
      throw new AppError("VALIDATION_ERROR", "없는 목소리입니다.");
    }
    const audio = await e.generateAsync({
      text: trimmed,
      enableExternalBuffer: true,
      generationConfig: new sherpa!.GenerationConfig({
        sid,
        speed,
        numSteps: NUM_STEPS,
        extra: { lang: LANG },
      }),
    });
    return {
      wav: toWav(audio.samples, audio.sampleRate),
      seconds: audio.samples.length / audio.sampleRate,
    };
  });
  // 앞사람이 실패해도 줄은 이어집니다
  queue = run.catch(() => undefined).finally(() => {
    waiting -= 1;
  });
  return run;
}
