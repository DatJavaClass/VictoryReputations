# Victory Reputations

Do you like making random NPCs happy when a dragon is rampaging in the background? Do you like irritating the local guard by being a minor inconvenience to the local landed gentry for the sake of the approval of the common peasant? Do you like slathering your sandwiches in grade A Icelandic fish brine?

Well, I can't help you with the third one, but you can damn bet your dice bags I can help with the first two!

That's right! Your party can finally put a number on how much the local guild likes them. Or doesn't like the fact your bard has been pulling a LARP of Genghis Khan, with Victory Reputations!

# What is Victory Reputations?

Victory Reputations tracks faction and individual NPC standing in Foundry VTT. The GM sets the terms. Players surrender goods in the form of items or currency through designated NPC "proxies." In return they earn reputation and collect tier rewards. I tested Victory Reputations in PF1e, as it was originally a quartet of macros in the Pathfinder 1e system and only became a module recently.

Why? Because I hated myself.

Oh, there is a certain merchant and looting module that is compatible with Victory Reputations. It has no official integration until I can get in touch with the creator and throw myself at his tender mercies. I can say that said module is running half of my personal PF1e instance. Thus maybe, just maybe, ask if he'll let me post what Victory Reputations can fully do when integrated with his module. Haha! Cryptic. 

## Install

Paste this into Foundry's Install Module manifest field:

https://github.com/DatJavaClass/VictoryReputations/releases/latest/download/module.json

Enable the module in your world. Donations need an active GM.

# Accessing Victory Reputations as a GM

Once installed, getting access to Victory Reputations is a highly technical and complex process involving three goats, two sea lions, and your old pal Chet from Rhode Island. See below.

<p align="center"><img width="225" height="174" alt="image" src="https://github.com/user-attachments/assets/47e93b6f-9388-4a63-8aa0-18b2c45025be" /></p>

Open **Actors > Reputations**.

## The GM Reputation Manager
<p align="center"><img width="357" height="374" alt="image" src="https://github.com/user-attachments/assets/f1cee4a3-6532-4d68-b917-e348cb28dab6" /></p>

This Rolls Royce of a GUI is the zero state of the Victory Reputations page, fresh out of the box, or frankly in a state of absolute frustration because you've found bugs I've missed. (By the way, let me know if you've found any bugs.) This landing page is the Manager. From here you'll create, edit, and, if needed, delete reputations. You'll also have the option here to set integrations with whatever system you're using in terms of quantity, currency, and ledger item types. You'll also notice the big button at the bottom. "Player Party." This is big because it's important. Even if it's just one person, it's critical to how the module functions. (Size is not everything.)
Now, because I love the sound of my own voice so much, even in my own head with all the other voices, I'll be explaining how to use Victory Reputations via a walkthrough on setting it up, and you can imagine my dulcet tones lulling you into enjoying my abomination.
<p align="center"><img width="480" height="360" alt="FailingToBeHumble" src="https://github.com/user-attachments/assets/64a0f032-4adc-4a9b-85e6-aaefe52de3b7" /></p>

### The Player Party
<p align="center"><img width="357" height="331" alt="image" src="https://github.com/user-attachments/assets/da8497b2-9459-400c-8bfd-e522cf3b3150" /></p>

When you click "Player Party" you'll be welcomed by a truly impressive blank GUI element with two interactive areas (above): the one area asking for party characters to be dragged to it, and a save button below. The upper element takes dragged input in the form of Actor objects only from the Sidebar. It has no upper limit to how many it can handle, but my tests show the module can exhibit erratic behavior if over 16 actors are present in the Player Party list. As you can see in the completed image below, the assembled party image does not look remarkably outstanding. The purpose here is to inform the rest of the larger module that the actors in this list are the ones who "gain" reputation and are allowed special privileges when interacting with other actors who "give" or "react" to reputation. Once this step is done, we'll move on to "Create New."
<p align="center"><img width="363" height="374" alt="image" src="https://github.com/user-attachments/assets/531f9623-e73e-4f83-9477-b8f480fbae02" /></p>

### Create New
<p align="center"><img width="359" height="375" alt="image" src="https://github.com/user-attachments/assets/97f9903e-1fa1-4a35-bb57-6a96941ffd30" /></p>

Create New's first dialog box can be a head scratcher for a moment, until you realize that Victory Reputations treats Individuals and Factions as separate structures within its internal system, even though they function almost identically. The primary difference is the concept of "Proxies." In the case of a Faction, you can have multiple Proxies (again, I'd stay under 16), each one a reputation interactive actor with that Faction. An Individual, on the other hand, cannot have Proxies. It instead is its own Proxy. You might be asking, "DatJavaClass, why don't I just put the Tabasco Sauce on the Peanut Butter and Bologna Sandwich?" To which I say? You do you.
As for the question of why not just make Factions of one? The reason is organization. When you have Factions with multiple Proxies, you can gate reputation access by Proxy location or, with integration I have not yet gotten permission to mention, Item Access. Whereas a singular Proxy for an Individual can only exist in one location, or one actor in multiple locations. Far more versatile, but they can't offer the diversity of services a Faction can.
To create a Faction, as I am doing in this image (below), you simply enter a string. To create one for an Individual, drag an actor type object from either the Compendium or Sidebar.
<p align="center"><img width="361" height="376" alt="image" src="https://github.com/user-attachments/assets/f8d60feb-4f4b-4189-a45c-76abe05f8efb" /></p>

