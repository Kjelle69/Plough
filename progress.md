Original prompt: Project name: **Plough**

We are building a **single-player 3D web game** called **Plough** using **Three.js + TypeScript + Vite** on the client side. The game will later use my **one.com PHP + MariaDB** backend for a persistent leaderboard, but in this first step you should use **mocked local data** for leaderboard rendering and keep the API layer clean and replaceable.

I want a **good long-term structure from the start**, but still keep the implementation lean and practical. Please follow an **iterative workflow**: make one solid step at a time, validate it, and keep the codebase clean and extensible.

## Goal for this iteration

Set up the initial project structure and implement a first usable version with:

1. A **main menu / start page**
2. A visible **Top 10 leaderboard panel** on that page using mocked data
3. A **player name input** stored in localStorage
4. UI placeholders for future:

   * difficulty selection
   * vehicle/plow machine selection
   * login/profile
5. A button to **start the game**
6. A separate **3D game view** using Three.js
7. A minimal playable placeholder scene with:

   * ground plane
   * simple lighting
   * a placeholder plow vehicle (simple box-based vehicle is fine)
   * orbit-free gameplay camera (not OrbitControls)
   * clean render loop
   * resize handling
8. A way to return from the game view to the main menu

## Important architecture requirements

Use a structure similar to this, adjusted as needed:

* `src/app/`
* `src/game/core/`
* `src/game/scene/`
* `src/game/entities/`
* `src/game/systems/`
* `src/game/levels/`
* `src/game/ui/`
* `src/services/`
* `src/state/`

Keep **menu/app logic separate from game logic**.

## Technical requirements

* Use **TypeScript**
* Use **Vite**
* Use **Three.js**
* No React unless absolutely necessary; prefer lightweight DOM/UI for now
* No physics engine yet
* No real backend calls yet
* Keep the leaderboard service abstracted so we can later swap mock data for one.com PHP API
* Keep the player profile/login as placeholder-only for now
* Use simple, readable code and avoid overengineering

## UI/UX direction

The game should feel like a clean early prototype:

* dark or winter-inspired menu
* readable panels
* title: **Plough**
* leaderboard visible directly on the start page
* future-expandable layout

## Deliverables for this iteration

Please implement:

* project structure
* initial app bootstrap
* menu screen
* mocked leaderboard service
* local player name persistence
* game screen with Three.js scene
* navigation between menu and game
* brief `architecture.md` explaining the structure
* `progress.md` updated with what was done and next suggested step

## Validation

After implementation:

* verify the app runs
* verify the menu loads
* verify leaderboard renders
* verify player name persists
* verify clicking Play enters the 3D scene
* verify returning to menu works

## Do not implement yet

* real snow-plowing gameplay
* collision/damage logic
* timer/score logic
* server API integration
* authentication
* vehicle selection logic beyond placeholder UI
* difficulty logic beyond placeholder UI

## Next step suggestion

When this step is complete, the next likely iteration should be:
“Add controllable vehicle movement in the 3D scene with a simple chase camera and basic obstacle collisions.”

Please start by creating the structure and implementing only this first iteration cleanly.

## Progress Log

- Initialized a Vite + TypeScript project and added `three` as the only runtime dependency for this iteration.
- Replaced the starter with an app shell that separates menu flow from the Three.js game runtime.
- Added a mocked leaderboard service behind an interface so the menu can later switch to a PHP/MariaDB-backed API client without structural changes.
- Added `PlayerProfileStore` to isolate local player-name persistence in `localStorage`.
- Implemented a winter-themed prototype menu with player-name input, future UI placeholders, a visible Top 10 leaderboard, and a start button.
- Implemented a separate game view with a ground plane, lighting, placeholder plow vehicle, fixed gameplay camera, render loop, resize handling, fullscreen toggle, and menu return path.
- Added `window.render_game_to_text` and `window.advanceTime(ms)` hooks to support deterministic browser validation for later iterations.
- Validation complete:
  - `npm run build` passes.
  - Menu loads with the `Plough` title and visible leaderboard panel.
  - Mock leaderboard renders 10 entries.
  - Player name persists across reload via `localStorage`.
  - Clicking `Start Game` enters the Three.js scene.
  - Clicking `Return to Menu` returns to the menu successfully.
  - Browser screenshots and runtime state artifacts were captured under `output/web-game/`.

