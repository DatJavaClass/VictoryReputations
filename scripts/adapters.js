import { integer } from "./core.js";
import { MODULE } from "./store.js";

const adapters = new Map(), icon = "icons/sundries/books/book-open-purple.webp";
const read = (value, path) => path.split(".").reduce((current, key) => current?.[key], value); // Safe dotted path getter
const quantity = value => integer(value, 0, Number.MAX_SAFE_INTEGER, "Resource quantity");
const sourceMatches = (item, uuid) => [item.uuid, item._stats?.compendiumSource, item.flags?.core?.sourceId].includes(uuid); // item matches source uuid

function resourcePath(path) { // Whitelists system.* paths, blocks prototype keys
  if (typeof path !== "string" || !/^system\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(path) || path.split(".").some(key => ["__proto__", "prototype", "constructor"].includes(key))) throw new Error("Currency requires a safe system attribute path."); // unsafe path throws, safe path returns
  return path;
}

function pilesAPI() {
  return globalThis.game?.modules?.get("item-piles")?.active ? game.itempiles?.API : null;
}

function currencyIdentity(value) { // Stable key for uuidless custom currencies
  if (Array.isArray(value)) return value.map(currencyIdentity); // array maps deep, others fall through
  if (!value || typeof value !== "object") return value; // primitive returns as is, objects continue
  return Object.fromEntries(Object.keys(value).sort().filter(key => !["_id", "_stats", "folder", "ownership", "sort", "quantity"].includes(key)).map(key => [key, currencyIdentity(value[key])]));
}

