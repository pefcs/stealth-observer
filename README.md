# Stealth Observer

A Foundry VTT module for D&D 5e 6.x and Foundry v14, with Midi-QOL per-observer hiding integration.

## Features in 0.1.8

- Stores the Stealth check total on the token and writes it to Midi-QOL's Hiding DC (`flags.midi-qol.hidden.dc`).
- Keeps Midi-QOL's per-observer visibility/attack handling, while overriding its generic Hiding result with this module's Perception and lighting calculation.
- Fixes the visibility wrapper lifecycle: the `hasStatusEffect` wrapper now always continues the libWrapper chain before applying the custom observer-specific answer. This prevents libWrapper from silently unregistering the wrapper.
- Uses `max(passive Perception, banked active Perception)` as the effective Perception score.
- Expires banked active Perception after 10 in-game minutes outside combat, or at the next combat round. Expiration refreshes canvas visibility immediately.
- Shows compact icon-and-value readouts for Perception and Stealth, plus an icon for local light exposure. Numeric values have no visible text labels; tooltips retain the full explanation.
- Groups all three readouts together at the end of the Token HUD control stack.
- Integrates with Action HUD: when Action HUD is active and enabled, the readouts appear beside the actor identity below Hit Dice instead of on Token HUD. Token HUD is the fallback when Action HUD is unavailable or disabled.
- Keeps independent GM/player visibility settings for each readout, with the GM able to edit banked numeric values. Players only see readouts for tokens they own.
- Shows local exposure as Bright, Dim, Dark, or Magical Dark through a distinct lighting icon; tooltips retain exposure source/raw diagnostics.
- Creates a companion `Temporary Hiding (Stealth Observer)` Active Effect. It is linked to the D&D Hiding condition: deleting or disabling the companion effect removes Hiding, and removing Hiding deletes the companion. The companion uses the native D&D 5e `duration.expiry: "shortRest"` property. D&D 5e marks it as a temporary Active Effect, which Action HUD recognizes through `effect.isTemporary`; no DAE special-duration flag is needed. It has no mechanical changes of its own.
- Removes Hiding when an attack or a verbal spell is used.
- Handles dim light, darkness, ordinary darkvision, Devil's Sight, truesight, blindsight, and movement-sensitive tremorsense.
- Reads Vision 5e 3.2.x actor-derived detection modes and their numeric ranges, including `basicSight`, `devilsSight`, `seeAll`, `blindsight`, and `feelTremor`. Also recognizes eligible precise third-party SIGHT modes (for example thermal vision) in natural darkness.

## Requirements

- Foundry VTT v14
- D&D 5e 6.0.x
- Midi-QOL 14.6.x
- libWrapper

## Readout visibility and placement settings

Each readout has independent GM and player controls. The same visibility controls apply regardless of whether the readout is shown in Action HUD or Token HUD:

- **Stealth**: show the stored hiding roll to the GM / players.
- **Perception**: show the current effective Perception (`max(passive, active)`) to the GM / players.
- **Light exposure**: show local Bright / Dim / Dark exposure to the GM / players.

Player readouts are read-only and limited to tokens the player owns. **Show readouts on Action HUD when available** controls placement. It defaults to enabled; Action HUD must also be active and its client-level Enabled setting must be on. If not, readouts fall back to Token HUD.

Other settings:

- **Create a Hiding removal effect**: creates the linked Action HUD companion effect, classified as temporary until short rest.
- **Use the Hiding icon for the removal effect**: chooses the system Hiding icon for the companion effect; otherwise a neutral eye icon is used.
- **Debug logging**: logs observer, target, active/passive Perception, adjusted Perception, lighting, and Stealth DC during visibility checks.

## Vision 5e compatibility

Vision 5e 3.2.3 derives sensory ranges on `Actor.detectionModes` as numeric values instead of relying exclusively on `TokenDocument.detectionModes` entries with an `enabled` property. Stealth Observer merges both sources and maps Vision 5e IDs to D&D sense categories: `basicSight` = darkvision, `devilsSight` = Devil's Sight, `seeAll` = truesight, `blindsight` = blindsight, and `feelTremor` = tremorsense. Ranges are checked against the observer-to-target distance.