## Next Suggested Step

- Add controllable vehicle movement in the 3D scene with a simple chase camera and basic obstacle collisions.

## Iteration Notes

- Current request: add controllable vehicle movement and support XBOX controller input.
- Completed:
  - Added `GameInput` to unify keyboard controls and Gamepad API controller input.
  - Added `VehicleController` for acceleration, steering, braking, reverse behavior, and simple collision blocking.
  - Replaced the passive rotating scene with a prototype course containing obstacle meshes and collision bodies.
  - Added a chase camera that follows the vehicle instead of the original fixed camera.
  - Updated the game header copy to show keyboard and XBOX controller controls.
  - Extended runtime debug state so validation can confirm active input source, speed, and collisions.

## Validation Notes

- `npm run build` passes after the movement/input changes.
- Keyboard validation via the browser game client confirmed forward movement, steering, and chase-camera follow behavior.
- Simulated Gamepad API validation confirmed:
  - active input source switches to `gamepad`
  - vehicle responds to XBOX-style analog stick + trigger input
  - collision blocking triggers against `Snowbank Alpha`
- Validation artifacts were written under `output/web-game/drive-keyboard` and `output/web-game/drive-gamepad`.

## Updated Next Suggested Step

- Add actual plowing gameplay on top of the new movement layer: plowable snow lanes, route progress, score/timer logic, and more deliberate obstacle/course design.

## Current Iteration

- Added plowable snow patches directly into the prototype course and exposed them through the level definition.
- Added `PlowRunSystem` to manage timer, snow clearing, score, and active/complete/failed run states.
- Added a lightweight `GameHud` overlay for score, time, cleared percentage, patch count, and run-status messaging.
- Added run restart support with the `R` key and updated the game header instructions accordingly.
- Extended `render_game_to_text` with gameplay state so automated validation can confirm timer/progress/score transitions.

## Current Validation

- `npm run build` passes after the gameplay/HUD changes.
- Browser game-client capture confirmed the new HUD renders correctly over the scene.
- Targeted browser validation confirmed:
  - clearing snow increases score and cleared percentage
  - timer counts down and transitions the run to `failed` at 0 seconds
  - pressing `R` resets vehicle position, timer, score, and cleared progress
- Validation artifacts were written under `output/web-game/plow-run` and `output/web-game/plow-targeted`.

## Updated Next Suggested Step

- Connect end-of-run results into the menu/leaderboard flow with a mock score submission path, then prepare that service boundary for the future PHP backend.

## Physics Iteration

- Replaced the old speed-only vehicle controller with a lightweight arcade snow-driving model built on persistent velocity.
- Added traction loss on snow, plow drag while actively clearing snow, lateral slip during turning, and damped obstacle impact response.
- Extended debug state with `lateralSpeed`, `traction`, and `impact` so feel/tuning can be inspected through browser automation.
- Adjusted the prototype course spawn and first snow lane so the new handling model can be exercised immediately from the start position.

## Physics Validation

- `npm run build` passes after the physics refactor.
- Browser validation confirmed:
  - straight acceleration ramps the vehicle up to speed from spawn
  - driving onto the first snow lane lowers traction and starts scoring/clearing
  - steering at speed produces measurable lateral slip
  - hitting `Snowbank Alpha` now produces a damped impact response with rebound instead of an instant dead stop
- Validation artifacts were written under `output/web-game/physics-pass`.

## Updated Next Suggested Step

- Tune the handling model and course design together, then connect completed runs into a mock score-submission flow so the prototype starts behaving like a full loop instead of a sandbox run.

## Snow Simulation Iteration

- Replaced simple per-patch `clearedArea` bookkeeping with a lightweight snow-depth grid for each plowable patch.
- Added per-patch canvas textures so plowed tracks and pushed snow banks update visually as the blade moves through snow.
- Updated plowing progress/scoring to derive from actual snow-depth reduction instead of the old area approximation.
- Updated snow-contact checks so vehicle traction loss and plow drag now read from local snow depth at the blade position.

## Snow Simulation Validation

