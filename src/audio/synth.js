// ============================================================================
// audio/synth.js — Web Audio 합성 엔진 (저수준 프리미티브)
//
// SFX/BGM 모두 외부 오디오 파일 없이 OscillatorNode + 노이즈 버퍼를 ADSR
// 게인으로 깎아 합성한다. 게임 로직과 완전히 분리된 "출력 장치"일 뿐이며,
// 무엇을 언제 울릴지는 audio-director가 이벤트 구독으로 결정한다.
//
// 설계 메모:
//  · AudioContext는 첫 사용자 제스처 이후에만 생성/재개할 수 있다(자동재생 정책).
//    ensure()는 지연 생성, resume()은 제스처 훅에서 호출한다.
//  · 신호 경로:  osc/noise → (각 노트 게인) → sfxBus|musicBus → master → comp → out
//    master는 음소거(0)/볼륨을, comp(DynamicsCompressor)는 겹친 SFX의 클리핑을 막는다.
//  · exponentialRamp는 0으로 못 가므로 0.0001을 바닥값으로 쓴다.
//  · 미지원/헤드리스 환경에서는 supported=false로 모든 호출이 무해한 no-op.
// ============================================================================

const AC =
  (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
  null;

const FLOOR = 0.0001; // exponentialRamp 바닥값(0 금지)

export class SynthEngine {
  /**
   * @param {object} [opts]
   * @param {number} [opts.volume=0.7]  마스터 볼륨(0..1)
   * @param {boolean} [opts.muted=false] 초기 음소거
   */
  constructor(opts = {}) {
    this.supported = !!AC;
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.comp = null;
    this._noiseBuf = null;
    this._volume = opts.volume != null ? opts.volume : 0.7;
    this._muted = !!opts.muted;
  }

  /** AudioContext 지연 생성 + 버스 구성. 첫 호출에서만 만든다. */
  ensure() {
    if (!this.supported || this.ctx) return this.ctx;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this._muted ? FLOOR : this._volume;

    // 부드러운 마스터 리미터: 동시에 터지는 타격음의 클리핑/찢어짐 방지.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 24;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;

    master.connect(comp);
    comp.connect(ctx.destination);

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = 1.0;
    sfxBus.connect(master);

    const musicBus = ctx.createGain();
    musicBus.gain.value = 0.42; // BGM은 SFX보다 한참 아래(연주가 플레이를 덮지 않게)
    musicBus.connect(master);

    this.master = master;
    this.comp = comp;
    this.sfxBus = sfxBus;
    this.musicBus = musicBus;
    this._noiseBuf = this._buildNoise(ctx);
    return ctx;
  }

  /** 사용자 제스처 훅에서 호출: 정지된 컨텍스트를 깨운다. */
  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended' && ctx.resume) {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _bus(name) {
    return name === 'music' ? this.musicBus : this.sfxBus;
  }

  /** 1초 길이 화이트노이즈 버퍼(타격/가비지/KO 재료). */
  _buildNoise(ctx) {
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---- 음소거 / 볼륨 ----

  setMuted(m) {
    this._muted = !!m;
    if (this.master) {
      const t = this.now();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this._muted ? FLOOR : this._volume, t, 0.015);
    }
  }

  isMuted() {
    return this._muted;
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.master && !this._muted) {
      this.master.gain.setTargetAtTime(this._volume, this.now(), 0.02);
    }
  }

  // ---- 합성 프리미티브 ----

  /**
   * 단일 오실레이터 노트(옵션 피치 글라이드 + ADSR 게인).
   * @param {object} o
   * @param {'sine'|'square'|'sawtooth'|'triangle'} [o.type='sine']
   * @param {number} o.freq             시작 주파수(Hz)
   * @param {number} [o.freqEnd]        끝 주파수(있으면 지수 글라이드)
   * @param {number} [o.dur=0.12]       서스테인 길이(초)
   * @param {number} [o.gain=0.3]       피크 게인(0..1)
   * @param {number} [o.attack=0.005]   어택(초)
   * @param {number} [o.release=0.06]   릴리스(초)
   * @param {number} [o.when=0]         지금으로부터의 시작 오프셋(초)
   * @param {number} [o.detune=0]       디튠(cent)
   * @param {'sfx'|'music'} [o.bus='sfx']
   */
  tone(o) {
    const ctx = this.ensure();
    if (!ctx) return;
    const {
      type = 'sine',
      freq,
      freqEnd,
      dur = 0.12,
      gain = 0.3,
      attack = 0.005,
      release = 0.06,
      when = 0,
      detune = 0,
      bus = 'sfx',
    } = o;
    const t0 = this.now() + Math.max(0, when);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (freqEnd && freqEnd > 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    }
    if (detune) osc.detune.setValueAtTime(detune, t0);

    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(FLOOR, gain), t0 + attack);
    g.gain.setValueAtTime(Math.max(FLOOR, gain), t0 + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur + release);

    osc.connect(g);
    g.connect(this._bus(bus));
    osc.start(t0);
    osc.stop(t0 + dur + release + 0.02);
  }

  /**
   * 필터링된 노이즈 버스트(타격/스파크/가비지/KO).
   * @param {object} o
   * @param {number} [o.dur=0.12]
   * @param {number} [o.gain=0.3]
   * @param {'lowpass'|'highpass'|'bandpass'} [o.type='bandpass']
   * @param {number} [o.freq=1200]      필터 컷오프/중심
   * @param {number} [o.freqEnd]        필터 스윕 끝(있으면 글라이드)
   * @param {number} [o.q=1]
   * @param {number} [o.attack=0.002]
   * @param {number} [o.release=0.05]
   * @param {number} [o.when=0]
   * @param {'sfx'|'music'} [o.bus='sfx']
   */
  noise(o = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const {
      dur = 0.12,
      gain = 0.3,
      type = 'bandpass',
      freq = 1200,
      freqEnd,
      q = 1,
      attack = 0.002,
      release = 0.05,
      when = 0,
      bus = 'sfx',
    } = o;
    const t0 = this.now() + Math.max(0, when);
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (freqEnd && freqEnd > 0) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    }
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(FLOOR, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur + release);

    src.connect(filt);
    filt.connect(g);
    g.connect(this._bus(bus));
    src.start(t0);
    src.stop(t0 + dur + release + 0.02);
  }
}

export { FLOOR };
