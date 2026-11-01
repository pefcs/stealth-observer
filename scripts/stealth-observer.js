const MODULE_ID = "stealth-observer";
const FLAG_SCOPE = MODULE_ID;
const TOKEN_STEALTH = "stealth";
const TOKEN_PERCEPTION = "perception";
let currentObserver = null;
let wrapperRegistered = false;
const syncingHidingEffects = new Set();
const log = (...args) => console.log(`${MODULE_ID} |`, ...args);
const warn = (...args) => console.warn(`${MODULE_ID} |`, ...args);

Hooks.once("init", () => {
  const register = (key, data) => game.settings.register(MODULE_ID, key, data);
  register("stealthSkill", { name: "Stealth skill key", scope: "world", config: true, type: String, default: "ste" });
  register("perceptionSkill", { name: "Perception skill key", scope: "world", config: true, type: String, default: "prc" });
  register("showHidingIcon", { name: "Use the Hiding icon for the removal effect", hint: "When disabled, the companion Action HUD effect uses a neutral eye icon instead.", scope: "world", config: true, type: Boolean, default: true });
  // Separate GM and player visibility controls for each readout.
  register("showStealthOnTokenHUD", { name: "Show banked Stealth to GM", hint: "Shows the hiding actor's stored Stealth result to the GM, wherever the readouts are displayed.", scope: "world", config: true, type: Boolean, default: true });
  register("showStealthOnTokenHUDToPlayers", { name: "Show banked Stealth to players", hint: "Shows the stored Stealth result to players who own the token, wherever the readouts are displayed.", scope: "world", config: true, type: Boolean, default: false });
  register("showPerceptionOnTokenHUD", { name: "Show current Perception to GM", hint: "Shows max(passive Perception, active Perception) to the GM, wherever the readouts are displayed.", scope: "world", config: true, type: Boolean, default: true });
  register("showPerceptionOnTokenHUDToPlayers", { name: "Show current Perception to players", hint: "Shows current Perception to players who own the token, wherever the readouts are displayed.", scope: "world", config: true, type: Boolean, default: false });
  register("showExposureOnTokenHUD", { name: "Show light exposure to GM", hint: "Shows the token's current local light exposure through an icon and tooltip.", scope: "world", config: true, type: Boolean, default: true });
  register("showExposureOnTokenHUDToPlayers", { name: "Show light exposure to players", hint: "Shows local light exposure to players who own the token through an icon and tooltip.", scope: "world", config: true, type: Boolean, default: false });
  register("showReadoutsOnActionHUD", { name: "Show readouts on Action HUD when available", hint: "Use the Action HUD identity area instead of the Token HUD when Action HUD is active and enabled.", scope: "world", config: true, type: Boolean, default: true, onChange: () => refreshVisibilityAndHUD() });
  // Retain the previous setting keys for existing worlds, but hide the superseded controls.
  register("showTokenHUDValues", { name: "(Legacy) Show Token HUD values", scope: "world", config: false, type: Boolean, default: true });
  register("showTokenHUDToPlayers", { name: "(Legacy) Show Token HUD values to players", scope: "world", config: false, type: Boolean, default: false });
  register("createHidingRemovalEffect", { name: "Create a Hiding removal effect", hint: "Adds a temporary companion Active Effect which can be removed from Action HUDs. Removing it also removes the Hiding condition; it expires at the end of a short rest.", scope: "world", config: true, type: Boolean, default: true });
  register("endOnAttack", { name: "End hiding when making an attack", scope: "world", config: true, type: Boolean, default: true });
  register("endOnVerbalSpell", { name: "End hiding when casting a verbal spell", scope: "world", config: true, type: Boolean, default: true });
  register("bankActivePerception", { name: "Bank active Perception checks", scope: "world", config: true, type: Boolean, default: true });
  register("activePerceptionDisadvantage", { name: "Apply disadvantage to Perception in poor lighting", hint: "Applies disadvantage to Perception checks when the rolling token is in dim light without darkvision, or in darkness without a stronger sense such as Devil’s Sight, truesight, or blindsight.", scope: "world", config: true, type: Boolean, default: true });
  register("debug", { name: "Debug logging", scope: "client", config: true, type: Boolean, default: false });
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") {
    ui.notifications.error(`${MODULE_ID} requires the D&D 5e system.`);
    return;
  }
  if (!game.modules.get("lib-wrapper")?.active) {
    ui.notifications.error(`${MODULE_ID} requires libWrapper. Enable it and reload.`);
    return;
  }
  registerMidiVisibilityIntegration();
  game.modules.get(MODULE_ID).api = { getActionHUDReadouts };
  Hooks.on("dnd5e.preRollSkill", onPreRollSkill);
  Hooks.on("dnd5e.rollSkill", onRollSkill);
  Hooks.on("midi-qol.preItemRoll", onPreItemRoll);
  Hooks.on("midi-qol.preAttackRoll", onPreAttackRoll);
  Hooks.on("updateWorldTime", onWorldTime);
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("deleteCombat", onDeleteCombat);
  Hooks.on("updateToken", onTokenUpdated);
  Hooks.on("updateActor", onActorUpdated);
  Hooks.on("renderTokenHUD", renderTokenHUD);
  Hooks.on("lightingRefresh", refreshVisibilityAndHUD);
  Hooks.on("controlToken", refreshVisibilityAndHUD);
  Hooks.on("canvasReady", refreshVisibilityAndHUD);
  Hooks.on("updateAmbientLight", refreshVisibilityAndHUD);
  Hooks.on("createAmbientLight", refreshVisibilityAndHUD);
  Hooks.on("deleteAmbientLight", refreshVisibilityAndHUD);
  Hooks.on("updateSetting", setting => {
    if (setting?.key?.startsWith(`${MODULE_ID}.`) || setting?.key === "action-hud.enabled") {
      refreshVisibilityAndHUD();
      canvas.tokens?.hud?.render?.();
    }
  });
  Hooks.on("deleteActiveEffect", onDeleteActiveEffect);
  Hooks.on("updateActiveEffect", onUpdateActiveEffect);
  void migrateExistingHidingRemovalEffects();
  // Action HUD creates its root during the same ready cycle; refresh after all ready hooks run.
  requestAnimationFrame(() => refreshTokenHUDValues());
  log("Ready", { foundry: game.version, dnd5e: game.system.version, midi: game.modules.get("midi-qol")?.version, actionHUD: game.modules.get("action-hud")?.active === true });
});

