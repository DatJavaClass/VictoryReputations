import { MODULE, ReputationStore } from "./store.js";
import { attempt, ReputationManager } from "./gm.js";
import { Runtime } from "./runtime.js";
import { openLedger, openProxy } from "./player.js";
import { registerAdapter } from "./adapters.js";
import { hostileTo, registerHostility } from "./hostility.js";
import { addProxyButton, playerProxy, registerPlayerInteraction } from "./interaction.js";

let manager;

function openManager() {
  return attempt(() => {
    if (!game.user.isGM) throw new Error("Only a GM can configure reputations.");
    manager ??= new ReputationManager();
    manager.render(true);
    return manager;
  });
}

Hooks.once("init", () => {
  ReputationStore.register();
  Runtime.register();
  registerHostility();
  // Public API for macros and other modules, see API.md
  game.modules.get(MODULE).api = Object.freeze({ openManager, openLedger, openProxy, registerAdapter,
    installLedger: actor => Runtime.installLedger(actor), getStanding: actor => Runtime.ledger(actor), hostileTo,
    isHostile: (repId, actor) => {
      const rep = ReputationStore.read().reputations.find(row => row.id === repId);
      // Party reps share one "party" score key, others key by actor uuid
      return Boolean(rep?.hostile && (Runtime.read().scores[rep.id]?.[rep.party && rep.members.includes(actor.uuid) ? "party" : actor.uuid] ?? 0) < 0);
    }, diagnostics: () => ({ version: game.modules.get(MODULE).version, foundry: game.version, system: game.system.id,
      systemVersion: game.system.version, itemPiles: game.modules.get("item-piles")?.version, activeGM: game.users.activeGM?.id,
      transactions: game.user.isGM ? Runtime.read().transactions.map(({ id, status, error }) => ({ id, status, error })) : [] }) });
});

Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM || html.find(".vr-open").length) return; // Skip duplicate button on re-render
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vr-open";
  button.textContent = "Reputations";
  button.addEventListener("click", openManager);
  const footer = html.find(".directory-footer")[0] ?? html[0];
  footer.append(button);
});

Hooks.on("victoryReputationsChanged", () => {
  if (manager?.rendered) manager.render();
});

Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.find(control => control.name === "token");
  tokens?.tools.push({ name: "victory-reputations", title: "Talk to Reputation Proxy", icon: "fas fa-handshake", button: true,
    onClick: () => {
      const targets = [...game.user.targets];
      if (targets.length !== 1) return ui.notifications.warn("Target one reputation proxy first.");
      openProxy(targets[0].actor);
    } });
  tokens?.tools.push({ name: "victory-ledger", title: "View Reputations", icon: "fas fa-book-open", button: true, onClick: () => openLedger() });
});

Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  if (playerProxy(sheet.actor)) return addProxyButton(sheet, sheet.actor, buttons); // Players get the proxy button on NPC sheets
  if (sheet.actor.testUserPermission(game.user, "OWNER")) buttons.unshift({ label: "Reputations", class: "vr-ledger", icon: "fas fa-book-open", onclick: () => openLedger(sheet.actor) });
});

Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  if (sheet.item.getFlag(MODULE, "ledger") && sheet.item.actor?.testUserPermission(game.user, "OWNER")) buttons.unshift({ label: "View Reputations", class: "vr-ledger", icon: "fas fa-book-open", onclick: () => openLedger(sheet.item.actor) });
});

Hooks.on("pf1PreActionUse", actionUse => {
  if (!actionUse.item?.getFlag(MODULE, "ledger")) return;
  openLedger(actionUse.item.actor);
  return false; // Cancel the PF1 action, ledger opens instead
});

Hooks.once("ready", () => {
  registerPlayerInteraction();
  // Prepared or recovery journals mean a crashed donation
  if (game.user.isGM && Runtime.read().transactions.some(row => ["prepared", "recovery"].includes(row.status))) ui.notifications.warn("Victory Reputations has an interrupted transaction. Open Monitor / Modify Standing to restore it.");
});
