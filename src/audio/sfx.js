// ============================================================================
// audio/sfx.js — 효과음 레시피 (합성 프리미티브의 조합)
//
// 각 함수는 SynthEngine을 받아 한 번의 피드백을 울린다. "언제" 울릴지는 모르며
// (그건 audio-director의 이벤트 구독 책임), 오직 "어떤 소리인가"만 정의한다.
//
// 톤 디자인 — 네온 아케이드(미감 Spec과 일관):
//  · 손맛 SFX(이동/회전/락)는 짧고 건조한 클릭. 플레이를 방해하지 않게 작게.
//  · 임팩트(하드드롭/가비지/KO)는 저역 thud + 노이즈로 타격감.
//  · 라인클리어/콤보는 밝은 상행 — 콤보는 단계가 오를수록 음정이 또렷이 상승해
//    긴장을 쌓는다(박진감의 핵심).
// 모든 음정은 A=440 기준 평균율 반음 비율로 계산(헬퍼 semis()).
// ============================================================================

// 반음(semitone) → 주파수 배율. base * 2^(n/12).
function semis(base, n) {
  return base * Math.pow(2, n / 12);
}

// 펜타토닉(밝고 안 부딪힘) 상행 음도 — 라인클리어/레벨업 아르페지오용.
const PENTA = [0, 3, 5, 7, 10, 12, 15];