function debug(...args) {
  if (game.settings.get(MODULE_ID, "debug")) log(...args);
}
function tokenDocument(tokenOrDoc) {
  if (!tokenOrDoc) return null;
  if (tokenOrDoc.documentName === "Token") return tokenOrDoc;
  if (tokenOrDoc.document?.documentName === "Token") return tokenOrDoc.document;
  return null;
}
function tokenForActor(actor) {
  const controlled = canvas.tokens?.controlled?.find(t => t.actor?.id === actor?.id);
  if (controlled) return controlled.document;
  return canvas.tokens?.placeables?.find(t => t.actor?.id === actor?.id)?.document ?? null;
}
function skillKey(key) { return game.settings.get(MODULE_ID, key); }
function isHiding(tokenOrDoc) {
  const doc = tokenDocument(tokenOrDoc);
  return !!doc?.actor?.statuses?.has("hiding");
}
function getHidingEffect(actor) {
  return actor?.effects?.find(e => !e.disabled && (e.statuses?.has("hiding") || e.flags?.["midi-qol"]?.hidden));
}
async function setTokenStealth(tokenDoc, total) {
  if (!tokenDoc) return;
  await tokenDoc.setFlag(FLAG_SCOPE, TOKEN_STEALTH, {
    total: Number(total),
    timestamp: game.time.worldTime,
    sceneId: tokenDoc.parent?.id ?? null
  });
}
async function clearTokenStealth(tokenDoc) {
  if (!tokenDoc) return;
  await tokenDoc.unsetFlag(FLAG_SCOPE, TOKEN_STEALTH);
}
async function clearActorStealthFlags(actor, preferredToken = null) {
  const docs = new Map();
  if (preferredToken) docs.set(preferredToken.uuid ?? preferredToken.id, preferredToken);
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorId === actor?.id || token.actor?.id === actor?.id) {
        docs.set(token.uuid ?? token.id, token);
      }
    }
  }
  for (const token of docs.values()) {
    if (token.getFlag?.(FLAG_SCOPE, TOKEN_STEALTH)) await clearTokenStealth(token);
  }
}
async function applyHiding(actor, tokenDoc, total) {
  if (!actor) return;
  const actorKey = actor.uuid;
  syncingHidingEffects.add(actorKey);
  try {
    // Midi-QOL 14.6.x reads the Hide DC from the D&D 5e Hiding condition's
    // flags.midi-qol.hidden.dc. Keep that condition as the canonical status.
    if (!actor.statuses?.has("hiding")) await actor.toggleStatusEffect("hiding", { active: true });
    const effect = getHidingEffect(actor) ?? actor.effects?.find(e => e.statuses?.has("hiding"));
    if (effect) await effect.update({ "flags.midi-qol.hidden.dc": Number(total) });
    else warn("Hiding status was applied but its ActiveEffect could not be located; Midi may use its default DC 15.");
    if (tokenDoc) await setTokenStealth(tokenDoc, total);
    if (game.settings.get(MODULE_ID, "createHidingRemovalEffect")) await ensureHidingRemovalEffect(actor);
  } finally {
    syncingHidingEffects.delete(actorKey);
  }
  debug("Hiding applied", actor.name, total);
  refreshVisibilityAndHUD();
}
async function removeHiding(actor, tokenDoc, reason = "unspecified") {
  if (!actor) return;
  const actorKey = actor.uuid;
  syncingHidingEffects.add(actorKey);
  try {
    if (actor.statuses?.has("hiding")) await actor.toggleStatusEffect("hiding", { active: false });
    await clearActorStealthFlags(actor, tokenDoc);
    await deleteHidingRemovalEffect(actor);
  } finally {
    syncingHidingEffects.delete(actorKey);
  }
  debug("Hiding removed", actor.name, reason);
  refreshVisibilityAndHUD();
}
function isHidingRemovalEffect(effect) {
  return !!effect?.getFlag?.(MODULE_ID, "hidingRemovalEffect") ||
    effect?.flags?.[MODULE_ID]?.hidingRemovalEffect === true;
}
function hidingStatusIcon() {
  const status = CONFIG.statusEffects?.find?.(entry => entry.id === "hiding" || entry.id === "hidden");
  const dnd5eStatus = CONFIG.DND5E?.statusEffects?.hiding;
  return status?.img ?? status?.icon ?? dnd5eStatus?.img ?? dnd5eStatus?.icon ??
    "systems/dnd5e/icons/svg/statuses/hiding.svg";
}
async function ensureHidingRemovalEffect(actor) {
  if (!actor) return;
  const existing = actor.effects?.find(isHidingRemovalEffect);
  const effectData = {
    name: "Temporary Hiding (Stealth Observer)",
    img: game.settings.get(MODULE_ID, "showHidingIcon") ? hidingStatusIcon() : "icons/svg/eye.svg",
    origin: actor.uuid,
    disabled: false,
    transfer: false,
    changes: [],
    statuses: [],
    // Native D&D 5e 6.x short-rest expiry; no DAE flags or mechanical changes.
    // D&D 5e exposes this as a temporary Active Effect, which Action HUD recognizes.
    duration: { expiry: "shortRest" },
    flags: {
      [MODULE_ID]: { hidingRemovalEffect: true }
    }
  };
  if (existing) {
    // Upgrade effects created by earlier builds as well, without resetting their enabled state.
    await existing.update({
      name: effectData.name,
      img: effectData.img,
      "duration.expiry": "shortRest",
      [`flags.${MODULE_ID}.hidingRemovalEffect`]: true
    });
    // Remove the legacy DAE field from companion effects created by 0.1.6 and earlier.
    if (existing.getFlag?.("dae", "specialDuration") != null) {
      await existing.unsetFlag("dae", "specialDuration");
    }
    return;
  }
  await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}
async function migrateExistingHidingRemovalEffects() {
  // Upgrade companion markers created by 0.1.6 and earlier as soon as the world loads.
  const actors = new Set([
    ...(game.actors?.contents ?? []),
    ...(canvas.tokens?.placeables ?? []).map(token => token.actor)
  ].filter(Boolean));
  let migrated = 0;
  for (const actor of actors) {
    if (!actor.effects?.some(isHidingRemovalEffect)) continue;
    try {
      await ensureHidingRemovalEffect(actor);
      migrated += 1;
    } catch (error) {
      warn("Could not migrate existing Hiding companion effect", actor.name, error);
    }
  }
  if (migrated) log("Migrated Hiding companion effects to native D&D 5e short-rest expiry", migrated);
}

