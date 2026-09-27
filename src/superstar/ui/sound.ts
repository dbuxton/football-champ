/**
 * Sound effects made on the fly with the Web Audio API: a referee's whistle, the thump of a kick,
 * the roar of the crowd. No audio files, nothing to download.
 *
 * The audio context is only made on the first sound, which always follows a click or a key press,
 * so browsers that block sound until the page has been used are happy.
 */

export type SoundKind = 'whistle' | 'final-whistle' | 'kick' | 'shot' | 'goal' | 'ooh' | 'tackle' | 'click' | 'cheer' | 'transfer';

let context: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, duration: number, wave: OscillatorType, volume: number, delay = 0, slideTo?: number) {
  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A burst of filtered noise: the crowd, a thud, the swish of the net. */
function noise(ac: AudioContext, duration: number, volume: number, from: number, to: number, delay = 0, attack = 0.02) {
  const length = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  const start = ac.currentTime + delay;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + duration);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start(start);
}

/** The pea in a referee's whistle makes it trill. */
function whistle(ac: AudioContext, delay: number, duration: number) {
  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const trill = ac.createOscillator();
  const depth = ac.createGain();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2900, start);
  trill.frequency.setValueAtTime(28, start);
  depth.gain.setValueAtTime(180, start);
  trill.connect(depth).connect(osc.frequency);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
  gain.gain.setValueAtTime(0.06, start + duration - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  trill.start(start);
  osc.stop(start + duration + 0.02);
  trill.stop(start + duration + 0.02);
}

export function playSound(kind: SoundKind): void {
  const ac = audio();
  if (!ac) return;
  switch (kind) {
    case 'whistle':
      whistle(ac, 0, 0.45);
      break;
    case 'final-whistle':
      whistle(ac, 0, 0.3);
      whistle(ac, 0.4, 0.3);
      whistle(ac, 0.8, 0.9);
      break;
    case 'kick':
      tone(ac, 150, 0.08, 'sine', 0.12, 0, 60);
      noise(ac, 0.05, 0.05, 900, 400);
      break;
    case 'shot':
      tone(ac, 120, 0.12, 'sine', 0.18, 0, 45);
      noise(ac, 0.08, 0.09, 1200, 300);
      break;
    case 'goal':
      noise(ac, 0.4, 0.12, 3000, 1500);
      noise(ac, 2.8, 0.22, 500, 1400, 0.05, 0.4);
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, 0.25, 'triangle', 0.05, 0.1 + i * 0.12));
      break;
    case 'ooh':
      noise(ac, 1.1, 0.12, 400, 700, 0, 0.15);
      break;
    case 'tackle':
      tone(ac, 90, 0.12, 'triangle', 0.12, 0, 60);
      break;
    case 'cheer':
      noise(ac, 1.6, 0.14, 600, 1300, 0, 0.3);
      break;
    case 'click':
      tone(ac, 880, 0.05, 'triangle', 0.05);
      break;
    case 'transfer':
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(ac, f, 0.3, 'triangle', 0.06, i * 0.1));
      noise(ac, 2, 0.1, 600, 1400, 0.3, 0.3);
      break;
  }
}
