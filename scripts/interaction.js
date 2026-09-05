import { MODULE } from "./store.js";
import { openProxy, proxyChoices } from "./player.js";

export function playerProxy(actor) {
  return !game.user.isGM && proxyChoices(actor).length > 0;
}

export function addProxyButton(app, actor, buttons) {
  if (!playerProxy(actor) || buttons.some(button => button.class === "vr-ledger")) return;
  buttons.unshift({ label: "Reputations", class: "vr-ledger", icon: "fas fa-book-open", onclick: async () => {
    const interaction = await openProxy(actor);
    if (interaction) await app.close();
    return interaction;
  } });
}

function directProxy(token) {
  if (!playerProxy(token.actor) || token.document.hidden || !token.isVisible) return false;
  return !(game.modules.get("item-piles")?.active && game.itempiles?.API?.isValidItemPile(token.document));
}

export function registerPlayerInteraction() {
  const wrappers = {
    _canView(wrapped, ...args) {
      return directProxy(this) || wrapped(...args);
    },
    _onClickLeft2(wrapped, ...args) {
      return directProxy(this) ? openProxy(this.actor) : wrapped(...args);
    }
  };
  for (const [method, wrapper] of Object.entries(wrappers)) {
    if (globalThis.libWrapper) libWrapper.register(MODULE, `CONFIG.Token.objectClass.prototype.${method}`, wrapper, "MIXED");
    else {
      const prototype = CONFIG.Token.objectClass.prototype, original = prototype[method];
      prototype[method] = function (...args) {
        return wrapper.call(this, original.bind(this), ...args);
      };
    }
  }
}

Hooks.on("item-piles-openInterface", (app, actor) => {
  if (game.user.isGM || app._vrProxyHeader) return;
  const original = app._getHeaderButtons;
  app._getHeaderButtons = function (...args) {
    const buttons = original.apply(this, args);
    addProxyButton(this, actor, buttons);
    return buttons;
  };
  app._vrProxyHeader = true;
});
