# Development

Version 1.0.0 targets Foundry V12. PF1e 11.11 is the primary system. Item Piles remains optional.

## Boundaries

Donations use GM-authorized, serialized requests with retry deduplication and recovery records. Other modules can still change inventory during a request. Review intervening edits before Restore Inventory.

One party roster supports shared standing. Opposing reputations apply the actual gain or loss once per direct link. Rewards go to the interacting character. One ledger displays all of that character's reputations.

## Diagnostics

Enable Debug logging in module settings. The module API exposes `diagnostics()`. Transaction hooks report stages for integration tools. See [API.md](API.md).