### Basic Info:
Once we've created our super awesome Faction that has an entirely unique name and doesn't sound like something from a mid-90s anime, we'll find ourselves on the Reputations Configuration Page.
<p align="center"><img width="545" height="524" alt="image" src="https://github.com/user-attachments/assets/56caafd1-ff04-4e99-a0a4-7676c18cceb3" /></p>

It's a page that looks like it brought THAC0 to the party and forgot to bring a "ye-old" gamer like myself to translate. I promise it's not that complex. The first section is Reputation Tiers. Here you can set "reputation tiers." If you're familiar with a certain monolithic MMO, you'll recognize this right away. If not, think of this as levels for reputation. You set a number of "tiers," max 10, and how many "reputation units" or "units" it takes to reach the next tier. All players start at 0 Reputation with a Faction by default. There is a default doubling scale for reputation, at base 50, embedded in the module that can be changed. All reputation gain and loss is persistent and starts from zero.
Now, onto the Options:

+ __Compress Tiers For Players:__ This option strips away the tier system and just provides a giant number of reputation for players. The Tier system still runs in the background.

+ __Negative Reputation:__ This option allows players to fall to -1,000 reputation with the Faction.

+ __Party Reputation:__ This option makes the reputation shared party wide. All gains and losses are shared among the party.

+ __Conditional Reputation:__ This is the only option checked true by default. This is the option that enables the Factions to react to each other in terms of dynamically lowering or gaining reputation. _I do not recommend unchecking this._

+ __Hostile Reputation:__ This option works only with Negative Reputation. It turns Faction actors hostile in negative reputation, excluding those who are manually set friendly.

+ __Reward again after loss:__ This option is left off by default. Use at your own peril. I leave it off, as some rewards may not be items in the traditional sense and could cause a duplication error.

The final three areas are fairly self explanatory. "Opposing Reputations," which has no options at the time of this walkthrough, is where one selects another existing reputation to decrease as the one we're assembling increases. The Player Party area is a check. It ensures the party is being affected by the update. If you see anyone not on the list, it means something is up with their actor and they need to be checked. It can happen with these types of modules. Finally, the Proxy pane, which is shared between both the Individual NPC and NPC Faction versions of this sheet, is a drag and drop interface between the Compendium and Sidebar. It is where you place those actors who will act as the "Proxies" for the reputation.

### Progress:
<p align="center"><img width="550" height="640" alt="image" src="https://github.com/user-attachments/assets/3c529b48-4011-4df6-a04b-92e9b880bf2b" /></p>

The Progress page is another simple one. It is broken into two halves, upper and lower. The upper part is another drag and drop interface that only takes item type objects from the Compendium. The lower part uses a more familiar item type picker for currencies. What these two share in common is the number entry field to the right. That is how many "Reputation Units" a single "unit" of the said item or currency yields when surrendered to a reputation enabled actor.

### Rewards:
<p align="center"><img width="547" height="638" alt="image" src="https://github.com/user-attachments/assets/e525dc77-745a-477f-98fa-3b7ef11cf43d" /></p>

The Rewards tab is a primitive event that acts on the player actor from the reputation enabled actor when the player reaches a certain level in the relevant reputation. It can apply any item type as a reward, excluding spells and buffs. Avoid applying races if possible, as this can cause issues. The image above is a completed Rewards page. The entire element is populated by drag and drop from the Compendium or the browser. (The browser is unreliable.)

### Monitor / Modify Standing
<p align="center"><img width="361" height="368" alt="image" src="https://github.com/user-attachments/assets/870b9324-52e6-4f05-a8f4-d0758dcb68a2" /></p>

Once we've filled out all three of those pages, we'll save the Faction and be returned to the main GM page. We'll see our newly created Faction here. Selecting it, we'll now have additional options. We're going to select "Monitor / Modify Standing" (see below). While this is unpopulated now, as there are no actors with Reputation, you can see it is trying to read for reputation on a drop down of actors. It also has the ability to externally add a reputation ledger to an actor (you need to remove the original reputation, all of it. I don't suggest it). Great for new PCs. This is where you come if you need to manually add to a player's reputation.
<p align="center"><img width="523" height="419" alt="image" src="https://github.com/user-attachments/assets/6864cb1f-94d9-4c95-b3af-669f2f01494c" /></p>

