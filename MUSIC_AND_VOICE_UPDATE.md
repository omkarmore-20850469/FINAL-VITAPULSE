# Workout music (one playlist per workout), BPM-synced trainer and a calm female voice guide

## What changed in this update
**UI is unchanged.** The music panel, chips, track list, visualizer and toggles look and behave exactly as before. The chips now show one playlist per workout, and the voice sounds different.

### 1. A different playlist for every workout (24 original tracks)
| Workout | Sound | BPM | Tracks |
|---|---|---|---|
| **Running** | full-power hype: sidechained supersaws, risers, snare rolls, two drops | 148-172 | Overdrive, Red Line, Fire Lap, Adrenaline |
| **Cycling** | driving melodic minor-key house | 128-140 | Open Road, Hill Climb, Cadence, Power Surge |
| **Walking** | bright feel-good house: bouncy bass, chord stabs, bell hook | 112-124 | Green Light, Citrus Morning, Sunrise Stride, Cool Breeze |
| **Yoga** | slow ambient: warm pads, soft electric piano, bells, ocean air | 60-66 | Still Water, Sun Salutation, Slow Breath |
| **Stretching** | softer, more spacious ambient | 52-58 | Soft Landing, Morning Light, Deep Forest |
| **Squats** | slow, heavy, dark lo-fi groove: 808 sub, swung hats, vinyl crackle | 88-92 | After Hours, Iron Will, Midnight Miles |
| **Push-ups** | harder, faster dark groove | 100-108 | Neon Rain, Shadow Lap, Last Rep |

Starting a workout opens its own playlist (tagged "matched"). "Yoga & Stretching" is one exercise in the app, so it opens Yoga; Stretching is one tap away. The user can switch to any playlist at any time.

### 2. More advanced music engine (`tools/generate_tracks.py`)
- Stereo mixes with per-note panning, convolution reverb, ping-pong delay and sidechain pumping.
- Real arrangements: intro > build (riser + snare roll) > drop > breakdown > drop 2 > outro (Running/Cycling/Walking); verse/hook/breakdown forms for Squats and Push-ups; slow evolving sections for Yoga and Stretching.
- 7th / 9th / sus chords with smooth voice-leading, plus generated 4-bar hook melodies that repeat and answer themselves.
- Instruments: FM electric piano, 808 sub, band-limited supersaw, plucks, bells, vinyl crackle, ocean air. Everything is synthesised (no samples) so it is royalty-free.
- Still starts exactly on beat 1 and is a whole number of bars, so the 3D trainer's stride keeps locking to `audio.currentTime * bpm / 60`. (Verified: kicks land within ~3 ms of the grid after MP3 encoding.)
- Re-generate or tweak: `python3 tools/generate_tracks.py` (all) or `python3 tools/generate_tracks.py fire-lap` (one). Needs numpy, scipy, ffmpeg. The `TRACKS` table at the bottom controls BPM, key, chords and seed for every track.

### 3. Calm, soothing female voice (`core/voice-cue.service.ts`)
- Scores every English voice installed on the device and picks the best natural-sounding female one, e.g. Edge "Sonia / Jenny / Aria / Neerja (Natural)", Chrome "Google UK English Female", macOS "Ava / Samantha / Serena", then Zira as a fallback. Male and novelty voices are never chosen.
- Slower delivery (rate 0.9) with a gentle pitch, short phrases, and numbers spoken as words ("five, four, three...").
- Wording follows the workout (e.g. "Settle in, and breathe slowly" for Yoga, "Stay focused, one steady rep at a time" for Squats) but the delivery is always calm.
- Music still ducks while she speaks. Each cue still fires once per session.
- If no female voice can be confirmed (some Android browsers hide voice gender), the pitch is lifted slightly so the default voice still sounds gentle.
- Optional: `voice.setVoice('<exact voice name>')` pins a specific installed voice.

## Files touched
`src/app/music/playlists.ts`, `src/app/music/music.service.ts` (default mood), `src/app/core/voice-cue.service.ts`, `tools/generate_tracks.py`, `src/assets/music/*.mp3` (24 new tracks, old v1 tracks removed).

## Notes
Music is off until the user presses play (browser autoplay rules). Volume, BPM sync and voice-cue choices are remembered in localStorage. Voice quality depends on the voices the device has: Edge and Chrome on desktop sound best, and on Windows the "Natural" voices need to be available in Edge.