- `npm run build` passes after the snow-depth refactor.
- Browser validation confirmed:
  - entering the first lane lowers traction and highlights the active patch
  - score/progress increase when the blade passes through snow
  - the snow patch texture updates persistently to show a driven/plowed path
- Validation artifacts were written under `output/web-game/snow-depth`.

## Updated Next Suggested Step

- Tune the snow-depth visual contrast and displacement rates, then connect completed runs into a mock score-submission flow so the prototype starts behaving like a proper full loop.

## 3D Snow Iteration

- Replaced the flat snow texture patches with deformerbara 3D snow meshes driven by the existing snow-depth grid.
- Each snow patch now updates vertex heights and normals from local snow depth, so snow thickness is represented as actual geometry.
- Kept the existing plow displacement logic, so the same simulation now affects both visuals and handling drag/traction.

## 3D Snow Validation

- `npm run build` passes after the 3D snow mesh refactor.
- Browser validation confirmed:
  - the first snow lane renders as an actual raised snow body instead of only a flat overlay
  - plowing the lane updates score/progress and keeps the active patch highlighted
  - the deformed snow mesh persists after driving through it
- Validation artifacts were written under `output/web-game/snow-heightfield`.

## Updated Next Suggested Step

- Tune snow height scale, displacement spread, and camera readability so tracks and side banks are much more obvious during play, then connect finished runs into a mock score-submission flow.

## SnowField Refactor

- Replaced the old patch-clearing/plow logic with separate systems:
  - `SnowField` owns the cell grid, base height, dynamic snow height, and render mesh
  - `PlowInteractionSystem` computes the blade footprint and performs cut/push mass redistribution
  - `SnowSimulationSystem` performs one light relaxation pass and mesh updates
  - `PlowScoringSystem` reads snow state for score/progress without owning deformation
- The plow now affects a rectangular blade region instead of point-like sampling.
- Removed mass is accumulated from blade cells and redistributed mostly forward, secondarily sideways.
- Added a debug blade outline object in the interaction system, disabled by default.

## SnowField Validation

- `npm run build` passes after the system refactor.
- Browser validation confirmed:
  - the snow remains a live deforming mesh
  - the plow carves a clearer trench under the blade region
  - material builds forward into a visible pile zone
  - gameplay state still updates separately from the deformation systems
- Validation artifacts were written under `output/web-game/snow-refactor`.

## Tuning Controls

- `CUT_STRENGTH` in `PlowInteractionSystem.ts`: how aggressively the blade removes snow.
- `FORWARD_WEIGHT` in `PlowInteractionSystem.ts`: how much removed mass goes to the forward pile zone.
- `SIDE_WEIGHT` in `PlowInteractionSystem.ts`: how much mass spills sideways.
- `relaxationPasses` and `relaxationFactor` in `SnowSimulationSystem.ts`: how much smoothing/flow happens after redistribution.
- `DYNAMIC_HEIGHT_SCALE` and `MAX_DYNAMIC_HEIGHT` in `SnowField.ts`: how tall the dynamic snow layer renders and how large piles may grow.

## Updated Next Suggested Step

- Improve blade-angle behavior, add accumulation limits directly in front of the blade, add better side spill shaping, and feed front-pile mass back into vehicle resistance.

## Camera And Snow Readability Iteration

- Added right-mouse drag orbit to the chase camera so the player can rotate the follow camera around the plow without switching to free orbit controls.
- Camera orbit is implemented as yaw/pitch offsets on top of the existing chase rig, preserving the gameplay follow behavior.
- Changed snow mesh rendering to exaggerate negative deformation more than positive buildup so plowed trenches read deeper and sharper.
- Replaced the old symmetric snow relaxation with one-way excess-snow flow, which lets piles settle slightly without filling trenches back in.

## New Tuning Notes

- `TRENCH_HEIGHT_SCALE` in `SnowField.ts`: controls how aggressively cut snow renders downward.
- `PILE_HEIGHT_SCALE` in `SnowField.ts`: controls how strongly pushed snow renders upward.
- `relaxationFactor` in `SnowSimulationSystem.ts`: controls how fast piled snow spreads outward.
- The relaxation pass now only moves excess snow above baseline, so increasing it should widen piles rather than erase plowed tracks.

## Validation Notes

