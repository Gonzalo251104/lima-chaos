/**
 * Web Audio API procedural synthesizer for LimaCaos: Combi Tycoon.
 * Generates an 8-bit Peruvian Chicha / Cumbia melody loop and procedural Lima traffic SFX
 * (fare coin chime, combi air-horn, and ATU inspector whistle) with zero external audio files.
 * Safe to instantiate in headless Node/Vitest environments.
 */
export class ChichaAudioSynth {
  // Peruvian Chicha pentatonic/harmonic lead sequence (frequencies in Hz, 0 = rest)
  private static readonly CHICHA_MELODY_HZ: readonly number[] = [
    440.0, 523.25, 659.25, 659.25, 783.99, 659.25, 523.25, 440.0,
    392.0, 493.88, 587.33, 587.33, 659.25, 587.33, 493.88, 392.0,
    349.23, 440.0, 523.25, 659.25, 587.33, 523.25, 493.88, 440.0,
    329.63, 415.3, 493.88, 659.25, 523.25, 493.88, 440.0, 0,
  ];

  // Syncopated Cumbia / Chicha bassline (in Hz)
  private static readonly CHICHA_BASS_HZ: readonly number[] = [
    110.0, 0, 164.81, 220.0, 110.0, 0, 164.81, 220.0,
    98.0, 0, 146.83, 196.0, 98.0, 0, 146.83, 196.0,
    87.31, 0, 130.81, 174.61, 87.31, 0, 130.81, 174.61,
    82.41, 0, 123.47, 164.81, 110.0, 0, 110.0, 0,
  ];

  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;
  private loopTimerId: ReturnType<typeof setInterval> | null = null;
  private stepIndex: number = 0;

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopChichaLoop();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    if (!this.isMuted) {
      this.startChichaLoop();
    }
    return this.isMuted;
  }

  /**
   * Starts the background 8-bit Peruvian Chicha music loop (~145 BPM eighth-note step sequencer).
   */
  public startChichaLoop(): void {
    if (this.isMuted || this.loopTimerId !== null) {
      return;
    }
    const ctx = this.ensureAudioContext();
    if (!ctx) {
      return;
    }

    this.stepIndex = 0;
    this.loopTimerId = setInterval(() => {
      if (this.isMuted) {
        return;
      }
      this.playSequencerStep();
    }, 185);
  }

  public stopChichaLoop(): void {
    if (this.loopTimerId !== null) {
      clearInterval(this.loopTimerId);
      this.loopTimerId = null;
    }
  }

  /**
   * Plays a crisp two-note coin chime when a passenger boards and pays their fare.
   */
  public playCoinChime(): void {
    if (this.isMuted) {
      return;
    }
    const ctx = this.ensureAudioContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    this.triggerTone(ctx, 987.77, 'triangle', now, 0.06, 0.06); // B5
    this.triggerTone(ctx, 1318.51, 'triangle', now + 0.06, 0.11, 0.07); // E6
  }

  /**
   * Plays a dual-tone Lima Combi air-horn honk during traffic jams or "Correteo" overtakes.
   */
  public playHornHonk(): void {
    if (this.isMuted) {
      return;
    }
    const ctx = this.ensureAudioContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    this.triggerTone(ctx, 415.3, 'sawtooth', now, 0.14, 0.055);
    this.triggerTone(ctx, 523.25, 'sawtooth', now, 0.14, 0.055);
  }

  /**
   * Plays a sharp inspector whistle trill when an informal Combi is fined at an ATU checkpoint.
   */
  public playAtuWhistle(): void {
    if (this.isMuted) {
      return;
    }
    const ctx = this.ensureAudioContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    this.triggerTone(ctx, 2637.02, 'square', now, 0.08, 0.065);
    this.triggerTone(ctx, 2959.96, 'square', now + 0.09, 0.14, 0.065);
  }

  private playSequencerStep(): void {
    const ctx = this.ensureAudioContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const idx = this.stepIndex % ChichaAudioSynth.CHICHA_MELODY_HZ.length;
    this.stepIndex += 1;

    const leadFreq = ChichaAudioSynth.CHICHA_MELODY_HZ[idx] ?? 0;
    const bassFreq = ChichaAudioSynth.CHICHA_BASS_HZ[idx] ?? 0;

    if (leadFreq > 0) {
      this.triggerTone(ctx, leadFreq, 'square', now, 0.13, 0.025);
    }
    if (bassFreq > 0) {
      this.triggerTone(ctx, bassFreq, 'triangle', now, 0.14, 0.04);
    }
  }

  private triggerTone(
    ctx: AudioContext,
    frequencyHz: number,
    type: OscillatorType,
    startTime: number,
    durationSec: number,
    gainPeak: number,
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequencyHz, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + durationSec + 0.01);
    } catch {
      // Ignore Web Audio state errors if browser autoplay policy blocks prior to gesture
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }
    if (typeof window === 'undefined') {
      return null;
    }
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }
    try {
      this.audioCtx = new AudioContextCtor();
      return this.audioCtx;
    } catch {
      return null;
    }
  }
}