async function deleteHidingRemovalEffect(actor) {
  if (!actor) return;
  const ids = actor.effects?.filter(isHidingRemovalEffect).map(effect => effect.id) ?? [];
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}
function onDeleteActiveEffect(effect) {
  const actor = effect?.parent;
  if (!actor || syncingHidingEffects.has(actor.uuid)) return;
  if (isHidingRemovalEffect(effect)) {
    void removeHiding(actor, tokenForActor(actor), "removal effect deleted from HUD");
    return;
  }
  if (effect.statuses?.has?.("hiding")) {
    // The canonical D&D Hiding condition was removed directly (e.g. from a HUD).
    void clearActorStealthFlags(actor, tokenForActor(actor));
    void deleteHidingRemovalEffect(actor);
    refreshVisibilityAndHUD();
  }
}
function onUpdateActiveEffect(effect, changes = {}) {
  const actor = effect?.parent;
  if (!actor || syncingHidingEffects.has(actor.uuid) || changes.disabled !== true) return;
  if (isHidingRemovalEffect(effect)) {
    void removeHiding(actor, tokenForActor(actor), "removal effect disabled from HUD");
  } else if (effect.statuses?.has?.("hiding")) {
    void removeHiding(actor, tokenForActor(actor), "Hiding condition disabled");
  }
}
function onPreRollSkill(config = {}, dialog = {}, message = {}) {
  if (!game.settings.get(MODULE_ID, "activePerceptionDisadvantage")) return;

  // D&D 5e 6.x pre-roll hooks use (config, dialog, message). The roll
  // configuration carries the skill and the rolling Actor as `subject`.
  // Keep the fallback shape for older integrations that passed (actor, config).
  let rollConfig = config;
  let actor = config?.subject ?? config?.actor ?? null;
  let skill = config?.skill ?? config?.skillId;
  if (!actor && config?.documentName === "Actor") {
    actor = config;
    rollConfig = dialog ?? {};
    skill = rollConfig.skill ?? rollConfig.skillId ?? message?.skillId;
  }

  if (skill !== skillKey("perceptionSkill")) return;
  if (!actor) {
    debug("Could not identify Actor on Perception pre-roll configuration", {
      skill, configKeys: Object.keys(rollConfig ?? {})
    });
    return;
  }

  const tokenDoc = tokenForActor(actor);
  if (!tokenDoc) {
    debug("No scene token found for lighting-based Perception disadvantage", actor.name);
    return;
  }

  const exposure = tokenExposureDetails(tokenDoc);
  if (!needsPerceptionDisadvantage(tokenDoc)) {
    debug("Perception roll has no lighting disadvantage", actor.name, {
      token: tokenDoc.name, exposure: exposure.level, exposureSource: exposure.source,
      rawExposure: exposure.raw
    });
    return;
  }

  // D&D 5e 6.x uses independent advantage/disadvantage booleans. Add
  // disadvantage without clearing advantage: if both are present, the system's
  // normal cancellation rule produces a straight roll. Existing disadvantage is
  // left in place, and the roll still uses only the system's ordinary two-die cap.
  const hadAdvantage = rollConfig.advantage === true;
  const hadDisadvantage = rollConfig.disadvantage === true;
  rollConfig.disadvantage = true;

  debug("Applying lighting-based Perception disadvantage", {
    actor: actor.name,
    token: tokenDoc.name,
    exposure: exposure.level,
    exposureSource: exposure.source,
    rawExposure: exposure.raw,
    hadAdvantage,
    hadDisadvantage,
    resultingAdvantage: rollConfig.advantage === true,
    resultingDisadvantage: rollConfig.disadvantage === true
  });
}
function needsPerceptionDisadvantage(tokenDoc) {
  const exposure = tokenExposure(tokenDoc);
  if (exposure === "bright" || exposure === "unknown") return false;
  const token = canvas.tokens?.get(tokenDoc.id);
  const blindsight = hasModeInRange(token, token, ["blindsight"]);
  const devilSight = hasModeInRange(token, token, ["devilsSight", "devilSight"]);
  const truesight = hasModeInRange(token, token, ["truesight", "trueSight", "seeAll"]);
  const additionalSight = hasAdditionalSightMode(token, token);
  const special = blindsight || devilSight || truesight || additionalSight;
  const darkvision = hasModeInRange(token, token, ["darkvision", "basicSight"]);
  if (exposure === "dim") return !special && !darkvision;
  // In full darkness, ordinary darkvision still suffers disadvantage; stronger senses do not.
  return !special;
}
function onRollSkill(...args) {
  // dnd5e 6.x hook: (rolls, options); options.subject and options.skill.
  const rolls = args[0];
  const options = args[1] ?? {};
  const skill = options.skill;
  const actor = options.subject;
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!actor || !roll) return;
  const tokenDoc = tokenForActor(actor);
  if (skill === skillKey("stealthSkill")) {
    const total = Number(roll.total);
    if (Number.isFinite(total)) void applyHiding(actor, tokenDoc, total);
  } else if (skill === skillKey("perceptionSkill") && game.settings.get(MODULE_ID, "bankActivePerception")) {
    void bankPerception(actor, tokenDoc, roll, options);
  }
}
async function bankPerception(actor, tokenDoc, roll, options) {
  if (!tokenDoc) tokenDoc = tokenForActor(actor);
  if (!tokenDoc) {
    debug("No scene token found for Perception roll", actor.name);
    return;
  }
  const total = Number(roll.total);
  if (!Number.isFinite(total)) return;
  const data = {
    total,
    timestamp: game.time.worldTime,
    combatId: game.combat?.active ? game.combat.id : null,
    round: game.combat?.active ? game.combat.round : null
  };
  await tokenDoc.setFlag(FLAG_SCOPE, TOKEN_PERCEPTION, data);
  debug("Active Perception banked", actor.name, { roll: total, effective: getEffectivePerception(tokenDoc), data });
  refreshVisibilityAndHUD();
}
function getBasePassivePerception(tokenDoc) {
  const actor = tokenDoc?.actor;
  if (!actor) return 0;
  const skill = actor.system?.skills?.[skillKey("perceptionSkill")];
  const value = Number(skill?.passive);
  if (Number.isFinite(value)) return value;
  const modifier = Number(skill?.mod);
  return Number.isFinite(modifier) ? 10 + modifier : 0;
}
function getValidPerceptionBank(tokenDoc) {
  const bank = tokenDoc?.getFlag(FLAG_SCOPE, TOKEN_PERCEPTION);
  if (!bank || !Number.isFinite(Number(bank.total))) return null;
  if (game.combat?.active) {
    if (bank.combatId !== game.combat.id || bank.round !== game.combat.round) return null;
  } else if (game.time.worldTime - Number(bank.timestamp ?? 0) >= 600) return null;
  return bank;
}
function getEffectivePerception(tokenDoc) {
  const passive = getBasePassivePerception(tokenDoc);
  const bank = getValidPerceptionBank(tokenDoc);
  return bank ? Math.max(passive, Number(bank.total)) : passive;
}
function onPreItemRoll(workflow) {
  const actor = workflow?.actor;
  const tokenDoc = tokenDocument(workflow?.token) ?? tokenForActor(actor);
  const item = workflow?.item;
  if (!actor || !item) return;
  const activities = item.system?.activities ? Array.from(item.system.activities.values()) : [];
  const isAttack = !!item.hasAttack || activities.some(a => a.type === "attack");
  const verbal = item.type === "spell" && (
    item.system?.components?.vocal === true ||
    item.system?.components?.verbal === true ||
    item.system?.properties?.has?.("vocal") ||
    item.system?.properties?.has?.("verbal") ||
    Array.from(item.system?.properties ?? []).some(p => ["vocal", "verbal"].includes(p))
  );
  if ((isAttack && game.settings.get(MODULE_ID, "endOnAttack")) ||
      (verbal && game.settings.get(MODULE_ID, "endOnVerbalSpell"))) {
    void removeHiding(actor, tokenDoc, isAttack ? "attack" : "verbal spell");
  }
}
function onPreAttackRoll(workflow) {
  if (!game.settings.get(MODULE_ID, "endOnAttack")) return;
  const actor = workflow?.actor;
  if (actor) void removeHiding(actor, tokenDocument(workflow?.token) ?? tokenForActor(actor), "attack roll");
}
function onWorldTime(worldTime) {
  if (game.combat?.active) return;
  void clearExpiredPerception();
  refreshTokenHUDValues();
}
function onUpdateCombat(combat, changes) {
  if ("round" in changes || "active" in changes) {
    // A combat transition starts a fresh in-combat Perception window; each later
    // round transition also clears the previous round's bank.
    void clearAllPerception();
  }
}
function onDeleteCombat(combat) {
  void clearAllPerception();
}
async function clearExpiredPerception() {
  const now = game.time.worldTime;
  let changed = false;
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      const bank = token.getFlag(FLAG_SCOPE, TOKEN_PERCEPTION);
      if (bank && now - Number(bank.timestamp ?? 0) >= 600) {
        await token.unsetFlag(FLAG_SCOPE, TOKEN_PERCEPTION);
        changed = true;
      }
    }
  }
  if (changed) {
    debug("Expired active Perception banks cleared");
    refreshVisibilityAndHUD();
  }
}
async function clearAllPerception() {
  let changed = false;
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.getFlag(FLAG_SCOPE, TOKEN_PERCEPTION)) {
        await token.unsetFlag(FLAG_SCOPE, TOKEN_PERCEPTION);
        changed = true;
      }
    }
  }
  if (changed) debug("Active Perception banks cleared");
  refreshVisibilityAndHUD();
}
function onTokenUpdated(token, changes) {
  if (changes.x !== undefined || changes.y !== undefined || changes.elevation !== undefined || changes.flags?.[MODULE_ID]) {
    refreshVisibilityAndHUD();
  }
}
function onActorUpdated(actor, changes) {
  if (changes.system?.skills || changes.system?.attributes?.senses) refreshVisibilityAndHUD();
}
function refreshVisibilityAndHUD() {
  canvas.perception?.update?.({ refreshVision: true });
  refreshTokenHUDValues();
}
function shouldShowHUDReadout(kind) {
  const suffix = game.user.isGM ? "" : "ToPlayers";
  return !!game.settings.get(MODULE_ID, `show${kind}OnTokenHUD${suffix}`);
}
function actionHUDEnabled() {
  if (!game.modules?.get?.("action-hud")?.active) return false;
  try { return game.settings.get("action-hud", "enabled") === true; }
  catch (_) { return false; }
}
function useActionHUDReadouts() {
  return game.settings.get(MODULE_ID, "showReadoutsOnActionHUD") === true && actionHUDEnabled();
}
function makeHUDReadout(kind, icon, title) {
  const $group = $(`<div class="control-icon stealth-observer-token-readout stealth-observer-${kind.toLowerCase()}" data-readout="${kind.toLowerCase()}" role="group"></div>`);
  $group.attr("title", title ?? kind);
  $group.append($(`<i class="fas ${icon}" aria-hidden="true"></i>`));
  return $group;
}
function tokenExposureHUDLabel(tokenDoc) {
  const details = tokenExposureDetails(tokenDoc);
  const token = canvas.tokens?.get(tokenDoc.id) ?? tokenDoc.object;
  let text = ({ bright: "Bright light", dim: "Dim light", dark: "Darkness", unknown: "Unknown light" })[details.level] ?? "Unknown light";
  let icon = ({ bright: "fa-sun", dim: "fa-cloud-sun", dark: "fa-moon", unknown: "fa-question-circle" })[details.level] ?? "fa-question-circle";
  let levelClass = details.level;
  if (details.level === "dark" && token && isTargetInMagicalDarkness(tokenDoc, token)) {
    text = "Magical darkness";
    icon = "fa-hat-wizard";
    levelClass = "magical";
  }
  return { ...details, text, icon, levelClass };
}
function appendTokenNumericReadout($parent, kind, icon, value, title, canEdit, onChange) {
  const $group = makeHUDReadout(kind, icon, title);
  const $value = $('<input class="stealth-observer-token-input" type="number" step="1">').val(value);
  $value.attr({ "aria-label": title ?? kind, title: title ?? kind });
  if (!canEdit) $value.prop("readonly", true).addClass("disabled");
  $group.append($value);
  if (canEdit) $value.on("change", onChange);
  $parent.append($group);
  return $group;
}
function renderTokenHUD(app, html) {
  const token = app?.object;
  const tokenDoc = token?.document;
  if (!tokenDoc?.actor) return;
  const $html = $(html);
  $html.find(".stealth-observer-token-readout").remove();
  if (useActionHUDReadouts()) return;
  if (!game.user.isGM && !tokenDoc.actor.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return;

  const showPerception = shouldShowHUDReadout("Perception");
  const showStealth = shouldShowHUDReadout("Stealth") && tokenDoc.actor.statuses?.has("hiding");
  const showExposure = shouldShowHUDReadout("Exposure");
  if (!showPerception && !showStealth && !showExposure) return;

  const $left = $html.find(".left").first();
  const $right = $html.find(".right").first();
  if (!$left.length || !$right.length) return;

  const bank = getValidPerceptionBank(tokenDoc);
  const passive = getBasePassivePerception(tokenDoc);
  const perception = getEffectivePerception(tokenDoc);
  const canEdit = game.user.isGM;
  let $perception = null;
  let $stealth = null;
  let $exposure = null;

  if (showPerception) {
    const title = bank
      ? `Effective Perception: ${perception} (passive ${passive}; active roll ${bank.total})`
      : `Passive Perception: ${passive}. No active Perception roll is banked.`;
    $perception = makeHUDReadout("Perception", "fa-binoculars", title);
    const $input = $('<input class="stealth-observer-token-input" type="number" step="1">').val(perception);
    $input.attr({ "aria-label": title, title });
    if (!(canEdit && bank)) $input.prop("readonly", true).addClass("disabled");
    else $input.on("change", async event => {
      const value = Number(event.currentTarget.value);
      if (!Number.isFinite(value)) return refreshTokenHUDValues();
      await tokenDoc.setFlag(FLAG_SCOPE, TOKEN_PERCEPTION, { ...bank, total: value });
      refreshVisibilityAndHUD();
    });
    $perception.append($input);
  }

  const stealthFlag = tokenDoc.getFlag(FLAG_SCOPE, TOKEN_STEALTH);
  if (showStealth && Number.isFinite(Number(stealthFlag?.total))) {
    const value = Number(stealthFlag.total);
    const title = `Banked Stealth check result / Hiding DC: ${value}`;
    $stealth = makeHUDReadout("Stealth", "fa-eye-slash", title);
    const $input = $('<input class="stealth-observer-token-input" type="number" step="1">').val(value);
    $input.attr({ "aria-label": title, title });
    if (!canEdit) $input.prop("readonly", true).addClass("disabled");
    else $input.on("change", async event => {
      const next = Number(event.currentTarget.value);
      if (!Number.isFinite(next)) return refreshTokenHUDValues();
      await setTokenStealth(tokenDoc, next);
      const effect = getHidingEffect(tokenDoc.actor);
      if (effect) await effect.update({ "flags.midi-qol.hidden.dc": next });
      refreshVisibilityAndHUD();
    });
    $stealth.append($input);
  }

  if (showExposure) {
    const exposure = tokenExposureHUDLabel(tokenDoc);
    $exposure = makeHUDReadout("Exposure", exposure.icon,
      `Local exposure: ${exposure.text} (source: ${exposure.source}; raw: ${String(exposure.raw)})`);
    $exposure.addClass(`stealth-observer-exposure-${exposure.levelClass}`);
  }

  // Append after other Token HUD render hooks have added their controls. Stealthy uses
  // these same left/right rails; this keeps Perception bottom-left and Stealth + Exposure
  // bottom-right, in that exact order, even when other modules add buttons.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const currentDoc = canvas.tokens?.hud?.object?.document;
    if (!document.documentElement.contains($html[0]) || currentDoc?.id !== tokenDoc.id) return;
    $html.find(".stealth-observer-token-readout").remove();
    if ($perception) $left.append($perception);
    if ($stealth) $right.append($stealth);
    if ($exposure) $right.append($exposure);
  }));
}
function getActorBasePassivePerception(actor) {
  const skill = actor?.system?.skills?.[skillKey("perceptionSkill")];
  const passive = Number(skill?.passive);
  if (Number.isFinite(passive)) return passive;
  const modifier = Number(skill?.mod);
  return Number.isFinite(modifier) ? 10 + modifier : 0;
}
function getActionHUDReadouts(tokenOrActor) {
  if (!useActionHUDReadouts()) return [];
  let tokenDoc = tokenDocument(tokenOrActor);
  const actor = tokenDoc?.actor ?? (tokenOrActor?.documentName === "Actor" ? tokenOrActor : tokenOrActor?.actor);
  if (!tokenDoc && actor) tokenDoc = tokenForActor(actor);
  const targetActor = tokenDoc?.actor ?? actor;
  if (!targetActor) return [];
  if (!game.user.isGM && !targetActor.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return [];

  const entries = [];
  if (shouldShowHUDReadout("Perception")) {
    const bank = tokenDoc ? getValidPerceptionBank(tokenDoc) : null;
    const passive = tokenDoc ? getBasePassivePerception(tokenDoc) : getActorBasePassivePerception(targetActor);
    const perception = tokenDoc ? getEffectivePerception(tokenDoc) : Math.max(passive, bank?.total ?? 0);
    entries.push({ key: "perception", icon: "fa-binoculars", value: perception,
      title: bank ? `Effective Perception ${perception} (passive ${passive}, active ${bank.total})` : `Passive Perception ${passive}` });
  }
  const stealthFlag = tokenDoc?.getFlag(FLAG_SCOPE, TOKEN_STEALTH);
  if (shouldShowHUDReadout("Stealth") && targetActor.statuses?.has("hiding") && Number.isFinite(Number(stealthFlag?.total))) {
    entries.push({ key: "stealth", icon: "fa-eye-slash", value: Number(stealthFlag.total), title: `Banked Stealth / Hiding DC ${Number(stealthFlag.total)}` });
  }
  if (tokenDoc && shouldShowHUDReadout("Exposure")) {
    const exposure = tokenExposureHUDLabel(tokenDoc);
    entries.push({ key: "exposure", icon: exposure.icon, value: null,
      className: `stealth-observer-exposure-${exposure.levelClass}`,
      title: `Local exposure: ${exposure.text} (source: ${exposure.source}; raw: ${String(exposure.raw)})` });
  }
  return entries;
}
function refreshTokenHUDValues() {
  const hud = canvas.tokens?.hud;
  const tokenDoc = hud?.object?.document;
  const element = hud?.element;
  if (tokenDoc?.actor && element && !useActionHUDReadouts()) {
    const $html = $(element);
    const bank = getValidPerceptionBank(tokenDoc);
    const passive = getBasePassivePerception(tokenDoc);
    const perception = getEffectivePerception(tokenDoc);
    const $perception = $html.find(".stealth-observer-perception .stealth-observer-token-input");
    if ($perception.length) {
      $perception.val(perception).attr("title", bank
        ? `Effective Perception: ${perception} (passive ${passive}; active roll ${bank.total})`
        : `Passive Perception: ${passive}. No active Perception roll is banked.`);
    }
    const stealthFlag = tokenDoc.getFlag(FLAG_SCOPE, TOKEN_STEALTH);
    const $stealth = $html.find(".stealth-observer-stealth .stealth-observer-token-input");
    if ($stealth.length) {
      if (tokenDoc.actor.statuses?.has("hiding") && Number.isFinite(Number(stealthFlag?.total))) {
        $stealth.val(Number(stealthFlag.total)).attr("title", `Banked Stealth check result / Hiding DC: ${Number(stealthFlag.total)}`);
      } else $html.find(".stealth-observer-stealth").remove();
    }
    const $exposure = $html.find(".stealth-observer-exposure");
    if ($exposure.length) {
      const exposure = tokenExposureHUDLabel(tokenDoc);
      $exposure.removeClass("stealth-observer-exposure-bright stealth-observer-exposure-dim stealth-observer-exposure-dark stealth-observer-exposure-unknown stealth-observer-exposure-magical");
      $exposure.addClass(`stealth-observer-exposure-${exposure.levelClass}`);
      $exposure.find("i").attr("class", `fas ${exposure.icon}`);
      $exposure.attr("title", `Local exposure: ${exposure.text} (source: ${exposure.source}; raw: ${String(exposure.raw)})`);
    }
  }
  Hooks.callAll("stealth-observer.readoutsChanged", tokenDoc ?? null);
  renderActionHUDReadoutsIfPresent();
}
function renderActionHUDReadoutsIfPresent() {
  const api = game.modules?.get?.("action-hud")?.api;
  if (typeof api?.refreshExternalReadouts === "function") api.refreshExternalReadouts();
}

function normalizeExposure(value) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["bright", "brightest", "daylight", "lit"].includes(normalized)) return "bright";
    if (["dim", "halfdark", "half-dark", "twilight"].includes(normalized)) return "dim";
    if (["dark", "darkness", "pitch dark", "pitch-dark"].includes(normalized)) return "dark";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const levels = CONST?.LIGHTING_LEVELS ?? foundry?.canvas?.perception?.VisionMode?.LIGHTING_LEVELS;
    if (levels) {
      if (value === levels.DARKNESS) return "dark";
      if (value === levels.HALFDARK || value === levels.DIM) return "dim";
      if (value === levels.BRIGHT || value === levels.BRIGHTEST) return "bright";
      // UNLIT is deliberately not guessed: it can occur in a dark scene with no
      // local illumination, so use the scene fallback only after checking helpers.
    }
  }
  return null;
}
function tokenExposureDetails(token) {
  const placeable = canvas.tokens?.get(token.id);
  if (!placeable) return { level: "unknown", source: "no-token-placeable", raw: null };

  // Midi-QOL exposes the same per-token light classification used by its D&D
  // automation. This accounts for local light sources instead of assuming that
  // every point in a dark global scene is dark.
  const midiUtils = globalThis.MidiQOL?.api?.tokenUtils
    ?? globalThis.MidiQOL?.tokenUtils
    ?? globalThis.cat?.utils?.tokenUtils;
  const midiGetLightLevel = midiUtils?.getLightLevel;
  // Midi-QOL 14.6.6's getLightLevel(token) calls token.getMovementOrigin().
  // In Foundry v14 that method belongs to TokenDocument, not the canvas
  // Token placeable. Passing the placeable first throws before a valid lookup.
  const tokenDoc = tokenDocument(token) ?? placeable.document;
  if (typeof midiGetLightLevel === "function" && typeof tokenDoc?.getMovementOrigin === "function") {
    try {
      const raw = midiGetLightLevel.call(midiUtils, tokenDoc);
      const level = normalizeExposure(raw);
      if (level) return { level, source: "MidiQOL.api.tokenUtils.getLightLevel(TokenDocument)", raw };
      debug("Midi per-token light-level lookup returned an unrecognized value", raw);
    } catch (err) {
      debug("Midi per-token light-level lookup failed for TokenDocument", err?.message ?? err);
    }
  } else if (typeof midiGetLightLevel === "function") {
    debug("Midi per-token light-level lookup skipped: TokenDocument.getMovementOrigin is unavailable");
  }

  // Keep compatibility with environments that provide a per-point lighting
  // helper, but do not assume it exists on Foundry's CanvasVisibility object.
  const point = placeable.center;
  const nativeLookups = [
    [canvas.effects?.visibility, canvas.effects?.visibility?.getLightLevel, point, "canvas.effects.visibility.getLightLevel"],
    [canvas.effects, canvas.effects?.getLightLevel, point, "canvas.effects.getLightLevel"]
  ];
  for (const [owner, getter, argument, source] of nativeLookups) {
    if (typeof getter !== "function") continue;
    try {
      const raw = getter.call(owner, argument);
      const level = normalizeExposure(raw);
      if (level) return { level, source, raw };
    } catch (err) {
      debug("Native per-point light-level lookup failed", source, err);
    }
  }

  // Last-resort fallback. This is scene-wide and cannot account for local lights;
  // the diagnostic source makes that limitation visible instead of hiding it.
  const darkness = Number(canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0);
  const level = darkness >= 1 ? "dark" : darkness > 0 ? "dim" : "bright";
  return { level, source: "scene-darkness-fallback", raw: darkness };
}
function tokenExposure(token) {
  return tokenExposureDetails(token).level;
}
/**
 * Normalize detection capabilities from both TokenDocument and Actor.
 * Vision 5e 3.2.3 stores its derived detection modes on Actor.detectionModes
 * as an object whose values are numeric ranges (for example basicSight: 60,
 * seeAll: 120, feelTremor: 30). Foundry token-level modes may instead be
 * arrays, Maps, or objects containing { enabled, range } records.
 */