- `npm run build` passes after the chase-camera and snow-readability changes.
- Browser validation confirmed the chase camera now responds to right-mouse drag:
  - before drag: `camera = { x: -15.48, y: 5.00, z: 0.00 }`
  - after drag: `camera = { x: -3.56, y: 6.94, z: 0.16 }`
- Automated gameplay capture through the first snow lane still updates score/progress and renders the deformed snow mesh without console errors.
- Artifacts were written under `output/web-game/camera-snow-pass`, `output/web-game/camera-snow-long-pass`, and `output/web-game/camera-rmb-pass`.

## Updated Next Suggested Step

- Make blade-angle and vehicle-heading matter more for where the front pile builds, then add resistance from front-pile mass so heavy snow materially slows the plow.

## Large Snowfield And Route Mask Iteration

- Replaced the old multi-patch course layout with one large continuous `SnowField` that covers the playable yard.
- Added `routeTargets` to the level definition so scoring/progress now track hidden road segments under the snow instead of the full snow surface.
- Refactored `PlowScoringSystem` to build per-route cell masks from the large field and compute progress only inside those masked road areas.
- Updated the prototype course with simple roadside marker posts so the hidden route can be read visually while driving.
- Updated the UI copy to describe a hidden route under the snow rather than isolated bright snow lanes.

## Validation Notes

- `npm run build` passes after the large-field and route-mask refactor.
- Browser validation confirmed:
  - the scene now renders as one broad snow-covered yard
  - roadside marker posts are visible around the hidden route
  - HUD progress now reports `0/4 zones` style progress for the masked route segments instead of full-surface snow
  - score/progress still increase while driving and plowing along the intended route
- Artifacts were written under `output/web-game/route-mask-pass`.

## Updated Next Suggested Step

- Add blade-angle-aware snow displacement and stronger vehicle resistance from heavy accumulated snow so route-following and plow positioning start to matter more moment to moment.

## Deep Cut Tuning Iteration

- Tuned the snow renderer so `dynamicHeight = 0` now renders at road/ground level instead of leaving a floating residual snow layer.
- Reduced base undulation and darkened low snow values so cleared road reads much more clearly against the surrounding snowpack.
- Increased blade cut strength and center weighting so the plow removes more snow per pass and leaves sharper shoulders at the trench edges.
- Reduced post-plow relaxation further so the cut stays visible and the snow pile in front does not slump back as quickly.

## Tuning Notes

- `BASE_SNOW_HEIGHT` in `SnowField.ts`: controls the resting snow thickness above ground before plowing.
- `CUT_STRENGTH` in `PlowInteractionSystem.ts`: controls how quickly the plow reaches ground level.
- `COMPACTION_RATIO` in `PlowInteractionSystem.ts`: controls how much removed snow remains as visible piled volume after compaction.
- `FORWARD_WEIGHT` and `SIDE_WEIGHT` in `PlowInteractionSystem.ts`: control how much removed snow stays in the front pile versus spilling sideways.
- `relaxationFactor` in `SnowSimulationSystem.ts`: controls how quickly pushed snow slumps outward after the cut.

## Compaction Tuning Iteration

- Kept the stronger cut so the blade still reaches road level quickly.
- Added `COMPACTION_RATIO` so only part of the removed snow becomes visible pile height, which reduces the oversized bow wave in front of the blade.
- Reduced forward and side deposition weights slightly so the trench stays strong while the pile reads denser and lower.

## Validation Notes

- `npm run build` passes after the compaction tuning pass.

## Persistent Drift Iteration

- Disabled snow relaxation by default in `SnowSimulationSystem`, so plowed trenches and built-up drifts now stay where they were created for the whole session.
- The simulation still supports relaxation as an option, but the runtime default is now fully static after each plow cut.

## Validation Notes

- `npm run build` passes after disabling relaxation.

## Front Pile And Reverse Tuning Iteration

- Increased the visible front-pile buildup again by raising `COMPACTION_RATIO` and moving more of the visible mass into the forward pile zone.
- Tightened the forward pile footprint so the snow stacks into a taller ridge directly in front of the blade instead of spreading too broadly.
- Reduced side spill a bit so more snow stays gathered in front of the plow.
- Increased reverse engine force and max reverse speed so backing away from a built-up pile feels less sluggish.

