import { Injectable, OnDestroy, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Exercise } from './models';
import { VoiceCueService } from './voice-cue.service';
import { MusicService } from '../music/music.service';

export interface ActiveWorkoutSession {
  exercise: Exercise;
  startedAt: number;
  durationSeconds: number;
}

const SESSION_KEY = 'vitapulse_active_workout';

@Injectable({ providedIn: 'root' })
export class WorkoutSessionService implements OnDestroy {
  readonly active = signal<ActiveWorkoutSession | null>(this.readSession());
  readonly elapsedSeconds = signal(0);
  private ticker: ReturnType<typeof setInterval> | null = null;
  private saving = false;
  private storageHandler = (event: StorageEvent) => {
    if (event.key === SESSION_KEY) {
      const next = this.readSession();
      this.active.set(next);
      this.updateElapsed();
      if (next) this.ensureTicker(); else this.stopTicker();
    }
  };

  constructor(private api: ApiService, private voice: VoiceCueService, private music: MusicService) {
    this.updateElapsed();
    if (this.active()) this.ensureTicker();
    if (typeof window !== 'undefined') window.addEventListener('storage', this.storageHandler);
  }

  start(exercise: Exercise): void {
    const session: ActiveWorkoutSession = {
      exercise,
      startedAt: Date.now(),
      durationSeconds: Math.max(60, Number(exercise.duration || 1) * 60)
    };
    this.active.set(session);
    this.elapsedSeconds.set(0);
    this.persist(session);
    this.ensureTicker();
    this.api.notify(`${exercise.name} started. Your session timer is running.`);
  }

  private readSession(): ActiveWorkoutSession | null {
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ActiveWorkoutSession;
      if (!parsed?.exercise?.id || !Number.isFinite(parsed.startedAt)) return null;
      return parsed;
    } catch { return null; }
  }

  private persist(session: ActiveWorkoutSession): void {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* storage may be unavailable */ }
  }

  private updateElapsed(): void {
    const session = this.active();
    this.elapsedSeconds.set(session ? Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)) : 0);
  }

  private ensureTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      this.updateElapsed();
      const session = this.active();
      if (session) this.voice.onTick(session.startedAt, session.exercise.name, this.elapsedSeconds(), session.durationSeconds);
      if (session && this.elapsedSeconds() >= session.durationSeconds) void this.finish(false);
    }, 500);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  async finish(cancel = false): Promise<void> {
    const session = this.active();
    if (!session || this.saving) return;
    this.saving = true;
    this.updateElapsed();
    const seconds = this.elapsedSeconds();
    this.active.set(null);
    this.elapsedSeconds.set(0);
    this.stopTicker();
    this.music.stop();
    this.voice.clear(session.startedAt);
    this.voice.complete(cancel);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* storage may be unavailable */ }
    try {
      const mins = Math.max(1, Math.round(seconds / 60));
      await this.api.saveWorkout({
        exerciseId: String(session.exercise.id),
        duration: Math.min(Number(session.exercise.duration) || mins, mins),
        calories: Math.round((Number(session.exercise.calories) || 0) * Math.min(1, seconds / session.durationSeconds)),
        state: cancel ? 'cancelled' : 'completed'
      });
      this.api.notify(cancel ? 'Session ended and saved. Nice work showing up!' : 'Workout completed. Great work!');
    } catch {
      this.api.notify('The session ended, but could not be saved. Check the API connection.');
    } finally { this.saving = false; }
  }

  formatTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  ngOnDestroy(): void {
    this.stopTicker();
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.storageHandler);
  }
}