function rawDetectionModeEntries(modes) {
  if (modes instanceof Map) return Array.from(modes.entries());
  if (Array.isArray(modes)) {
    return modes.map((mode, index) => [mode?.id ?? mode?.type ?? String(index), mode]);
  }
  if (modes && typeof modes === "object") return Object.entries(modes);
  return [];
}
function detectionModeEntries(tokenOrDoc) {
  const doc = tokenOrDoc?.document ?? tokenOrDoc;
  const actor = doc?.actor ?? tokenOrDoc?.actor;
  const byId = new Map();
  // Start with token-specific configuration. An explicit disabled entry wins,
  // while a token entry that only says enabled=true inherits the Actor range.
  for (const [id, mode] of rawDetectionModeEntries(doc?.detectionModes)) byId.set(mode?.id ?? id, mode);
  // Vision 5e derives the available sensory modes on the Actor, not the TokenDocument.
  for (const [id, actorMode] of rawDetectionModeEntries(actor?.detectionModes)) {
    const key = actorMode?.id ?? id;
    if (!byId.has(key)) {
      byId.set(key, actorMode);
      continue;
    }
    const tokenMode = byId.get(key);
    if (tokenMode?.enabled === false) continue;
    const tokenHasRange = typeof tokenMode === "number" ||
      (typeof tokenMode === "string" && tokenMode.trim() !== "" && Number.isFinite(Number(tokenMode))) ||
      tokenMode?.range !== undefined || tokenMode?.distance !== undefined || tokenMode?.radius !== undefined;
    if (!tokenHasRange) {
      if (tokenMode && typeof tokenMode === "object" && tokenMode.enabled === true && actorMode && typeof actorMode === "object") {
        byId.set(key, { ...actorMode, enabled: true });
      } else if (tokenMode === true || tokenMode?.enabled === true) {
        byId.set(key, actorMode);
      }
    }
  }
  return Array.from(byId.entries());
}
function detectionModeRange(mode) {
  if (typeof mode === "number") return mode;
  if (typeof mode === "string" && mode.trim() !== "" && Number.isFinite(Number(mode))) return Number(mode);
  const value = mode?.range ?? mode?.distance ?? mode?.radius;
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}
function detectionModeEnabled(mode) {
  if (typeof mode === "number") return mode > 0;
  if (typeof mode === "string" && mode.trim() !== "" && Number.isFinite(Number(mode))) return Number(mode) > 0;
  if (mode === true) return true;
  if (!mode || typeof mode !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(mode, "enabled")) return mode.enabled === true;
  const range = detectionModeRange(mode);
  // An object stored under a mode ID is itself an enabled entry unless explicitly disabled.
  return range === null ? true : range > 0;
}
function detectionModeCoversRange(mode, distance) {
  const range = detectionModeRange(mode);
  if (range === null) return true;
  if (range === Infinity) return true;
  return range > 0 && distance <= range;
}
const DETECTION_MODE_GROUPS = [
  new Set(["darkvision", "basicSight"]),
  new Set(["devilsSight", "devilSight"]),
  new Set(["truesight", "trueSight", "seeAll"]),
  new Set(["blindsight"]),
  new Set(["tremorsense", "feelTremor"])
];
function sameDetectionMode(a, b) {
  if (a === b) return true;
  return DETECTION_MODE_GROUPS.some(group => group.has(a) && group.has(b));
}

