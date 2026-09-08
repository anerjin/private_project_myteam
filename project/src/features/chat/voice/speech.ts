/**
 * 브라우저의 음성 인식·합성을 **얇게** 감쌉니다.
 *
 * ## 왜 브라우저 내장인가
 *
 * 이 앱은 모델 키를 갖지 않습니다(`[037]`) — 그래서 바깥 음성 API 도 부를 수
 * 없습니다. 로컬 Whisper 는 모델이 수백 MB 에 한국어 품질이 낮아 «실험»에
 * 맞지 않습니다. 남는 것은 브라우저가 이미 갖고 있는 `SpeechRecognition` 과
 * `speechSynthesis` 입니다 — 의존 0, 키 0.
 *
 * ## 소리가 어디로 가는지 «말합니다»
 *
 * Chrome·Edge 의 음성 인식은 기본으로 **제조사 서버**에서 돕니다. 기기 안
 * 처리를 지원하는 브라우저면(`available({ processLocally })`) 그쪽을 먼저
 * 쓰고, 어느 쪽인지 화면이 적습니다(`recognitionSupport`). 조용히 보내지
 * 않습니다.
 *
 * ## 타입은 여기서 직접 적습니다
 *
 * `lib.dom` 에 `SpeechRecognition` 이 없습니다(표준이 아니고 `webkit` 접두어가
 * 남아 있습니다). 쓰는 만큼만 적고, 없는 브라우저에서는 `null` 을 돌려줍니다 —
 * 그러면 화면이 «안 되는 이유»를 말합니다.
 */

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}

interface RecognitionResultEvent extends Event {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface RecognitionErrorEvent extends Event {
  error: string;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  /** 기기 안에서 처리 — 지원하는 브라우저에서만 뜻이 있습니다 */
  processLocally?: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface RecognitionCtor {
  new (): Recognition;
  /** 언어·처리 위치별 가용성 — 새 브라우저에만 있습니다 */
  available?: (o: {
    langs: string[];
    processLocally?: boolean;
  }) => Promise<string>;
}

const LANG = "ko-KR";

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * 음성 인식이 **어디서** 되는가 — 화면이 이 값을 그대로 적습니다.
 *
 * `insecure` 는 브라우저가 아니라 **주소**의 문제입니다. 마이크는 `https` 와
 * `localhost` 에서만 열립니다 — `http://100.x.x.x:3100` 으로 열면 권한 창조차
 * 안 뜨고 `not-allowed` 만 옵니다. 그걸 「마이크를 허용하세요」로 보여 주면
 * 사람이 설정을 뒤지게 됩니다. 실제로 그랬습니다.
 */
export type RecognitionWhere = "device" | "vendor" | "none" | "insecure";

export async function recognitionSupport(): Promise<RecognitionWhere> {
  const C = ctor();
  if (!C) return "none";
  if (!window.isSecureContext) return "insecure";
  if (typeof C.available !== "function") return "vendor";
  try {
    const r = await C.available({ langs: [LANG], processLocally: true });
    return r === "available" ? "device" : "vendor";
  } catch {
    return "vendor";
  }
}

/** 브라우저가 주는 오류 코드를 **사람 말**로 */
export function describeRecognitionError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "마이크 사용을 허용해야 합니다. 주소창 왼쪽의 자물쇠에서 바꿀 수 있습니다.";
    case "no-speech":
      return "아무 말도 들리지 않았습니다.";
    case "audio-capture":
      return "마이크를 찾지 못했습니다.";
    case "network":
      return "음성 인식 서버에 닿지 못했습니다. 이 브라우저는 인식을 바깥 서버에서 합니다.";
    case "aborted":
      return "";
    default:
      return `음성 인식이 멈췄습니다 (${code}).`;
  }
}

