import { MODULE, ReputationStore } from "./store.js";
import { Runtime } from "./runtime.js";
import { standingKey } from "./core.js";

export function hostileTo(proxy, character) {
  if (!proxy || !character) return false; // missing proxy or character not hostile
  const sources = [proxy.uuid, `Actor.${proxy.id}`, proxy.getFlag("core", "sourceId"), proxy._stats?.compendiumSource], state = Runtime.read(); // every proxy uuid form
  return ReputationStore.read().reputations.some(rep => rep.hostile && rep.proxies.some(row => sources.includes(row.actorUuid)) && (state.scores[rep.id]?.[standingKey(rep, character.uuid)] ?? 0) < 0);
}

export function registerHostility() {
  Hooks.on("drawToken", token => {
    const original = token._getBorderColor;
    if (token[`_${MODULE}`]) return; // Patch once per token
    token[`_${MODULE}`] = true;
    token._getBorderColor = function (...args) { // Border turns hostile on negative standing
      const controlled = canvas.tokens.controlled.filter(row => row.actor && !row.actor.isToken), character = controlled.length === 1 ? controlled[0].actor : game.user.character; // one controlled, else assigned
      return hostileTo(this.actor, character) ? CONFIG.Canvas.dispositionColors.HOSTILE : original.apply(this, args);
    };
  });
  const refresh = () => { // repaint on standing, selection
    for (const token of canvas.tokens?.placeables ?? []) token.renderFlags.set({ refreshBorder: true }); // In: all tokens, out: border refresh
  };
  Hooks.on("controlToken", refresh);
  Hooks.on("victoryStandingChanged", refresh);
  Hooks.on("victoryReputationsChanged", refresh);
}
