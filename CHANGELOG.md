## 0.1.10

- Fixed lighting-based disadvantage on active Perception checks for D&D 5e 6.x. The pre-roll handler now reads the modern `(config, dialog, message)` hook signature and resolves the rolling Actor from `config.subject`.
- Uses the D&D 5e 6.x `disadvantage` roll-configuration flag rather than the obsolete `advantageMode` property.
- Preserves any existing advantage or disadvantage source. Lighting disadvantage cancels an existing advantage using D&D's normal rule; existing disadvantage remains disadvantage.
- Uses the rolling token's local exposure and in-range vision modes: dim light imposes disadvantage without darkvision or a stronger sense; darkness imposes disadvantage unless the actor has Devil's Sight, truesight, blindsight, or another eligible precise sight mode. Ordinary darkvision does not remove disadvantage in darkness.
- The existing **Apply disadvantage to Perception in poor lighting** setting controls this behavior and remains enabled by default.

# Changelog

## 0.1.2

- Fixed the `hasStatusEffect` wrapper so it always calls the next wrapper before applying the per-observer result. This prevents libWrapper from automatically unregistering it.
- Added effective Perception calculation: `max(passive, active roll)`.
- Refreshes token visibility immediately when Perception is banked, expires, or is cleared at a combat-round transition.
- Added Stealth and current Perception values to the Token HUD, with GM editing for banked values and optional read-only player visibility.
- Added a linked `Temporary Hiding (Stealth Observer)` companion Active Effect for convenient removal from Action HUDs. Deleting/disabling the companion removes the canonical D&D Hiding condition; ending Hiding removes the companion.
- Added diagnostic details for observer/target, active/passive Perception, lighting adjustment, and Hiding DC.
- Retained object/Map/array compatibility for token detection modes.

## 0.1.3

- Fixed Vision 5e compatibility: detection capabilities are now read from `Actor.detectionModes` as well as token-level detection modes.
- Added support for Vision 5e's numeric detection ranges, including `basicSight` (darkvision), `devilsSight`, `seeAll` (truesight), `blindsight`, and `feelTremor` (tremorsense).
- Added aliases for Vision 5e's detection-mode IDs and D&D 5e sense-range fallbacks.
- Added support for eligible precise third-party `SIGHT` detection modes (such as Vision 5e thermal vision) in natural darkness; they do not pierce magical darkness.
- Expanded debug output to show the observer's available detection modes and their effective ranges.


## 0.1.4

- Fixed per-token light classification: use Midi-QOL's `api.tokenUtils.getLightLevel(token)` when available, which accounts for local light sources instead of relying on scene-wide darkness.
- Corrected Foundry v14 lighting enum handling (`DARKNESS`, `HALFDARK`, `DIM`, `BRIGHT`, `BRIGHTEST`); removed the invalid `CONST.LIGHTING_LEVELS.DARK` check.
- Added `exposureSource` and `rawExposure` to the per-observer debug record so lighting misclassification can be traced directly.
- Kept a clearly labeled scene-darkness fallback for environments without a per-token light-level helper.


## 0.1.5

- Corrected the Midi-QOL `getLightLevel` argument: pass the Foundry v14 `TokenDocument`, which provides `getMovementOrigin`, rather than the canvas Token placeable.
- Avoids the expected `e.getMovementOrigin is not a function` error during visibility checks.
- Diagnostic output now identifies the TokenDocument lookup path and reports only the concise lookup failure message.

## 0.1.6
- Replaced the crowded icon-only Token HUD numbers with compact labeled readout pills for PER, STE, and LIGHT.
- Added independent GM and player visibility settings for Stealth, current Perception, and local light exposure. Player readouts are limited to tokens the player owns.
- Added local exposure refreshes after Foundry lighting refreshes and ambient-light changes. Magical darkness is labeled separately in the HUD.
- Marked the Hiding companion effect as temporary with `flags.dae.specialDuration: ["shortRest"]`, without adding any mechanical effect changes. Existing companion effects are upgraded in place.


## 0.1.7
- Replaced the legacy DAE `flags.dae.specialDuration` workaround with D&D 5e 6.x native `duration.expiry: "shortRest"`.
- Action HUD recognizes the companion through the system's native `effect.isTemporary` getter; no DAE flag is required.
- Existing companion effects are migrated in place at world load and whenever Hiding is applied; the legacy DAE special-duration flag is removed.


## 0.1.8
- Replaced Token HUD text labels (PER, STE, BRIGHT/DIM/DARK) with compact icon-and-value controls; exposure is represented by its lighting icon with a descriptive tooltip.
- Grouped Perception, Stealth, and exposure into one trailing Token HUD footer instead of splitting them between left and right columns.
- Added an Action HUD integration that places the same readouts in the actor identity area below Hit Dice when Action HUD is active and enabled.
- Added the world setting `Show readouts on Action HUD when available`; when enabled and Action HUD is available, readouts move to Action HUD instead of being duplicated on Token HUD. Otherwise Token HUD remains the fallback.
- Preserved independent GM/player visibility settings for each of the three readouts; values remain editable by the GM.


## 0.1.9
- Reworked Token HUD readouts to icon + value only, in Stealthy-style positions: Perception bottom-left; Stealth and light exposure bottom-right.
- Delayed the readout append until other Token HUD controls have rendered so the values remain last.
- Added a public Action HUD readout API and live refresh event integration.
- Added configurable routing to Action HUD when that module is active and enabled.


## 0.1.9
- Reworked Token HUD readouts to icon + value only, in Stealthy-style positions: Perception bottom-left; Stealth and light exposure bottom-right.
- Delayed the readout append until other Token HUD controls have rendered so the values remain last.
- Added a public Action HUD readout API and live refresh event integration.
- Added configurable routing to Action HUD when that module is active and enabled.


## 0.1.9
- Reworked Token HUD readouts to icon + value only, in Stealthy-style positions: Perception bottom-left; Stealth and light exposure bottom-right.
- Delayed the readout append until other Token HUD controls have rendered so the values remain last.
- Added a public Action HUD readout API and live refresh event integration.
- Added configurable routing to Action HUD when that module is active and enabled.


## 0.1.9
- Reworked Token HUD readouts to icon + value only, in Stealthy-style positions: Perception bottom-left; Stealth and light exposure bottom-right.
- Delayed the readout append until other Token HUD controls have rendered so the values remain last.
- Added a public Action HUD readout API and live refresh event integration.
- Added configurable routing to Action HUD when that module is active and enabled.


## 0.1.9
- Reworked Token HUD readouts to icon + value only, in Stealthy-style positions: Perception bottom-left; Stealth and light exposure bottom-right.
- Delayed the readout append until other Token HUD controls have rendered so the values remain last.
- Added a public Action HUD readout API and live refresh event integration.
- Added configurable routing to Action HUD when that module is active and enabled.
