export const LIMITS = Object.freeze({ tiers: 10, threshold: 9999, valueMin: -1000, valueMax: 9999, floor: -1000 });

export function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  return value;
}

function identifier(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  if (["__proto__", "constructor", "prototype"].includes(value)) throw new Error(`${label} is reserved.`);
  return value;
}

function unique(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} must be a list.`);
  const ids = rows.map(row => identifier(row?.id, `${label} ID`));
  if (new Set(ids).size !== ids.length) throw new Error(`${label} IDs must be unique.`);
}

export function createReputation(id, name, actorUuid = null) {
  return validateReputation({ id, name, kind: actorUuid ? "individual" : "faction", actorUuid,
    tiers: [{ id: "tier-1", name: "Tier 1", units: 100 }], compressTiers: false,
    conditional: true, negative: false, hostile: false, party: false,
    proxies: actorUuid ? [{ id: actorUuid, actorUuid, message: "" }] : [], items: [], currencies: [], rewards: [],
    opposing: [], members: [], repeatRewards: false });
}

export function validateReputation(source) {
  const rep = structuredClone(source);
  rep.opposing ??= [];
  rep.members ??= [];
  rep.repeatRewards ??= false;
  identifier(rep.id, "Reputation ID");
  identifier(rep.name, "Reputation name");
  for (const field of ["opposing", "members"]) {
    if (!Array.isArray(rep[field]) || rep[field].some(id => typeof id !== "string" || !id.trim()) || new Set(rep[field]).size !== rep[field].length) throw new Error(`${field} must contain unique identifiers.`);
  }

  if (rep.opposing.includes(rep.id)) throw new Error("A reputation cannot oppose itself.");
  if (typeof rep.repeatRewards !== "boolean") throw new Error("Repeat rewards must be a checkbox value.");
  if (!["individual", "faction"].includes(rep.kind)) throw new Error("Reputation type must be individual or faction.");
  for (const field of ["compressTiers", "conditional", "negative", "hostile", "party"]) {
    if (typeof rep[field] !== "boolean") throw new Error(`${field} must be a checkbox value.`);
  }

  unique(rep.tiers, "Tier");
  integer(rep.tiers.length, 1, LIMITS.tiers, "Tier count");
  for (const tier of rep.tiers) {
    identifier(tier.name, "Tier name");
    integer(tier.units, 1, LIMITS.threshold, "Tier units");
  }

  unique(rep.proxies, "Proxy");
  for (const proxy of rep.proxies) {
    identifier(proxy.actorUuid, "Proxy actor UUID");
    if (typeof proxy.message !== "string") throw new Error("Proxy message must be text.");
  }

  if (rep.kind === "individual") {
    identifier(rep.actorUuid, "Individual actor UUID");
    if (rep.proxies.length !== 1 || rep.proxies[0].actorUuid !== rep.actorUuid) throw new Error("Individual reputation requires its own NPC proxy.");
  }

  for (const field of ["items", "currencies"]) {
    unique(rep[field], field);
    for (const entry of rep[field]) {
      identifier(entry.name, `${field} name`);
      identifier(entry[field === "items" ? "uuid" : "key"], `${field} reference`);
      integer(entry.units, LIMITS.valueMin, LIMITS.valueMax, "Donation value");
    }
  }

  unique(rep.rewards, "Reward");
  const assigned = new Set();
  for (const reward of rep.rewards) {
    identifier(reward.uuid, "Reward UUID");
    identifier(reward.type, "Reward type");
    if (["buff", "spell"].includes(reward.type.toLowerCase())) throw new Error("Buffs and spells cannot be rewards.");
    if (!rep.tiers.some(tier => tier.id === reward.tierId)) throw new Error("Reward tier does not exist.");
    if (assigned.has(reward.tierId)) throw new Error("Each tier accepts one reward.");
    assigned.add(reward.tierId);
  }

  return rep;
}

export function applyUnits(current, delta, negative = false) {
  integer(current, LIMITS.floor, Number.MAX_SAFE_INTEGER, "Current reputation");
  integer(delta, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "Reputation change");
  const total = current + delta;
  if (!Number.isSafeInteger(total)) throw new Error("Reputation exceeds safe numerical limits.");
  const units = Math.max(negative ? LIMITS.floor : 0, total);
  return { before: current, units, delta: units - current };
}

export function quoteDonation(reputation, selection, inventory) {
  const rep = validateReputation(reputation), lines = [];
  let units = 0;
  unique(selection, "Selection");
  unique(inventory, "Inventory");
  for (const row of selection) {
    integer(row.quantity, 0, Number.MAX_SAFE_INTEGER, "Donation quantity");
    if (!["items", "currencies"].includes(row.kind)) throw new Error("Unknown donation type.");
    const offer = rep[row.kind].find(entry => entry.id === row.offerId), stock = inventory.find(entry => entry.id === row.id);
    if (!offer || !stock || stock.kind !== row.kind || stock.offerId !== row.offerId) throw new Error("Donation is not accepted or no longer available.");
    integer(stock.quantity, 0, Number.MAX_SAFE_INTEGER, "Available quantity");
    if (row.quantity > stock.quantity) throw new Error(`Insufficient ${offer.name}.`);
    const value = row.quantity * offer.units;
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(units + value)) throw new Error("Donation exceeds safe numerical limits.");
    units += value;
    if (row.quantity) lines.push({ id: row.id, kind: row.kind, offerId: row.offerId, quantity: row.quantity, remaining: stock.quantity - row.quantity, units: value });
  }

  if (!lines.length) throw new Error("Choose goods to surrender first.");
  return { reputationId: rep.id, units, lines };
}

export function tierProgress(rep, units) {
  let remaining = units, completed = 0;
  for (const tier of rep.tiers) {
    if (remaining < tier.units) break;
    remaining -= tier.units;
    completed++;
  }

  const index = Math.min(completed, rep.tiers.length - 1), max = rep.tiers[index].units;
  const earned = units < 0 ? [] : rep.tiers.slice(0, index + 1).map(tier => tier.id);
  return { tier: index + 1, current: completed === rep.tiers.length ? max : remaining, max, earned };
}

export function standingKey(rep, actorUuid) {
  return rep.party && rep.members.includes(actorUuid) ? "party" : actorUuid;
}

export function planStanding(definitions, state, reputationId, actorUuid, delta) {
  const rep = definitions.find(row => row.id === reputationId), next = structuredClone(state), changes = [];
  if (!rep) throw new Error("Reputation no longer exists.");
  if (rep.party && !rep.members.includes(actorUuid)) throw new Error("The GM must add this character under Reputations > Player Party.");
  next.scores ??= {};
  next.claimed ??= {};
  const update = (target, subject, amount) => {
    const key = standingKey(target, subject);
    if (changes.some(change => change.id === target.id && change.key === key)) return;
    next.scores[target.id] ??= {};
    const result = applyUnits(next.scores[target.id][key] ?? 0, amount, target.negative);
    next.scores[target.id][key] = result.units;
    changes.push({ id: target.id, key, ...result });
    return result.delta;
  };
  const applied = update(rep, actorUuid, delta), subjects = rep.party ? rep.members : [actorUuid];
  if (rep.conditional) {
    for (const target of definitions.filter(row => row.id !== rep.id && row.conditional && (rep.opposing.includes(row.id) || row.opposing.includes(rep.id)))) {
      for (const subject of subjects) update(target, subject, -applied);
    }
  }

  const rewards = [];
  next.claimed[actorUuid] ??= {};
  for (const change of changes) {
    const target = definitions.find(row => row.id === change.id);
    if (change.key !== standingKey(target, actorUuid)) continue;
    const before = tierProgress(target, change.before).earned, after = tierProgress(target, change.units).earned;
    const claimed = next.claimed[actorUuid][target.id] ?? [];
    for (const reward of [...target.rewards].sort((a, b) => target.tiers.findIndex(tier => tier.id === a.tierId) - target.tiers.findIndex(tier => tier.id === b.tierId))) {
      if (!after.includes(reward.tierId) || (target.repeatRewards ? before.includes(reward.tierId) && claimed.includes(reward.tierId) : claimed.includes(reward.tierId))) continue;
      rewards.push({ ...reward, reputationId: target.id });
      if (!claimed.includes(reward.tierId)) claimed.push(reward.tierId);
    }

    next.claimed[actorUuid][target.id] = claimed;
  }

  return { state: next, changes, rewards };
}
