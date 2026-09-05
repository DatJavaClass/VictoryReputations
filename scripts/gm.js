import { createReputation, integer, validateReputation } from "./core.js";
import { MODULE, ReputationStore } from "./store.js";
import { Runtime } from "./runtime.js";
import { getAdapter } from "./adapters.js";

const template = name => `modules/${MODULE}/templates/${name}.hbs`;

export async function attempt(task) {
  try {
    return await task();
  } catch (error) {
    console.error(`${MODULE} |`, error);
    ui.notifications.error(error.message);
  }
}

async function droppedDocument(event, type) {
  const data = TextEditor.getDragEventData(event), doc = data.uuid ? await fromUuid(data.uuid) : null;
  if (doc?.documentName !== type) throw new Error(`Drop an ${type} from the world or a compendium.`);
  return doc;
}

export class ReputationManager extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { id: "victory-reputations-manager", title: "Reputations",
      template: template("manager"), width: 480, height: 500, resizable: true, classes: ["victory-reputations"] });
  }

  getData() {
    const state = ReputationStore.read();
    this.revision = state.revision;
    return { reputations: state.reputations.map(rep => ({ ...rep, selected: rep.id === this.selected })), selected: state.reputations.some(rep => rep.id === this.selected) };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-reputation]").on("click", event => {
      this.selected = event.currentTarget.dataset.reputation;
      this.render();
    });
    html.find("[data-action]").on("click", event => attempt(async () => {
      ReputationStore.requireGM();
      const action = event.currentTarget.dataset.action, state = ReputationStore.read(), rep = state.reputations.find(row => row.id === this.selected);
      if (action === "create") new ReputationCreator().render(true);
      else if (action === "party") new PartyRoster().render(true);
      else if (action === "monitor") new StandingMonitor().render(true);
      else if (action === "system") new AdapterSettings().render(true);
      else if (action === "edit" && rep) new ReputationEditor(rep, state.revision).render(true);
      else if (action === "delete" && rep) {
        const confirmed = await Dialog.confirm({ title: "Delete Reputation", content: "<p>Remove the selected reputation and its configuration?</p>" });
        if (confirmed) await ReputationStore.remove(rep.id, state.revision);
      }
    }));
  }
}

class ReputationCreator extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "Create Reputation", template: template("create"),
      width: 450, closeOnSubmit: false, classes: ["victory-reputations"], dragDrop: [{ dropSelector: "[data-drop]" }] });
  }

  _canDragDrop() {
    return game.user.isGM;
  }

  async create(name, actorUuid = null) {
    ReputationStore.requireGM();
    const rep = createReputation(foundry.utils.randomID(), name.trim(), actorUuid);
    new ReputationEditor(rep, ReputationStore.read().revision).render(true);
    await this.close();
  }

  async _updateObject(event, data) {
    await attempt(() => this.create(data.name));
  }

  async _onDrop(event) {
    await attempt(async () => {
      const actor = await droppedDocument(event, "Actor");
      await this.create(actor.name, actor.uuid);
    });
  }
}

