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
const MIN_GAP = { hit: 0.12, kill: 0.09, crit: 0.18, pickup: 0.03, skill_aura: 0.5, click: 0,
  // The last spells come fast but sound long: let each ring out before it starts again.
  skill_w_sword: 1.6, skill_m_fire3: 1.8, skill_p_wave: 1.4, skill_r_dance: 0.6, skill_r_storm: 0.7,
  skill_r_heaven: 0.9, skill_r_formless: 2.0 };
// Sounds that come many times a second play softer than spells.
const GAIN = { hit: 0.35, pickup: 0.5, click: 0.6, kill: 0.28, crit: 0.45, combo: 0.9 };

// Decoded sound kept at most (mono float samples: about 80 seconds at 48 kHz).
const SFX_BUDGET = 16e6;

export class Audio {
  constructor(manifest) {
    this.files = manifest.sfx || {};
    this.bgmList = manifest.bgm || [];
    this.buffers = {}; // file key -> { buf, used, bytes }
    this.pending = {};
    this.bytes = 0;
    this.clock = 0;
    this.last = {};
    this.sfxOn = true;
    this.bgmOn = true;
    this.sfxVolume = 0.6;
    this.bgmVolume = 0.5;
    this.ctx = null;
    this.music = null;
    this.musicKey = null;
    // Which numbered sound (e.g. "092" for 092.wav) plays for a game event; set by the game.
    this.map = {};
  }