## Validation Notes

- `npm run build` passes after the front-pile and reverse-speed tuning pass.

## Side Banks And Mesh Resolution Iteration

- Added explicit inner and outer side-bank deposition zones in `PlowInteractionSystem` so snow now builds into left/right roadside-style berms instead of only a front ridge.
- Shifted some visible snow mass from the front pile into those side banks while keeping the front buildup intact.
- Increased the main `SnowField` grid resolution from `80x52` to `96x64` so plowed walls and side berms read more cleanly.

## Validation Notes

- `npm run build` passes after the side-bank and mesh-resolution tuning pass.

## Snow Texture Iteration

- Wired the `snowcoarse` asset set into `SnowField` so the deformable snow mesh now uses the coarse snow base color, normal map, and roughness map.
- Kept vertex colors active on top of the texture so plowed cuts and piled snow still read clearly from gameplay-driven shading.

## Validation Notes

- `npm run build` passes after applying the `snowcoarse` material maps.

## Front Load Resistance Iteration

- Added `frontPileLoad` to the plow debug/simulation state so the game now tracks how much snow is packed directly in front of the blade.
- The front pile starts small, grows as snow accumulates, and now feeds back into vehicle handling:
  - lower effective plow traction
  - lower forward engine authority
  - lower forward top speed
  - stronger tendency to stall when the packed load gets too large
- Reverse behavior remains comparatively strong so the plow can back out of an overbuilt pile.

## Tuning Notes

- `frontPileLoad` is measured as weighted excess snow height in the front pile footprint.
- In `VehicleController.ts`, front-load resistance currently scales through:
  - `plowDrag`
  - forward `engineForce`
  - `rollingResistance`
  - `maxForwardSpeed`
  - an extra stopping term once `frontPileLoad` exceeds roughly `0.95`

## Validation Notes

- `npm run build` passes after the front-load resistance pass.

## Front Shape And Stall Tuning Iteration

- Reworked front deposition away from a narrow spike:
  - widened the main front pile footprint
  - added a broader front apron zone farther ahead
  - shifted more visible snow into side banks
- Increased side-bank share so the plow now builds stronger left/right berms rather than a single tall spear in front.
- Broadened `frontPileLoad` sampling across both the near front pile and the front apron so resistance tracks total pushed volume more honestly.
- Tightened the stall behavior in `VehicleController` so large front volume chokes forward force earlier and can fully stop the plow under heavy load.

## Validation Notes

- `npm run build` passes after the front-shape and stall tuning pass.

## High Resolution And Front Load Amplification Iteration

- Increased the main snowfield resolution again from `96x64` to `160x108` so trenches and side berms have much finer geometry to deform.
- Changed snow deposition to use a small local kernel instead of dropping each contribution into a single cell, which should reduce sawtooth ridges and make built-up snow read more like continuous berms.
- Increased visible moved snow via `COMPACTION_RATIO` and strengthened both front and side deposition so more material actually accumulates in front of the blade.
- Amplified `frontPileLoad` by combining weighted average excess with peak excess, so a broad front volume now counts as meaningful load instead of being diluted away.
- Tightened vehicle resistance again so the plow can stall earlier when too much snow is being pushed.

## Validation Notes

- `npm run build` passes after the high-resolution and front-load amplification pass.

## Dev Panel Iteration

- Added a live `DevPanel` overlay in the game view for runtime tuning instead of hunting constants in code.
- Wired key snow parameters into shared tuning state:
  - cut strength
  - compaction ratio
  - front weight
  - front apron weight
  - side bank weight
  - base snow height
  - pile height scale
- Wired key vehicle/load parameters into shared tuning state:
  - reverse speed
  - reverse force
  - load divisor
  - stop threshold
  - stop strength
  - load resistance
- `SnowField`, `PlowInteractionSystem`, and `VehicleController` now read from that shared tuning state so slider changes apply live during play.

## Validation Notes

- `npm run build` passes after the dev-panel integration.

## Dev Panel Expansion Iteration

- Added `Forward Force` and `Forward Speed` sliders so forward driving can now be tuned live alongside reverse.
- Added side-bank shape sliders:
  - `Side Inner Width`
  - `Side Outer Width`
  - `Side Bank Length`
