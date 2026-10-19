import { migrateTiers, validateReputation } from "./core.js";

export const MODULE = "victory-reputations";

export class ReputationStore {
  static queue = Promise.resolve();

  static register() {
    game.settings.register(MODULE, "definitions", { scope: "world", config: false, type: Object,
      default: { revision: 0, reputations: [] }, onChange: () => Hooks.callAll("victoryReputationsChanged") });
  }

  static read() {
    const state = structuredClone(game.settings.get(MODULE, "definitions"));
    state.partyMembers ??= [...new Set(state.reputations.flatMap(rep => rep.members ?? []))]; // Older saves stored members per rep
    state.reputations = state.reputations.map(rep => ({ ...migrateTiers(rep), members: [...state.partyMembers] }));
    return state;
  }

  static requireGM() {
    if (!game.user.isGM) throw new Error("Only a GM can configure reputations."); // non GM throws, GM continues
    const gm = game.users.activeGM;
    if (!gm || gm.id !== game.user.id) throw new Error("The active GM must save reputation changes."); // inactive GM throws
  }

  static write(revision, change) { // Serialized writes, revision check catches stale editors
    const operation = this.queue.then(async () => {
      this.requireGM();
      const state = this.read();
      if (state.revision !== revision) throw new Error("Reputations changed in another window. Reopen this editor before saving."); // stale revision throws
      change(state.reputations, state);
      state.reputations = state.reputations.map(rep => { // each rep validated, members stripped
        const value = validateReputation({ ...rep, members: state.partyMembers });
        delete value.members; // Members live in partyMembers, not per rep
        return value;
      });
      state.revision++;
      await game.settings.set(MODULE, "definitions", state);
      return state.revision;
    });
    this.queue = operation.catch(() => {}); // Keep the chain alive after a failure
    return operation;
  }

  static save(rep, revision) {
    return this.write(revision, rows => {
      const index = rows.findIndex(row => row.id === rep.id), value = validateReputation(rep);
      if (index < 0) rows.push(value); // Insert when new, else replace
      else rows[index] = value;
    });
  }

  static saveParty(members, revision) {
    if (!Array.isArray(members) || members.some(uuid => typeof uuid !== "string" || !/^Actor\.[a-zA-Z0-9]+$/.test(uuid))) throw new Error("Party members must be world characters."); // bad member uuid throws
    return this.write(revision, (rows, state) => { state.partyMembers = [...new Set(members)]; });
  }

  static remove(id, revision) {
    return this.write(revision, rows => {
      const index = rows.findIndex(row => row.id === id);
      if (index < 0) throw new Error("That reputation no longer exists."); // removing absent reputation throws
      rows.splice(index, 1);
    });
  }
}