export interface ListenHandle {
  /** 듣기를 그만둡니다. 지금까지 들은 것이 있으면 `onFinal` 이 옵니다 */
  stop(): void;
  /** 들은 것을 버리고 끝냅니다 */
  abort(): void;
}

/**
 * 말이 «끝났다»고 보는 침묵의 길이.
 *
 * 브라우저의 기본(`continuous: false`)은 **숨 한 번 쉬면 끝**입니다 — 운영자가
 * 「말이 다 끝나기 전에 듣기가 종료된다」고 했습니다. 한국어 지시는 「그
 * 자료… 음… 찾아 줘」처럼 중간에 쉽니다. 1.8초는 생각하는 사이는 넘기고
 * 진짜 끝은 놓치지 않는 길이로 잡았습니다 — 길면 답이 늦고 짧으면 끊깁니다.
 */
const SILENCE_MS = 1_800;
/** 말이 «시작되지» 않은 채 이만큼 지나면 그만둡니다 */
const NO_SPEECH_MS = 8_000;
/** 마이크를 늘 켜 두지 않습니다 — 아무리 길어도 여기서 끊습니다 */
const MAX_LISTEN_MS = 60_000;

/**
 * 한 마디를 듣습니다.
 *
 * `continuous: true` 로 **계속 듣되, 끝은 우리가 정합니다** — 마지막 말 뒤
 * `SILENCE_MS` 동안 아무것도 안 들리면 끝. 호출어(「네오야」)는 없습니다:
 * 누르고 → 말하고 → (쉬면) 끝. 단추를 다시 누르면 그 자리에서 끝냅니다.
 *
 * Chrome 은 계속 듣기에서도 스스로 멈출 때가 있습니다(네트워크·자체 한도).
 * 그때 이미 들은 것이 있으면 그것으로 답하고, 없으면 «못 들었다»고 말합니다.
 */
export function listen(h: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
  where: RecognitionWhere;
}): ListenHandle | null {
  const C = ctor();
  if (!C) return null;

  const r = new C();
  r.lang = LANG;
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 1;
  if (h.where === "device") r.processLocally = true;

  let final = "";
  let aborted = false;
  let silence: ReturnType<typeof setTimeout> | null = null;
  const started = Date.now();

  const armSilence = (ms: number) => {
    if (silence) clearTimeout(silence);
    silence = setTimeout(() => r.stop(), ms);
  };

  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const res = e.results[i]!;
      const text = res[0].transcript;
      if (res.isFinal) final += text;
      else interim += text;
    }
    // 확정된 것 + 흘러가는 것 — 사람이 «지금까지 뭐라고 들었는지» 봅니다
    h.onInterim((final + interim).trim());
    // 말이 들릴 때마다 침묵 시계를 되감습니다
    armSilence(Date.now() - started > MAX_LISTEN_MS ? 0 : SILENCE_MS);
  };
  r.onerror = (e) => {
    // 계속 듣기에서 `no-speech` 는 «아직» 이지 실패가 아닙니다 — onend 가 판단합니다
    if (e.error === "no-speech") return;
    const msg = describeRecognitionError(e.error);
    if (msg) h.onError(msg);
  };
  r.onend = () => {
    if (silence) clearTimeout(silence);
    const text = final.trim();
    if (!aborted) {
      if (text) h.onFinal(text);
      else h.onError("아무 말도 들리지 않았습니다.");
    }
    h.onEnd();
  };

  try {
    r.start();
  } catch {
    h.onError("음성 인식을 시작하지 못했습니다.");
    return null;
  }
  // 아무 말도 안 하면 여기서 끝납니다
  armSilence(NO_SPEECH_MS);

  return {
    stop: () => r.stop(),
    abort: () => {
      aborted = true;
      final = "";
      if (silence) clearTimeout(silence);
      r.abort();
    },
  };
}

/* ────────────────────────── 합성 (읽어 주기) ────────────────────────── */