- Wired those side-bank tuning values into `PlowInteractionSystem` so widening the banks no longer requires code edits.
- Added mouse-wheel zoom to the chase camera while keeping right-mouse orbit intact.

## Validation Notes

- `npm run build` passes after the dev-panel expansion and camera zoom update.

## Dev Mode Gate Iteration

- `?dev=1` now enables the tuning workflow explicitly:
  - dev panel only renders in that mode
  - run timer becomes infinite in that mode
- The HUD now displays `∞` for time when dev mode is active.
- Increased the side-bank width slider caps again:
  - `Side Inner Width` max is now `4.8`
  - `Side Outer Width` max is now `6.4`

## Validation Notes

- `npm run build` passes after the dev-mode gating update.

## Cut Smoothing Iteration

- Added a local removal kernel in `PlowInteractionSystem` so the blade no longer cuts snow as a near-single-cell vertical wall.
- Snow removal now spreads over the center cell, its orthogonal neighbors, and light diagonal neighbors, which should soften the trench shoulders and make side berms/dikes less cliff-like.

## Validation Notes

- `npm run build` passes after the cut-smoothing pass.

## Side Bank Shape Control Iteration

- Added `sideBankHeight` to snow tuning and exposed it in the dev panel as `Side Bank Height`.
- Side banks now have separate controls for:
  - width
  - length
  - height
- Flattened the side-bank deposition profile so the berms build more like a broad mass with a smoother falloff, rather than peaking sharply nearest the plow.

## Validation Notes

- `npm run build` passes after the side-bank shape-control pass.

## Side Wall Width Boost

- Increased default side-wall widths by 4x:
  - `sideBankInnerWidth`: `0.8 -> 3.2`
  - `sideBankOuterWidth`: `1.6 -> 6.4`
- Raised dev slider caps again so tuning still has headroom:
  - `Side Inner Width` max is now `9.6`
  - `Side Outer Width` max is now `12.8`

## Validation Notes

- `npm run build` passes after the deep-cut tuning pass.
- Browser validation confirmed:
  - the plowed lane reads darker and lower, closer to visible road/ground level
  - the front pile is still present while the trench behind the blade stays sharper
  - progression and scoring still update correctly on the hidden route mask
- Artifacts were written under `output/web-game/deep-plow-pass`.

## Side Berm Spread Iteration

- Widened the actual side deposition zones in `PlowInteractionSystem` instead of only increasing slider ranges.
- Side berm deposition now uses a dedicated `wide` kernel, so side-bank snow is spread across a broader lateral footprint instead of stacking into a thin ridge.
- Broadened the inner, outer, and berm collection footprints and flattened their weighting curves so side walls build as wider masses with more even average height.

## Validation Notes

- `npm run build` passes after the side-berm spread pass.

## Side Mass Boost Iteration

- Increased default side mass substantially so the plow now sends much more visible snow into the side banks by default.
- Raised default `sideBankHeight` and `sideBermShare` so a larger share of the visible plowed mass ends up in the broader side berm instead of staying concentrated near the blade.
- Expanded dev-panel headroom again:
  - `Side Banks` max is now `1.4`
  - `Side Bank Height` max is now `4.5`
  - `Side Berm Share` max is now `0.98`

## Validation Notes

- `npm run build` passes after the side-mass boost pass.

## Front And Side Spread Iteration

- Reworked forward deposition so the front pile now uses a dedicated broad `front` kernel instead of the old narrow center-weighted drop.
- Widened both forward zones:
  - `forwardPile` is broader and longer
  - `forwardApron` is much broader and flatter
- Widened side-bank capture again and flattened the weighting curves further so straight plowing spreads snow into wider berm bodies instead of knife ridges.
- Expanded the `wide` side-bank kernel with more far-lateral offsets so side mass actually lands across a larger span of cells when driving straight.

## Validation Notes

- `npm run build` passes after the front-and-side spread pass.

## Plow Control And Body Compression Iteration

- Added live plow controls:
  - keyboard: `Q/E` angles the plow, `Z/X` lowers/raises it
  - controller: `LB/RB` angles the plow, D-pad up/down raises/lowers it
