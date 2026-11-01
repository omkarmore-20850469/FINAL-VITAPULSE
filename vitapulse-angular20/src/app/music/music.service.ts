import { Injectable, computed, signal } from '@angular/core';
import { PLAYLISTS, PlaylistId, Track, playlistForActivity } from './playlists';

const VOL_KEY = 'vitapulse_music_volume';
const SYNC_KEY = 'vitapulse_music_bpm_sync';

/** Plays workout tracks from the app's own assets and exposes an analyser + beat clock. */
@Injectable({ providedIn: 'root' })
export class MusicService {
  readonly playlistId = signal<PlaylistId>('running');
  readonly trackIndex = signal(0);
  readonly playing = signal(false);
  readonly volume = signal(this.readNumber(VOL_KEY, 0.7));
  readonly bpmSync = signal(this.readNumber(SYNC_KEY, 1) === 1);
  readonly error = signal<string | null>(null);
  readonly playlist = computed(() => PLAYLISTS[this.playlistId()]);
  readonly track = computed<Track>(() => this.playlist().tracks[this.trackIndex()] ?? this.playlist().tracks[0]);
  /** The BPM the avatar should follow, or 0 when music is not driving the animation. */
  readonly syncBpm = computed(() => (this.playing() && this.bpmSync() ? this.track().bpm : 0));

  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private ducked = false;
  private loadedSrc = '';

  /** Choose the playlist matched to the current exercise (does not start playback). */
  matchActivity(exerciseName: string): void {
    this.selectPlaylist(playlistForActivity(exerciseName), false);
  }

  selectPlaylist(id: PlaylistId, autoplay = this.playing()): void {
    if (id === this.playlistId()) return;
    this.playlistId.set(id); this.trackIndex.set(0);
    if (autoplay) void this.play(); else this.stop();
  }

  selectTrack(index: number): void {
    this.trackIndex.set(index); void this.play();
  }

  async toggle(): Promise<void> { if (this.playing()) this.pause(); else await this.play(); }

  async play(): Promise<void> {
    const audio = this.ensureAudio();
    if (this.loadedSrc !== this.track().src) this.loadTrack();
    try {
      await this.ctx?.resume();
      await audio.play();
      this.error.set(null);
    } catch {
      this.playing.set(false);
      this.error.set('Playback was blocked or the track could not load. Press play to try again.');
    }
  }

  pause(): void { this.audio?.pause(); }

  stop(): void {
    if (!this.audio) return;
    this.audio.pause(); this.audio.currentTime = 0; this.playing.set(false); this.loadedSrc = '';
  }

  next(): void { this.step(1, this.playing()); }
  previous(): void {
    if (this.audio && this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    this.step(-1, this.playing());
  }

  setVolume(value: number): void {
    const v = Math.min(1, Math.max(0, Number(value) || 0));
    this.volume.set(v); this.applyVolume();
    try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* storage may be unavailable */ }
  }

  setBpmSync(on: boolean): void {
    this.bpmSync.set(on);
    try { localStorage.setItem(SYNC_KEY, on ? '1' : '0'); } catch { /* storage may be unavailable */ }
  }

  /** Lowers the music while a spoken cue is playing. */
  duck(on: boolean): void { this.ducked = on; this.applyVolume(); }

  /** Beats elapsed since the start of the current track, locked to the audio clock. */
  currentBeat(): number { return this.audio ? this.audio.currentTime * this.track().bpm / 60 : 0; }

  /** Fills the array with frequency data for the visualizer; returns false if no analyser yet. */
  frequencyData(into: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(into); return true;
  }
  get binCount(): number { return this.analyser?.frequencyBinCount ?? 64; }

  private step(delta: number, thenPlay: boolean): void {
    const n = this.playlist().tracks.length;
    this.trackIndex.set((this.trackIndex() + delta + n) % n);
    if (thenPlay) void this.play(); else this.stop();
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('play', () => this.playing.set(true));
    audio.addEventListener('pause', () => this.playing.set(false));
    audio.addEventListener('ended', () => this.step(1, true));
    audio.addEventListener('error', () => { this.playing.set(false); this.error.set('This track could not be loaded.'); });
    this.audio = audio;
    this.applyVolume();
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      const source = this.ctx.createMediaElementSource(audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128; this.analyser.smoothingTimeConstant = 0.78;
      source.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    } catch { /* the visualizer is optional; audio still plays without it */ }
    return audio;
  }

  private loadTrack(): void {
    const audio = this.ensureAudio();
    audio.src = this.track().src; audio.load();
    this.loadedSrc = this.track().src;
    this.error.set(null);
  }

  private applyVolume(): void {
    if (this.audio) this.audio.volume = this.volume() * (this.ducked ? 0.3 : 1);
  }

  private readNumber(key: string, fallback: number): number {
    try { const n = Number(localStorage.getItem(key)); return localStorage.getItem(key) === null || !Number.isFinite(n) ? fallback : n; } catch { return fallback; }
  }
}
