// Original, procedural sound design. No downloaded recordings or autoplay.
export function createFireworkAudio({ contextFactory, random = Math.random } = {}) {
  let context, master, noise, disposed = false;
  let enabled = true, volume = .28;
  const voices = new Set();
  const stats = { launches: 0, bursts: 0 };
  function configure(nextEnabled, nextVolume) {
    enabled = nextEnabled;
    volume = Math.max(0, Math.min(1, nextVolume));
    if (master) master.gain.setTargetAtTime(enabled ? volume * .45 : 0, context.currentTime, .025);
    if (!enabled) stop();
  }
  async function unlock() {
    if (disposed || !enabled) return false;
    const AudioContext = contextFactory || globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = volume * .45;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -15; limiter.ratio.value = 8;
        master.connect(limiter); limiter.connect(context.destination);
        noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
      }
      if (context.state === 'suspended') await context.resume();
      if (disposed) return false;
      return context.state === 'running';
    } catch { return false; }
  }
  function voice(type, pan = 0) {
    if (disposed || !enabled || !context || context.state !== 'running' || voices.size >= 18) return;
    const now = context.currentTime;
    const source = context.createBufferSource(); source.buffer = noise;
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const stereo = context.createStereoPanner(); stereo.pan.value = Math.max(-.8, Math.min(.8, pan));
    source.connect(filter); filter.connect(gain); gain.connect(stereo); stereo.connect(master);
    const launch = type === 'launch';
    const duration = launch ? .8 : 1.4;
    filter.type = launch ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(launch ? 500 : 1300, now);
    filter.frequency.exponentialRampToValueAtTime(launch ? 2600 : 80, now + duration);
    filter.Q.value = launch ? 3 : .7;
    gain.gain.setValueAtTime(.001, now);
    gain.gain.exponentialRampToValueAtTime(launch ? .12 : .85, now + (launch ? .16 : .012));
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.onended = () => { voices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); };
    voices.add(source); source.start(now); source.stop(now + duration);
    stats[launch ? 'launches' : 'bursts']++;
  }
  function stop() {
    for (const source of voices) { try { source.stop(); } catch { /* Already ended. */ } }
    voices.clear();
  }
  return {
    unlock, configure, stop,
    launch: (pan) => voice('launch', pan), burst: (pan) => voice('burst', pan),
    get state() { return context?.state || 'locked'; },
    get voiceCount() { return voices.size; }, stats,
    dispose() { if (disposed) return; disposed = true; stop(); context?.close().catch(() => {}); },
  };
}