- The blade mesh now visually rotates and lifts with those controls.
- `PlowInteractionSystem` now uses blade angle and lift:
  - lift reduces or disables active cutting
  - blade angle biases snow mass toward one side so angled plowing leads volume into that direction
- Added a separate rough body-compaction pass so the machine itself presses snow down when driving through it, especially while reversing into snow.
- Updated runtime debug output and header help text to reflect the new plow controls.

## Validation Notes

- `npm run build` passes after the plow-control and body-compression pass.

## Blade Angle Side-Flow Tuning

- Kept the plow cut centered in front of the vehicle even when the blade is visually angled.
- Changed blade-angle mass routing so max angle now behaves much more like a real discharge side:
  - the closed side is nearly shut off
  - more snow stays in the forward flow
  - the open side receives a much stronger share of the displaced mass

## Validation Notes

- `npm run build` passes after the blade-angle side-flow tuning pass.

## GLB Map Integration

- Replaced the old hardcoded prototype test field with the imported `Plough.glb` map from `src/assets/New Folder/`.
- `createPrototypeCourse` is now async and loads the map through `GLTFLoader`, rescales it to gameplay size, recenters it around the world origin, and uses the model bounds to define:
  - the playable snowfield area
  - the spawn point
  - the default route/scoring coverage
- Removed the old placeholder plane, obstacle boxes, and roadside marker posts from the level definition.
- Updated `GameRuntime` to wait for level loading before starting the simulation loop.
- Updated the game header copy from `Plough Test Field` to `Plough Map`.
- Added Vite type declarations for `.glb` asset imports.

## Validation Notes

- `npm run build` passes after replacing the prototype field with the imported GLB map.

## Full-Scale Map Update

- Set the imported GLB map to full scale instead of the earlier normalized preview scale.
- Reduced snowfield density to an adaptive capped grid so the full-size map does not allocate an unusably large heightfield.
- Increased the gameplay camera far plane to handle the larger world scale without premature clipping.

## Validation Notes

- `npm run build` passes after switching the GLB map to full scale.

## Local Snow Zone Update

- Limited the active snow simulation area to a fixed local `1000 x 1000` zone instead of covering the entire full-scale map.
- Positioned that snow zone as a first-pass playable neighborhood area within the imported map, with spawn moved to the west side of the local zone.
- Kept the rest of the GLB map visible as environment while only the local zone remains actively plowable.

## Validation Notes

- `npm run build` passes after switching to the local 1000x1000 snow zone.

## Camera Zoom Range Update

- Increased the chase camera zoom-out range substantially for the larger imported map.
- Raised the default chase distance and height slightly so the camera reads better over the local neighborhood snow zone.

## Validation Notes

- `npm run build` passes after expanding the chase camera zoom range.

## Blade-Shaped Snow Footprint

- Changed the active plow cut from a generic rectangular footprint to a blade-shaped footprint that better matches the visual plow bar.
- Updated the simulated blade dimensions to match the current plow model width more closely.
- The cut now samples cells by distance to the blade segment, which should make the trench/readout follow the plow shape more faithfully.

## Validation Notes

- `npm run build` passes after switching the plow cut to a blade-shaped footprint.

## Slight Machine Power Increase

- Increased the default machine strength a bit:
  - more forward force
  - slightly higher forward and reverse top speed
  - somewhat less aggressive slowdown from front snow load
- Kept the overall handling model intact; this is a tuning pass, not a controller rewrite.

## Validation Notes

- `npm run build` passes after the small machine power increase.

## Terrain-Following Snow And Tree Scatter

- Added terrain-aware snow base sampling so the snowfield now follows sampled height from the imported GLB map instead of always sitting on a flat plane.
- Split snow queries into:
  - full rendered world height
  - pure snow depth
  so snow-contact checks still work correctly when terrain height is non-zero.
- Added a cached terrain height sampler for the active snow zone to keep the terrain-following snowfield affordable.
- Spawned a couple hundred simple procedural trees around the imported map area while keeping the local plow zone relatively clear.

## Validation Notes

- `npm run build` passes after adding terrain-following snow and procedural tree scatter.

## Larger Snow Patch Without More Sim Cost

