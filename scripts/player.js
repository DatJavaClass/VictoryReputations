import { MODULE, ReputationStore } from "./store.js";
import { Runtime } from "./runtime.js";

function escape(value) {
  const span = document.createElement("span");
  span.textContent = String(value ?? "");
  return span.innerHTML.replaceAll('"', "&quot;");
}

function pick(title, label, choices, selected) {
  return new Promise(resolve => new Dialog({ title,
    content: `<div class="form-group"><label>${escape(label)}</label><select name="choice">${choices.map(row => `<option value="${escape(row.id)}"${row.id === selected ? " selected" : ""}>${escape(row.name)}</option>`).join("")}</select></div>`,
    buttons: { choose: { label: "Continue", callback: html => resolve(html.find('[name="choice"]').val()) }, cancel: { label: "Cancel", callback: () => resolve(null) } },
    default: "choose", close: () => resolve(null)
  }, { width: 420 }).render(true));
}

export async function chooseActor(actor) {
  if (actor) {
    actor = typeof actor === "string" ? await fromUuid(actor) : actor;
    actor = actor?.actor ?? actor;
    if (actor?.documentName !== "Actor" || actor.isToken || !actor.testUserPermission(game.user, "OWNER")) throw new Error("Choose an owned world character with a linked token.");
    return actor;
  }

  const controlled = (canvas?.tokens?.controlled ?? []).map(token => token.actor).filter(actor => actor && !actor.isToken && actor.testUserPermission(game.user, "OWNER"));
  const selected = [...new Map(controlled.map(actor => [actor.uuid, actor])).values()];
  if (selected.length === 1) return selected[0];
  const available = [...new Map([...selected, ...game.actors.filter(actor => actor.testUserPermission(game.user, "OWNER"))].map(actor => [actor.uuid, actor])).values()];
  if (!available.length) throw new Error("You do not own a character. Ask your GM to assign one.");
  if (available.length === 1) return available[0];
  const preferred = selected.length ? selected[0].uuid : game.user.character?.uuid;
  const id = await pick("Choose Character", "Whose reputation?", available.map(actor => ({ id: actor.uuid, name: actor.name })), preferred);
  return available.find(actor => actor.uuid === id) ?? null;
}

export function proxyChoices(actor) {
  if (actor?.documentName !== "Actor") return [];
  const sources = new Set([actor.uuid, actor.getFlag("core", "sourceId"), actor._stats?.compendiumSource, actor.prototypeToken?.actor?.uuid].filter(Boolean));
  if (actor.isToken && actor.id) sources.add(`Actor.${actor.id}`);
  return ReputationStore.read().reputations.flatMap(rep => rep.proxies.filter(proxy => sources.has(proxy.actorUuid)).map(proxy => ({ rep, proxy })));
}

export async function openProxy(proxyActorOrUuid, actorOptional) {
  try {
    let proxyActor = typeof proxyActorOrUuid === "string" ? await fromUuid(proxyActorOrUuid) : proxyActorOrUuid;
    proxyActor = proxyActor?.actor ?? proxyActor;
    if (proxyActor?.documentName !== "Actor") throw new Error("Choose an NPC proxy token or actor.");
    const choices = proxyChoices(proxyActor);
    if (!choices.length) throw new Error("This NPC is not a reputation proxy.");
    let choice = choices[0];
    if (choices.length > 1) {
      const id = await pick("Choose Reputation", "Who are you speaking for?", choices.map((row, index) => ({ id: String(index), name: row.rep.name })));
      if (id === null) return null;
      choice = choices[Number(id)];
    }

    const actor = await chooseActor(actorOptional);
    if (!actor) return null;
    return new ReputationInteraction(actor, choice.rep.id, choice.proxy.id).render(true);
  } catch (error) {
    ui.notifications.error(error.message);
    return null;
  }
}

export async function openLedger(actorOptional) {
  try {
    const actor = await chooseActor(actorOptional);
    return actor ? new ReputationLedger(actor).render(true) : null;
  } catch (error) {
    ui.notifications.error(error.message);
    return null;
  }
}

