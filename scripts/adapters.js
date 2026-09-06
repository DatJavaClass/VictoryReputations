import { integer } from "./core.js";
import { MODULE } from "./store.js";

const adapters = new Map(), icon = "icons/sundries/books/book-open-purple.webp";
const read = (value, path) => path.split(".").reduce((current, key) => current?.[key], value); // Safe dotted path getter
const quantity = value => integer(value, 0, Number.MAX_SAFE_INTEGER, "Resource quantity");
const sourceMatches = (item, uuid) => [item.uuid, item._stats?.compendiumSource, item.flags?.core?.sourceId].includes(uuid); // Matches an owned item back to its compendium source

function resourcePath(path) { // Whitelists system.* paths, blocks prototype keys
  if (typeof path !== "string" || !/^system\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(path) || path.split(".").some(key => ["__proto__", "prototype", "constructor"].includes(key))) throw new Error("Currency requires a safe system attribute path.");
  return path;
}

function pilesAPI() {
  return globalThis.game?.modules?.get("item-piles")?.active ? game.itempiles?.API : null;
}

function currencyIdentity(value) { // Stable key for custom Item Piles currencies without a uuid
  if (Array.isArray(value)) return value.map(currencyIdentity);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => !["_id", "_stats", "folder", "ownership", "sort", "quantity"].includes(key)).map(key => [key, currencyIdentity(value[key])]));
}

function pilesCurrencies(actor) {
  const api = pilesAPI();
  if (!api) return [];
  try {
    const currencies = actor ? api.getActorCurrencies(actor, { getAll: true, secondary: true }) : [...api.CURRENCIES, ...api.SECONDARY_CURRENCIES];
    return currencies.flatMap(currency => {
      const path = currency.path ?? currency.data?.path, uuid = currency.data?.uuid;
      if (currency.type === "attribute" || !currency.type) return [{ key: `item-piles:attribute:${resourcePath(path)}`, name: game.i18n.localize(currency.name), path }];
      const itemId = currency.item?.id ?? currency.item?._id, definition = currency.data?.item;
      if (!uuid && !definition) throw new Error(`Custom currency ${currency.name} has no item definition.`);
      const key = uuid ? `item-piles:item:${uuid}` : `item-piles:custom:${JSON.stringify(currencyIdentity(definition))}`;
      if (itemId && !Array.from(actor?.items ?? []).some(item => item.id === itemId)) throw new Error(`Custom currency ${currency.name} resolved outside the actor.`); // Guards against a currency item that is not on this actor
      return [{ key, name: game.i18n.localize(currency.name), uuid, itemId }];
    });
  } catch (error) {
    throw new Error(`Cannot read Item Piles currencies: ${error.message}`, { cause: error });
  }
}

class GenericAdapter {
  config() {
    return game.settings.get(MODULE, "genericAdapter");
  }

  quantityPath() {
    return resourcePath(this.config().quantityPath || "system.quantity");
  }

  currencyDefinitions(actor) { // Numeric fields under the currency path count as currencies, plus Item Piles
    const path = resourcePath(this.config().currencyPath || "system.currency"), currencies = actor ? read(actor, path) : {};
    return [...Object.entries(currencies ?? {}).filter(([, value]) => Number.isSafeInteger(value) && value >= 0).map(([key]) => ({ key, name: key, path: resourcePath(`${path}.${key}`) })), ...pilesCurrencies(actor)];
  }

  async inventory(actor, rep) {
    const stock = [], currencies = this.currencyDefinitions(actor), items = Array.from(actor.items), quantityPath = this.quantityPath();
    for (const offer of rep.items) {
      for (const item of items.filter(item => sourceMatches(item, offer.uuid))) {
        if (read(item, quantityPath) === undefined) throw new Error(`This system needs a configured quantity path for ${item.name}.`);
        stock.push({ id: `items:${offer.id}:${item.id}`, kind: "items", offerId: offer.id, name: offer.name, img: item.img, quantity: quantity(read(item, quantityPath)), itemId: item.id, path: quantityPath });
      }
    }

    for (const offer of rep.currencies) {
      const currency = currencies.find(currency => currency.key === offer.key);
      if (!currency) throw new Error(`Currency ${offer.name} is unavailable. Check its system or Item Piles configuration.`);
      if (currency.path) {
        stock.push({ id: `currencies:${offer.id}`, kind: "currencies", offerId: offer.id, name: offer.name, quantity: quantity(read(actor, currency.path)), path: currency.path });
      } else {
        const path = resourcePath(pilesAPI().ITEM_QUANTITY_ATTRIBUTE); // Item backed Piles currencies use the Piles quantity attribute
        for (const item of items.filter(item => item.id === currency.itemId || (currency.uuid && sourceMatches(item, currency.uuid)))) {
          stock.push({ id: `currencies:${offer.id}:${item.id}`, kind: "currencies", offerId: offer.id, name: offer.name, img: item.img, quantity: quantity(read(item, path)), itemId: item.id, path });
        }
      }
    }

    return stock;
  }