- Increased the local snow patch size from `60` to `100`.
- Switched the snow simulation grid to a fixed `512 x 512` cell budget instead of scaling cell count up with patch size.
- Result: noticeably larger plowable area at roughly the same simulation/render cost, with somewhat lower spatial detail per meter.

## Validation Notes

- `npm run build` passes after enlarging the snow patch while keeping the fixed grid budget.

## Static Host Asset Path Fix

- Fixed the production build for static hosting in a subdirectory by making the build script explicit: `vite build --base ./`.
- Verified that `dist/index.html` now references `./assets/...` instead of `/assets/...`, which prevents the host from returning HTML for JS/CSS asset requests and causing MIME-type errors.

## Validation Notes

- `npm run build` passes after the static-host path fix.

## Night And Snow Spray Iteration

- Switched the scene into a darker moonlit setup with a visible moon mesh and blue-white directional moonlight.
- Updated the plow vehicle with cylindrical lamps, live white front lights, red rear lights, and round wheels.
- Added a lightweight `SnowSpraySystem` that emits short-lived snow mist around the plow when driving in snow with the blade engaged.

## Validation Notes

- 
pm run build passes after the night-lighting, wheel, lamp, and snow-spray pass.
- Browser smoke capture confirms dark moonlit ambience plus active front/rear vehicle lights in gameplay.
- Validation artifacts were written under output/web-game/snow-spray-pass.

## Snow Spray Follow And Scale Tuning

- Reduced snow-spray particle count, spawn size, growth rate, and alpha so the mist reads lighter and less like oversized expanding blobs.
- Cut the inherited forward velocity sharply and biased particles slightly backward so the snow haze stays behind in world space instead of pacing with the plow.
- Shortened particle lifetime a bit and lowered vertical lift so the effect stays closer to the blade and dissipates faster.

## Snow Mask Cleanup Iteration

- Added a lightweight post-process on the sampled plowable mask in `SnowField` to fill small internal holes and remove isolated single-cell artifacts.
- This smooths the lake-shaped playable area slightly at grid level and should eliminate zig-zag dead patches where the plow unexpectedly stops affecting snow inside the lake.

## Snow Surface Seam And Spray Persistence Tuning

- Switched snowfield texture UVs to world-space mapping so adjacent snow tiles share one continuous snow pattern instead of restarting the texture per tile.
- This should remove the visible mid-lake seam caused by tile UV resets while preserving the same approximate snow texture scale.
- Increased snow-spray lifetime and softened its vertical motion so the mist hangs behind the plow longer and slowly sinks toward the ground instead of vanishing too quickly.

## Static Snow Surround Iteration

- Added a separate static snow-covered ground mesh under and around the playable lake area.
- The static ground follows sampled terrain height, extends beyond the plowable zone, and uses the same snow material family with world-space UV mapping.
- This gives the scene a snow-covered continuation outside the active snowfield and helps hide jagged lake-edge cutoffs against the dark surroundings.

## Ice Reveal Tuning

- Restored a clearer ice-blue reveal in deeply plowed snow by blending trench vertex colors toward a colder blue tint as snow depth approaches fully cleared.
- The effect is limited to the deepest cuts so ordinary snow tracks still read as snow, while blade-to-ground passes recover the earlier icy lake-surface look.

## Soft Outer Boundary Tuning

- Added a separate vehicle-physics penalty outside the playable lake mask instead of using a hard boundary.
- When the vehicle center leaves the plowable area, traction, engine authority, and top speed drop sharply while rolling resistance increases heavily.
- Result: the machine can still crawl outside the play area, but it feels bogged down enough to act as a natural barrier rather than inviting exploration far beyond the lake.

## Packed Track Surface Tuning

- Reworked trench-bottom coloring so plowed tracks no longer look like uneven loose snow all the way down.
- Mid-depth cuts now shift toward a colder packed-snow tone, and deeper cuts blend further into a darker ice-blue surface.
- This makes the cleared track bottoms read more like compressed snow and exposed lake ice instead of just noisy white snow texture.

## Static Snow Height Adjustment

- Lowered the surrounding static snow surface slightly so the plowed lake surface can read more clearly underneath.
- This keeps the soft snowy continuation outside the playable area while reducing the chance that the surround layer visually competes with exposed ice in cleared tracks.
