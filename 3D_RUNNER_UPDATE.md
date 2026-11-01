# VitaPulse 3D Athletic Runner Update

This update replaces the running emoji in the active workout timer and persistent floating workout card with an animated procedural 3D athlete rendered by Three.js. It does not require a downloaded character model or additional packages beyond the existing `three` dependency.

## Where it appears
- Active workout timer: larger animated 3D runner beside the elapsed time.
- Floating workout card: compact animated 3D runner remains visible while navigating around the app.
- Exercise cards: small animated runner glyph beside the exercise duration, avoiding one WebGL canvas per card.

## Technical notes
- Character geometry and running gait are generated in `vitapulse-angular20/src/app/training/runner-3d.component.ts`.
- The runner uses Three.js and an articulated procedural character with swinging arms, legs, bent knees, running shoes, lights and a floor halo.
- The active session timer continues to use `WorkoutSessionService`; this update changes the visual treatment, not the timer/session logic.
- The component respects `prefers-reduced-motion` and disposes of its animation frame, observer, renderer, geometry and materials when removed.
- The character is stylized 3D, not photorealistic. A licensed rigged GLB model with professional motion-capture clips can replace it later for more realistic movement.

## Run
From `vitapulse-angular20`:

```powershell
npm install
npm run build
npm start
```

A complete Angular build could not be verified in the packaging environment because npm dependency installation timed out. Please run `npm run build` locally and share any errors if they appear.
