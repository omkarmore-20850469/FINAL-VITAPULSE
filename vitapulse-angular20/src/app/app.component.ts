import { Component, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIf } from '@angular/common';
import { WorkoutSessionService } from './core/workout-session.service';
import { ApiService } from './core/api.service';
import { Runner3dComponent } from './training/runner-3d.component';

type Theme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIf, Runner3dComponent],
  template: `
    <div class="app-shell">
      <aside class="sidebar" *ngIf="api.user()">
        <a class="brand" routerLink="/" aria-label="VitaPulse home">
          <span class="brand-mark">✦</span>
          <span>vita<span class="brand-light">pulse</span><small>YOUR WELLNESS SPACE</small></span>
        </a>
        <div class="nav-label">WORKSPACE</div>
        <a class="nav-item" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}"><span>◫</span> Overview</a>
        <a class="nav-item" routerLink="/training" routerLinkActive="active"><span>↗</span> Start workout</a>
        <a class="nav-item" routerLink="/history" routerLinkActive="active"><span>▤</span> Workout history</a>
        <a class="nav-item" routerLink="/goals" routerLinkActive="active"><span>◎</span> Goals &amp; wellness</a>
        <a class="nav-item" routerLink="/hydration" routerLinkActive="active"><span>♧</span> Hydration tracker</a>
        <a class="nav-item" routerLink="/weekly" routerLinkActive="active"><span>▥</span> Weekly consistency</a>
        <div class="sidebar-bottom">
          <div class="mini-profile">
            <div class="avatar">{{ initials() }}</div>
            <div class="profile-copy"><strong>{{api.user()?.displayName}}</strong><small>Personal account</small></div>
            <button class="icon-btn" title="Sign out" aria-label="Sign out" (click)="logout()">↪</button>
          </div>
          <div class="sidebar-note"><span class="pulse"></span> Every move counts.</div>
        </div>
      </aside>

      <main class="main-area" [class.auth-main]="!api.user()">
        <header class="topbar" *ngIf="api.user()">
          <div><div class="eyebrow">YOUR PERSONAL FITNESS SPACE</div><h2>{{ pageTitle() }}</h2></div>
          <div class="topbar-right">
            <button class="theme-toggle" type="button" (click)="toggleTheme()" [attr.aria-pressed]="theme()==='dark'" [attr.aria-label]="theme()==='dark' ? 'Switch to light mode' : 'Switch to dark mode'">
              <span class="theme-toggle-symbol" aria-hidden="true">{{theme()==='dark' ? '☾' : '☼'}}</span>
              <span class="theme-toggle-track" aria-hidden="true"><span class="theme-toggle-knob"></span></span>
              <span class="theme-toggle-label">{{theme()==='dark' ? 'Dark' : 'Light'}}</span>
            </button>
            <span class="date-chip">◷ &nbsp; {{today}}</span><div class="avatar avatar-small">{{initials()}}</div>
          </div>
        </header>
        <div class="auth-theme-control" *ngIf="!api.user()">
          <button class="theme-toggle" type="button" (click)="toggleTheme()" [attr.aria-pressed]="theme()==='dark'" [attr.aria-label]="theme()==='dark' ? 'Switch to light mode' : 'Switch to dark mode'">
            <span class="theme-toggle-symbol" aria-hidden="true">{{theme()==='dark' ? '☾' : '☼'}}</span>
            <span class="theme-toggle-track" aria-hidden="true"><span class="theme-toggle-knob"></span></span>
            <span class="theme-toggle-label">{{theme()==='dark' ? 'Dark' : 'Light'}}</span>
          </button>
        </div>
        <router-outlet />
        <footer class="footer" *ngIf="api.user()">Built for progress, not perfection <span>✦</span></footer>
      </main>
    </div>
    <aside class="floating-workout" *ngIf="api.user() && workoutSession.active() as running" aria-label="Workout session controls">
      <div class="floating-workout-icon" aria-hidden="true"><app-runner-3d [compact]="true" [activity]="running.exercise.name"></app-runner-3d></div>
      <div class="floating-workout-copy">
        <strong>Workout in progress</strong>
        <span>{{running.exercise.name}}</span>
        <b>{{workoutSession.formatTime(workoutSession.elapsedSeconds())}}</b>
      </div>
      <button class="floating-finish" type="button" (click)="finishFromCorner()" aria-label="Finish current workout">Finish</button>
    </aside>
    <div class="toast" *ngIf="api.toast()" role="status" aria-live="polite">{{api.toast()}}</div>
  `
})
export class AppComponent {
  today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  theme = signal<Theme>(this.readTheme());

  constructor(public api: ApiService, private router: Router, public workoutSession: WorkoutSessionService) {
    this.applyTheme(this.theme());
    if (typeof document !== 'undefined') {
      setInterval(() => {
        const active = this.workoutSession.active();
        document.title = active
          ? `${this.workoutSession.formatTime(this.workoutSession.elapsedSeconds())} • ${active.exercise.name} | VitaPulse`
          : this.defaultTitle();
      }, 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.workoutSession.active() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('VitaPulse workout is still running', { body: `${this.workoutSession.active()?.exercise.name} · ${this.workoutSession.formatTime(this.workoutSession.elapsedSeconds())} elapsed` });
        }
      });
    }
  }

  private readTheme(): Theme {
    try {
      const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem('vitapulse_theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch { return 'light'; }
  }

  setTheme(value: string): void {
    const next: Theme = value === 'dark' ? 'dark' : 'light';
    this.theme.set(next);
    try { localStorage.setItem('vitapulse_theme', next); } catch { /* storage may be disabled */ }
    this.applyTheme(next);
  }

  toggleTheme(): void {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private applyTheme(theme: Theme): void {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme);
  }

  initials(): string {
    return (this.api.user()?.displayName || 'VP').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  }

  pageTitle(): string {
    const p = this.router.url;
    return p.includes('training') ? 'Start a workout' : p.includes('history') ? 'Your workout history' : p.includes('goals') ? 'Goals & wellness' : p.includes('hydration') ? 'Hydration tracker' : p.includes('weekly') ? 'Weekly consistency' : 'Your overview';
  }

  private defaultTitle(): string { return this.pageTitle() + ' | VitaPulse'; }

  async finishFromCorner(): Promise<void> { await this.workoutSession.finish(false); }

  logout(): void {
    this.api.logout();
    this.router.navigateByUrl('/login');
  }
}