  /** The numbered sounds in the build (the game's own files are numbered), for the sound picker. */
  bank() {
    return Object.keys(this.files).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b);
  }

  /** Whether the build carries a sound by this name (numbered or 연's own named clips). */
  has(name) {
    return Object.prototype.hasOwnProperty.call(this.files, name);
  }

  /** Plays one numbered sound now, for trying a choice out. */
  preview(n) {
    this.unlock();
    const [num, r] = String(n).split('@');
    const b = this.buffer(num);
    if (b) this.start(b, 1, +r || 1);
    else this.want(num, x => this.start(x, 1, +r || 1), 2);
  }

  // The sounds are decoded as they are first played, and the least lately played let go past a
  // budget: all 844 decoded at the first tap were some 25 minutes of sound, 300 MB of samples on
  // a phone (its renderer killed for memory with the pictures on top). A sound's first play comes
  // as soon as it is decoded (a moment later; dropped if that took too long to still belong to
  // the blow), every later one at once.
  /** A decoded sound by its file key, or null (not decoded yet). */
  buffer(key) {
    const e = key && this.buffers[key];
    if (!e) return null;
    e.used = ++this.clock;
    return e.buf;
  }

  /** Decodes a sound; `then(buffer)` if it is in within `late` seconds. */
  want(key, then, late = 0.25) {
    if (!this.ctx || !key || !this.has(key) || this.buffers[key]) return;
    const t0 = this.ctx.currentTime;
    let p = this.pending[key];
    if (!p) {
      p = this.pending[key] = fetch('assets/' + this.files[key]).then(r => r.arrayBuffer()).then(d => this.ctx.decodeAudioData(d)).then(buf => {
        this.buffers[key] = { buf, used: ++this.clock, bytes: buf.length * buf.numberOfChannels * 4 };
        this.bytes += this.buffers[key].bytes;
        if (this.bytes > SFX_BUDGET) this.trim();
        return buf;
      }).catch(e => { console.warn('sound', this.files[key], e); return null; }).finally(() => { delete this.pending[key]; });
    }
    if (then) p.then(buf => { if (buf && this.sfxOn && !this.halted && this.ctx.currentTime - t0 <= late) then(buf); });
  }

  /** Past the budget: the least lately played let go, to three quarters of it. */
  trim() {
    const old = Object.keys(this.buffers).sort((x, y) => this.buffers[x].used - this.buffers[y].used);
    for (const k of old) {
      if (this.bytes <= SFX_BUDGET * 0.75) break;
      this.bytes -= this.buffers[k].bytes;
      delete this.buffers[k];
    }
  }

  start(buffer, gain = 1, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (rate !== 1) src.playbackRate.value = rate;
    if (gain === 1) src.connect(this.master);
    else {
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.master);
    }
    src.start();
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
      // The sounds heard all the time, ready from the first blow; the rest as they are first played.
      for (const k of ['hit', 'kill', 'crit', 'pickup', 'click', 'combo', 'levelup', 'enter']) { const f = this.fileOf(k); if (f) this.want(f); }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.music && this.bgmOn && this.music.paused && !this.halted) this.music.play().catch(() => {});
  }

  /** The file key a game event plays now (its numbered sound, or its own named clip), or null. */
  fileOf(k, level = 1) {
    let n = this.map[k];
    if (Array.isArray(n)) n = n[Math.min(level, n.length) - 1];
    if (n === '-') return null;
    const num = n ? String(n).split('@')[0] : null;
    return num && this.has(num) ? num : this.has(k) ? k : null;
  }

  /** kind: the skill's kind, for fallbacks; level picks among several sounds (기원 tiers);
   *  rate: played that many times as fast (the kill sound climbing with a streak). */
  play(key, kind, level = 1, rate = 1) {
    if (!this.sfxOn || !this.ctx || this.halted) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[key] || -1) < (MIN_GAP[key] ?? MIN_GAP[kind] ?? 0.03)) return;
    this.last[key] = now;
    const chain = key.startsWith('skill_') ? [key, 'skill_' + kind, 'skill'] : [key];
    for (const k of chain) {
      let n = this.map[k];
      if (Array.isArray(n)) n = n[Math.min(level, n.length) - 1];
      if (n === '-') return; // chosen: no sound
      // 'NNN@r': the sound at r times its speed (a spell sharing another's sound, pitched apart).
      const [num, r] = n ? String(n).split('@') : [];
      const fk = num && this.has(num) ? num : this.has(k) ? k : null;
      if (fk) {
        const b = this.buffer(fk), g = GAIN[key] ?? 1, rt = (+r || 1) * rate;
        if (b) this.start(b, g, rt);
        else this.want(fk, x => this.start(x, g, rt));
        return;
      }
    }
    // Spells stay silent without their own files: a made-up sound misrepresents them.
    if (key.startsWith('skill_')) return;
    if (SYNTH[key]) this.synth(rate === 1 ? SYNTH[key] : { ...SYNTH[key], f: SYNTH[key].f && SYNTH[key].f.map(f => f * rate) });
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
    // In the app the music plays natively (NativeMusic.java), taking no audio focus, so a video
    // watched in picture-in-picture keeps playing beside the game; in a browser, an <audio>.
    this.music = window.BaramMusic ? nativeMusic('assets/' + file, this.bgmVolume) : new window.Audio('assets/' + file);
    this.music.loop = true;
    this.music.volume = this.bgmVolume;
    if (this.bgmOn && !this.halted) this.music.play().catch(() => {});
  }

  pickBgm(key) {
    const chosen = this.map['bgm_' + key];
    if (chosen === '-') return null;
    const pick = chosen && this.bgmList.find(b => b.key === chosen);
    if (pick) return pick.file;
    const named = this.bgmList.find(b => b.key === key);
    if (named) return named.file;
    if (key === 'title') return null;
    const battle = this.bgmList.find(b => b.key === 'battle')
      || this.bgmList.filter(b => b.key !== 'title' && b.key !== 'boss')[0];
    if (key === 'boss' && !battle) return null;
    return battle ? battle.file : null;
  }

  stopBgm() {
    if (this.music) (this.music.stop || this.music.pause).call(this.music);
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

  /** Music volume 0..1 (the on/off switch keeps it); applied at once, in the app too. */
  setBgmVolume(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.music) this.music.volume = this.bgmVolume;
  }

  /** Effects volume 0..1: the master gain every effect goes through. */
  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.sfxVolume;
  }

  /** A short sample effect, so the new effects volume can be heard. */
  sample() {
    this.unlock();
    if (!this.sfxOn || !this.ctx) return;
    delete this.last.click;
    this.play('click');
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

/** The app's native music as the few bits of an <audio> the game uses (play, pause, paused, volume). */
function nativeMusic(path, vol) {
  const N = window.BaramMusic;
  let v = vol;
  return {
    loop: true, paused: true,
    play() { this.paused = false; N.play(path, v); return Promise.resolve(); },
    pause() { this.paused = true; N.pause(); },
    stop() { this.paused = true; N.stop(); },
    get volume() { return v; },
    set volume(x) { v = x; N.setVolume(x); },
  };
}
