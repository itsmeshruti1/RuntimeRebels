const SOUND_DIR = '/media/sound/';

export class SwitchSound {
  constructor(params) {
    this.params = params;
    this.buffers = new Map();
    this.source = null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.load(params.file);
    const unlock = () => this.ctx.state === 'suspended' && this.ctx.resume().catch(() => {});
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.ctx.suspend() : this.ctx.resume()).catch(() => {}));
  }

  load(file) {
    if (!this.ctx || !file) return Promise.resolve(null);
    if (this.buffers.has(file)) return this.buffers.get(file);
    const p = fetch(SOUND_DIR + encodeURIComponent(file))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((b) => this.ctx.decodeAudioData(b))
      .catch(() => null);
    this.buffers.set(file, p);
    return p;
  }

  play() {
    if (!this.ctx || !this.params.file) return;
    const resumed = this.ctx.state === 'suspended' ? this.ctx.resume().catch(() => {}) : Promise.resolve();
    Promise.all([resumed, this.load(this.params.file)]).then(([, buffer]) => {
      if (!buffer || this.ctx.state !== 'running') return;
      this.stop();
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = this.params.volume;
      source.connect(gain);
      gain.connect(this.master);
      source.onended = () => {
        gain.disconnect();
        if (this.source === source) this.source = null;
      };
      source.start();
      this.source = source;
    });
  }

  stop() {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {}
    this.source = null;
  }
}

export function playOnClicks(sound) {
  document.addEventListener('click', (e) => {
    if (e.target.closest('a[href], button')) sound.play();
  });
}
