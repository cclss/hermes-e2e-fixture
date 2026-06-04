// ============================================================================
// audio/index.js — 오디오 레이어 공개 API (배럴)
//
// main.js는 AudioDirector만 알면 된다. 합성/레시피/BGM는 내부 구현.
// 오디오는 게임 규칙과 분리된 "이벤트 구독 출력" 레이어다(g9).
// ============================================================================

export { AudioDirector } from './audio-director.js';
export { SynthEngine } from './synth.js';
export { Bgm } from './bgm.js';
export { SFX } from './sfx.js';
