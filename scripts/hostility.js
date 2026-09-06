import { MODULE, ReputationStore } from "./store.js";
import { Runtime } from "./runtime.js";
import { standingKey } from "./core.js";

export function hostileTo(proxy, character) {
  if (!proxy || !character) return false;
  const sources = [proxy.uuid, `Actor.${proxy.id}`, proxy.getFlag("core", "sourceId"), proxy._stats?.compendiumSource], state = Runtime.read(); // Every uuid form a proxy actor can appear under
  return ReputationStore.read().reputations.some(rep => rep.hostile && rep.proxies.some(row => sources.includes(row.actorUuid)) && (state.scores[rep.id]?.[standingKey(rep, character.uuid)] ?? 0) < 0);
}

export function registerHostility() {
  Hooks.on("drawToken", token => {
    const original = token._getBorderColor;
    if (token[`_${MODULE}`]) return; // Patch once per token
    token[`_${MODULE}`] = true;
    token._getBorderColor = function (...args) { // Border goes hostile when the viewing character is in the negative
      const controlled = canvas.tokens.controlled.filter(row => row.actor && !row.actor.isToken), character = controlled.length === 1 ? controlled[0].actor : game.user.character; // Single controlled token wins, else assigned character
      return hostileTo(this.actor, character) ? CONFIG.Canvas.dispositionColors.HOSTILE : original.apply(this, args);
    };
  });
  const refresh = () => { // Repaint borders when standing or selection changes
    for (const token of canvas.tokens?.placeables ?? []) token.renderFlags.set({ refreshBorder: true });
  };
  Hooks.on("controlToken", refresh);
  Hooks.on("victoryStandingChanged", refresh);
  Hooks.on("victoryReputationsChanged", refresh);
}