Eligible precise custom detection modes registered as `SIGHT` (such as Vision 5e thermal vision) can avoid the natural-darkness penalty when their own `_canDetect` check accepts the target. They do not automatically pierce magical darkness. Imprecise, sound, movement, and other non-sight modes are not treated as ordinary visual sight.

## Perception calculation

The active result does not replace passive Perception. The effective value is `max(active roll, passive Perception)`. Outside combat it expires after 600 in-game seconds. In combat it expires at the next round transition. When it expires, the effective value automatically returns to passive Perception.

Lighting rules applied to the hiding target:

- Dim light: -5 unless the detector has darkvision in range or a stronger relevant sense.
- Darkness: no detection without a suitable sense; ordinary darkvision treats it as dim light and applies -5.
- Devil's Sight, truesight, and blindsight ignore darkness penalties. Blindsight also works while blinded.
- Tremorsense can detect a moving target, not a stationary one, and ignores darkness penalties.
- Magical darkness blocks ordinary darkvision.

## Testing notes

This is still an in-world development build. The visibility wrapper and Perception calculation are syntax-checked and exercised with a small Foundry API stub, but a live Foundry session is required to validate Gm-Vision integration, magical darkness source detection, token HUD styling, and how the Action HUD presents the companion Active Effect. Vision 5e 3.2.3 support is now explicitly implemented against its uploaded source, but still requires live in-world validation. Enable **Debug logging** for useful visibility traces.

## Installation

Replace the existing `Data/modules/stealth-observer` folder with the folder in this archive, enable **Stealth Observer**, and reload Foundry.


### Per-token lighting classification (0.1.4)

When Midi-QOL exposes `api.tokenUtils.getLightLevel`, Stealth Observer uses it to classify the hidden token's actual local exposure. This is important when the scene's global darkness is non-zero but a local light source illuminates the target. Debug output includes `exposureSource` and `rawExposure`. The scene-wide darkness fallback is used only when no per-token helper can provide a result.

## 0.1.6 UI changes

The Token HUD displays compact labeled readout pills rather than icon-only numbers. Stealth, Perception, and light exposure can each be shown or hidden separately for the GM and players. The linked Hiding companion effect uses D&D 5e’s native short-rest expiry (`duration.expiry: "shortRest"`), which makes Action HUD place it in the temporary-effects strip via `effect.isTemporary`, while keeping its `changes` array empty.


## 0.1.8 readout layout
Perception and Stealth are shown as icon + value, without `PER` or `STE` text. Light exposure uses only the appropriate sun/cloud/moon/magic icon; hover text explains the exposure. Token HUD values are grouped together at the bottom of the Token HUD controls. When Action HUD is active and enabled, an integration bridge inserts the same readouts beside the actor identity, below Hit Dice; no Action HUD source modification is required.


### HUD Readouts
Stealth Observer can display compact icon-only readouts on the Token HUD or, when Action HUD is active and enabled, in Action HUD's actor identity area. Perception is placed at the bottom-left of the Token HUD; banked Stealth and light exposure are placed bottom-right. GM/player visibility is configurable independently for each readout.


### HUD Readouts
Stealth Observer can display compact icon-only readouts on the Token HUD or, when Action HUD is active and enabled, in Action HUD's actor identity area. Perception is placed at the bottom-left of the Token HUD; banked Stealth and light exposure are placed bottom-right. GM/player visibility is configurable independently for each readout.


### HUD Readouts
Stealth Observer can display compact icon-only readouts on the Token HUD or, when Action HUD is active and enabled, in Action HUD's actor identity area. Perception is placed at the bottom-left of the Token HUD; banked Stealth and light exposure are placed bottom-right. GM/player visibility is configurable independently for each readout.


### HUD Readouts
Stealth Observer can display compact icon-only readouts on the Token HUD or, when Action HUD is active and enabled, in Action HUD's actor identity area. Perception is placed at the bottom-left of the Token HUD; banked Stealth and light exposure are placed bottom-right. GM/player visibility is configurable independently for each readout.


### HUD Readouts
Stealth Observer can display compact icon-only readouts on the Token HUD or, when Action HUD is active and enabled, in Action HUD's actor identity area. Perception is placed at the bottom-left of the Token HUD; banked Stealth and light exposure are placed bottom-right. GM/player visibility is configurable independently for each readout.
