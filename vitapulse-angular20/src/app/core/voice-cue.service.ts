import { Injectable, signal } from '@angular/core';
import { MusicService } from '../music/music.service';
import { PlaylistId } from '../music/playlists';

const ENABLED_KEY = 'vitapulse_voice_cues';
const VOICE_KEY = 'vitapulse_voice_name';
const FIRED_PREFIX = 'vitapulse_cue_';

/** Voices that are clearly not meant for coaching (macOS novelty voices etc.). */
const AVOID = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|organ|princess|ralph|trinoids|whisper|zarvox|fred|kathy|superstar|wobble)\b/i;
/** Names of voices that are female and sound warm / natural (higher number = nicer for a calm guide). */
const FEMALE_RANK: Record<string, number> = {
  jenny: 34, sonia: 34, aria: 30, libby: 30, neerja: 30, ava: 30, serena: 28, samantha: 26, moira: 28, tessa: 26, karen: 26,
  emma: 26, michelle: 24, natasha: 24, clara: 24, allison: 24, susan: 18, hazel: 18, catherine: 18, kate: 20, stephanie: 18,
  swara: 26, heera: 20, kalpana: 20, veena: 22, fiona: 22, victoria: 20, nicky: 18, zoe: 24, joanna: 24, salli: 20, kendra: 20, ivy: 20, zira: 8
};
const MALE = /\b(male|david|mark|george|james|guy|ryan|thomas|daniel|alex|rishi|ravi|hemant|prabhat|christopher|eric|roger|steffan|brian|matthew|prabhat|man)\b/i;

/** Spoken coaching cues: a calm, soothing female guide using the best voice the device offers. */
@Injectable({ providedIn: 'root' })
export class VoiceCueService {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  readonly enabled = signal(this.readEnabled());
  /** Name of the voice currently chosen (empty until the browser has loaded its voice list). */
  readonly voiceName = signal('');
  private voice: SpeechSynthesisVoice | null = null;
  private genderKnown = false;

  constructor(private music: MusicService) {
    if (this.supported) {
      this.pickVoice();
      // Chrome and Edge load their voice list asynchronously.
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
    }
  }

