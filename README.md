(Full admission, AI assited readme/terribad with documentation on my own creations will clean up)

# Victory Reputations

Your party can finally put a number on how much the local guild likes them. Or doesn't.

Victory Reputations tracks faction and individual NPC standing in Foundry V12. The GM sets the terms. Players surrender goods through NPC proxies, earn reputation, and collect tier rewards. PF1e is the primary system. Item Piles is optional.

## Install

Paste this into Foundry's Install Module manifest field:

https://github.com/DatJavaClass/VictoryReputations/releases/latest/download/module.json

Enable the module in your world. Donations need an active GM.

## GM pages and buttons

Open **Actors > Reputations**.

| Page | Buttons and outcome |
| --- | --- |
| Manager | Create New, Edit, Delete manage reputations. |
| Create | Name a faction or drop an individual actor. Continue opens its editor. |
| Basic Info | Add Tier, Remove Final Tier set 1 to 10 tiers. Drop proxies. Dialog edits their greeting. Remove unlinks a proxy. |
| Message | Keep Message retains the greeting for the reputation being edited. |
| Progress | Drop items, set values, Add Currency. Remove drops an accepted offering. |
| Rewards | Drop tier rewards. Remove clears a reward. Save Reputation commits the setup. |
| Player Party | Drop characters, Remove members, Save Player Party. One roster supports shared standing. |
| Monitor / Modify Standing | Apply Change adjusts scores. Restore Inventory handles interrupted transactions. Add Reputations Ledger to Character reuses an existing ledger. |
| System Integration | Save Integration stores inventory and currency fields. |

New tiers default to 50, 100, 200, 400, 800, 1,600, 3,200, 6,400, 12,800, and 25,600 units. Each value is the total reputation needed to unlock that tier. At 200, you reach Tier 3. Lose 10 and return to Tier 2. Custom thresholds remain editable. Existing reputations migrate to equivalent totals.

Basic Info also controls opposing reputations, negative standing, hostility, party sharing, and compressed player displays. Rewards can be earned once or again when enabled.

## Player pages and buttons

Double-click a proxy. Item Piles proxy? Open its Reputations header button. The handshake tool also opens a targeted proxy.

**I'd like to increase my standing** opens donations. Arrows or quantity fields select goods. **Surrender Goods** exchanges them for standing and earned rewards. **Not now**, **Changed Mind**, and **Close** leave the interaction.

The book tool and character ledger open all standings. **Refresh** reloads them. **Add Reputations to Character** installs one living ledger, a Trait feat in PF1e. Repeated clicks reuse it.

[Integration API](API.md) and [development notes](DEVELOPMENT.md).
