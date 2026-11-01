# VitaPulse — Final Project Package

VitaPulse is a fitness and wellness tracking web application with an Angular 20 frontend and a .NET 10 Web API backed by SQLite.

## Final UI upgrade
- Two appearance modes: Light and Dark, switched with a compact toggle slider.
- Theme selection is available on authenticated pages and login/signup pages.
- Theme preference is saved in browser local storage and restored on refresh. Previous legacy theme values are normalized to Light or Dark.
- Responsive layout for desktop, tablet, and mobile widths.
- Improved accessible labels for appearance controls and toast notifications.
- Reduced-motion preference is respected.

## Main app areas
- Overview dashboard
- Workout session and exercise library
- Workout history
- Goals and wellness
- Hydration tracker
- Weekly consistency
- **Inline 3D workout trainer** powered by Three.js: activity-specific animation beside the active workout timer and within the floating workout card. Running, walking, cycling, yoga-and-stretching, squats, and push-ups use different motion profiles.
- Login and account registration

## Technology
- Angular 20 / TypeScript
- Three.js for interactive WebGL 3D rendering (`three` and `@types/three`)
- .NET 10 / ASP.NET Core Web API
- Entity Framework Core with SQLite
- JWT authentication

## Run on Windows
Install the .NET 10 SDK and Node.js 20.19+ or 22.12+ first.

### 1. Start API (PowerShell window 1)
From the extracted project folder:

```powershell
cd .\vitapulse-dotnet
dotnet restore
dotnet build
dotnet run
```

Check `http://localhost:5080/health`. Keep this terminal open.

### 2. Start Angular (PowerShell window 2)
From the extracted project folder:

```powershell
cd .\vitapulse-angular20
npm install
npm run build
npm start
```

Open `http://localhost:4200` and create an account if needed. Sign in, open **Start workout**, and select an activity. The activity-specific 3D trainer appears beside the running timer and in the floating workout card. A WebGL-capable browser is required.

## 3D model note
The included avatar is generated from Three.js geometry and animated procedurally, so the project does not depend on a third-party character download. It is a stylized interactive 3D avatar, not a photorealistic scanned human or a pose-estimation system. A licensed rigged GLB character and motion clips can be added later for more realistic anatomy and movement.

## Important verification note
The source has been updated and packaged, but this environment could not finish `npm install` (network/dependency retrieval timed out) and does not have the .NET SDK. Therefore, a successful local production build has **not** been verified here. Run the build commands above on the target Windows machine and resolve any environment-specific errors before submitting or deploying.

## Database and privacy
The ZIP does not contain your local SQLite database or browser storage. Do not delete an existing database if you need its data. This project is a wellness tracker, not a medical diagnostic tool; any fitness/calorie estimates should be treated as estimates.


## Final UI polish (28 Oct 2026)
- Replaced the five-way appearance select with a persistent Light/Dark switch. Legacy saved themes are normalized to Light unless the stored value is `dark`.
- Refined the page background, typography contrast, glass active navigation tab, cards, and floating workout control.
- The 3D workout renderer now chooses a movement profile by the selected exercise: Running, Walking, Cycling (with a procedural bicycle), Squats, Push Ups, and a combined Yoga & Stretching sequence. Activity mini-markers on workout cards also use distinct CSS motion cues.
- Verification note: run `npm run build` and the .NET build locally; this environment has not yet completed dependency-backed builds.
