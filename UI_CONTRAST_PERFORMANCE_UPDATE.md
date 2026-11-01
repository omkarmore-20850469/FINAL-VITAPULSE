# VitaPulse UI Contrast & Performance Polish

This update preserves the existing Angular/.NET project and yoga/stretching focus while refining the UI layer.

## What changed
- Increased contrast on light/white surfaces: primary text uses deep navy/charcoal and supporting text uses readable slate.
- Kept white text on intentionally dark hero and primary-action surfaces, where it remains legible.
- Improved light-mode card borders, surface depth, input/placeholder contrast, and focus-visible accessibility rings.
- Added responsive spacing adjustments for tablet and mobile widths.
- Reduced motion for users who enable the operating-system reduced-motion preference.
- Kept the existing dark theme and app logic intact; changes are primarily CSS overrides to reduce regression risk.

## Apply / run
Open `VitaPulse_Advanced_Angular20_DotNet/vitapulse-angular20`, install dependencies with `npm install`, then run `npm start`. Build verification requires Node.js and Angular CLI dependencies to be installed.
