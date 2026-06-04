// ============================================================================
// audio/bgm.js — 가벼운 합성 BGM 루프 (룩어헤드 스케줄러)
//
// 플레이 중에만 도는 절제된 미니멀 루프. 베이스 펄스 + 어두운 아르페지오 +
// 오프비트 하이햇으로 "긴장감 있되 거슬리지 않는" 네온 아케이드 그루브를 만든다.
// musicBus(낮은 게인)로 나가 SFX를 절대 덮지 않는다.
//
// 스케줄링: setInterval 룩어헤드(25ms)로 AudioContext.currentTime 기준 0.1s 앞을
// 미리 예약 → rAF/탭 비활성과 무관하게 박자가 흔들리지 않는다.
// ============================================================================

// A 단조 펜타토닉 근처 — 어둡고 떠 있는 느낌.
const ROOT = 220; // A3
function semis(base, n) {
  return base * Math.pow(2, n / 12);
}

// 16스텝 1마디. 각 값은 루트로부터의 반음(또는 null=쉼).
const BASS = [0, null, 0, null, -2, null, 3, null, 0, null, 0, null, 5, null, 3, null];
const ARP = [12, 15, 19, 15, 12, 19, 24, 19, 10, 15, 17, 15, 10, 17, 22, 17];

const STEP_DUR = 0.135; // 한 16분음표 길이(초) ≈ 111 BPM
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

export class Bgm {
  /** @param {import('./synth.js').SynthEngine} synth */
  constructor(synth) {
    this.synth = synth;
    this.running = false;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
    this._tick = this._tick.bind(this);
    this._intensity = 0; // 0..1, KO 근접 등에서 끌어올릴 수 있는 긴장도 훅(예약)
  }

  start() {
    const ctx = this.synth.ensure();
    if (!ctx || this.running) return;
    this.running = true;
    this._step = 0;
    this._nextTime = this.synth.now() + 0.08;
    this._timer = setInterval(this._tick, LOOKAHEAD_MS);
  }

  stop() {
    this.running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** 긴장도(0..1). 현재는 아르페지오 음량/필터에 소폭 반영(예약 훅). */
  setIntensity(v) {
    this._intensity = Math.max(0, Math.min(1, v));
  }

  _tick() {
    if (!this.running) return;
    const s = this.synth;
    while (this._nextTime < s.now() + SCHEDULE_AHEAD) {
      this._playStep(this._step, this._nextTime - s.now());
      this._nextTime += STEP_DUR;
      this._step = (this._step + 1) % 16;
    }
  }

  _playStep(step, when) {
    const s = this.synth;
    const intent = this._intensity;

    // 베이스(짝수/지정 스텝): 둥근 저역 펄스.
    const b = BASS[step];
    if (b != null) {
      s.tone({
        bus: 'music',
        type: 'triangle',
        freq: semis(ROOT, b) / 2,
        dur: STEP_DUR * 0.9,
        gain: 0.22,
        attack: 0.005,
        release: 0.06,
        when,
      });
    }

    // 아르페지오: 어두운 톱니, 짧게 통통.
    const a = ARP[step];
    if (a != null) {
      s.tone({
        bus: 'music',
        type: 'sawtooth',
        freq: semis(ROOT, a),
        dur: STEP_DUR * 0.55,
        gain: 0.07 + intent * 0.04,
        attack: 0.004,
        release: 0.05,
        when,
      });
    }

    // 오프비트 하이햇(노이즈)으로 그루브.
    if (step % 2 === 1) {
      s.noise({
        bus: 'music',
        type: 'highpass',
        freq: 7000,
        dur: 0.03,
        gain: 0.03,
        release: 0.03,
        when,
      });
    }
    // 다운비트 킥 보강.
    if (step % 4 === 0) {
      s.tone({
        bus: 'music',
        type: 'sine',
        freq: 90,
        freqEnd: 45,
        dur: 0.12,
        gain: 0.16,
        release: 0.06,
        when,
      });
    }
  }
}
