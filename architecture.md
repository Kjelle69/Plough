# Plough Architecture

This first iteration keeps the app lean while separating menu/application flow from the Three.js runtime.

## Structure

- `src/app/`
  Handles high-level application flow and screen switching between the menu and the 3D game view.
- `src/game/core/`
  Owns the runtime loop, renderer, camera integration, resize handling, and debug/test hooks.
- `src/game/scene/`
  Scene-level setup such as lighting and other environment assembly helpers.
- `src/game/entities/`
  Reusable in-world entities. The current placeholder plow vehicle lives here.
- `src/game/systems/`
  Cross-cutting runtime systems. Input, vehicle movement, plowing/scoring, camera behavior, and fullscreen handling live here.
- `src/game/levels/`
  Level/environment construction. The current prototype course includes obstacle bodies plus plowable snow patches backed by lightweight depth grids and deformerbara 3D snow meshes.
- `src/game/ui/`
  Lightweight DOM-based in-game HUD and overlay elements.
- `src/services/`
  External-facing service abstractions. The leaderboard service is mocked here but already replaceable.
- `src/state/`
  Lightweight persistence and local app state. Player name storage is isolated behind a small store class.

## Current Flow

`src/main.ts` bootstraps `App`, which renders either:

- the menu screen with profile input, placeholders, and leaderboard
- the game screen with a mounted `GameRuntime`

The menu layer never reaches directly into Three.js internals. It only starts or disposes the runtime.

## Replaceable Pieces

- `MockLeaderboardService` implements a `LeaderboardService` interface, so a future PHP API client can replace it without rewriting the menu layer.
- `PlayerProfileStore` owns `localStorage` access, which keeps persistence details out of the UI code.
- `GameInput` unifies keyboard and Gamepad API input into a single vehicle-control shape.
- `VehicleController` now implements a lightweight arcade snow-driving model with velocity, traction loss, lateral slip, plow drag, and damped impact response.
- `PlowRunSystem` now owns the run timer, snow-depth clearing/pushing simulation, score accumulation, and end-of-run state.
- `GameHud` renders the current run state as a DOM overlay without mixing UI concerns into the scene code.
- `GameRuntime` orchestrates the scene and systems rather than owning movement logic directly.

## Next Extension Point

The natural next iteration is making the new 3D snow model more readable and believable: tune snow thickness/displacement, improve camera readability of tracks and banks, add snow-depth resistance directly into gameplay goals, and connect end-of-run results into the mocked leaderboard flow before backend persistence.
