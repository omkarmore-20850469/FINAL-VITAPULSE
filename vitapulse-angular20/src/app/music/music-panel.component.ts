import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicService } from './music.service';
import { VoiceCueService } from '../core/voice-cue.service';
import { PLAYLISTS, PLAYLIST_ORDER, playlistForActivity } from './playlists';

/** Workout music panel: playlists matched to the activity, mini player, visualizer, BPM sync and voice-cue toggles. */
@Component({
  selector: 'app-music-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="music-panel" aria-label="Workout music">
      <header class="mp-head">
        <div><div class="eyebrow">WORKOUT MUSIC</div><h3>{{ music.playlist().name }}</h3></div>
        <span class="mp-bpm" [class.mp-bpm-live]="music.playing()"><b>{{ music.track().bpm }}</b> BPM</span>
      </header>

      <div class="mp-visual">
        <canvas #viz width="480" height="84" aria-hidden="true"></canvas>
        <div class="mp-now" aria-live="polite"><strong>{{ music.track().title }}</strong><small>{{ music.track().artist }} · {{ music.playlist().blurb }}</small></div>
      </div>

      <div class="mp-controls">
        <button type="button" class="mp-btn" (click)="music.previous()" aria-label="Previous track">⏮</button>
        <button type="button" class="mp-btn mp-play" (click)="music.toggle()" [attr.aria-label]="music.playing() ? 'Pause music' : 'Play music'">{{ music.playing() ? '❚❚' : '▶' }}</button>
        <button type="button" class="mp-btn" (click)="music.next()" aria-label="Next track">⏭</button>
        <label class="mp-volume"><span aria-hidden="true">{{ music.volume() === 0 ? '🔇' : '🔊' }}</span>
          <input type="range" min="0" max="1" step="0.05" [value]="music.volume()" (input)="music.setVolume($any($event.target).value)" aria-label="Volume">
        </label>
      </div>
      <p class="mp-error" *ngIf="music.error() as err" role="alert">{{ err }}</p>

      <div class="mp-chips" role="group" aria-label="Choose playlist">
        <button type="button" *ngFor="let id of order" class="mp-chip" [class.mp-chip-on]="music.playlistId() === id" (click)="music.selectPlaylist(id)">
          {{ playlists[id].name }}<small *ngIf="id === matched">matched</small>
        </button>
      </div>

      <ol class="mp-tracks">
        <li *ngFor="let t of music.playlist().tracks; let i = index">
          <button type="button" [class.mp-track-on]="music.trackIndex() === i" (click)="music.selectTrack(i)"><span>{{ music.trackIndex() === i && music.playing() ? '♪' : i + 1 }}</span><strong>{{ t.title }}</strong><em>{{ t.bpm }} BPM</em></button>
        </li>
      </ol>

      <div class="mp-toggles">
        <label><input type="checkbox" [checked]="music.bpmSync()" (change)="music.setBpmSync($any($event.target).checked)"> Sync trainer stride to BPM</label>
        <label *ngIf="voice.supported"><input type="checkbox" [checked]="voice.enabled()" (change)="voice.setEnabled($any($event.target).checked)"> Spoken cues</label>
      </div>
    </section>
  `,
  styles: [`
    :host{display:block}
    .music-panel{display:flex;flex-direction:column;gap:14px;text-align:left;padding:18px;border:1px solid var(--line);border-radius:18px;background:var(--surface-2)}
    .mp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .mp-head h3{margin:4px 0 0;font:800 18px Manrope,sans-serif;color:var(--ink)}
    .mp-bpm{font:600 12px 'DM Sans',sans-serif;color:var(--ink-2);padding:6px 11px;border-radius:999px;background:var(--accent-soft);color:var(--accent-soft-ink)}
    .mp-bpm b{font-size:16px}
    .mp-bpm-live b{animation:mpbeat .5s ease-in-out infinite alternate}
    @keyframes mpbeat{to{opacity:.55}}
    .mp-visual{position:relative;border-radius:14px;overflow:hidden;background:var(--surface);border:1px solid var(--line)}
    .mp-visual canvas{display:block;width:100%;height:84px}
    .mp-now{display:flex;flex-direction:column;gap:2px;padding:9px 12px;border-top:1px solid var(--line)}
    .mp-now strong{color:var(--ink);font-size:14px}.mp-now small{color:var(--ink-2);font-size:11px}
    .mp-controls{display:flex;align-items:center;gap:10px}
    .mp-btn{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:14px;cursor:pointer}
    .mp-btn:hover{border-color:var(--accent)}
    .mp-play{width:50px;height:50px;background:var(--accent);color:var(--accent-ink);border-color:transparent;font-size:16px}
    .mp-btn:focus-visible,.mp-chip:focus-visible,.mp-tracks button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    .mp-volume{display:flex;align-items:center;gap:8px;margin-left:auto;flex:1;max-width:170px;color:var(--ink-2)}
    .mp-volume input{flex:1;min-width:0;accent-color:var(--accent)}
    .mp-error{margin:0;font-size:12px;color:var(--ink)}
    .mp-chips{display:flex;flex-wrap:wrap;gap:7px}
    .mp-chip{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:7px 12px;font:600 12px 'DM Sans',sans-serif;cursor:pointer}
    .mp-chip small{margin-left:6px;font-size:10px;color:var(--accent-soft-ink);background:var(--accent-soft);padding:1px 6px;border-radius:999px}
    .mp-chip-on{background:var(--accent);color:var(--accent-ink);border-color:transparent}
    .mp-chip-on small{background:rgba(255,255,255,.25);color:inherit}
    .mp-tracks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
    .mp-tracks button{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;width:100%;text-align:left;border:0;background:transparent;color:var(--ink);padding:8px 10px;border-radius:10px;cursor:pointer;font:500 13px 'DM Sans',sans-serif}
    .mp-tracks button:hover{background:var(--surface)}
    .mp-tracks em{font-style:normal;font-size:11px;color:var(--ink-2)}
    .mp-track-on{background:var(--accent-soft)!important;color:var(--accent-soft-ink)!important}
    .mp-toggles{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;color:var(--ink-2)}
    .mp-toggles label{display:flex;align-items:center;gap:7px;cursor:pointer}
    .mp-toggles input{accent-color:var(--accent)}
    @media(prefers-reduced-motion:reduce){.mp-bpm-live b{animation:none}}
  `]
})
export class MusicPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() activity = 'running';
  @ViewChild('viz', { static: true }) viz!: ElementRef<HTMLCanvasElement>;
  readonly order = PLAYLIST_ORDER;
  readonly playlists = PLAYLISTS;
  matched = playlistForActivity('running');
  private frame = 0;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(public music: MusicService, public voice: VoiceCueService, private zone: NgZone) {}

  ngOnChanges(): void {
    this.matched = playlistForActivity(this.activity);
    this.music.matchActivity(this.activity);
  }

  ngAfterViewInit(): void { this.zone.runOutsideAngular(() => this.draw()); }
  ngOnDestroy(): void { cancelAnimationFrame(this.frame); }

  private draw = (): void => {
    this.frame = requestAnimationFrame(this.draw);
    const canvas = this.viz.nativeElement; const g = canvas.getContext('2d'); if (!g) return;
    const w = canvas.width, h = canvas.height;
    const style = getComputedStyle(canvas);
    const accent = style.getPropertyValue('--accent').trim() || '#4fd1c0';
    const light = style.getPropertyValue('--accent-light').trim() || accent;
    g.clearRect(0, 0, w, h);
    const bars = 40, gap = 4, bw = (w - gap * (bars - 1)) / bars;
    if (!this.data || this.data.length !== this.music.binCount) this.data = new Uint8Array(this.music.binCount);
    const live = this.music.playing() && this.music.frequencyData(this.data);
    const grad = g.createLinearGradient(0, h, 0, 0); grad.addColorStop(0, accent); grad.addColorStop(1, light);
    g.fillStyle = grad;
    for (let i = 0; i < bars; i++) {
      // Skew toward the lower bins where most musical energy lives.
      const bin = Math.min(this.data.length - 1, Math.floor(Math.pow(i / bars, 1.5) * this.data.length * 0.9));
      const level = live ? this.data[bin] / 255 : 0.04;
      const bh = Math.max(3, level * (h - 6));
      const x = i * (bw + gap), y = h - bh;
      g.beginPath(); (g as CanvasRenderingContext2D).roundRect?.(x, y, bw, bh, 3) ?? g.rect(x, y, bw, bh); g.fill();
    }
  };
}