export class ReputationEditor extends FormApplication {
  constructor(rep, revision, options = {}) {
    super(structuredClone(rep), options);
    this.revision = revision;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "Configure Reputation", template: template("editor"),
      width: 730, height: 700, resizable: true, closeOnSubmit: false, classes: ["victory-reputations"],
      tabs: [{ navSelector: ".tabs", contentSelector: ".vr-body", initial: "basic" }], dragDrop: [{ dropSelector: "[data-drop]" }] });
  }

  async getData() {
    const rep = structuredClone(this.object);
    rep.members = ReputationStore.read().partyMembers;
    rep.opposing ??= [];
    for (const proxy of rep.proxies) {
      const actor = await fromUuid(proxy.actorUuid).catch(() => null);
      proxy.name = actor?.name ?? "Missing actor";
      proxy.locations = game.scenes.contents.flatMap(scene => scene.tokens.contents.filter(token => (token.actorId === actor?.id && !actor?.pack) || [token.actor?.getFlag("core", "sourceId"), token.actor?._stats?.compendiumSource].includes(proxy.actorUuid))
        .map(token => `${scene.name}: ${token.x}, ${token.y}`)).join("; ") || "No scene token";
    }

    const members = await Promise.all(rep.members.map(async uuid => ({ uuid, name: (await fromUuid(uuid))?.name ?? "Missing character" })));
    return { rep, members, opponents: ReputationStore.read().reputations.filter(row => row.id !== rep.id).map(row => ({ id: row.id, name: row.name, selected: rep.opposing.includes(row.id) })), faction: rep.kind === "faction", canAddTier: rep.tiers.length < 10,
      canRemoveTier: rep.tiers.length > 1, tiers: rep.tiers.map(tier => ({ ...tier, reward: rep.rewards.find(reward => reward.tierId === tier.id) })) };
  }

  capture() {
    if (!this.form) return;
    const form = new FormData(this.form), rep = this.object;
    rep.name = String(form.get("name") ?? rep.name).trim();
    for (const key of ["compressTiers", "conditional", "negative", "hostile", "party", "repeatRewards"]) rep[key] = form.has(key);
    rep.opposing = form.getAll("opposing");
    for (const [index, tier] of rep.tiers.entries()) {
      tier.name = String(form.get(`tierName.${index}`) ?? tier.name).trim();
      tier.units = Number(form.get(`tierUnits.${index}`));
    }

    for (const kind of ["items", "currencies"]) {
      for (const [index, row] of rep[kind].entries()) row.units = Number(form.get(`${kind}.${index}`));
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action]").on("click", event => attempt(async () => {
      this.capture();
      const { action, id, kind } = event.currentTarget.dataset, rep = this.object;
      switch (action) {
        case "add-tier":
          if (rep.tiers.length < 10) rep.tiers.push({ id: foundry.utils.randomID(), name: `Tier ${rep.tiers.length + 1}`, units: 100 });
          break;
        case "remove-tier": {
          if (rep.tiers.length <= 1) break;
          const tier = rep.tiers.at(-1);
          if (!await Dialog.confirm({ title: "Remove Tier", content: "<p>Remove the final tier and its assigned reward?</p>" })) return;
          rep.tiers.pop();
          rep.rewards = rep.rewards.filter(reward => reward.tierId !== tier.id);
          break;
        }
        case "remove":
          if (!["proxies", "items", "currencies", "rewards"].includes(kind) || (kind === "proxies" && rep.kind === "individual")) return;
          rep[kind] = rep[kind].filter(row => row.id !== id);
          break;
        case "message": {
          const proxy = rep.proxies.find(row => row.id === id);
          if (proxy) new ProxyMessage(proxy).render(true);
          return;
        }
        case "currency":
          new CurrencyEditor(rep, () => this.render()).render(true);
          return;
      }

      this.render();
    }));
  }

  _canDragDrop() {
    return game.user.isGM;
  }

  async _onDrop(event) {
    await attempt(async () => {
      ReputationStore.requireGM();
      this.capture();
      const zone = event.target.closest("[data-drop]"), rep = this.object;
      if (!zone) return;
      const kind = zone.dataset.drop, doc = await droppedDocument(event, kind === "proxies" ? "Actor" : "Item");
      if (kind === "proxies") {
        if (rep.kind !== "faction") throw new Error("An individual reputation already has its NPC proxy.");
        if (!rep.proxies.some(proxy => proxy.actorUuid === doc.uuid)) rep.proxies.push({ id: foundry.utils.randomID(), actorUuid: doc.uuid, message: "" });
      } else if (kind === "items") {
        if (!rep.items.some(item => item.uuid === doc.uuid)) rep.items.push({ id: foundry.utils.randomID(), uuid: doc.uuid, name: doc.name, units: 1 });
      } else if (kind === "rewards") {
        if (!doc.pack) throw new Error("Drop rewards from a compendium.");
        if (["buff", "spell"].includes(doc.type.toLowerCase())) throw new Error("Buffs and spells cannot be rewards.");
        const tierId = zone.dataset.tier;
        if (!rep.tiers.some(tier => tier.id === tierId)) return;
        rep.rewards = rep.rewards.filter(reward => reward.tierId !== tierId);
        rep.rewards.push({ id: foundry.utils.randomID(), tierId, uuid: doc.uuid, name: doc.name, type: doc.type });
      }

      this.render();
    });
  }

  async _updateObject() {
    await attempt(async () => {
      this.capture();
      const rep = validateReputation(this.object);
      this.revision = await ReputationStore.save(rep, this.revision);
      ui.notifications.info("Reputation saved.");
      await this.close();
    });
  }
}

class ProxyMessage extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "Proxy Message", template: template("message"),
      width: 530, height: 370, closeOnSubmit: true, classes: ["victory-reputations"] });
  }

  async getData() {
    return { message: await TextEditor.enrichHTML(this.object.message, { async: true, secrets: false }) };
  }

  async _updateObject(event, data) {
    this.object.message = data.message ?? this.object.message;
    ui.notifications.info("Message updated. Save the reputation to keep it.");
  }
}

