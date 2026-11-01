/** Workout music catalogue: one playlist per workout. All tracks are original, synthesised by tools/generate_tracks.py (royalty-free). */
export interface Track { id: string; title: string; artist: string; bpm: number; src: string; }
export type PlaylistId = 'running' | 'cycling' | 'walking' | 'yoga' | 'stretching' | 'squats' | 'pushups';
export interface Playlist { id: PlaylistId; name: string; blurb: string; tracks: Track[]; }

const T = (id: string, title: string, bpm: number): Track => ({ id, title, bpm, artist: 'VitaPulse Originals', src: `assets/music/${id}.mp3` });

export const PLAYLISTS: Record<PlaylistId, Playlist> = {
  running: {
    id: 'running', name: 'Running', blurb: 'Full-power hype beats · 148–172 BPM',
    tracks: [T('overdrive', 'Overdrive', 148), T('red-line', 'Red Line', 156), T('fire-lap', 'Fire Lap', 160), T('adrenaline', 'Adrenaline', 172)]
  },
  cycling: {
    id: 'cycling', name: 'Cycling', blurb: 'Driving melodic house · 128–140 BPM',
    tracks: [T('open-road', 'Open Road', 128), T('hill-climb', 'Hill Climb', 132), T('cadence', 'Cadence', 136), T('power-surge', 'Power Surge', 140)]
  },
  walking: {
    id: 'walking', name: 'Walking', blurb: 'Bright feel-good grooves · 112–124 BPM',
    tracks: [T('green-light', 'Green Light', 112), T('citrus-morning', 'Citrus Morning', 116), T('sunrise-stride', 'Sunrise Stride', 120), T('cool-breeze', 'Cool Breeze', 124)]
  },
  yoga: {
    id: 'yoga', name: 'Yoga', blurb: 'Slow ambient for flow and breath · 60–66 BPM',
    tracks: [T('still-water', 'Still Water', 60), T('sun-salutation', 'Sun Salutation', 62), T('slow-breath', 'Slow Breath', 66)]
  },
  stretching: {
    id: 'stretching', name: 'Stretching', blurb: 'Soft, spacious calm · 52–58 BPM',
    tracks: [T('soft-landing', 'Soft Landing', 52), T('morning-light', 'Morning Light', 54), T('deep-forest', 'Deep Forest', 58)]
  },
  squats: {
    id: 'squats', name: 'Squats', blurb: 'Slow, heavy, dark grooves · 88–92 BPM',
    tracks: [T('after-hours', 'After Hours', 88), T('iron-will', 'Iron Will', 90), T('midnight-miles', 'Midnight Miles', 92)]
  },
  pushups: {
    id: 'pushups', name: 'Push-ups', blurb: 'Harder dark grooves · 100–108 BPM',
    tracks: [T('neon-rain', 'Neon Rain', 100), T('shadow-lap', 'Shadow Lap', 104), T('last-rep', 'Last Rep', 108)]
  }
};

export const PLAYLIST_ORDER: PlaylistId[] = ['running', 'cycling', 'walking', 'yoga', 'stretching', 'squats', 'pushups'];

/** Picks the playlist that belongs to an exercise name (the user can always switch). */
export function playlistForActivity(name: string): PlaylistId {
  const s = (name || '').toLowerCase();
  if (/yoga|meditat|breath/.test(s)) return 'yoga';
  if (/stretch|mobility|cool/.test(s)) return 'stretching';
  if (/squat/.test(s)) return 'squats';
  if (/push/.test(s)) return 'pushups';
  if (/cycl|bike|biking|spin/.test(s)) return 'cycling';
  if (/walk|hik/.test(s)) return 'walking';
  return 'running';
}
