// Sound: the files listed in the manifest when there are any, made-up sounds otherwise.
//
// BGM keys: "title", "battle" (or any other name), "boss". With no file of a key, battle
// music is picked from the files that are not title/boss.
// SFX keys, most specific first: "skill_<skill id>" -> "skill_<kind>" -> "skill";
// and "hit", "kill", "hurt", "pickup", "levelup", "boss", "chest", "heal", "win", "lose".

const SYNTH = {
  skill: { type: 'triangle', f: [520, 260], t: 0.12, v: 0.12 },
  skill_slash: { noise: true, f: [3000, 800], t: 0.12, v: 0.2 },
  skill_bolt: { type: 'square', f: [900, 300], t: 0.09, v: 0.06 },
  skill_strike: { noise: true, f: [1800, 200], t: 0.3, v: 0.25 },
  skill_nova: { noise: true, f: [600, 100], t: 0.4, v: 0.25 },
  skill_orbit: { type: 'sine', f: [300, 700], t: 0.25, v: 0.1 },
  skill_field: { noise: true, f: [400, 150], t: 0.35, v: 0.15 },
  skill_aura: { type: 'sine', f: [500, 520], t: 0.08, v: 0.03 },
  hit: { type: 'square', f: [220, 120], t: 0.05, v: 0.04 },
  kill: { type: 'square', f: [330, 80], t: 0.09, v: 0.05 },
  hurt: { type: 'sawtooth', f: [180, 60], t: 0.18, v: 0.15 },
  pickup: { type: 'sine', f: [880, 1320], t: 0.06, v: 0.05 },
  levelup: { type: 'triangle', seq: [523, 659, 784, 1047], t: 0.09, v: 0.15 },
  chest: { type: 'triangle', seq: [784, 988, 1175, 1568], t: 0.1, v: 0.15 },
  heal: { type: 'sine', seq: [660, 880], t: 0.1, v: 0.12 },
  boss: { type: 'sawtooth', seq: [110, 104, 98], t: 0.25, v: 0.15 },
  win: { type: 'triangle', seq: [523, 659, 784, 659, 784, 1047], t: 0.14, v: 0.15 },
  lose: { type: 'triangle', seq: [392, 330, 262, 196], t: 0.22, v: 0.15 },
};

// The game plays the same sound many times a second; a little gap keeps it from roaring.
const MIN_GAP = { hit: 0.05, kill: 0.04, pickup: 0.03, skill_aura: 0.5 };

export class Audio {
  constructor(manifest) {
    this.files = manifest.sfx || {};
    this.bgmList = manifest.bgm || [];
    this.buffers = {};
    this.last = {};
    this.sfxOn = true;
    this.bgmOn = true;
    this.sfxVolume = 0.8;
    this.bgmVolume = 0.5;
    this.ctx = null;
    this.music = null;
    this.musicKey = null;
  }

  /** Called from the first tap: browsers only let sound start from one. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.sfxVolume;
      this.master.connect(this.ctx.destination);
      for (const [key, file] of Object.entries(this.files)) this.load(key, file);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.music && this.bgmOn && this.music.paused && !this.halted) this.music.play().catch(() => {});
  }

  async load(key, file) {
    try {
      const res = await fetch('assets/' + file);
      this.buffers[key] = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn('sound', file, e);
    }
  }

  play(key, kind) {
    if (!this.sfxOn || !this.ctx || this.halted) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[key] || -1) < (MIN_GAP[key] ?? MIN_GAP[kind] ?? 0.03)) return;
    this.last[key] = now;
    const chain = key.startsWith('skill_') ? [key, 'skill_' + kind, 'skill'] : [key];
    for (const k of chain) {
      if (this.buffers[k]) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers[k];
        src.connect(this.master);
        src.start();
        return;
      }
    }
    // Spells stay silent without their own files: a made-up sound misrepresents them.
    if (key.startsWith('skill_')) return;
    if (SYNTH[key]) this.synth(SYNTH[key]);
  }

  synth(s) {
    const c = this.ctx, t0 = c.currentTime;
    const g = c.createGain();
    g.connect(this.master);
    if (s.seq) {
      s.seq.forEach((f, i) => {
        const o = c.createOscillator(), gg = c.createGain();
        o.type = s.type;
        o.frequency.value = f;
        const a = t0 + i * s.t;
        gg.gain.setValueAtTime(0.0001, a);
        gg.gain.exponentialRampToValueAtTime(s.v, a + 0.01);
        gg.gain.exponentialRampToValueAtTime(0.0001, a + s.t * 1.6);
        o.connect(gg).connect(g);
        o.start(a);
        o.stop(a + s.t * 1.7);
      });
      return;
    }
    let src;
    if (s.noise) {
      const len = Math.ceil(c.sampleRate * s.t);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(s.f[0], t0);
      f.frequency.exponentialRampToValueAtTime(s.f[1], t0 + s.t);
      src.connect(f).connect(g);
    } else {
      src = c.createOscillator();
      src.type = s.type;
      src.frequency.setValueAtTime(s.f[0], t0);
      src.frequency.exponentialRampToValueAtTime(s.f[1], t0 + s.t);
      src.connect(g);
    }
    g.gain.setValueAtTime(s.v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + s.t);
    src.start(t0);
    src.stop(t0 + s.t + 0.02);
  }

  /** Background music for a moment of the game: "title", "battle" or "boss". */
  bgm(key) {
    const file = this.pickBgm(key);
    if (!file) {
      this.stopBgm();
      return;
    }
    if (this.music && this.musicFile === file) return;
    this.stopBgm();
    this.musicFile = file;
    this.music = new window.Audio('assets/' + file);
    this.music.loop = true;
    this.music.volume = this.bgmVolume;
    if (this.bgmOn && !this.halted) this.music.play().catch(() => {});
  }

  pickBgm(key) {
    const named = this.bgmList.find(b => b.key === key);
    if (named) return named.file;
    if (key === 'title') return null;
    const battle = this.bgmList.find(b => b.key === 'battle')
      || this.bgmList.filter(b => b.key !== 'title' && b.key !== 'boss')[0];
    if (key === 'boss' && !battle) return null;
    return battle ? battle.file : null;
  }

  stopBgm() {
    if (this.music) this.music.pause();
    this.music = null;
    this.musicFile = null;
  }

  setBgm(on) {
    this.bgmOn = on;
    if (!this.music) return;
    if (on && !this.halted) this.music.play().catch(() => {});
    else this.music.pause();
  }

  setSfx(on) {
    this.sfxOn = on;
  }

  /** The app went to the background (or came back). */
  halt(on) {
    this.halted = on;
    if (on) {
      if (this.music) this.music.pause();
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    } else {
      if (this.ctx) this.ctx.resume().catch(() => {});
      if (this.music && this.bgmOn) this.music.play().catch(() => {});
    }
  }
}