export function synthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * 마크다운을 **소리로 낼 글**로 바꿉니다.
 *
 * 답은 마크다운입니다(`chat-panel` 의 뷰어 주석). 그대로 읽히면 「별표 별표
 * 굵게 별표 별표」가 됩니다.
 */
export function speakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " 코드 생략 ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    // 표의 구분줄 `| --- | --- |` — 읽으면 「대시 대시 대시」입니다
    .replace(/^\s*\|?[\s|:-]*-{2,}[\s|:-]*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 한 덩어리의 길이. Chrome 은 긴 발화를 **말없이 끊는** 버그가 오래됐습니다 —
 * 문장 단위로 잘라 줄을 세웁니다. `speechSynthesis` 는 큐라 순서대로 나옵니다.
 */
const CHUNK = 180;

function chunks(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const s of text.split(/(?<=[.!?。])\s+/)) {
    if ((buf + " " + s).length > CHUNK && buf) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function koreanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("ko") && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("ko")) ??
    null
  );
}

export interface SpeakHandle {
  cancel(): void;
}

/** 브라우저 내장 목소리 — 서버 목소리가 없거나 실패했을 때의 뒷길 */
function speakViaBrowser(parts: string[], onEnd: () => void): SpeakHandle | null {
  if (!synthesisSupported()) return null;
  const synth = window.speechSynthesis;
  // 앞의 말이 남아 있으면 겹칩니다
  synth.cancel();

  const voice = koreanVoice();
  let done = 0;
  let cancelled = false;
  const finish = () => {
    done += 1;
    if (!cancelled && done === parts.length) onEnd();
  };

  for (const p of parts) {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = LANG;
    if (voice) u.voice = voice;
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
  }

  return {
    cancel: () => {
      cancelled = true;
      synth.cancel();
    },
  };
}

/* ──────────────────────── 서버 목소리 (Supertonic) ──────────────────────── */

export interface ServerVoices {
  /** 고를 수 있는 목소리 수 — `sid` 는 `0 … voices-1` */
  voices: number;
  sampleRate: number;
}

/** 서버에 목소리가 있는가. 없으면 `null` — 그러면 브라우저 목소리를 씁니다 */
export async function serverVoices(): Promise<ServerVoices | null> {
  try {
    const r = await fetch("/api/tts", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      available: boolean;
      voices: number;
      sampleRate?: number;
    };
    return j.available && j.voices > 0
      ? { voices: j.voices, sampleRate: j.sampleRate ?? 44100 }
      : null;
  } catch {
    return null;
  }
}

/**
 * 서버에서 만든 소리를 **덩어리째 이어서** 틉니다.
 *
 * 답 전체를 한 번에 만들면 첫 소리까지 몇 초를 기다립니다(12초 분량에
 * 2.8초 — 실측). 문장 덩어리로 나눠 **첫 덩어리를 틀면서 다음 것을 미리
 * 받습니다.** 만드는 속도(RTF 0.23)가 말하는 속도보다 빨라 끊기지 않습니다.
 *
 * 첫 덩어리부터 못 받으면 `onFail` — 호출한 쪽이 브라우저 목소리로 물러납니다.
 * 중간에 끊기면 그냥 끝냅니다(반은 이 목소리, 반은 저 목소리가 더 이상합니다).
 */
/**
 * 재생 중인 `<audio>` 를 붙들어 둡니다. DOM 에 없는 요소는 지역 변수만 쥐고
 * 있으면 수거 대상이 될 수 있습니다 — 그러면 소리가 **중간에 조용히 끊깁니다.**
 */
const playing = new Set<HTMLAudioElement>();