function pilesCurrencies(actor) {
  const api = pilesAPI();
  if (!api) return []; // no Piles API returns empty list
  try {
    const currencies = actor ? api.getActorCurrencies(actor, { getAll: true, secondary: true }) : [...api.CURRENCIES, ...api.SECONDARY_CURRENCIES];
    return currencies.flatMap(currency => { // each currency maps to entry
      const path = currency.path ?? currency.data?.path, uuid = currency.data?.uuid;
      if (currency.type === "attribute" || !currency.type) return [{ key: `item-piles:attribute:${resourcePath(path)}`, name: game.i18n.localize(currency.name), path }]; // attribute currency returns early, items continue
      const itemId = currency.item?.id ?? currency.item?._id, definition = currency.data?.item;
      if (!uuid && !definition) throw new Error(`Custom currency ${currency.name} has no item definition.`); // no uuid or definition throws
      const key = uuid ? `item-piles:item:${uuid}` : `item-piles:custom:${JSON.stringify(currencyIdentity(definition))}`;
      if (itemId && !Array.from(actor?.items ?? []).some(item => item.id === itemId)) throw new Error(`Custom currency ${currency.name} resolved outside the actor.`); // Currency item must live on actor
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

  currencyDefinitions(actor) { // Numeric currency fields, plus Item Piles
    const path = resourcePath(this.config().currencyPath || "system.currency"), currencies = actor ? read(actor, path) : {};
    return [...Object.entries(currencies ?? {}).filter(([, value]) => Number.isSafeInteger(value) && value >= 0).map(([key]) => ({ key, name: key, path: resourcePath(`${path}.${key}`) })), ...pilesCurrencies(actor)];
  }

  async inventory(actor, rep) {
    const stock = [], currencies = this.currencyDefinitions(actor), items = Array.from(actor.items), quantityPath = this.quantityPath();
    for (const offer of rep.items) { // In: item offers, out: stock rows
      for (const item of items.filter(item => sourceMatches(item, offer.uuid))) { // In: owned matches, out: stock row
        if (read(item, quantityPath) === undefined) throw new Error(`This system needs a configured quantity path for ${item.name}.`); // missing quantity field throws
        stock.push({ id: `items:${offer.id}:${item.id}`, kind: "items", offerId: offer.id, name: offer.name, img: item.img, quantity: quantity(read(item, quantityPath)), itemId: item.id, path: quantityPath });
      }
    }

    for (const offer of rep.currencies) { // In: currency offers, out: stock rows
      const currency = currencies.find(currency => currency.key === offer.key);
      if (!currency) throw new Error(`Currency ${offer.name} is unavailable. Check its system or Item Piles configuration.`); // unknown currency offer throws
      if (currency.path) { // Actor path, else Piles item
        stock.push({ id: `currencies:${offer.id}`, kind: "currencies", offerId: offer.id, name: offer.name, quantity: quantity(read(actor, currency.path)), path: currency.path });
      } else { // item backed currency, no actor path
        const path = resourcePath(pilesAPI().ITEM_QUANTITY_ATTRIBUTE); // Piles quantity attribute
        for (const item of items.filter(item => item.id === currency.itemId || (currency.uuid && sourceMatches(item, currency.uuid)))) { // In: backing items, out: stock rows
          stock.push({ id: `currencies:${offer.id}:${item.id}`, kind: "currencies", offerId: offer.id, name: offer.name, img: item.img, quantity: quantity(read(item, path)), itemId: item.id, path });
        }
      }
    }

    return stock;
  }

  async plan(actor, quote, rep, rewards = []) { // Builds the update set, never writes
    const stock = await this.inventory(actor, rep), resources = new Map(), itemUpdates = new Map(), actorUpdate = {}, itemCreates = [], itemDeletes = [];
    if (quote.reputationId !== rep.id) throw new Error("Donation belongs to another reputation."); // wrong reputation quote throws
    for (const line of quote.lines) { // In: quote lines, out: summed totals
      const row = stock.find(row => row.id === line.id && row.kind === line.kind && row.offerId === line.offerId);
      if (!row) throw new Error("The selected resource is no longer available."); // stale stock row throws
      const amount = quantity(line.quantity), key = `${row.itemId ?? "actor"}:${row.path}`, total = quantity((resources.get(key)?.total ?? 0) + amount); // sums per item path
      if (total > row.quantity) throw new Error(`Insufficient ${row.name}.`); // overspend throws, within stock continues
      resources.set(key, { row, total });
    }

    for (const { row, total } of resources.values()) { // In: totals, out: update sets
      const remaining = quantity(row.quantity - total);
      if (row.itemId) { // Item update, else actor update
        const update = itemUpdates.get(row.itemId) ?? { _id: row.itemId };
        update[row.path] = remaining;
        itemUpdates.set(row.itemId, update);
      } else actorUpdate[row.path] = remaining;
    }

    for (const reward of rewards) { // In: rewards, out: create entries
      let document;
      try {
        document = await fromUuid(reward.uuid);
      } catch (error) {
        throw new Error(`Cannot load reward ${reward.uuid}: ${error.message}`, { cause: error });
      }

      if (document?.documentName !== "Item") throw new Error("The reward must resolve to an item."); // non item reward throws
      if (["buff", "spell"].includes(document.type)) throw new Error("Buffs and spells cannot be rewards."); // buff or spell reward throws
      const data = structuredClone(document.toObject());
      delete data._id;
      delete data.folder;
      delete data.ownership;
      delete data.sort;
      if (data.type === "race") { // PF1 allows one race, replace it
        const previous = itemCreates.findIndex(item => item.type === "race");
        if (previous >= 0) itemCreates.splice(previous, 1); // earlier race create gets dropped
        for (const item of Array.from(actor.items).filter(item => item.type === "race")) { // In: old races, out: delete list
          if (!itemDeletes.includes(item.id)) itemDeletes.push(item.id); // queue each old race delete once
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
    if (!type || !types.includes(type)) throw new Error("Choose a valid ledger item type in the generic adapter settings. The module ledger window remains available."); // no valid ledger type throws
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
  if (typeof systemId !== "string" || !systemId.trim() || !["inventory", "plan", "currencyDefinitions", "ledgerData"].every(method => typeof adapter?.[method] === "function")) throw new Error("A system adapter requires inventory, plan, currencyDefinitions, and ledgerData methods."); // bad id or missing method throws
  adapters.set(systemId, adapter);
}

export function getAdapter() {
  return adapters.get(globalThis.game?.system?.id) ?? generic; // Generic fallback for unregistered systems
}

registerAdapter("pf1", new PathfinderAdapter());
