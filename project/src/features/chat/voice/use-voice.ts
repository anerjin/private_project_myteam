"use client";

import { useEffect, useRef, useState } from "react";

import { findCharacter, type NeoCharacter } from "@/features/chat/characters";
import {
  listen,
  type ListenHandle,
  recognitionSupport,
  type RecognitionWhere,
  serverVoices,
  type ServerVoices,
  speak,
  type SpeakHandle,
  synthesisSupported,
} from "@/features/chat/voice/speech";

/**
 * 음성 모드의 상태 기계.
 *
 * ## 머리는 그대로입니다
 *
 * 이 훅은 **말을 글로 바꾸고, 글을 소리로 바꾸는 것**만 합니다. 바뀐 글은
 * `onSend` 로 나가는데 그것이 채팅 모드의 `send` 와 **같은 함수**입니다 —
 * 네오가 할 수 있는 일도, 대화 기록도, 채팅과 하나입니다. 음성 모드에
 * 「두 번째 네오」를 두면 어느 쪽이 무엇을 기억하는지 아무도 모르게 됩니다.
 *
 * ## 네 상태
 *
 * `idle` → (누름) → `listening` → (말 끝) → `thinking` → (답) → `speaking` → `idle`.
 * 캐릭터가 이 값을 보고 자세를 바꿉니다. `speaking` 은 읽어 주기를 켰을 때만
 * 지나갑니다.
 *
 * ## 설정은 브라우저에
 *
 * 캐릭터와 「읽어 주기」는 패널 밝기(`qb.chat.theme`)와 같은 성질입니다 —
 * 사람마다 나눌 것이 아니라 «이 자리가 어떻게 보이는가»라 `localStorage` 에
 * 그대로 둡니다.
 */

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

const TTS_KEY = "qb.chat.voice.tts";
const CHARACTER_KEY = "qb.chat.voice.character";
const SID_KEY = "qb.chat.voice.sid";

/** 「들어 보기」가 읽는 문장 */
const SAMPLE = "안녕하세요, 저는 네오입니다. 사내에 등록된 자료를 찾아 드립니다.";

export interface VoiceState {
  phase: VoicePhase;
  /** 듣는 동안 흘러가는 글 — 아직 확정되지 않았습니다 */
  interim: string;
  /** 인식이 «어디서» 되는가. `null` 이면 아직 묻는 중 */
  where: RecognitionWhere | null;
  /** 마지막 오류 — 다음 시도에서 지워집니다 */
  error: string | null;
  /** 오류는 아니지만 알아야 할 것 — 「서버 목소리를 못 받아 브라우저 목소리로」 */
  note: string | null;
  tts: boolean;
  ttsAvailable: boolean;
  /** 서버 목소리(Supertonic). `null` 이면 브라우저 내장 목소리 */
  server: ServerVoices | null;
  /** 고른 서버 목소리 — `0 … voices-1` */
  voiceId: number;
  character: NeoCharacter;
  /** 마이크 단추 — 상태에 따라 «시작·멈춤·조용히»가 됩니다 */
  press: () => void;
  /** 고른 목소리로 한 문장 — 설정 창의 「들어 보기」 */
  preview: () => void;
  setTts: (on: boolean) => void;
  setVoiceId: (sid: number) => void;
  setCharacter: (id: string) => void;
}