# Accessing Victory Reputations as a Player

## Building trust through Bribery, but first...Bookkeeping.
<p align="center"><img width="593" height="57" alt="image" src="https://github.com/user-attachments/assets/1b6cd5b8-8adb-4c0b-ba3c-3e92cc8c77c5" /></p>

Before a player can use Victory Reputations, they need a Reputations book. This step can be done by the GM, but I find it's best to have a player do it so they know where to look. First, a player clicks the Reputations button. This will present them a list of the available reputations and the player's current rank in them, if any, the ability to refresh these values, and a button that says "Add Reputations to Character." Have the player click that button. They'll have a new trait called "Reputations" with an On-Use ability that will bring up a near identical GUI. It will tell them their most current rep levels, refresh their current rep levels, or attempt to self repair the reputation mechanic by reimporting the trait if the system detects it has been changed (#1 source of breakage).
<p align="center"><img width="421" height="133" alt="image" src="https://github.com/user-attachments/assets/38cdb5b7-7df1-4dac-9bdf-361c7111609b" /></p>

## Ok, now the bribery.
<p align="center"><img width="541" height="172" alt="image" src="https://github.com/user-attachments/assets/a912e889-a520-4d23-80ff-62fff6ffeb8a" /></p>

Opening the interactive portion of the Player GUI is fairly straightforward. Go up to a Faction actionable NPC and poke them. Twice. It will open the above menu and, if the GM decides, have a custom message for you. The two choices are a fancy way of offering to give them things or walk away. There is support for a Module I am entirely far to dependent on my personal foundry instance that this is compatible with so you can have both. 

<p align="center"><img width="539" height="305" alt="image" src="https://github.com/user-attachments/assets/cc7b7e63-c501-4cef-a6cd-45e494a29361" /></p>

In the above image is the last interaction menu for the module, the surrendering of items to the Faction in exchange for reputation.

[Integration API](API.md) 

## The Big Red Button

This script is a last resort debug option for Victory Reputations. Run this, and it resets the module to a fresh state. All user data in and related to the module, excluding child items now passed through the module to actors, is removed.

```javascript
(async () => {
  const id = "victory-reputations";
  let resume;

  async function clearFlags(document) {
    if (document?.flags?.[id]) await document.update({ [`flags.-=${id}`]: null });
  }

  async function clearItem(item) {
    if (item.flags?.[id]?.ledger === true) await item.delete();
    else await clearFlags(item);
  }

  async function clearActor(actor) {
    if (!actor) return;
    for (const item of [...actor.items]) await clearItem(item);
    await clearFlags(actor);
  }

  try {
    if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) throw new Error("Run this as the active GM.");
    if (!game.modules.get(id)?.active) throw new Error("Enable Victory Reputations before running this reset.");
    const { Runtime } = await import(foundry.utils.getRoute(`modules/${id}/scripts/runtime.js`));
    const { ReputationStore } = await import(foundry.utils.getRoute(`modules/${id}/scripts/store.js`));
    const enqueue = Runtime.enqueue, write = ReputationStore.write;
    const blocked = () => Promise.reject(new Error("Victory Reputations is resetting."));
    Runtime.enqueue = ReputationStore.write = blocked;
    resume = () => { Runtime.enqueue = enqueue; ReputationStore.write = write; };
    await Promise.all([Runtime.queue, ReputationStore.queue]);
    for (const setting of game.settings.settings.values()) {
      if (setting.namespace === id) await game.settings.set(id, setting.key, structuredClone(setting.default));
    }

    for (const actor of game.actors) await clearActor(actor);
    for (const scene of game.scenes) {
      for (const token of scene.tokens) {
        if (!token.actorLink) await clearActor(token.actor);
        await clearFlags(token);
      }
    }

    for (const item of [...game.items]) await clearItem(item);
    window.location.reload();
  } catch (error) {
    resume?.();
    console.error("Victory Reputations reset:", error);
    ui.notifications.error(`${error.message} If the reset was interrupted, correct the error and run it again.`);
  }
})();
```

## Known Bugs

- The Reputation option may not be visible when the actor being engaged is flagged to behave as something other than a normal actor.
  - Temporary Fix until Solved: Reload Player Client

## License

MIT, copyright 2026 DatJavaClass. Fork it, change it, redistribute it. Keep the copyright and license notice with copies or substantial portions. See [LICENSE](LICENSE).