  async plan(actor, quote, rep, rewards = []) { // Builds the update set, never writes
    const stock = await this.inventory(actor, rep), resources = new Map(), itemUpdates = new Map(), actorUpdate = {}, itemCreates = [], itemDeletes = [];
    if (quote.reputationId !== rep.id) throw new Error("Donation belongs to another reputation.");
    for (const line of quote.lines) {
      const row = stock.find(row => row.id === line.id && row.kind === line.kind && row.offerId === line.offerId);
      if (!row) throw new Error("The selected resource is no longer available.");
      const amount = quantity(line.quantity), key = `${row.itemId ?? "actor"}:${row.path}`, total = quantity((resources.get(key)?.total ?? 0) + amount); // Sum lines hitting the same item or actor path
      if (total > row.quantity) throw new Error(`Insufficient ${row.name}.`);
      resources.set(key, { row, total });
    }

    for (const { row, total } of resources.values()) {
      const remaining = quantity(row.quantity - total);
      if (row.itemId) {
        const update = itemUpdates.get(row.itemId) ?? { _id: row.itemId };
        update[row.path] = remaining;
        itemUpdates.set(row.itemId, update);
      } else actorUpdate[row.path] = remaining;
    }

    for (const reward of rewards) {
      let document;
      try {
        document = await fromUuid(reward.uuid);
      } catch (error) {
        throw new Error(`Cannot load reward ${reward.uuid}: ${error.message}`, { cause: error });
      }

      if (document?.documentName !== "Item") throw new Error("The reward must resolve to an item.");
      if (["buff", "spell"].includes(document.type)) throw new Error("Buffs and spells cannot be rewards.");
      const data = structuredClone(document.toObject());
      delete data._id;
      delete data.folder;
      delete data.ownership;
      delete data.sort;
      if (data.type === "race") { // PF1 allows one race, replace it
        const previous = itemCreates.findIndex(item => item.type === "race");
        if (previous >= 0) itemCreates.splice(previous, 1);
        for (const item of Array.from(actor.items).filter(item => item.type === "race")) {
          if (!itemDeletes.includes(item.id)) itemDeletes.push(item.id);
        }
      }

      data.flags ??= {};
      data.flags.core ??= {};
      data.flags.core.sourceId = reward.uuid;
      data.flags[MODULE] = { ...(data.flags[MODULE] ?? {}), reward: { reputationId: reward.reputationId ?? rep.id, tierId: reward.tierId, uuid: reward.uuid } };
      itemCreates.push(data);
    }

    return { itemUpdates: [...itemUpdates.values()].filter(item => !itemDeletes.includes(item._id)), actorUpdate, itemCreates, itemDeletes }; // Deleted items drop their pending updates
  }

  ledgerData() { // First item type this system supports wins
    const types = game.documentTypes?.Item ?? [], configured = this.config().ledgerType, type = configured || ["feat", "loot", "equipment", "item"].find(type => types.includes(type));
    if (!type || !types.includes(type)) throw new Error("Choose a valid ledger item type in the generic adapter settings. The module ledger window remains available.");
    return { name: "Reputations", type, img: icon, flags: { [MODULE]: { ledger: true } }, system: { description: { value: "<p>A living ledger of your character's standing in the world. Open the module's Reputations window to check your relationships.</p>" } } };
  }
}

class PathfinderAdapter extends GenericAdapter {
  quantityPath() {
    return "system.quantity";
  }

  currencyDefinitions(actor) {
    return [...Object.entries({ pp: "Platinum", gp: "Gold", sp: "Silver", cp: "Copper" }).map(([key, name]) => ({ key, name, path: `system.currency.${key}` })), ...pilesCurrencies(actor)];
  }

  ledgerData() {
    return { name: "Reputations", type: "feat", img: icon, flags: { [MODULE]: { ledger: true } }, system: {
      subType: "trait", description: { value: "<p>A living ledger of your character's standing in the world. Use View Reputations to check your current relationships.</p>" },
      actions: [{ _id: foundry.utils.randomID(), name: "View Reputations", activation: { type: "nonaction", cost: 0 } }]
    } };
  }
}

const generic = new GenericAdapter();

export function registerAdapter(systemId, adapter) {
  if (typeof systemId !== "string" || !systemId.trim() || !["inventory", "plan", "currencyDefinitions", "ledgerData"].every(method => typeof adapter?.[method] === "function")) throw new Error("A system adapter requires inventory, plan, currencyDefinitions, and ledgerData methods.");
  adapters.set(systemId, adapter);
}

export function getAdapter() {
  return adapters.get(globalThis.game?.system?.id) ?? generic; // Generic fallback for unregistered systems
}

registerAdapter("pf1", new PathfinderAdapter());
