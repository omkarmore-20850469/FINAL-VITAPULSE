# VitaPulse — final UI and activity-motion update

## UI changes
- Kept only two themes: Light and Dark. The slider is available while signed in and on auth screens, and the selected choice is saved in `localStorage`.
- Used a calm grey/teal-tinted workspace background, stronger near-black text in Light mode, and a charcoal sidebar with high-contrast text.
- Added translucent glass-style hover and active navigation states, with stronger outlines and subtle depth.
- Kept the Dark theme contrast appropriate for dark surfaces.

## Activity motion
The `app-runner-3d` component maps exercise names to separate movement profiles:
- Running: fast alternating gait and airborne bounce.
- Walking: slower, shorter stride.
- Cycling: cyclist posture, visible bicycle frame, rotating wheels, and pedalling.
- Yoga & Stretching: one combined recovery activity that alternates a calm overhead yoga pose with gentle side reaches.
- Squats: repeated controlled descent/rise with knee/hip bending.
- Push-ups: horizontal plank pose and repeated down/up movement.

The full 3D preview appears beside the active timer and in the floating workout card. Small CSS motion markers remain in the exercise selection cards to avoid creating many simultaneous WebGL contexts on the same page. The 3D camera is reframed when the activity changes so wide/ground-level movements are not framed like running.

## Existing account and database
The backend seeds the combined **Yoga & Stretching** activity. For older local databases, the API and Angular UI hide the separate legacy **Yoga** and **Stretching** choices, while leaving their database rows in place so historical workouts keep valid exercise references. No database or user account is deleted.

## Build verification
The project source and archive structure were checked. A full Angular build could not be run in this environment because `npm install` timed out. The .NET SDK is not installed in this environment. On Windows, from `vitapulse-angular20`, run `npm install` and `npm run build`; from `vitapulse-dotnet`, run `dotnet restore`, `dotnet build`, and `dotnet run` with the .NET 10 SDK installed.
