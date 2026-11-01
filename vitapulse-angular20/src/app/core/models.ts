export interface Exercise { id: string; name: string; duration: number; calories: number; description?: string; category?: string; }
export interface Workout { id: string; exerciseId: string; name: string; duration: number; calories: number; date: string; state: 'completed'|'cancelled'; }
export interface AuthResponse { token: string; email: string; displayName: string; }
