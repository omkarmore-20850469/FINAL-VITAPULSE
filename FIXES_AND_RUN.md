# VitaPulse repair package — Angular 20 + .NET 10

## What was fixed
- Backend project targets .NET 10 and uses EF Core SQLite 10 / JWT Bearer 10.
- SQLite database path is resolved relative to `vitapulse-dotnet`, even when the API is launched from a different working directory.
- Angular protected routes validate the stored token using `/api/auth/me`. Stale sessions are cleared instead of silently allowing the dashboard to open.
- Workout endpoints check that the current account and selected exercise exist before inserting. This prevents a stale token from causing SQLite `FOREIGN KEY constraint failed`.
- Login and registration trim email/name inputs; login no longer blocks older valid passwords merely because they are shorter than the signup minimum.
- README reflects the .NET 10 setup.

## Requirements on Windows
- .NET 10 SDK
- Node.js 20.19+ or 22.12+ and npm
- Internet access for the first `npm install` and `dotnet restore`

## Start the backend
Open PowerShell in the extracted project root:

```powershell
cd .\vitapulse-dotnet
dotnet --list-sdks
dotnet restore
dotnet build
dotnet run
```

Keep this terminal open. Expected API address: `http://localhost:5080`.
Health check: open `http://localhost:5080/health`.
Swagger: `http://localhost:5080/swagger` in Development.

## Start the Angular frontend
Open a second PowerShell window in the extracted project root:

```powershell
cd .\vitapulse-angular20
node --version
npm --version
npm install
npm run build
npm start
```

Open `http://localhost:4200`.

## Important first-login note
The uploaded ZIP does not include your local SQLite database file or browser's local storage. After opening this repaired copy, the app will clear a stale login token when the API validates it. If the previous account does not exist in the database for this extracted copy, create a new account through **Create account**. Do not delete `vitapulse.db` if it contains data you want to keep.

## If anything still fails
Copy the complete output of:
- `dotnet build` from `vitapulse-dotnet`
- `npm run build` from `vitapulse-angular20`
- browser DevTools Console / Network error for the failing action

This environment could not complete npm dependency installation, and it does not have a runnable .NET SDK, so the source changes are packaged but must still be compiled on your Windows machine.
