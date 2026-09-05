import { planStanding, quoteDonation, standingKey, tierProgress } from "./core.js";
import { MODULE, ReputationStore } from "./store.js";
import { getAdapter } from "./adapters.js";

export class Runtime {
  static queue = Promise.resolve();
  static pending = new Map();

  static register() {
    game.settings.register(MODULE, "standing", { scope: "world", config: false, type: Object,
      default: { scores: {}, claimed: {}, transactions: [] }, onChange: () => Hooks.callAll("victoryStandingChanged") });
    game.settings.register(MODULE, "genericAdapter", { scope: "world", config: false, type: Object,
      default: { quantityPath: "system.quantity", currencyPath: "system.currency", ledgerType: "" } });
    game.settings.register(MODULE, "debug", { name: "Debug logging", hint: "Log reputation requests and transaction stages.", scope: "world", config: true, type: Boolean, default: false });
    Hooks.on("updateActor", (actor, changes, options, userId) => {
      const request = changes[`flags.${MODULE}.request`] ?? foundry.utils.getProperty(changes, `flags.${MODULE}.request`), response = changes[`flags.${MODULE}.response`] ?? foundry.utils.getProperty(changes, `flags.${MODULE}.response`);
      if (request?.id && game.users.activeGM?.id === game.user.id) this.enqueue(() => this.execute(actor, request, userId)).catch(error => this.report(error));
      if (response?.id && game.users.get(userId)?.isGM) this.receive(response);
    });
  }

  static report(error) {
    console.error(`${MODULE} |`, error);
    ui.notifications.error(error.message);
  }

  static debug(stage, data) {
    if (game.settings.get(MODULE, "debug")) console.debug(`${MODULE} | ${stage}`, data);
    Hooks.callAll("victoryReputationsTransaction", stage, data);
  }

  static enqueue(task) {
    const operation = this.queue.then(task);
    this.queue = operation.catch(() => {});
    return operation;
  }

  static read() {
    return structuredClone(game.settings.get(MODULE, "standing"));
  }

  static async save(state) {
    ReputationStore.requireGM();
    await game.settings.set(MODULE, "standing", state);
  }

  static async ledger(actor) {
    if (!actor?.testUserPermission(game.user, "OWNER")) throw new Error("Choose a character you own.");
    const state = this.read();
    return ReputationStore.read().reputations.map(rep => {
      const units = state.scores[rep.id]?.[standingKey(rep, actor.uuid)] ?? 0;
      return { id: rep.id, name: rep.name, units, ...tierProgress(rep, units), compressTiers: rep.compressTiers, hostile: rep.hostile && units < 0 };
    });
  }

  static inventory(actor, rep) {
    return getAdapter().inventory(actor, rep);
  }