  setEnabled(on: boolean): void {
    this.enabled.set(on);
    try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* storage may be unavailable */ }
    if (!on && this.supported) speechSynthesis.cancel();
    if (on) this.say('Voice guide on. I will be with you the whole way.', true);
  }

  /** Optional: lock a specific installed voice by name (remembered on this device). */
  setVoice(name: string): void {
    try { localStorage.setItem(VOICE_KEY, name); } catch { /* storage may be unavailable */ }
    this.pickVoice();
  }

  /** Called from the session ticker. Each cue fires at most once per session, even across tabs and reloads. */
  onTick(sessionKey: number, name: string, elapsed: number, duration: number): void {
    if (!this.enabled() || !this.supported) return;
    const remaining = duration - elapsed;
    const minutes = Math.max(1, Math.round(duration / 60));
    const mood = this.music.playlistId();   // wording follows the workout's playlist
    if (elapsed >= 0 && elapsed < 6) this.once(sessionKey, 'start', this.startLine(mood, name, minutes), elapsed < 4);
    if (duration >= 120 && elapsed >= duration / 2 && elapsed < duration / 2 + 8) this.once(sessionKey, 'half', this.halfLine(mood));
    if (duration > 120 && remaining <= 60 && remaining > 52) this.once(sessionKey, 'last-minute', this.lastMinuteLine(mood));
    if (duration > 30 && remaining <= 10 && remaining > 9) this.once(sessionKey, 'ten', 'Ten seconds.', true, 0.96);
    ['five', 'four', 'three', 'two', 'one'].forEach((word, i) => {
      const n = 5 - i;
      if (duration > 30 && remaining <= n && remaining > n - 1) this.once(sessionKey, `n${n}`, word, true, 0.98);
    });
  }

  complete(cancelled: boolean): void {
    if (!this.enabled() || !this.supported) return;
    this.say(cancelled
      ? 'Session ended. Well done for showing up today.'
      : 'Workout complete. Wonderful work. Take a slow breath in, and let it go.', true);
  }

  clear(sessionKey: number): void {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`${FIRED_PREFIX}${sessionKey}_`)) localStorage.removeItem(k);
      }
    } catch { /* storage may be unavailable */ }
  }

  // ---- wording: always calm, gently flavoured by the selected music mood -------------------------------------------
  private startLine(id: PlaylistId, name: string, minutes: number): string {
    const m = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    switch (id) {
      case 'yoga': return `Let's begin. ${name}, ${m}. Settle in, and breathe slowly.`;
      case 'stretching': return `Let's begin. ${name}, ${m}. Ease into each stretch, nice and slow.`;
      case 'squats': case 'pushups': return `Let's begin. ${name}, ${m}. Stay focused, one steady rep at a time.`;
      case 'walking': return `Let's begin. ${name}, ${m}. Keep it light, and keep it steady.`;
      default: return `Here we go. ${name}, ${m}. Find your rhythm, you've got this.`;
    }
  }
  private halfLine(id: PlaylistId): string {
    return this.isGentle(id) ? 'Halfway there. Keep breathing, nice and easy.' : 'Halfway there. You are doing beautifully.';
  }
  private lastMinuteLine(id: PlaylistId): string {
    return this.isGentle(id) ? 'One minute left. Stay with your breath.' : 'One minute left. Finish strong, you have this.';
  }
  private isGentle(id: PlaylistId): boolean { return id === 'yoga' || id === 'stretching'; }

  // ---- speaking ---------------------------------------------------------------------------------------------------
  private once(sessionKey: number, cue: string, text: string, interrupt = false, rate?: number): void {
    const key = `${FIRED_PREFIX}${sessionKey}_${cue}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* fall through: speak anyway */ }
    this.say(text, interrupt, rate);
  }

  private say(text: string, interrupt: boolean, rate = 0.9): void {
    if (!this.supported) return;
    if (!this.voice) this.pickVoice();
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-US';
    // Slower than default and a touch softer = calm and soothing. If we could not confirm the voice is female,
    // lift the pitch slightly so the default voice still sounds gentle rather than flat.
    u.rate = rate;
    u.pitch = this.genderKnown ? 1.02 : 1.14;
    u.volume = 0.95;
    u.onstart = () => this.music.duck(true);
    u.onend = u.onerror = () => this.music.duck(false);
    speechSynthesis.speak(u);
  }

  /** Scores every installed English voice and keeps the best female-sounding, natural one. */
  private pickVoice(): void {
    if (!this.supported) return;
    const all = speechSynthesis.getVoices();
    if (!all.length) return;
    const english = all.filter(v => /^en[-_]/i.test(v.lang) || /^en$/i.test(v.lang));
    const pool = english.length ? english : all;
    let saved = '';
    try { saved = localStorage.getItem(VOICE_KEY) || ''; } catch { /* storage may be unavailable */ }
    const forced = saved ? pool.find(v => v.name === saved) : undefined;
    let best: SpeechSynthesisVoice | null = forced ?? null, bestScore = -Infinity;
    if (!best) {
      for (const v of pool) {
        const s = this.score(v);
        if (s > bestScore) { bestScore = s; best = v; }
      }
    }
    this.voice = best;
    this.genderKnown = !!best && (!!forced || this.isFemale(best));
    this.voiceName.set(best?.name ?? '');
  }

  private isFemale(v: SpeechSynthesisVoice): boolean {
    const n = v.name.toLowerCase();
    if (/\bfemale\b|\bwoman\b/.test(n)) return true;
    return Object.keys(FEMALE_RANK).some(k => new RegExp(`\\b${k}\\b`).test(n));
  }

  private score(v: SpeechSynthesisVoice): number {
    const n = v.name.toLowerCase();
    if (AVOID.test(n)) return -200;
    let s = 0;
    if (/natural|neural|premium|enhanced|online|wavenet/.test(n) || !v.localService) s += 45;   // cloud / neural voices sound far more human
    const rank = Object.entries(FEMALE_RANK).find(([k]) => new RegExp(`\\b${k}\\b`).test(n));
    if (/\bfemale\b|\bwoman\b/.test(n)) s += 40;
    if (rank) s += 40 + rank[1];
    else if (MALE.test(n) && !/\bfemale\b/.test(n)) s -= 120;
    if (/^en[-_](in|gb|us|au)/i.test(v.lang)) s += 8;
    if (/^en[-_](gb|in)/i.test(v.lang)) s += 3;                                                   // softer accents suit a calm guide
    if (v.default) s += 1;
    return s;
  }

  private readEnabled(): boolean {
    try { return localStorage.getItem(ENABLED_KEY) !== '0'; } catch { return true; }
  }
}