class ReputationInteraction extends Application {
  constructor(actor, reputationId, proxyId) {
    super();
    this.actor = actor;
    this.reputationId = reputationId;
    this.proxyId = proxyId;
    this.donating = false;
    this.pending = false;
    this.quantities = new Map();
    this.stock = [];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "Reputations", template: `modules/${MODULE}/templates/player.hbs`,
      classes: ["victory-reputations", "vr-player"], width: 720, height: "auto", resizable: true, scrollY: [".vr-goods"] });
  }

  async getData() {
    try {
      if (!this.actor.testUserPermission(game.user, "OWNER")) throw new Error("You no longer own this character.");
      const rep = ReputationStore.read().reputations.find(rep => rep.id === this.reputationId), proxy = rep?.proxies.find(proxy => proxy.id === this.proxyId);
      if (!rep || !proxy) throw new Error("This reputation proxy is no longer available.");
      const standing = (await Runtime.ledger(this.actor)).find(row => row.id === rep.id);
      const data = { name: rep.name, actorName: this.actor.name, standing, donating: this.donating,
        message: await TextEditor.enrichHTML(proxy.message, { async: true, secrets: false, relativeTo: this.actor }), pending: this.pending };
      if (!this.donating) return data;
      this.stock = await Runtime.inventory(this.actor, rep);
      for (const kind of ["items", "currencies"]) {
        data[kind] = rep[kind].flatMap(offer => {
          const stock = this.stock.filter(row => row.kind === kind && row.offerId === offer.id);
          return (stock.length ? stock : [{ id: `unavailable-${kind}-${offer.id}`, quantity: 0 }]).map(row => {
            const quantity = Math.min(this.quantities.get(row.id) ?? 0, row.quantity);
            this.quantities.set(row.id, quantity);
            return { id: row.id, name: row.name || offer.name, owned: row.quantity, quantity, empty: !row.quantity, remaining: row.quantity - quantity };
          });
        });
      }

      data.hasSelection = this.stock.some(row => (this.quantities.get(row.id) ?? 0) > 0);
      return data;
    } catch (error) {
      return { error: error.message };
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="close"]').on("click", () => this.close());
    html.find('[data-action="donate"]').on("click", () => { this.donating = true; this.render(); });
    html.find("[data-step]").on("click", event => {
      const row = event.currentTarget.closest("[data-stock]"), input = row.querySelector("input");
      this.setQuantity(row, Number(input.value) + Number(event.currentTarget.dataset.step));
    });
    html.find("input[data-quantity]").on("input change", event => this.setQuantity(event.currentTarget.closest("[data-stock]"), Number(event.currentTarget.value)));
    html.find('[data-action="submit"]').on("click", () => this.surrender());
  }

  setQuantity(row, value) {
    if (this.pending) return;
    const stock = this.stock.find(stock => stock.id === row.dataset.stock), quantity = Math.min(stock?.quantity ?? 0, Math.max(0, Number.isSafeInteger(value) ? value : 0));
    this.quantities.set(row.dataset.stock, quantity);
    row.querySelector("input").value = quantity;
    row.querySelector("[data-remaining]").textContent = (stock?.quantity ?? 0) - quantity;
    this.element.find('[data-action="submit"]').prop("disabled", ![...this.quantities.values()].some(quantity => quantity > 0));
  }

  async surrender() {
    if (this.pending) return;
    const selection = this.stock.map(row => ({ id: row.id, kind: row.kind, offerId: row.offerId, quantity: this.quantities.get(row.id) ?? 0 })).filter(row => row.quantity > 0);
    if (!selection.length) return ui.notifications.warn("Choose goods to surrender first.");
    this.pending = true;
    this.element.find("button, input").prop("disabled", true);
    this.element.find("[data-status]").text("Waiting for the GM...");
    try {
      await Runtime.submit(this.actor, { reputationId: this.reputationId, proxyId: this.proxyId, selection });
      ui.notifications.info("Goods surrendered. Your reputation has been updated.");
      this.pending = false;
      await this.close();
    } catch (error) {
      this.pending = false;
      ui.notifications.error(error.message);
      this.render();
    }
  }

  async close(options) {
    if (this.pending) return;
    return super.close(options);
  }
}

class ReputationLedger extends Application {
  constructor(actor) {
    super();
    this.actor = actor;
    this.handlers = [
      ["updateActor", Hooks.on("updateActor", changed => { if (changed.uuid === actor.uuid) this.render(); })],
      ["victoryReputationsChanged", Hooks.on("victoryReputationsChanged", () => this.render())],
      ["victoryStandingChanged", Hooks.on("victoryStandingChanged", () => this.render())]
    ];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "View Reputations", template: `modules/${MODULE}/templates/ledger.hbs`,
      classes: ["victory-reputations", "vr-player"], width: 560, height: "auto", resizable: true, scrollY: [".vr-ledger-list"] });
  }

  async getData() {
    try {
      if (!this.actor.testUserPermission(game.user, "OWNER")) throw new Error("You no longer own this character.");
      return { actorName: this.actor.name, reputations: await Runtime.ledger(this.actor) };
    } catch (error) {
      return { error: error.message };
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="refresh"]').on("click", () => this.render());
    html.find('[data-action="close"]').on("click", () => this.close());
    html.find('[data-action="install"]').on("click", async event => {
      event.currentTarget.disabled = true;
      try {
        await Runtime.installLedger(this.actor);
        ui.notifications.info("Reputations added to your character.");
      } catch (error) {
        ui.notifications.error(error.message);
      } finally {
        event.currentTarget.disabled = false;
      }
    });
  }

  async close(options) {
    for (const [hook, id] of this.handlers) Hooks.off(hook, id);
    return super.close(options);
  }
}