  static receive(response) {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response);
    else pending.reject(new Error(response.error));
  }

  static async submit(actor, request) {
    if (!actor?.testUserPermission(game.user, "OWNER") || actor.isToken) throw new Error("Choose an owned world character.");
    if (!game.users.activeGM) throw new Error("An active GM is required to surrender goods.");
    const pending = Array.from(this.pending.values()).find(row => row.actorUuid === actor.uuid);
    if (pending && !pending.timedOut) throw new Error("A request for this character is already pending.");
    const prior = actor.getFlag(MODULE, "request"), response = actor.getFlag(MODULE, "response");
    const unresolved = pending?.data ?? (prior?.id && prior.id !== response?.id && Date.now() - prior.created < 86400000 ? prior : null);
    const data = unresolved ? { ...unresolved, created: Date.now() } : { kind: "donation", delta: null, selection: [], proxyId: null, ...request, id: foundry.utils.randomID(), created: Date.now() };
    if (unresolved) ui.notifications.warn("Retrying the previous request with its original goods selection.");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.get(data.id).timedOut = true;
        reject(new Error("The GM has not confirmed this request. Retrying will use this same request to prevent duplicate charges."));
      }, 60000);
      this.pending.set(data.id, { resolve, reject, timer, actorUuid: actor.uuid, data, timedOut: false });
      actor.setFlag(MODULE, "request", data).catch(error => this.receive({ id: data.id, ok: false, error: error.message }));
    });
  }

  static async execute(actor, request, userId) {
    ReputationStore.requireGM();
    let journal, state;
    try {
      const user = game.users.get(userId);
      if (!user || !actor.testUserPermission(user, "OWNER") || actor.isToken) throw new Error("The requesting user does not own this world character.");
      if (typeof request.id !== "string" || !/^[a-zA-Z0-9]{16}$/.test(request.id)) throw new Error("Invalid request identifier.");
      state = this.read();
      const previous = state.transactions.find(row => row.id === request.id);
      if (previous) {
        if (previous.actorUuid !== actor.uuid || previous.userId !== userId) throw new Error("Request identity mismatch.");
        await this.respond(actor, { id: request.id, ok: previous.status === "committed", error: previous.error ?? "This request was already processed." });
        return;
      }

      if (!Number.isSafeInteger(request.created) || Math.abs(Date.now() - request.created) > 120000) throw new Error("This request expired. Open the proxy again.");
      if (!["adjust", "donation"].includes(request.kind)) throw new Error("Unknown reputation request.");
      if (state.transactions.some(row => ["prepared", "recovery"].includes(row.status))) throw new Error("The GM must recover an interrupted transaction before accepting goods.");
      const definitions = ReputationStore.read().reputations, rep = definitions.find(row => row.id === request.reputationId);
      if (!rep) throw new Error("Reputation no longer exists.");
      if (request.kind === "adjust" && !user.isGM) throw new Error("Only a GM can adjust standing directly.");
      if (request.kind !== "adjust" && !rep.proxies.some(proxy => proxy.id === request.proxyId)) throw new Error("That NPC is no longer a proxy.");
      const quote = request.kind === "adjust" ? { reputationId: rep.id, units: request.delta, lines: [] } : quoteDonation(rep, request.selection, await this.inventory(actor, rep));
      const planned = planStanding(definitions, state, rep.id, actor.uuid, quote.units), adapter = getAdapter();
      const plan = await adapter.plan(actor, quote, rep, planned.rewards);
      journal = await this.prepare(actor, plan, request.id, userId);
      state.transactions = state.transactions.filter(row => ["prepared", "recovery"].includes(row.status) || Date.now() - row.created < 86400000);
      state.transactions.push(journal);
      await this.save(state);
      this.debug("prepared", { id: request.id, actorUuid: actor.uuid, changes: planned.changes });
      await this.mutate(actor, plan, journal);
      planned.state.transactions = state.transactions;
      journal.status = "committed";
      await this.save(planned.state);
      this.debug("committed", { id: request.id, actorUuid: actor.uuid });
    } catch (error) {
      if (journal && this.read().transactions.some(row => row.id === journal.id && row.status === "committed")) {
        this.report(error);
        await this.respond(actor, { id: request.id, ok: true });
        return;
      }

      if (journal) {
        try {
          await this.rollback(actor, journal);
          journal.status = "rolled-back";
        } catch (recoveryError) {
          journal.status = "recovery";
          this.report(recoveryError);
        }

        journal.error = error.message;
        await this.save(state);
      }

      this.debug("failed", { id: request.id, error: error.message });
      await this.respond(actor, { id: request.id, ok: false, error: error.message });
      return;
    }

    await this.respond(actor, { id: request.id, ok: true });
  }

  static async prepare(actor, plan, id, userId) {
    const actorBefore = {}, itemsBefore = [], deleted = [];
    for (const path of Object.keys(plan.actorUpdate)) {
      const value = foundry.utils.getProperty(actor.toObject(), path);
      if (value === undefined) throw new Error(`Currency field is missing: ${path}`);
      actorBefore[path] = structuredClone(value);
    }

    for (const update of plan.itemUpdates) {
      const item = actor.items.get(update._id);
      if (!item) throw new Error("An inventory item disappeared.");
      const before = { _id: item.id };
      for (const path of Object.keys(update).filter(key => key !== "_id")) before[path] = structuredClone(foundry.utils.getProperty(item.toObject(), path));
      itemsBefore.push(before);
    }

    for (const itemId of plan.itemDeletes) {
      const item = actor.items.get(itemId);
      if (!item) throw new Error("A replaced reward item disappeared.");
      deleted.push(item.toObject());
    }

    for (const item of plan.itemCreates) item._id = foundry.utils.randomID();
    return { id, userId, actorUuid: actor.uuid, created: Date.now(), status: "prepared", actorBefore, itemsBefore, deleted, createdIds: plan.itemCreates.map(item => item._id) };
  }

  static async mutate(actor, plan) {
    if (plan.itemUpdates.length) await actor.updateEmbeddedDocuments("Item", plan.itemUpdates);
    if (Object.keys(plan.actorUpdate).length) await actor.update(plan.actorUpdate);
    if (plan.itemDeletes.length) await actor.deleteEmbeddedDocuments("Item", plan.itemDeletes);
    if (plan.itemCreates.length) {
      const created = await actor.createEmbeddedDocuments("Item", plan.itemCreates, { keepId: true });
      if (created.length !== plan.itemCreates.length || plan.itemCreates.some(item => !actor.items.has(item._id))) throw new Error("The system did not create all tier rewards.");
    }
  }

  static async rollback(actor, journal) {
    const created = journal.createdIds.filter(id => actor.items.has(id)), deleted = journal.deleted.filter(item => !actor.items.has(item._id));
    if (created.length) await actor.deleteEmbeddedDocuments("Item", created);
    if (deleted.length) await actor.createEmbeddedDocuments("Item", deleted, { keepId: true });
    if (journal.itemsBefore.length) await actor.updateEmbeddedDocuments("Item", journal.itemsBefore);
    if (Object.keys(journal.actorBefore).length) await actor.update(journal.actorBefore);
    this.debug("rolled-back", { id: journal.id });
  }

  static async respond(actor, response) {
    this.receive(response);
    await actor.setFlag(MODULE, "response", response);
  }

  static async recover(id) {
    return this.enqueue(async () => {
      ReputationStore.requireGM();
      const state = this.read(), journal = state.transactions.find(row => row.id === id && ["prepared", "recovery"].includes(row.status));
      if (!journal) throw new Error("That transaction does not need recovery.");
      const actor = await fromUuid(journal.actorUuid);
      if (!actor) throw new Error("The transaction's character is missing.");
      await this.rollback(actor, journal);
      journal.status = "rolled-back";
      journal.error = "The GM restored this interrupted transaction.";
      await this.save(state);
      await this.respond(actor, { id, ok: false, error: journal.error });
    });
  }

  static async installLedger(actor) {
    if (!actor?.testUserPermission(game.user, "OWNER")) throw new Error("Choose a character you own.");
    const existing = actor.items.find(item => item.getFlag(MODULE, "ledger"));
    if (existing) {
      if (game.system.id === "pf1" && existing.type === "feat" && existing.system.subType !== "trait") await existing.update({ "system.subType": "trait" });
      return existing;
    }
    const data = await getAdapter().ledgerData(actor);
    return (await actor.createEmbeddedDocuments("Item", [data]))[0];
  }
}
