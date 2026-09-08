#!/usr/bin/env node
/**
 * 네오의 목소리 모델을 내려받습니다 (`DEC-072`).
 *
 *   npm run tts:model            → <STORAGE_ROOT 의 옆>/models/ 에 풀어 둡니다
 *   npm run tts:model -- D:\somewhere
 *
 * 끝나면 `.env` 에 적을 `TTS_MODEL_DIR=` 한 줄을 찍어 줍니다. 모델은 sherpa-onnx
 * 가 배포하는 Supertonic 3 (int8) 입니다 — 31개 언어, 한국어 포함.
 *
 * 왜 스크립트인가: 새 서버 PC 에서 「어디서 받아 어디에 두는지」를 사람이
 * 기억하게 두면 반드시 다른 자리에 둡니다. 여기 한 곳이 정본입니다.
 */

import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const NAME = "sherpa-onnx-supertonic-3-tts-int8-2026-05-11";
const URL_ = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${NAME}.tar.bz2`;

const root =
  process.argv[2] ??
  (process.env.STORAGE_ROOT
    ? path.join(path.dirname(process.env.STORAGE_ROOT), "models")
    : null);

if (!root) {
  console.error("어디에 둘지 모릅니다 — 인자로 폴더를 주거나 .env 의 STORAGE_ROOT 가 있어야 합니다.");
  process.exit(1);
}

const dir = path.join(root, NAME);
if (existsSync(path.join(dir, "voice.bin"))) {
  console.log(`이미 있습니다: ${dir}`);
  console.log(`\n.env 에:\nTTS_MODEL_DIR=${dir}`);
  process.exit(0);
}

mkdirSync(root, { recursive: true });
const archive = path.join(root, `${NAME}.tar.bz2`);

console.log(`내려받습니다 → ${archive}`);
const res = await fetch(URL_);
if (!res.ok || !res.body) {
  console.error(`받지 못했습니다: HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));
console.log(`받음: ${Math.round(statSync(archive).size / 1024 / 1024)}MB`);

// Windows 10+ 의 tar 도 bzip2 를 풉니다
execFileSync("tar", ["-xjf", archive, "-C", root], { stdio: "inherit" });

if (!existsSync(path.join(dir, "voice.bin"))) {
  console.error("풀었는데 voice.bin 이 없습니다 — 압축 파일 구조가 바뀌었을 수 있습니다.");
  process.exit(1);
}
console.log(`\n준비됐습니다: ${dir}\n\n.env 에:\nTTS_MODEL_DIR=${dir}\n그리고 npm run serve:restart`);
