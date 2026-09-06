# Development

Version 1.0.3 targets Foundry V12 with some testing for v13. PF1e 11.11 is the primary system. Item Piles remains optional.

The 1.0.2 update changes tier progression to cumulative thresholds. New tiers start at 50 and double through 25,600. Current total standing determines rank, including losses. Below the first threshold, the character is Tier 0. Existing reputations convert their old entry costs to equivalent totals without changing scores or earned tiers. 

The 1.0.3 update is Minor Refactoring due to Forgetfulness: guidance comments added across the scripts, no behavior change.

## Boundaries

Donations use GM-auth, serialized requests with retry deduplication and recovery records. Other modules can still change inventory during a request.

One party roster supports shared standing. Opposing reputations apply the actual gain or loss once per direct link. Rewards go to the interacting character. One ledger displays all of that character's reputations.

## Diagnostics

Enable Debug logging in module settings. The module API exposes `diagnostics()`. Transaction hooks report stages for integration tools. See [API.md](API.md). Yay! Logs!
