# VitaPulse workout-session UI update

## Changes
- Added a persistent floating workout companion in the app corner while a session is active.
- Timer is calculated from the saved start timestamp, so route changes, page refreshes, and background-tab throttling do not reset elapsed time.
- The active session is stored in browser localStorage and synchronized across same-origin browser tabs.
- The corner Finish button saves the workout as completed; the in-session early-end action remains available.
- Added animated runner cues beside the active timer and exercise duration labels.
- Browser-tab title shows the elapsed timer and exercise name while a workout is active.
- If browser notifications were already permitted, switching away from the tab can show a reminder that the session is still running. The app does not request notification permission automatically.
- Removed the 3D Motion Lab navigation item and route.
- Increased text contrast in the Balanced theme so secondary text is near-black rather than muted grey.

## Test after extracting
1. Run the .NET backend and Angular frontend as described in `FIXES_AND_RUN.md`.
2. Sign in, open Start workout, and start an exercise.
3. Navigate to Overview or Workout history. The floating timer should remain visible and continue.
4. Refresh the page. The active session should restore with the elapsed time preserved.
5. Click Finish in the floating card. The session should be saved and the card should disappear.
6. If you have two browser tabs open to the same local app, start a session in one and confirm the other tab receives the floating session widget.

Note: the frontend and backend builds have not been run in this environment. Verify with `npm run build` and `dotnet build` on the target machine.