class CurrencyEditor extends FormApplication {
  constructor(rep, refresh) {
    super({});
    this.rep = rep;
    this.refresh = refresh;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "Accepted Currency", template: template("currency"),
      width: 430, closeOnSubmit: false, classes: ["victory-reputations"] });
  }

  async getData() {
    const actor = game.user.character ?? game.actors.find(actor => actor.hasPlayerOwner) ?? game.actors.contents[0];
    return { currencies: await getAdapter().currencyDefinitions(actor) };
  }

  async _updateObject(event, data) {
    await attempt(async () => {
      const currencies = (await this.getData()).currencies, selected = currencies.find(row => row.key === data.currency);
      const name = selected?.name ?? String(data.name ?? "").trim(), key = selected?.key ?? String(data.key ?? "").trim(), units = Number(data.units);
      if (!name || !key) throw new Error("Enter a currency name and identifier.");
      integer(units, -1000, 9999, "Currency value");
      if (this.rep.currencies.some(row => row.key === key)) throw new Error("That currency is already listed.");
      this.rep.currencies.push({ id: foundry.utils.randomID(), name, key, units });
      this.refresh();
      await this.close();
    });
  }
}

export class StandingMonitor extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "Party Standing", template: template("monitor"), width: 700,
      height: 560, resizable: true, closeOnSubmit: false, classes: ["victory-reputations"] });
  }

  async getData() {
    const actors = game.actors.contents;
    this.actorId ??= actors.find(actor => actor.hasPlayerOwner)?.id ?? actors[0]?.id;
    const actor = game.actors.get(this.actorId);
    return { actors: actors.map(row => ({ id: row.id, name: row.name, selected: row.id === this.actorId })),
      rows: actor ? await Runtime.ledger(actor) : [], recovery: Runtime.read().transactions.filter(row => ["prepared", "recovery"].includes(row.status)) };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("select[name=actor]").on("change", event => {
      this.actorId = event.currentTarget.value;
      this.render();
    });
    html.find("[data-action]").on("click", event => attempt(async () => {
      const { action, id } = event.currentTarget.dataset;
      if (action === "recover") {
        if (!await Dialog.confirm({ title: "Restore Transaction", content: "<p>Restore the recorded inventory values from before this interrupted transaction? Review later character edits first.</p>" })) return;
        await Runtime.recover(id);
      } else if (action === "ledger") await Runtime.installLedger(game.actors.get(this.actorId));
      else if (action === "adjust") {
        const input = html[0].querySelector(`[data-delta="${id}"]`), delta = Number(input.value);
        integer(delta, -999999, 999999, "Reputation change");
        await Runtime.submit(game.actors.get(this.actorId), { kind: "adjust", reputationId: id, delta });
      }

      this.render();
    }));
  }

  async _updateObject() {}
}

class PartyRoster extends FormApplication {
  constructor() {
    super({});
    const state = ReputationStore.read();
    this.members = state.partyMembers;
    this.revision = state.revision;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "Player Party", template: template("party"), width: 480,
      height: 440, resizable: true, closeOnSubmit: false, classes: ["victory-reputations"], dragDrop: [{ dropSelector: "[data-drop]" }] });
  }

  async getData() {
    return { members: await Promise.all(this.members.map(async uuid => ({ uuid, name: (await fromUuid(uuid))?.name ?? "Missing character" }))) };
  }

  _canDragDrop() {
    return game.user.isGM;
  }

  async _onDrop(event) {
    await attempt(async () => {
      const actor = await droppedDocument(event, "Actor");
      if (actor.pack || actor.isToken) throw new Error("Drop a world character into the party roster.");
      if (!this.members.includes(actor.uuid)) this.members.push(actor.uuid);
      this.render();
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-remove]").on("click", event => {
      this.members = this.members.filter(uuid => uuid !== event.currentTarget.dataset.remove);
      this.render();
    });
  }

  async _updateObject() {
    await attempt(async () => {
      await ReputationStore.saveParty(this.members, this.revision);
      ui.notifications.info("Player party saved for all reputations.");
      await this.close();
    });
  }
}

class AdapterSettings extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "System Integration", template: template("adapter"), width: 530, closeOnSubmit: false });
  }

  getData() {
    return game.settings.get(MODULE, "genericAdapter");
  }

  async _updateObject(event, data) {
    await attempt(async () => {
      ReputationStore.requireGM();
      for (const key of ["quantityPath", "currencyPath"]) {
        if (!/^system(?:\.[a-zA-Z0-9_]+)+$/.test(data[key]) || /(?:__proto__|constructor|prototype)/.test(data[key])) throw new Error("Enter a valid system data path.");
      }

      await game.settings.set(MODULE, "genericAdapter", { quantityPath: data.quantityPath, currencyPath: data.currencyPath, ledgerType: String(data.ledgerType ?? "").trim() });
      await this.close();
    });
  }
}
