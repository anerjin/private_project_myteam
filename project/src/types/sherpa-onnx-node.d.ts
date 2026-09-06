/**
 * `sherpa-onnx-node` 의 타입 — **쓰는 만큼만** 적었습니다.
 *
 * 패키지가 타입을 주지 않습니다. 전체를 옮겨 적으면 판올림마다 어긋나고,
 * 우리가 부르는 것은 `OfflineTts` 하나와 `GenerationConfig` 뿐입니다.
 * 형태는 저장소의 `nodejs-addon-examples/test_tts_non_streaming_supertonic_en_async.js`
 * 를 따랐습니다.
 */
declare module "sherpa-onnx-node" {
  export interface GeneratedAudio {
    samples: Float32Array;
    sampleRate: number;
  }

  export interface SupertonicModelConfig {
    durationPredictor: string;
    textEncoder: string;
    vectorEstimator: string;
    vocoder: string;
    ttsJson: string;
    unicodeIndexer: string;
    voiceStyle: string;
  }

  export interface OfflineTtsConfig {
    model: {
      supertonic: SupertonicModelConfig;
      debug?: boolean;
      numThreads?: number;
      provider?: "cpu";
    };
    maxNumSentences?: number;
  }

  export class GenerationConfig {
    constructor(o: {
      sid?: number;
      speed?: number;
      numSteps?: number;
      extra?: Record<string, string>;
    });
  }

  export class OfflineTts {
    static createAsync(config: OfflineTtsConfig): Promise<OfflineTts>;
    readonly numSpeakers: number;
    readonly sampleRate: number;
    generateAsync(o: {
      text: string;
      generationConfig: GenerationConfig;
      enableExternalBuffer?: boolean;
    }): Promise<GeneratedAudio>;
  }
}
