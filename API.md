# Integration API

The API is available after Foundry initializes the module:

```javascript
const reputations = game.modules.get("victory-reputations").api;
await reputations.openLedger(game.user.character);
```

## Entry points

- `openManager()`: GM configuration.
- `openLedger(actor?)`: owned-character ledger, with a chooser when omitted.
- `openProxy(proxyActorOrUuid, actor?)`: proxy interaction.
- `installLedger(actor)`: add the character's ledger item.
- `getStanding(actor)`: current ledger rows.
- `isHostile(reputationId, actor)`: hostility for one reputation.
- `hostileTo(proxyActor, character)`: hostility for a proxy.
- `diagnostics()`: versions, active GM, and transaction status.
- `registerAdapter(systemId, adapter)`: replace a system integration.

## Adapter contract

Adapters provide four methods:

- `currencyDefinitions(actor)`: currency entries with `key` and `name`.
- `inventory(actor, reputation)`: entries with `id`, `kind`, `offerId`, and integer `quantity`. Kinds are `items` and `currencies`.
- `plan(actor, quote, reputation, rewards)`: return `itemUpdates`, `actorUpdate`, `itemCreates`, and `itemDeletes`. This method must not write documents. It must revalidate actual inventory.
- `ledgerData(actor)`: item data for the living ledger.

The runtime performs document writes and recovery. Currency fields must exist before mutation. Reward data must preserve source identity and reject buffs and spells.

## Debugging

```javascript
const diagnostics = game.modules.get("victory-reputations").api.diagnostics();
console.log(diagnostics);
```

`victoryReputationsTransaction` emits a stage and detail object. `victoryStandingChanged` signals score updates. Enable Debug logging for console traces. These hooks are available to a live debugging bridge, including AAGM-O.