export const SFX = {
  /** 가로 이동: 아주 짧은 건조한 틱. */
  move(s) {
    s.tone({ type: 'square', freq: 220, dur: 0.018, gain: 0.05, attack: 0.001, release: 0.02 });
  },

  /** 소프트드롭 스텝: 이동보다 낮고 더 작게(연타되므로 절제). */
  soft(s) {
    s.tone({ type: 'square', freq: 150, dur: 0.015, gain: 0.035, attack: 0.001, release: 0.015 });
  },

  /** 회전: 위로 살짝 휘는 짧은 블립. */
  rotate(s) {
    s.tone({
      type: 'triangle',
      freq: 330,
      freqEnd: 460,
      dur: 0.05,
      gain: 0.12,
      attack: 0.002,
      release: 0.04,
    });
  },

  /** 홀드: 부드러운 스왑 느낌의 2음 점프. */
  hold(s) {
    s.tone({ type: 'sine', freq: 392, dur: 0.05, gain: 0.1, release: 0.03 });
    s.tone({ type: 'sine', freq: 587, dur: 0.06, gain: 0.09, when: 0.045, release: 0.04 });
  },

  /** 자연 락(소프트 안착): 짧고 낮은 클릭 + 미세 노이즈 틱. */
  lock(s) {
    s.tone({ type: 'triangle', freq: 180, freqEnd: 130, dur: 0.04, gain: 0.16, release: 0.04 });
    s.noise({ type: 'bandpass', freq: 2600, q: 0.7, dur: 0.02, gain: 0.05, release: 0.02 });
  },

  /** 하드드롭: 휙 떨어지는 노이즈 스윕 + 저역 thud(타격감). */
  hardDrop(s) {
    s.noise({ type: 'lowpass', freq: 3200, freqEnd: 320, q: 0.8, dur: 0.09, gain: 0.18, release: 0.05 });
    s.tone({ type: 'sine', freq: 150, freqEnd: 55, dur: 0.12, gain: 0.34, attack: 0.002, release: 0.08 });
    s.tone({ type: 'triangle', freq: 90, dur: 0.07, gain: 0.16, release: 0.05 });
  },

  /**
   * 라인 클리어: 줄 수(1..4)에 따라 길이/밝기가 커지는 상행 아르페지오 + 스파크.
   * 테트리스(4줄)는 더 굵고 화사하게.
   */
  lineClear(s, lines = 1) {
    const n = Math.max(1, Math.min(4, lines | 0));
    const base = 523.25; // C5
    const notes = Math.min(PENTA.length, 2 + n); // 줄 수↑ → 음 수↑
    const step = 0.045 - n * 0.004; // 줄 수↑ → 더 빠른 아르페지오
    for (let i = 0; i < notes; i++) {
      s.tone({
        type: 'triangle',
        freq: semis(base, PENTA[i]),
        dur: 0.07 + n * 0.01,
        gain: 0.1 + n * 0.02,
        attack: 0.002,
        release: 0.07,
        when: i * step,
      });
    }
    // 화사한 상단 스파크.
    s.noise({
      type: 'highpass',
      freq: 4000,
      freqEnd: 9000,
      q: 0.6,
      dur: 0.08 + n * 0.02,
      gain: 0.04 + n * 0.02,
      release: 0.1,
    });
    if (n >= 4) {
      // 테트리스 한 방: 묵직한 저역 보강.
      s.tone({ type: 'sine', freq: 110, freqEnd: 220, dur: 0.22, gain: 0.2, release: 0.12 });
    }
  },

  /**
   * 콤보 상승음: 콤보 단계가 오를수록 음정이 반음씩 또렷이 상승(긴장 고조).
   * @param {number} step 콤보 단계(1=2연속, 2=3연속 …)
   */
  combo(s, step = 1) {
    const k = Math.max(1, step | 0);
    const pitch = Math.min(24, k * 2); // 단계마다 장2도씩, 2옥타브에서 포화
    const f = semis(659.25, pitch); // E5 기준 상승
    s.tone({ type: 'square', freq: f * 0.5, dur: 0.05, gain: 0.07, release: 0.03 });
    s.tone({ type: 'triangle', freq: f, freqEnd: f * 1.5, dur: 0.12, gain: 0.16, attack: 0.002, release: 0.08 });
    // 단계가 높을수록 반짝이는 옥타브 하모닉 추가.
    if (k >= 3) {
      s.tone({ type: 'sine', freq: f * 2, dur: 0.1, gain: 0.06, when: 0.02, release: 0.08 });
    }
  },

  /** 레벨 업: 단단한 상행 2음 팡파르. */
  levelUp(s) {
    s.tone({ type: 'sawtooth', freq: semis(440, 0), dur: 0.1, gain: 0.12, release: 0.06 });
    s.tone({ type: 'sawtooth', freq: semis(440, 7), dur: 0.16, gain: 0.13, when: 0.09, release: 0.1 });
    s.tone({ type: 'sine', freq: semis(440, 12), dur: 0.18, gain: 0.1, when: 0.18, release: 0.12 });
  },

  /**
   * 가비지 수신: 위협적인 저역 충격 + 하강 노이즈(줄 수 비례 강도). "맞았다".
   * @param {number} lines 들어온 가비지 줄 수
   */
  garbage(s, lines = 1) {
    const n = Math.max(1, Math.min(8, lines | 0));
    s.tone({ type: 'sawtooth', freq: 130, freqEnd: 48, dur: 0.16 + n * 0.01, gain: 0.18 + n * 0.02, release: 0.1 });
    s.noise({ type: 'lowpass', freq: 1400, freqEnd: 240, q: 1.2, dur: 0.16, gain: 0.1 + n * 0.015, release: 0.08 });
    s.tone({ type: 'square', freq: 70, dur: 0.1, gain: 0.1, release: 0.06 });
  },

  /** 도발(티배깅/AI 되받기): 약 올리는 하강 "냐~" 벤드. */
  taunt(s) {
    s.tone({ type: 'sawtooth', freq: 740, freqEnd: 370, dur: 0.16, gain: 0.13, attack: 0.004, release: 0.08, detune: 8 });
    s.tone({ type: 'square', freq: 370, freqEnd: 300, dur: 0.18, gain: 0.07, when: 0.05, release: 0.1 });
  },

  /** KO: 큰 크래시 — 하강 노이즈 스윕 + 저역 붐 + 디튠 단3화음. */
  ko(s) {
    s.noise({ type: 'lowpass', freq: 6000, freqEnd: 200, q: 0.8, dur: 0.5, gain: 0.26, release: 0.3 });
    s.tone({ type: 'sine', freq: 160, freqEnd: 40, dur: 0.6, gain: 0.34, attack: 0.003, release: 0.35 });
    // 불길한 단3화음(루트/단3도/5도) 디튠.
    s.tone({ type: 'sawtooth', freq: 220, dur: 0.5, gain: 0.08, release: 0.3, detune: -10 });
    s.tone({ type: 'sawtooth', freq: 261.6, dur: 0.5, gain: 0.08, release: 0.3 });
    s.tone({ type: 'sawtooth', freq: 329.6, dur: 0.5, gain: 0.07, release: 0.3, detune: 10 });
  },

  /** 카운트다운 비프(3·2·1). */
  count(s) {
    s.tone({ type: 'square', freq: 440, dur: 0.09, gain: 0.16, release: 0.05 });
  },

  /** "FIGHT!" 개시 스팅어: 상행 더블 스탭. */
  fight(s) {
    s.tone({ type: 'sawtooth', freq: 330, freqEnd: 660, dur: 0.16, gain: 0.2, release: 0.1 });
    s.tone({ type: 'sawtooth', freq: 660, dur: 0.22, gain: 0.18, when: 0.12, release: 0.14, detune: 6 });
    s.noise({ type: 'highpass', freq: 5000, dur: 0.18, gain: 0.06, when: 0.12, release: 0.12 });
  },

  /** UI 선택/확정(버튼·난이도). 가벼운 확인음. */
  ui(s) {
    s.tone({ type: 'triangle', freq: 587, freqEnd: 784, dur: 0.06, gain: 0.1, release: 0.05 });
  },
};

export { semis };
