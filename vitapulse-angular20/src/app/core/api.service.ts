import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, Exercise, Workout } from './models';

type CurrentUser = { id?: number; email: string; displayName: string };

@Injectable({ providedIn: 'root' })
export class ApiService {
  // Keep this URL aligned with Properties/launchSettings.json and the backend launch script.
  readonly baseUrl = 'http://localhost:5080/api';
  readonly user = signal<CurrentUser | null>(this.readUser());
  readonly toast = signal('');
  private sessionValidated = false;
  private sessionValidation?: Promise<boolean>;

  constructor(private http: HttpClient) {}

  private readUser(): CurrentUser | null {
    try {
      const value = typeof localStorage === 'undefined' ? null : localStorage.getItem('vitapulse_user');
      return value ? JSON.parse(value) as CurrentUser : null;
    } catch {
      return null;
    }
  }

  private readToken(): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem('vitapulse_token');
    } catch {
      return null;
    }
  }

  async request<T>(url: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown): Promise<T> {
    try {
      if (method === 'GET') return await firstValueFrom(this.http.get<T>(this.baseUrl + url));
      if (method === 'DELETE') return await firstValueFrom(this.http.delete<T>(this.baseUrl + url));
      return await firstValueFrom(this.http.post<T>(this.baseUrl + url, body));
    } catch (error: any) {
      const status = error?.status;
      const serverMessage = error?.error?.message || error?.error?.title;
      const message = serverMessage
        || (status === 0
          ? 'Cannot connect to API. Start the .NET backend on port 5080.'
          : status === 401
            ? 'Your session has expired. Please sign in again.'
            : status === 400
              ? 'Some submitted information is invalid. Check your entries and try again.'
              : `Request failed (${status ?? 'unknown'}).`);
      this.notify(message);
      throw new Error(message);
    }
  }

  async validateSession(): Promise<boolean> {
    if (!this.readToken() || !this.user()) {
      this.logout();
      return false;
    }
    if (this.sessionValidated) return true;
    if (this.sessionValidation) return this.sessionValidation;

    this.sessionValidation = this.request<CurrentUser>('/auth/me')
      .then(current => {
        this.user.set({ email: current.email, displayName: current.displayName, id: current.id });
        localStorage.setItem('vitapulse_user', JSON.stringify(this.user()));
        this.sessionValidated = true;
        return true;
      })
      .catch(() => {
        this.logout();
        return false;
      })
      .finally(() => {
        this.sessionValidation = undefined;
      });
    return this.sessionValidation;
  }

  async login(email: string, password: string): Promise<void> {
    const response = await this.request<AuthResponse>('/auth/login', 'POST', { email: email.trim(), password });
    this.saveAuth(response);
  }

  async register(displayName: string, email: string, password: string): Promise<void> {
    const response = await this.request<AuthResponse>('/auth/register', 'POST', {
      displayName: displayName.trim(), email: email.trim(), password
    });
    this.saveAuth(response);
  }

  private saveAuth(response: AuthResponse): void {
    localStorage.setItem('vitapulse_token', response.token);
    const current = { email: response.email, displayName: response.displayName };
    localStorage.setItem('vitapulse_user', JSON.stringify(current));
    this.user.set(current);
    this.sessionValidated = true;
    this.sessionValidation = undefined;
  }

  logout(): void {
    try {
      localStorage.removeItem('vitapulse_token');
      localStorage.removeItem('vitapulse_user');
    } catch { /* storage may be unavailable in privacy mode */ }
    this.user.set(null);
    this.sessionValidated = false;
    this.sessionValidation = undefined;
  }

  exercises(): Promise<Exercise[]> {
    return this.request<Exercise[]>('/exercises');
  }

  history(): Promise<Workout[]> {
    return this.request<Workout[]>('/workouts');
  }

  saveWorkout(workout: { exerciseId: string; duration: number; calories: number; state: 'completed' | 'cancelled' }): Promise<Workout> {
    const exerciseId = Number(workout.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId < 1) {
      return Promise.reject(new Error('Choose a valid exercise before saving the workout.'));
    }
    return this.request<Workout>('/workouts', 'POST', { ...workout, exerciseId });
  }

  notify(message: string): void {
    this.toast.set(message);
    setTimeout(() => {
      if (this.toast() === message) this.toast.set('');
    }, 4500);
  }
}