function hasModeInRange(observer, target, modeIds) {
  if (!observer || !target) return false;
  const doc = observer.document ?? observer;
  const actor = doc.actor ?? observer.actor;
  const distance = distanceBetweenTokens(observer, target);
  const hasConfiguredMode = detectionModeEntries(doc).some(([id, mode]) => {
    const modeId = mode?.id ?? id;
    return modeIds.some(wanted => sameDetectionMode(modeId, wanted)) &&
      detectionModeEnabled(mode) && detectionModeCoversRange(mode, distance);
  });
  if (hasConfiguredMode) return true;
  const rawSenses = actor?.system?.attributes?.senses ?? {};
  const senses = rawSenses.ranges ?? rawSenses;
  const senseKeys = {
    darkvision: "darkvision",
    basicSight: "darkvision",
    blindsight: "blindsight",
    tremorsense: "tremorsense",
    feelTremor: "tremorsense",
    truesight: "truesight",
    trueSight: "truesight",
    seeAll: "truesight"
  };
  return modeIds.some(id => {
    const key = senseKeys[id];
    const range = Number(senses?.[key] ?? 0);
    return !!key && range > 0 && distance <= range;
  });
}
/**
 * Vision 5e and third-party systems can register additional precise SIGHT modes
 * (for example thermalVision). Treat eligible, in-range SIGHT modes as a source
 * of vision in natural darkness, but not as a way to pierce magical darkness.
 * basicSight is ordinary darkvision and lightPerception only perceives light.
 */