export function useVoice({
  enabled,
  onSend,
}: {
  /** 음성 모드가 켜져 있고 패널이 열려 있는가. 꺼지면 듣기·말하기를 멈춥니다 */
  enabled: boolean;
  /** 확정된 말을 보내고 **답 글**을 돌려줍니다. 못 받으면 `null` */
  onSend: (text: string) => Promise<string | null>;
}): VoiceState {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [interim, setInterim] = useState("");
  const [where, setWhere] = useState<RecognitionWhere | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tts, setTtsState] = useState(true);
  const [server, setServer] = useState<ServerVoices | null>(null);
  const [voiceId, setVoiceIdState] = useState(0);
  const [characterId, setCharacterId] = useState<string | null>(null);

  const listening = useRef<ListenHandle | null>(null);
  const speaking = useRef<SpeakHandle | null>(null);
  /** 훅이 내려간 뒤에 오는 콜백이 상태를 만지지 않게 */
  const alive = useRef(true);

  /*
   * 지원 여부는 **묻는 데 시간이 걸립니다**(`available()` 이 Promise). 비동기로
   * 받아 넣으므로 `set-state-in-effect` 에 걸리지 않습니다. 저장된 설정은
   * 패널의 다른 설정과 같은 타이밍(하이드레이션 뒤)에 되살립니다.
   */
  useEffect(() => {
    alive.current = true;
    void recognitionSupport().then((w) => {
      if (alive.current) setWhere(w);
    });
    // 서버에 목소리가 있는지 — 없으면 `null` 이고 브라우저 목소리로 갑니다
    void serverVoices().then((s) => {
      if (alive.current) setServer(s);
    });
    const timer = setTimeout(() => {
      try {
        if (window.localStorage.getItem(TTS_KEY) === "0") setTtsState(false);
        setCharacterId(window.localStorage.getItem(CHARACTER_KEY));
        const sid = Number(window.localStorage.getItem(SID_KEY));
        if (Number.isInteger(sid) && sid >= 0) setVoiceIdState(sid);
      } catch {
        /* 저장소를 막아 둔 브라우저 — 기본값으로 갑니다 */
      }
    }, 0);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      listening.current?.abort();
      speaking.current?.cancel();
    };
  }, []);

  /** 음성 모드를 끄거나 패널을 닫으면 **그 자리에서** 조용해집니다 */
  useEffect(() => {
    if (enabled) return;
    listening.current?.abort();
    listening.current = null;
    speaking.current?.cancel();
    speaking.current = null;
    const timer = setTimeout(() => {
      if (alive.current) {
        setPhase("idle");
        setInterim("");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [enabled]);

  /**
   * 읽어 줍니다 — 서버 목소리가 있으면 그것으로, 없으면 브라우저 목소리로.
   * 서버가 첫 덩어리부터 실패하면 `speak` 가 스스로 물러나고 `note` 에 남깁니다.
   */
  function say(text: string) {
    setPhase("speaking");
    speaking.current = speak(text, {
      server: server ? { sid: Math.min(voiceId, server.voices - 1) } : null,
      onFallback: () => {
        if (alive.current) {
          setNote("서버 목소리가 끊겨 나머지는 브라우저 목소리로 읽습니다.");
        }
      },
      onEnd: () => {
        speaking.current = null;
        if (alive.current) setPhase("idle");
      },
    });
    // 읽을 것이 없었으면(빈 답) 바로 돌아옵니다
    if (!speaking.current) setPhase("idle");
  }

  const canSpeak = server !== null || synthesisSupported();

  function start() {
    if (!where || where === "none" || where === "insecure") return;
    setError(null);
    setNote(null);
    setInterim("");

    const handle = listen({
      where,
      onInterim: (t) => {
        if (alive.current) setInterim(t);
      },
      onFinal: (text) => {
        listening.current = null;
        if (!alive.current) return;
        setInterim("");
        setPhase("thinking");
        void onSend(text).then((reply) => {
          if (!alive.current) return;
          if (reply && tts && canSpeak) say(reply);
          else setPhase("idle");
        });
      },
      onError: (message) => {
        if (alive.current) setError(message);
      },
      onEnd: () => {
        // 확정된 말이 없이 끝났으면(침묵·오류) 제자리로
        if (alive.current) {
          setInterim("");
          setPhase((p) => (p === "listening" ? "idle" : p));
        }
      },
    });

    if (!handle) return;
    listening.current = handle;
    setPhase("listening");
  }

  /**
   * 단추 하나가 상태마다 다른 일을 합니다 — 들을 때는 멈추고, 말할 때는
   * 조용히 시키고, 쉴 때는 듣기 시작합니다. 생각 중에는 아무 일도 없습니다.
   */
  function press() {
    if (phase === "listening") {
      listening.current?.stop();
      return;
    }
    if (phase === "speaking") {
      speaking.current?.cancel();
      speaking.current = null;
      setPhase("idle");
      return;
    }
    if (phase === "thinking") return;
    start();
  }

  function setTts(on: boolean) {
    setTtsState(on);
    if (!on && phase === "speaking") {
      speaking.current?.cancel();
      speaking.current = null;
      setPhase("idle");
    }
    try {
      window.localStorage.setItem(TTS_KEY, on ? "1" : "0");
    } catch {
      /* 못 저장해도 이번 세션에서는 그대로입니다 */
    }
  }

  function setCharacter(id: string) {
    setCharacterId(id);
    try {
      window.localStorage.setItem(CHARACTER_KEY, id);
    } catch {
      /* 위와 같음 */
    }
  }

  function setVoiceId(sid: number) {
    setVoiceIdState(sid);
    try {
      window.localStorage.setItem(SID_KEY, String(sid));
    } catch {
      /* 위와 같음 */
    }
  }

  /** 고른 목소리로 한 문장. 쉬고 있을 때만 — 답을 읽는 중에 끼어들지 않습니다 */
  function preview() {
    if (phase !== "idle" || !canSpeak) return;
    setError(null);
    setNote(null);
    say(SAMPLE);
  }

  return {
    phase,
    interim,
    where,
    error,
    note,
    tts,
    ttsAvailable: canSpeak,
    server,
    voiceId,
    character: findCharacter(characterId),
    press,
    preview,
    setTts,
    setVoiceId,
    setCharacter,
  };
}
