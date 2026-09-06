"use client";

import {
  Check,
  LoaderCircle,
  Mic,
  Settings2,
  Square,
  Volume2,
} from "lucide-react";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ASSISTANT } from "@/features/chat/assistant";
import { CHARACTERS } from "@/features/chat/characters";
import type { VoicePhase, VoiceState } from "@/features/chat/voice/use-voice";
import { cn } from "@/lib/utils";

/**
 * 음성 모드의 두 조각 — 위의 «무대»와 아래의 «마이크».
 *
 * 둘 사이에 말풍선 목록이 옵니다. 그 목록은 채팅 모드와 **같은 것**이라
 * 패널이 그리고, 여기서는 그 위와 아래만 맡습니다.
 *
 * ## three 는 여기서만 내려받습니다
 *
 * 채팅 모드만 쓰는 사람은 WebGL 코드를 받을 이유가 없습니다. `dynamic` 으로
 * 음성 모드를 «켤 때» 내려받고, 서버 렌더에서는 아예 없습니다(WebGL 이
 * 없는 곳에서 `three` 를 import 하면 그 자리에서 죽습니다).
 */
const DioCharacter = dynamic(
  () =>
    import("@/features/chat/components/dio-character").then(
      (m) => m.DioCharacter
    ),
  {
    ssr: false,
    loading: () => (
      <div className="bg-muted/40 h-full w-full animate-pulse rounded-lg" />
    ),
  }
);

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "기다리는 중",
  listening: "듣는 중",
  thinking: "생각하는 중",
  speaking: "말하는 중",
};

/** 캐릭터가 서 있는 자리. **무슨 상태인지는 글로도** 말합니다 — 캔버스는 읽히지 않습니다 */
export function VoiceStage({ voice }: { voice: VoiceState }) {
  return (
    <div className="shrink-0 border-b px-3 py-2">
      <div
        role="img"
        aria-label={`${ASSISTANT} — ${PHASE_LABEL[voice.phase]}`}
        // 무대는 넉넉하게 — 「더 크게」(운영자). 폭이 좁아도 세로는 그대로입니다
        className="bg-muted/30 relative h-72 overflow-hidden rounded-lg"
      >
        <DioCharacter
          spec={voice.character}
          phase={voice.phase}
          className="h-full w-full"
        />
        <span
          aria-live="polite"
          className="text-muted-foreground absolute right-2 bottom-1 text-xs"
        >
          {PHASE_LABEL[voice.phase]}
        </span>
        {/* 끌 수 있다는 것은 보여 줘야 압니다 — 손잡이가 없는 물건입니다 */}
        <span className="text-muted-foreground/70 pointer-events-none absolute bottom-1 left-2 text-xs">
          끌어서 돌려 보세요
        </span>
      </div>
    </div>
  );
}

const WHERE_TEXT = {
  device: "음성은 이 PC 안에서 글로 바뀝니다. 밖으로 나가지 않습니다.",
  vendor:
    "이 브라우저는 음성을 제조사 서버(Google·Microsoft)로 보내 글로 바꿉니다. 말한 내용이 PC 밖으로 나갑니다.",
  none: "이 브라우저에는 음성 인식이 없습니다. Chrome·Edge 에서 됩니다.",
  insecure:
    "주소가 http 라 브라우저가 마이크를 막습니다. 서버 PC 에서는 http://localhost:3100 으로 여십시오. 다른 PC 에서는 https 주소가 필요합니다.",
} as const;