function hasAdditionalSightMode(observer, target) {
  if (!observer || !target) return false;
  const source = observer.vision ?? observer.visionSource;
  const sightType = foundry?.canvas?.perception?.DetectionMode?.DETECTION_TYPES?.SIGHT ?? "sight";
  for (const [id, mode] of detectionModeEntries(observer.document ?? observer)) {
    const modeId = mode?.id ?? id;
    if (!detectionModeEnabled(mode) || !detectionModeCoversRange(mode, distanceBetweenTokens(observer, target))) continue;
    if (["basicSight", "darkvision", "lightPerception", "devilsSight", "devilSight", "seeAll", "truesight", "trueSight", "blindsight"].some(value => sameDetectionMode(modeId, value))) continue;
    const definition = CONFIG.Canvas?.detectionModes?.[modeId];
    if (definition?.type !== sightType || definition.imprecise) continue;
    try {
      if (typeof definition._canDetect === "function") {
        if (!source || !definition._canDetect(source, target)) continue;
      }
    } catch (err) {
      debug("Could not evaluate custom SIGHT detection mode", modeId, err);
      continue;
    }
    return true;
  }
  return false;
}
function detectHidden(targetDoc, observerDoc) {
  if (!targetDoc?.actor || !observerDoc?.actor || targetDoc.id === observerDoc.id) return true;
  if (!targetDoc.actor.statuses?.has("hiding")) return true;
  // A separate Invisible condition remains effective even when Perception beats the Stealth result.
  if (targetDoc.actor.statuses?.has("invisible")) return false;
  if (targetDoc.disposition === observerDoc.disposition) return true;
  const observer = canvas.tokens?.get(observerDoc.id) ?? observerDoc.object;
  const target = canvas.tokens?.get(targetDoc.id) ?? targetDoc.object;
  if (!observer || !target) return false;
  const midiConfig = (() => {
    try { return game.settings.get("midi-qol", "ConfigSettings"); } catch (_) { return null; }
  })();
  const forceVision = !!midiConfig?.optionalRules?.invisVision;
  if (observerDoc.sight?.enabled === false && !forceVision) return true;
  const blind = observerDoc.actor.statuses?.has("blinded");
  const blindsight = hasModeInRange(observer, target, ["blindsight"]);
  if (blind && !blindsight) return false;
  const devilSight = hasModeInRange(observer, target, ["devilsSight", "devilSight"]);
  const truesight = hasModeInRange(observer, target, ["truesight", "trueSight", "seeAll"]);
  const special = devilSight || truesight || blindsight;
  const tremor = hasModeInRange(observer, target, ["tremorsense", "feelTremor"]) &&
    (targetDoc.actor.statuses?.has("moving") || target.isMoving === true || !!target._animation);
  const additionalSight = hasAdditionalSightMode(observer, target);
  const darknessProof = special || tremor;
  const basePerception = getEffectivePerception(observerDoc);
  const exposureInfo = tokenExposureDetails(targetDoc);
  const exposure = exposureInfo.level;
  const darkvision = hasModeInRange(observer, target, ["darkvision", "basicSight"]);
  if (exposure === "dark" && !darknessProof && !darkvision && !additionalSight) {
    debug("Hidden target cannot be detected in darkness", { observer: observerDoc.name, target: targetDoc.name, perception: basePerception, exposure });
    return false;
  }
  const magicalDarkness = exposure === "dark" && isTargetInMagicalDarkness(targetDoc, target);
  if (magicalDarkness && !darknessProof) {
    // Ordinary darkvision and other non-magical SIGHT modes do not pierce magical darkness.
    debug("Hidden target is in magical darkness", { observer: observerDoc.name, target: targetDoc.name, darkvision, additionalSight });
    return false;
  }
  let perception = basePerception;
  if (!darknessProof && !additionalSight && exposure === "dim" && !darkvision) perception -= 5;
  if (!darknessProof && !additionalSight && exposure === "dark" && darkvision) perception -= 5;
  // Tremorsense can notice a moving creature without a darkness penalty, but not one that is standing still.
  const stealth = targetDoc.getFlag(FLAG_SCOPE, TOKEN_STEALTH);
  const dc = Number(stealth?.total ?? getHidingEffect(targetDoc.actor)?.flags?.["midi-qol"]?.hidden?.dc ?? 15);
  const detected = perception >= dc;
  debug("Per-observer Hiding check", {
    observer: observerDoc.name,
    target: targetDoc.name,
    passive: getBasePassivePerception(observerDoc),
    active: getValidPerceptionBank(observerDoc)?.total ?? null,
    effectivePerception: basePerception,
    adjustedPerception: perception,
    stealth: dc,
    exposure,
    exposureSource: exposureInfo.source,
    rawExposure: exposureInfo.raw,
    darkvision,
    special: darknessProof,
    tremor,
    additionalSight,
    selectedDetectionMode: observerDoc.sight?.detectionMode ?? null,
    selectedVisionMode: observerDoc.sight?.visionMode ?? null,
    availableDetectionModes: detectionModeEntries(observerDoc).map(([id, mode]) => ({
      id: mode?.id ?? id,
      enabled: detectionModeEnabled(mode),
      range: detectionModeRange(mode)
    })),
    detected
  });
  return detected;
}
function distanceBetweenTokens(observer, target) {
  if (canvas.grid?.measurePath && observer?.center && target?.center) {
    const measured = canvas.grid.measurePath([observer.center, target.center])?.distance;
    if (Number.isFinite(Number(measured))) return Number(measured);
  }
  return Math.hypot((observer?.center?.x ?? 0) - (target?.center?.x ?? 0), (observer?.center?.y ?? 0) - (target?.center?.y ?? 0)) /
    (canvas.grid?.size ?? 100) * (canvas.scene?.grid?.distance ?? 5);
}
function isTargetInMagicalDarkness(targetDoc, target) {
  try {
    const sources = canvas.effects?.visionSources ?? canvas.effects?.lightSources ?? [];
    return Array.from(sources).some(source => {
      const data = source?.data ?? source?.source?.data ?? {};
      const darkness = data.darkness ?? data.negative ?? data.isDarkness;
      if (!darkness) return false;
      const shape = source.shape ?? source.source?.shape;
      return shape?.contains?.(target.center.x, target.center.y) ?? false;
    });
  } catch (_) {
    return false;
  }
}
function registerMidiVisibilityIntegration() {
  if (wrapperRegistered) return;
  try {
    // Track the observer during Midi's own visibility test. Midi-QOL 14.6.x wraps
    // DetectionMode.testVisibility and then asks TokenDocument.hasStatusEffect("invisible").
    libWrapper.register(MODULE_ID, "foundry.canvas.perception.DetectionMode.prototype.testVisibility",
      function (wrapped, visionSource, ...args) {
        const previous = currentObserver;
        const sourceObject = visionSource?.object ?? visionSource?.token ?? null;
        currentObserver = sourceObject?.document ?? (sourceObject?.documentName === "Token" ? sourceObject : null);
        try { return wrapped(visionSource, ...args); }
        finally { currentObserver = previous; }
      }, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.Token.documentClass.prototype.hasStatusEffect",
      function (wrapped, statusId) {
        // This is registered as WRAPPER, so it MUST always continue the chain.
        // Calling wrapped first keeps libWrapper from auto-unregistering us; we then
        // replace Midi's generic Hiding answer with our observer-specific result.
        const originalResult = wrapped(statusId);
        const invisibleId = CONFIG.specialStatusEffects?.INVISIBLE ?? "invisible";
        if (statusId !== invisibleId || !currentObserver || !this.actor?.statuses?.has("hiding")) return originalResult;
        const visible = detectHidden(this, currentObserver);
        debug("Midi invisible-status override", {
          target: this.name,
          observer: currentObserver.name,
          visible,
          originalMidiResult: originalResult
        });
        return !visible;
      }, "WRAPPER");
    wrapperRegistered = true;
    debug("Midi per-observer visibility integration registered");
  } catch (err) {
    warn("Could not register Midi visibility integration. Midi's own hiding rules remain active.", err);
    ui.notifications.warn(`${MODULE_ID}: could not extend Midi-QOL visibility checks. See console.`);
  }
}