function speakViaServer(
  parts: string[],
  sid: number,
  onEnd: () => void,
  /** 첫 덩어리부터 안 됐다 — 통째로 브라우저 목소리로 */
  onFail: () => void,
  /** 중간에 서버가 끊겼다 — **남은 것**을 브라우저 목소리로 */
  onRest: (rest: string[]) => void
): SpeakHandle {
  const ctl = new AbortController();
  let cancelled = false;
  let audio: HTMLAudioElement | null = null;
  let url: string | null = null;

  const fetchOnce = async (text: string): Promise<Blob> => {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: sid }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`tts ${r.status}`);
    return r.blob();
  };

  /** 한 번 실패는 «바쁨»일 수 있습니다(줄이 길면 429) — 잠깐 뒤 한 번 더 */
  const fetchPart = async (text: string): Promise<Blob> => {
    try {
      return await fetchOnce(text);
    } catch (e) {
      if (cancelled) throw e;
      await new Promise((res) => setTimeout(res, 700));
      return fetchOnce(text);
    }
  };

  const play = (blob: Blob) =>
    new Promise<void>((resolve, reject) => {
      url = URL.createObjectURL(blob);
      const el = new Audio(url);
      audio = el;
      playing.add(el);
      const done = () => {
        playing.delete(el);
        if (url) URL.revokeObjectURL(url);
        url = null;
      };
      el.onended = () => {
        done();
        resolve();
      };
      el.onerror = () => {
        done();
        reject(new Error("play"));
      };
      el.play().catch((e) => {
        done();
        reject(e);
      });
    });

  void (async () => {
    let next = fetchPart(parts[0]!);
    for (let i = 0; i < parts.length; i += 1) {
      let blob: Blob;
      try {
        blob = await next;
      } catch {
        if (cancelled) return;
        // 첫 덩어리면 통째로, 중간이면 **남은 것만** 브라우저 목소리로 — 끝내지 않습니다
        if (i === 0) onFail();
        else onRest(parts.slice(i));
        return;
      }
      if (cancelled) return;
      if (i + 1 < parts.length) {
        next = fetchPart(parts[i + 1]!);
        // 재생 중에 미리 받다가 실패해도 «처리되지 않은 거부»가 되지 않게
        next.catch(() => undefined);
      }
      try {
        await play(blob);
      } catch {
        if (cancelled) return;
        // 첫 덩어리부터 «틀지» 못한 것도 실패입니다 — 받았다고 들린 것은 아닙니다
        if (i === 0) onFail();
        else onRest(parts.slice(i + 1));
        return;
      }
      if (cancelled) return;
    }
    onEnd();
  })();

  return {
    cancel: () => {
      cancelled = true;
      ctl.abort();
      if (audio) {
        audio.pause();
        playing.delete(audio);
      }
      if (url) URL.revokeObjectURL(url);
      url = null;
    },
  };
}

/**
 * 글을 읽어 줍니다. `onEnd` 는 **마지막 덩어리가 끝났을 때** 한 번 옵니다.
 *
 * `server` 가 있으면 서버 목소리(`/api/tts`)를, 없거나 첫 덩어리부터 실패하면
 * 브라우저 목소리를 씁니다 — 물러날 때 `onFallback` 이 한 번 옵니다.
 */
export function speak(
  markdown: string,
  h: {
    server: { sid: number } | null;
    onEnd: () => void;
    onFallback?: () => void;
  }
): SpeakHandle | null {
  const text = speakable(markdown);
  if (!text) return null;
  const parts = chunks(text);

  if (!h.server) return speakViaBrowser(parts, h.onEnd);

  // 서버가 실패하면 손잡이 «안»을 바꿔 끼웁니다 — 바깥의 cancel 은 그대로 듣습니다
  let inner: SpeakHandle | null = null;
  const viaBrowser = (rest: string[]) => {
    h.onFallback?.();
    inner = rest.length ? speakViaBrowser(rest, h.onEnd) : null;
    if (!inner) h.onEnd();
  };
  inner = speakViaServer(
    parts,
    h.server.sid,
    h.onEnd,
    () => viaBrowser(parts),
    viaBrowser
  );
  return { cancel: () => inner?.cancel() };
}