/** 마이크 단추 · 흘러가는 글 · 설정 */
export function VoiceBar({
  voice,
  disabled,
}: {
  voice: VoiceState;
  /** 디오 자체를 못 쓰는 상태 (CLI 없음) */
  disabled: boolean;
}) {
  /** 브라우저나 주소가 막은 경우 — 그 이유를 단추 옆에 적습니다 */
  const blocked =
    voice.where === "none" || voice.where === "insecure" ? voice.where : null;
  const off = disabled || blocked !== null || voice.where === null;

  const icon =
    voice.phase === "listening" ? (
      <Square className="size-5" />
    ) : voice.phase === "thinking" ? (
      <LoaderCircle className="size-5 animate-spin" />
    ) : voice.phase === "speaking" ? (
      <Volume2 className="size-5" />
    ) : (
      <Mic className="size-5" />
    );

  const label =
    voice.phase === "listening"
      ? "듣기 멈추기"
      : voice.phase === "thinking"
        ? "생각하는 중"
        : voice.phase === "speaking"
          ? "말 멈추기"
          : "말하기";

  const line = voice.error
    ? voice.error
    : voice.phase === "listening"
      ? voice.interim || "말씀하세요…"
      : voice.note
        ? voice.note
        : voice.phase === "thinking"
          ? "생각 중… (자료를 찾으면 10초쯤 걸립니다)"
          : voice.phase === "speaking"
            ? "누르면 조용해집니다"
            : blocked
              ? WHERE_TEXT[blocked]
              : "단추를 누르고 말씀하세요";

  return (
    <div className="shrink-0 border-t p-3">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          className={cn(
            "size-12 shrink-0 rounded-full",
            voice.phase === "listening" &&
              "ring-primary/40 animate-pulse ring-4"
          )}
          aria-label={label}
          aria-pressed={voice.phase === "listening"}
          disabled={off || voice.phase === "thinking"}
          onClick={voice.press}
        >
          {icon}
        </Button>

        <p
          className={cn(
            "min-w-0 flex-1 text-sm",
            voice.error ? "text-destructive" : "text-muted-foreground",
            voice.phase === "listening" && voice.interim && "text-foreground"
          )}
          aria-live="polite"
        >
          {line}
        </p>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="음성 설정">
              <Settings2 className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <PopoverHeader>
              <PopoverTitle>캐릭터</PopoverTitle>
              <PopoverDescription>
                {ASSISTANT}가 어떤 모습으로 서 있을지
              </PopoverDescription>
            </PopoverHeader>
            <ul className="space-y-1">
              {CHARACTERS.map((c) => {
                const on = c.id === voice.character.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => voice.setCharacter(c.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left",
                        on ? "border-foreground/30 bg-muted" : "hover:bg-muted/60"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 rounded-full"
                        style={{ backgroundColor: c.fur }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{c.name}</span>
                        <span className="text-muted-foreground block text-xs">
                          {c.description}
                        </span>
                      </span>
                      {on && <Check className="mt-0.5 size-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t pt-2.5">
              <Label htmlFor="qb-voice-tts" className="text-sm">
                대답을 소리로 읽어 주기
              </Label>
              <Switch
                id="qb-voice-tts"
                checked={voice.tts}
                disabled={!voice.ttsAvailable}
                onCheckedChange={voice.setTts}
              />
            </div>

            {/*
              **목소리.** 서버에 Supertonic 이 있으면 열 가지 중에 고르고 들어
              봅니다. 없으면 브라우저 목소리이고 — 그 사실과 갈 길을 적습니다.
              이름표가 없어 번호로 부릅니다(모델이 이름을 주지 않습니다).
            */}
            {voice.server ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="qb-voice-sid" className="shrink-0 text-sm">
                  목소리
                </Label>
                <select
                  id="qb-voice-sid"
                  className="border-input bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
                  value={Math.min(voice.voiceId, voice.server.voices - 1)}
                  disabled={!voice.tts}
                  onChange={(e) => voice.setVoiceId(Number(e.target.value))}
                >
                  {Array.from({ length: voice.server.voices }, (_, i) => (
                    <option key={i} value={i}>
                      목소리 {i + 1}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!voice.tts || voice.phase !== "idle"}
                  onClick={voice.preview}
                >
                  <Volume2 className="size-4" />
                  들어 보기
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs leading-relaxed">
                서버에 목소리 모델이 없어 브라우저 내장 목소리로 읽습니다.
                자연스러운 목소리는 <code>npm run tts:model</code> 로 넣습니다
                (운영 안내 10장).
              </p>
            )}

            {/*
              **소리가 어디로 가는지 적습니다.** 브라우저마다 다르고, 사용자는
              그것을 알 길이 없습니다. 조용히 보내지 않습니다.
            */}
            <p className="text-muted-foreground border-t pt-2.5 text-xs leading-relaxed">
              {voice.where ? WHERE_TEXT[voice.where] : "지원 여부를 확인하는 중…"}
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
