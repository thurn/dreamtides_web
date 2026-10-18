# Dreamtides 97: Story bible

**Status:** the narrative ground truth for Dreamtides 97 (decision
[P16](plan/decisions.md#p16-narrative)). Every creative bead writes against
it: dream briefs, residents, townsfolk, challenger personas, quests, and the
dialogue of the Dream Guides, the incarnations and Apollyon. Where this page
and the [design overview](README.md) or its appendices disagree, the design
documents win and this page is wrong.

[Back to the design overview](README.md)

## Contents

1. [How to use this bible](#how-to-use-this-bible)
2. [The premise](#the-premise)
3. [The campaign as a descent](#the-campaign-as-a-descent)
4. [Tone and register](#tone-and-register)
5. [Talking about the game](#talking-about-the-game)
6. [What never appears](#what-never-appears)
7. [Recurring motifs](#recurring-motifs)
8. [The through-line](#the-through-line)
9. [Voice guides: the Dream Guides](#voice-guides-the-dream-guides)
10. [Voice guides: the incarnations](#voice-guides-the-incarnations)
11. [Voice guide: Apollyon](#voice-guide-apollyon)
12. [Other speakers](#other-speakers)
13. [Naming rules](#naming-rules)
14. [Rulings and open questions](#rulings-and-open-questions)

## How to use this bible

- **Read it whole once,** then keep [What never appears](#what-never-appears)
  and the voice guide for your speaker open while writing.
- **Sample lines are models, not stock.** Write new lines in the same voice;
  do not reuse a sample verbatim unless it fits exactly.
- **Authored lines are fixed.** The Dream Guides' journey lines in
  `src/content/guides.ts` stay as written. New D97 lines sit beside them and
  must sound like the same person.
- **All copy lives in content modules,** keyed by UUID (P17). Names are
  display text only; nothing is ever looked up by name.
- **The first authored dream** (dream `3229d6c7-…`, the harvest hill town) is
  the reference sample for resident voice. Its brief's tone note is the
  local application of this bible.

## The premise

### The dreaming

The dreaming is every dream there is, joined door to door. Each dream is one
place held in one mood: a hill town on the last evening of harvest, a forge
hall cut into ice, a neon back street, a graveyard chapel at dusk. Doors
between dreams are veils of slow color; stepping through one is like falling
asleep a second time.

Dreams do not know about each other. A dream is complete in itself, and the
people who live in it have never heard of any other place.

### Who lives here

The dreaming has two kinds of people.

- **The dream-bound.** Residents, townsfolk, shopkeepers and most
  challengers belong to one dream. They know its lanes, its customs and its
  small wrongnesses, and nothing beyond its doors. They do not call their
  home a dream, and they never name it.
- **The walkers.** A few move between dreams and know the dreaming for what
  it is: the Dream Guides, the Avatars, Apollyon in all his incarnations,
  and the player. Walkers say "dream" and "the dreaming" plainly.

The placed role NPCs (sages, amulet merchants and changers, prize duelists)
stand between the two: they appear wherever assembly puts them, but they
speak only of their trade and the door or road in front of them.

### The player

The player is a dreamer who walks the dreaming in the shape of an
**Avatar**. The Avatar is a figure of power the dreamer has taken up; the
player's body in the overworld is that Avatar's sprite. Switching Avatars at
a waypoint is changing shape.

- An Avatar the player has taken up cannot also stand elsewhere in the
  world, which is why its characters step away when it joins the roster
  ([§B16](appendix-b-dreams.md#b16-avatar-characters-and-switching)).
- The player has no name of their own in any line, and no line names the
  player's current Avatar, since it can change at any waypoint.
- Who the dreamer is, and whether anyone sleeps outside the dreaming, is
  never answered. Characters may wonder; nobody knows.

### Why people play cards

Every card is a dreamed thing. A collection is everything the dreamer has
gathered on the way, and a battle is a contest of what two players can
dream. In the dreaming, a challenge is as ordinary as a game of cards at an
inn: a hand is dealt, each side puts up an ante, and the winner keeps it.
Locals talk about battles as games ("Fancy a hand?"); walkers can say more
("Every card dreams, friend").

### The guardians

Avatars who stand in front of doors are **guardians**. They are not
Apollyon's servants. Each holds a door for reasons of their own (pride,
duty, a taste for testing travelers) and steps aside, without grudge, once
beaten. The deepest door of each act is held instead by one of Apollyon's
incarnations (below), which is Apollyon himself, not a guardian. Within a dream, the guarded door is often the thing the dream is
stuck on: in the first dream, the sun will not set through the arch while
someone stands in its mouth.

### Apollyon

Apollyon is the end of things. Every dream ends, in its time: evenings close,
feasts finish, fires burn down. Apollyon is a different ending, the last
door, through which every dream would pass at once and nothing would follow.
He waits at the bottom of the dreaming, in **Limbo**, and calls it rest.

He comes up to meet the dreamer in **incarnations**: ten faces, each one a
way the world can end. One stands at the deepest door of each act, and the
rest stand around his dais in Limbo. When the last of those falls, he
manifests in gold.

The heart of the story is the difference between **an ending in its time**
and **the end of everything at once**. The player is never against endings.
Beating a guardian lets a stuck dream move on ("Go on, then. Let it get
dark."); beating Apollyon keeps every ending its own.

### After Apollyon

Beating Apollyon does not wake the dreamer. The dreaming stays open, every
act dream can be walked again, and keys open dreams that light up once and
then close. The mood after Apollyon is relief and breadth: endings still
come, but one at a time, as they should.

## The campaign as a descent

Characters experience the campaign as a descent, not a sequence of numbered
acts. Each act is deeper in the dreaming, closer to Limbo.

| Campaign stage | In-world sense | Mood |
| --- | --- | --- |
| Act 1 | The near dreaming, close to where dreamers arrive | Welcome, curiosity, small mysteries |
| Act 2 | Wider dreaming; walkers recognize the player | Confidence, a first friendly Avatar |
| Act 3 | The middle depths; the pull downward is felt | Seriousness, guides speak of Apollyon |
| Act 4 | The deep dreaming; keys begin to turn up | Cold under the warmth, higher stakes |
| Act 5 | The floor of the dreaming, just above Limbo | Gravity, farewells, resolve |
| Limbo | The bottom; only Apollyon and his faces | Stillness, inevitability |
| After Apollyon | The open dreaming | Relief, breadth, play |

Act exits are the deepest doors of each act; their red veils read as "down".
The door to Limbo is white.

**Key dreams** are dreams folded small: a key holds one dream, which opens
once, lights up for a while, and closes when its challengers are done.
Characters can mention keys and key dreams by those words (decision S14).

## Tone and register

### The overall tone

- **Literary, warm and a little uncanny.** Each dream is lovely on the
  surface with one thing slightly wrong underneath.
- **Second person where the narration speaks,** in the Cumulus UI voice:
  literary, Title Case titles, no emoji.
- **Kindness is real; menace is courteous.** Nobody sneers at the player.
  Even Apollyon is polite.
- **Humor is dry** and comes from character, never from winking at the
  player or at games.
- **No modern idiom** outside the dreams whose culture is modern (the
  station, the city, the wasteland), and no slang anywhere that will date.

### Line craft

- **One to three lines per node,** each line one or two sentences, rarely
  more than 20 words. Most authored lines are under 12 words.
- **Say one thing per line.** The second line answers or turns the first.
- **Specific nouns over adjectives:** "the bread's nearly done", not "the
  delicious bread is taking a while".
- **Sayings stand in for opinions** among the dream-bound: a harvest saying,
  a smith's proverb, a station regulation.
- **Player choice labels** are short, plain and first person: "Deal me in.",
  "I'll look for it.", "Goodbye." The decline on any challenge is "Not now."
  or a close variant ("Not yet.", "Another time."), matching the preview's
  Not now. The player is curious and decent, never snide, and never speaks
  more than one sentence.
- **Punctuation** follows the D97 dialogue modules: straight apostrophes,
  an ellipsis character (…) for trailing speech, em dashes sparingly.

### Registers

| Speaker | Register |
| --- | --- |
| Dream-bound locals | Their culture's plain speech; short sentences; customs and sayings; never name their home |
| Dream Guides | Their own voice (below); dream-aware; may name Apollyon and Limbo |
| Avatar characters | Proud, individual, dream-aware; speak of doors and tests, never of a particular dream's lore unless the dream module seats them there |
| Incarnations | Apollyon's shared register (no contractions, "dreamer") inflected by one ending |
| Apollyon | Calm, old, courteous, final |
| Placed role NPCs | Their trade, briefly, in a neutral traveler's voice |

## Talking about the game

Characters use the game's player-facing words, because those are the words
on screen.

| Thing | How characters say it |
| --- | --- |
| A battle | A game, a hand, a match, a challenge. Walkers may say "battle" |
| The ante | "The ante", "what you put up" (decision S19 names it the ante everywhere) |
| Cards | Cards. Walkers may call them dreams or dreamed things |
| Essence | Essence. Locals may count it in their own idiom ("a fair price") |
| Amulets | "An amulet". Never named by resonance in a line |
| Dreamsigns | Dreamsigns or signs |
| Keys and key dreams | Keys and key dreams |
| Waypoints | Waypoints, or by look: the obelisk, the crystal |
| Doors | Doors, gates, arches, airlocks: whatever the frame is |
| The Dream Atlas | The Atlas (walkers only) |
| Acts | Never by number; by depth: "deeper", "this far down" |
| Limbo | "Limbo", by walkers only |

- **No numbers from the design.** Prices, tiers, copy counts, slot counts,
  score targets and challenger counts are tunables and never appear in a
  line. A module that supports placeholders (Gravok's `{win_essence}`) is
  the only way a value reaches dialogue. In-world numbers that are local
  color, like a child who always loses count at forty-three, are fine.
- **No mechanics explained in dialogue.** Screens explain rules; characters
  give flavor. Takeshi may name his trial; the trial card states the
  constraint.
- **No door information outside sages.** Sages are the only source of
  information about unexplored doors
  ([§B14](appendix-b-dreams.md#b14-sages)). No other line says where a door
  leads or which door starts the way to the incarnation. Townsfolk may point
  out paths, bridges and places within their own dream.
- **Nothing chases the player.** Battles are opt-in (pillar 4). No line
  threatens to follow, hunt or force the player, and no line suggests that a
  loss ends the run.

## What never appears

These rules bind every line, name, item, quest title, step description and
tooltip.

1. **Dream names.** Dreams have no names anywhere in the game (decision
   [P10](plan/decisions.md#p10-dreams-are-unnamed)). Locals say "the town",
   "up the hill", "the valley", "here". Walkers say "this dream", "a dream
   I passed through", "a cold one, all ice". No capitalized place name ever
   stands for a dream, and no character names a town, river, kingdom or
   world.
2. **Tileset names.** "Tumbleleaf Village", "Frostforge", "Pharaoh's Gate",
   "Tsukiren", "Winterwake Fjords", "Hope's End", "Wilderveil", "The Rust
   Expanse", "Farpoint Station", "Grid City" and every other tileset or
   dreamscape name are internal labels for art sets and never appear in
   player-facing copy, even as an adjective or a pun. A guide at home says
   "home", never where home is.
3. **Tide names and resonance labels.** Tides stay hidden (decision S27). No
   line, item or quest uses a tide's display name from `src/content/tides.ts`
   ("Harvest of the Fallen", "Call of the Wild", "Drums of War" and the
   rest), even as an ordinary phrase, and no character speaks of tides,
   tide sets or affinities. The five resonance names appear only on amulets
   and the Avatar select screen; in dialogue they occur only as ordinary
   lowercase words with no game meaning ("the embers are low"), never as a
   label for a kind of card, amulet or person.
4. **Internals.** Tiers, the reward bag, deck sources, pool Avatars, layers,
   seeds, anchors, knobs and refill clocks. A challenger never says it is
   stronger "because this is the deep"; it simply plays well.
5. **Act numbers** in dialogue. The UI shows the act; characters speak of
   depth.
6. **The player's name or Avatar,** and gendered address to the player
   ("lad", "my lady", "sir"). Warm address words like "friend", "love" or
   "traveler" are gender-neutral and fine.
7. **The real world:** real places, real people, real deities, brands,
   dates and technology names. The station has airlocks and consoles, not
   any real company's products.
8. **Claims about where a dream sits.** A dream never says it is the first,
   the last, near Limbo, or in any act. Only act-conditioned lines may sense
   depth, and only in the bands of [The through-line](#the-through-line).
9. **Claims about who stands at a guardian anchor.** A guardian anchor may
   hold an Avatar, an incarnation, or no one (B4, C6). Lore about a guarded
   door names the role ("whoever stands in the arch"), never a person or a
   species, and reads true whether the anchor is full or empty.

## Recurring motifs

Motifs tie the dreams together without tying them to an order. Use one or
two per dream, lightly; never all of them.

| Motif | What it carries | How to use it |
| --- | --- | --- |
| **Thresholds** | Every dream is a room between doors | Locals have customs about doors, gates and bridges; guides pause at them |
| **The almost** | A dream held just before its ending | A feast about to start, a string nearly tuned, a ship nearly launched. Laughed off, never mourned |
| **Endings in their time** | The good ending, against Apollyon's | Someone in the dream expects the ending and is at peace with it ("Evenings end. Even this one.") |
| **The count** | A dream's small wrongness made concrete | A tally that always stops at the same number, a crossing-keeper who counts the same total |
| **The extra place** | Welcome for whoever walks in | A cup poured, a chair set, a bed made for "whoever comes in from the dark" |
| **The dark below** | Apollyon's nearness | Only in Acts 4–5 lines: a cold floor, fires burning low, water running downhill toward nothing |
| **Names kept** | The Keeper of Names, and the nameless dreams | Locals cannot recall what their home is called and are not troubled. Never explained, never fixed |
| **Gold** | What is final or beyond the ordinary | Apollyon is gold; a key dream opens in a gold ring. Reserve gold imagery for keys, Apollyon and finality |

**Motif discipline:**

- A motif is shown, never named: nobody says "the almost".
- "The dark below" and any sense of depth appear only in act-conditioned
  lines, so dreams stay act-agnostic.
- "Names kept" never implies that a dream will get its name back, by any
  means, at any point.

## The through-line

### The principle

Recurring characters (the Dream Guides, the incarnations and Apollyon) react
to act progress and to earlier meetings. Dreams themselves stay
act-agnostic, because assembly places any dream in any act (decision S4,
P16). A dream's residents may carry at most a light, optional act-reactive
bark; their main lines read the same in every act.

### What dialogue can test

Dialogue graphs choose an entry node by condition (P17,
`src/content/d97/dialogue/schema.ts`). The through-line uses:

- `act` with `min` and `max`, for depth bands;
- `flag`, for earlier meetings, set by a `setFlag` effect on a choice;
- `anchorBeaten`, for a beaten guardian or challenger in the same dream,
  and in Limbo for the fixed incarnation anchors;
- `quest` and `questStep`, for quest-aware barks.

A meeting flag must be set by a choice, so a first-meeting node always ends
with at least one choice that sets the character's "met" flag (the first
dream's bridge-keeper does this when the player says "Count me, then.").
Flags are per run and per character UUID.

### Depth bands

Write recurring characters' banded lines in these bands. Fewer bands are
fine; more are not needed.

| Band | Condition | What changes |
| --- | --- | --- |
| Near | Act 1 | Introductions. Walkers explain themselves in one line and never lecture |
| Wide | Acts 2–3 | Recognition. Guides note the player is still walking; Act 3 lines may first name Apollyon |
| Deep | Acts 4–5 | The dark below. Fewer jokes, more care; keys can be mentioned |
| Limbo | Limbo | Only incarnations and Apollyon speak; no guide appears there (B7) |
| Open | After Apollyon | Relief and breadth; walkers acknowledge what the player did, briefly |
| Key dream | Inside a key dream | Guides know the dream will close; a touch of "make the most of it" |

### Earlier meetings

- **Dream Guides** have three memory states: never met, met before, and met
  often (two flags: "met" and "met again"). A guide's line for a later
  meeting acknowledges it in one clause ("Back again!") and moves on.
- **A spent appearance** (the service used) has its own line: a farewell,
  since the guide stays as an ordinary character
  ([§B13](appendix-b-dreams.md#b13-dream-guides)).
- **An enhanced appearance** at home gets a line that says "home" without
  saying where.
- **Incarnations** remember the faces that fell before them. In an act,
  the number of incarnations already beaten is one less than the act's
  number, so the act band carries that memory. In Limbo, `anchorBeaten` on the other Limbo
  anchors tells an incarnation how many of its siblings have fallen.
- **Apollyon** remembers the whole descent. His lines speak of "every face
  you broke" without naming which, since the five that built him vary by run.

### Townsfolk and act state

Townsfolk "carry the story's through-line" (P20) by sensing depth, never by
knowing events. A dream may give one or two townsfolk an optional bark per
band:

- **Near and Wide:** nothing unusual, or a passing oddity.
- **Deep:** "The fire won't catch tonight." "Water's running the wrong way
  under the bridge." A sense of cold from below, laughed off.
- **Open:** a small relief: "Felt like something let go. Can't say what."

Every banded bark must read correctly in a dream that lands in any act.

## Voice guides: the Dream Guides

The ten Dream Guides wander the dreaming and recur in every act (S24). Each
keeps their authored journey lines, quoted below exactly. Guides are
dream-aware, never appear in Limbo, and appear once in each key dream at
random.

### Tobias Tanglefur

- **Role:** curiosities: cards from outside what the player's usual finds
  supply, at a premium. Home: the talking-animal village.
- **Look:** a talking animal in a bowler hat, with a tail.
- **Temperament:** warm, chatty, a born seller, honest that his prices are
  steep.
- **Diction:** exclamations, hospitality idioms, short sentences, provenance
  boasts ("came a long way, this one"). Never calls his stock "outside your
  tide set"; it comes "from far off".
- **Wants:** to match each curiosity with the right owner, and to hear where
  the player has been.
- **Address:** "friend".
- **Authored:** "Welcome, friend! Browse a while." / "I've set aside
  something just for you."
- **New samples:** "Came a long way, this one. Farther than you have,
  friend." / "Steep? Rare things travel slow, and I pay their fare."
- **Spent:** "That's my pack lighter! See you down the road, friend."
- **Across the descent:** Near, he introduces himself as a dealer in
  curiosities. Wide, he greets the player as a regular. Deep, his stock
  "gets stranger down here" and his cheer is a little forced. Open, business
  is good again and he says so.
- **Memory:** "Back again! I kept a corner of the pack for you."

### Amunet, the Tomb-Keeper

- **Role:** the Dreamsign Bazaar. Home: the desert temple.
- **Temperament:** solemn, patient, archival. She keeps Dreamsigns as a
  tomb keeps grave goods.
- **Diction:** formal; no contractions; "shall"; sand, memory and keeping.
  Measured sentences of equal weight.
- **Wants:** that nothing dreamed be forgotten.
- **Address:** none; she speaks to "you".
- **Authored:** "The sands remember all dreams." / "Choose, and I shall show
  you another."
- **New samples:** "Each sign was set down by a sleeper long gone. Take one,
  and it walks again." / "The sands keep a record of you now."
- **Spent:** "Go. The sands will hold your place."
- **Across the descent:** Deep: "The sands below grow cold. Something waits
  beneath all dreams." Open: "The sands remember this also: you went down,
  and you came back."
- **Memory:** "I remember you. The sands remember more."

### Sigrún

- **Role:** Dreamsign Revelation: one sign claimed from a few revealed.
  Home: the frozen fjord.
- **Look:** a braided seer in chainmail and a spangenhelm.
- **Temperament:** blunt, unsentimental, a reader of frost.
- **Diction:** short declaratives and imperatives; frost, ice and signs; few
  adjectives; almost never a question.
- **Wants:** to read true, and to see a clear path walked.
- **Address:** none.
- **Authored:** "The frost reveals what is hidden. Pick one sign to claim." /
  "Your path is clearer than most. Pick one sign to claim."
- **New samples:** "Breathe on the ice. Read what shows." / "The frost has
  shown me signs. One of them is yours."
- **Spent:** "Done. Walk on."
- **Across the descent:** Wide: "Still walking. Good." Deep: "The ice runs
  deep here. Deeper than I like." Open: "The frost shows no great ending
  now. Good."
- **Memory:** "You again. The frost said you would come."

### Durgan Forgehammer

- **Role:** Transfiguration. Home: the dwarven forge hall in the ice.
- **Temperament:** hearty, proud, loud, impatient with dull work.
- **Diction:** forge words (temper, quench, anvil, bellows, ore); em dashes;
  "let's"; exclamatory imperatives.
- **Wants:** good work; every card at its best temper.
- **Address:** none, or a hearty "you".
- **Authored:** "Stoke the forge — let's reshape it." / "Any card, any
  temper you like."
- **New samples:** "Bring it here — cold metal never sang." / "There.
  Quenched and true. Mind the edge."
- **Spent:** "Forge is banked. Find me again, and bring better ore."
- **Across the descent:** Deep: "Even my coals burn low this far down."
  Open: "Hah! Stoke it high — there's time for fine work now."
- **Memory:** "You! Still carrying my work, I hope."

### Deacon Holt

- **Role:** Duplication. Home: the graveyard chapel.
- **Temperament:** gentle, weary, steadfast; pastoral, with a soft dark
  humor.
- **Diction:** communal "we"; tag questions ("don't we?"); plain words of
  vigil and endurance.
- **Wants:** that nobody walks alone, and that nothing precious is lost.
- **Address:** "we" more than "you".
- **Authored:** "We endure together, don't we?" / "Pick one, and I'll make
  another."
- **New samples:** "Two are harder to lose than one. That's all my craft
  is, really." / "Still walking? So am I. That counts for something,
  doesn't it?"
- **Spent:** "Go on, then. I'll keep a candle lit."
- **Across the descent:** Deep: "We're near the bottom of things now,
  aren't we? I can hear it in the bells." Open: "The worst of it's past.
  We endured, didn't we?"
- **Memory:** "There you are. I hoped we'd meet again."

### Master Takeshi

- **Role:** handicap trials. He offers one trial per appearance and fights
  it himself ([§B15](appendix-b-dreams.md#b15-quests), S30). Home: the
  samurai garden.
- **Temperament:** austere, calm, quietly amused by eagerness.
- **Diction:** aphorisms; blade images; paired clauses; never explains
  twice. He names his trials by their Title Case names (Empty Hands, One of
  Each, Long Odds) and lets the trial card give the rule.
- **Wants:** to see the player win with less.
- **Address:** "student".
- **Authored:** "Let go of what weighs you down." / "A cleaner blade cuts
  truer." In D97 these speak to the trial's constraint.
- **New samples:** "Today you leave something behind, student. Then we
  fight." / "Win with less, and you will need less to win."
- **Beaten (trial won):** "Good. You carried only what you needed."
- **Across the descent:** Deep: "You have gone deep, student. Your step is
  lighter for it." Open: "Even after the greatest fight, there is
  practice."
- **Memory:** "Again, student. Again is how it is learned."

### Aldric, the Seer

- **Role:** Augury: two visions, one chosen. Home: the enchanted forest.
- **Look:** a wizard's hat.
- **Temperament:** patient, kindly, a little grave.
- **Diction:** measured, complete sentences; paths, visions and choosing;
  balanced pairs. Gently instructive.
- **Wants:** that the player choose with open eyes.
- **Address:** none; he speaks of "your dream".
- **Authored (two of five):** "Two paths unfold before you. Choose one to
  shape your dream." / "Two futures call to you. You may follow only one."
- **New samples:** "Neither path is wrong. Only one is yours." / "I saw you
  coming, though not from which side."
- **Spent:** "Walk well. I will watch the path behind you."
- **Across the descent:** Deep: "My visions dim near the bottom of the
  dreaming. I see you in them still." Open: "Paths again, everywhere. I had
  almost forgotten how many."
- **Memory:** "We meet where I foresaw. That is always a comfort."

### Maddox

- **Role:** Random Site: three roads, one hiding something better. Home: the
  wasteland camp.
- **Temperament:** laconic drifter; sardonic, unbothered, fond of not
  knowing.
- **Diction:** clipped; drops subjects ("Seen worse."); road images; a
  gambler's shrug.
- **Wants:** to see what is around the next bend.
- **Address:** none.
- **Authored:** "Let’s see where this road takes us." / "Three roads. Pick
  your poison."
- **New samples:** "Roads out here don't care where you're going. That's
  the fun of 'em." / "You again. Road keeps putting us together."
- **Spent:** "That's my roads walked. Yours keep going."
- **Across the descent:** Deep: "Every road runs downhill from here." Open:
  "Roads go every which way again. Like it better."
- **Memory:** "Huh. Thought the road would've eaten you by now."

### Gravok

- **Role:** Gamble: Three Gates, Ladder Climb, Starway Stairs, Four-Suit
  Reprise and Blackjack. Home: the space station.
- **Look:** a troll's head and a bow tie.
- **Temperament:** a genial showman, sly, fonder of a good game than of
  winning.
- **Diction:** dealer's patter; flourishes; game names in Title Case;
  fortune and boldness; exclamation marks.
- **Wants:** a bold player at his table.
- **Address:** "traveler".
- **Authored:** "Fortune favors the bold, traveler." / "No fee tonight. Big
  stakes, though." His game introductions in `guides.ts` stay as written.
- **New samples:** "Step up, traveler! The house is generous tonight.
  Mostly." / "Ha! Fortune likes you. I'll try not to take it personally."
- **Spent:** "Table's closed, traveler. Come lose to me another night."
- **Across the descent:** Deep: "Stakes climb the deeper you play,
  traveler. Everyone knows that." Open: "Back from the big table! Now — a
  friendly game?"
- **Memory:** "My favorite traveler! Sit, sit."

### "Layaway"

- **Role:** Exploration: stepping into the dream inside a drawn card. Home:
  the neon city.
- **Look:** a cap and shades.
- **Name:** an alias, always written with its quotation marks. Layaway never
  gives another name.
- **Temperament:** cool, cryptic, relaxed; a street mystic who deals in
  directions.
- **Diction:** present tense; casual but never dated slang; aphorisms about
  cards dreaming; "step inside".
- **Wants:** to show people what is inside things.
- **Address:** "friend", with a little edge.
- **Authored:** "Every card dreams, friend. Draw one, and we'll step
  inside." / "Pick a direction. The dream will make the path."
- **New samples:** "Everything's on layaway, friend. You pay later." /
  "Inside every card there's a door. I just know where the handles are."
- **Spent:** "That's the trip. Walk it off, friend."
- **Across the descent:** Deep: "Down here even the cards dream darker.
  Step careful." Open: "Every card's got somewhere to be again. Feel that?"
- **Memory:** "Knew you'd circle back. Everybody does."

## Voice guides: the incarnations

### What they are

Each incarnation is Apollyon wearing one ending. Their speaker names are the
authored titles in `src/content/apollyon.ts` ("Apollyon, the World's End";
"Apollyon, Sovereign of the Void"). Any incarnation can guard any act or
wait in Limbo, so every incarnation needs lines for every band.

### The shared register

- **No contractions.** Every incarnation and Apollyon speak in full words.
- **"Dreamer"** is how they address the player, and only Apollyon's voices
  use it.
- **Ending is a fact, not a threat.** They speak of endings as weather. They
  never threaten pursuit, and never claim a loss ends the player.
- **They do not lie.** They may be cryptic; they are never false.
- **The pool Avatar is never mentioned.** Deck focus is a source of imagery
  only.
- **Aspect words** (Ravening, Hunger, Catastrophe and so on) may appear as
  ordinary words in their lines, lowercase unless they open a sentence.

### Shape of an incarnation's dialogue

- **Greeting** by band: Act 1; Acts 2–3; Acts 4–5; Limbo. Each greeting
  ends with the challenge choices (accept, and a "Not yet." decline).
- **Beaten line** by band: the incarnation steps aside and stays as an
  ordinary character (C2), so it keeps one quiet line.
- **Memory:** in acts, the greeting may acknowledge "the faces before me";
  in Limbo, lines may count fallen siblings through `anchorBeaten`.

Looks follow the [overworld visual guide](overworld-visual-guide.md#incarnations-and-apollyon):
monstrous heads at 1.25×, tinted and haloed, listed there in the same order
as [Appendix C §C2](appendix-c-bosses-and-keys.md#c2-incarnations).

### Apollyon, the World's End

- **Aspect:** Ravening. **Look:** a wolf's head. **Imagery:** a pack
  multiplying into one devouring chorus.
- **Voice:** plural "we"; short pulses; repeated words like a howl.
- **Greeting:** "We are many. We are hungry. We are almost enough."
- **Beaten:** "Fewer of us. For now."
- **Limbo:** "The others fell to you. We heard every one."

### Apollyon, the Butcher

- **Aspect:** Hunger. **Look:** a boar's head. **Imagery:** sacrifice that
  feeds the survivors.
- **Voice:** a matter-of-fact tradesman of flesh; weights, cuts and waste;
  grimly jovial.
- **Greeting:** "Everything is meat for something, dreamer. Let us see what
  you weigh."
- **Beaten:** "A fair cut. I will not waste it."
- **Deep:** "You are leaner than when you started. Good. Less to carve."

### Apollyon, the End of Causality

- **Aspect:** Catastrophe. **Look:** an alien head. **Imagery:** each event
  birthing another; a storm of portents.
- **Voice:** tense slips; reports the future as past; effects before
  causes; unhurried.
- **Greeting:** "You have already stepped aside for me. Now you arrive."
- **Beaten:** "This was always going to have happened."
- **Limbo:** "You beat me tomorrow. Today, you try."

### Apollyon, the Unplaceable

- **Aspect:** Violation. **Look:** a lizard's head. **Imagery:** a precise
  strike through every guard.
- **Voice:** evasive about where it is; cold precision; seams, gaps and
  edges.
- **Greeting:** "You are looking where I am not. Look again."
- **Beaten:** "You found the seam. Few do."
- **Wide:** "I was behind every door you chose not to open."

### Apollyon, the Doom of Humanity

- **Aspect:** Slaughter. **Look:** an orc's head. **Imagery:** warriors in
  ranks, striking before mercy.
- **Voice:** a war chief's cadence; commands; ranks and orders; mercy as a
  thing for later.
- **Greeting:** "Form your ranks, dreamer. Mine were formed before you
  slept."
- **Beaten:** "Your line held. Mine broke. Remember the order of it."
- **Limbo:** "My kin in ending have fallen. I do not."

### Apollyon, the Herald of Revelation

- **Aspect:** Frenzy. **Look:** a minotaur's head. **Imagery:** warriors
  awakening into a final rapture.
- **Voice:** an ecstatic proclaimer; exalted, archaic, exclamations; speaks
  as if the end were good news.
- **Greeting:** "Hear it, dreamer! The last song is already rising!"
- **Beaten:** "Not yet the rapture. Not yet."
- **Deep:** "So close now! Feel it, dreamer: the floor is singing!"

### Apollyon, the Last Word

- **Aspect:** Haunting. **Look:** a skeleton. **Imagery:** an ethereal host
  that returns endlessly.
- **Voice:** epitaphs; terse and final; "here lies" shapes; always speaks
  last in a conversation.
- **Greeting:** "Every story ends with me. I do not mind waiting."
- **Beaten:** "Here lies my patience. It will rise."
- **Limbo:** "When all is quiet, I will still be speaking."

### Apollyon, the Broken Cycle

- **Aspect:** Damnation. **Look:** a zombie. **Imagery:** broken souls
  winding through death's river and back.
- **Voice:** weary and circular; repetition of "again" and "round"; river
  images; sentences that loop back to their start.
- **Greeting:** "Round again, dreamer. Round and round, and down."
- **Beaten:** "Down the river, and back. I always come back around."
- **Wide:** "You came this way before. Everyone has. Again."

### Apollyon, the Keeper of Names

- **Aspect:** Suffering. **Look:** a vampire. **Imagery:** the discarded
  becoming omens; names collected and kept.
- **Voice:** aristocratic, intimate, politely acquisitive. The only
  incarnation that asks questions, and he never waits for an answer.
- **Greeting:** "What were you called, before you wore that face? No matter.
  I shall keep it for you."
- **Beaten:** "Keep your name, then. For now it is still yours."
- **Rule:** he may hint that dreams have no names because he keeps them. He
  never gives one back, and nothing he says implies a name can be won.

### Apollyon, Sovereign of the Void

- **Aspect:** Oblivion. **Look:** a crowned void-king. **Imagery:** the void
  swelling to infinity.
- **Voice:** regal and vast; the fewest words of any incarnation; long
  pauses written as an ellipsis.
- **Greeting:** "Kneel, or do not. The void receives either."
- **Beaten:** "… Even the void can wait."
- **Limbo:** "… All of them gone. There is room for you."

## Voice guide: Apollyon

- **Role:** the final battle of the campaign. He manifests on his dais in
  Limbo when the fifth Limbo incarnation falls, unanted and retryable, built
  from the five incarnations who guarded the acts (C3–C4).
- **Look:** winged and crowned in gold, at twice a character's size, over a
  court washed in violet.
- **Temperament:** calm, ancient, courteous, unhurried. He is not cruel. He
  believes the last door is mercy: rest for every dream at once.
- **Diction:** the shared register at its plainest. Complete, simple
  sentences; no contractions; "dreamer"; never more than two sentences a
  line. He may borrow an image from any incarnation, but never names one.
- **Wants:** every ending gathered into one. He calls it rest, the last door,
  the quiet.
- **Address:** "dreamer".
- **Manifesting:** "You came down every step. I watched each one." / "Every
  dream ends, dreamer. I ask only that they end together."
- **Challenge choices:** accept ("Then let's begin.") and decline ("Not
  yet."). The decline is always open; he never pressures.
- **Retry greeting:** "Gather yourself. I am always here. That is rather the
  point."
- **Defeated:** "So. Not all at once, then. One at a time, as you prefer."
- **After Apollyon:** if he remains in Limbo after his defeat, he speaks one
  line and offers nothing: "Walk where you like, dreamer. Every ending will
  still come. Each in its time."
- **Memory:** he speaks of "every face you broke" and "those who waited
  here" only as a whole, never naming which incarnations fell.

## Other speakers

### Avatar characters

Assembly places Avatars as guardians, Act 2 and 3 quest givers, and
challengers, each at most once per campaign (B7). Their voice comes from
their name and authored title in `src/content/avatars/` (Vaela, Ember Among
Remnants; Tensho, Daimyo of Lacquered Fury).

- **Proud and individual,** dream-aware, and courteous in defeat.
- **Dream-agnostic** unless the dream module itself seats them: a placed
  Avatar speaks of "this door", "this place", never a landmark.
- **Guardians** speak of holding the door and testing whoever comes.
  Beaten, they step aside with one gracious line.
- **Friendly Avatar quest givers** ask the player to prove a kinship across
  two steps; completing the quest is the Avatar choosing to walk with the
  player. Their farewell, as they step away, should read as joining, not
  leaving.

### Residents and townsfolk

Residents and townsfolk follow their dream's brief, which applies this
bible locally in a tone note. They are dream-bound, never name their home,
and fill the dream with customs, sayings and its one small wrongness. Use
the first dream as the model: Wenna Ashdown counts time in barrels, Cobb
counts every crossing, and Widow Marrable alone expects the dark.

### Challenger personas

- **One line of greeting, one of being beaten.** The greeting carries the
  persona's trade or temperament into the game ("One, two. One, two.
  That's how a floor gets threshed.").
- **Beaten lines are gracious or wry,** never bitter.
- **Persona names** are a role ("Threshers", "The Scarecrow") with an
  individual name in the speaker field where the persona is a person
  (Garrow, Oswin Marl).

### Placed role NPCs

Sages, amulet merchants, amulet changers and prize duelists are placed by
assembly in any dream. Their lines are tileset-agnostic and about their
trade: a sage's single hint, a merchant's catalog, a duelist's displayed
prize. Sages' hints mark the Atlas and never name a dream.

### Shopkeepers

Every dream's shopkeeper is an authored resident in the dream's own voice,
who sells "the shop" in local terms ("provisions for the road").

## Naming rules

### General rules

- **Every named thing has a UUID;** names are display text only. Card
  names are not unique, and no name is ever used to find anything.
- **Characters, quests and items have names. Dreams never do.** Places
  inside a dream are lowercase descriptive phrases ("the well square", "the
  white bridge"), never capitalized place names.
- **Character names** are a given name, a given name and surname, or a
  title and name ("Hessa Mott", "Widow Marrable", "Mother Yarrow").
  An epithet follows a comma ("Amunet, the Tomb-Keeper"; "Aldric, the
  Seer").
- **Avoid sound-alikes within a dream** and with the recurring cast: no two
  speakers in one dream should start with the same sound.

### Forbidden patterns

- **The recurring cast's names:** the 32 Avatars, the ten Dream Guides and
  the incarnation titles. Also avoid near-homophones of them, especially of
  the hard-K Avatar names (Kael Voss, Kaleth, Karev Soltis, Kell Tarn,
  Korrax, Kragg) and of the guides (a "Tobin" beside "Tobias" is already
  too close: the first dream's Reeve Tobin Rook breaks this rule and is not
  a model).
- **Card and Dreamsign names.** Before using a name, search
  `src/content/cards/` and `src/content/dreamsigns/`; a character or item
  that shares a card's or Dreamsign's name will read as that card.
- **Tileset, dreamscape, tide and resonance names,** in any form (a
  character called "Ember", a "Wilderveil Ranger", an item called "Call of
  the Wild").
- **Mechanical names:** "the Rare Collector", "Tier Master",
  "Essence-Monger".
- **Real people, deities, places and brands,** and famous fictional names
  (no Thorin, no Musashi, no Ragnar).
- **Winking names:** puns on game terms or modern jokes.

### By tileset

The table covers each tileset's people. Patterns are guides for invention;
the examples are free to use if they pass the checks above.

| Tileset | Pattern | Examples |
| --- | --- | --- |
| Harvest hill towns and the meadow | Plain English country given names; surnames from birds, plants, soil and trades; titles of office (Reeve, Widow, Mother) | Wenna Ashdown, Hessa Mott, Garrow, Alys Thorne, Old Haskett |
| Talking-animal village | Short country given names with compound hedgerow surnames, on the Tanglefur pattern | Pip Thistlecomb, Hazel Burrowell, Bram Mosswhisker |
| Dwarven forge hall | Hard given names in -an, -ar, -ok, -rim; craft compound surnames, on the Forgehammer pattern | Brannok Coldbellows, Thrudi Anvilsworn, Halvar Rimehand |
| Desert temple | Invented names with Egyptian sounds (-et, -u, -mes, Nefer-), never real pharaohs or gods; office as epithet | Tahemet, the Water-Bearer; Iumeri; Kherset, the Scribe |
| Frozen fjord | Norse-sounding names with accents allowed (-rún, -hild, -ulf, -björn); patronymics; bynames | Ásvör Ice-Eye, Hallgrim Bjarnason, Ylfa the Grey |
| Samurai garden | Plausible Japanese given names with English honorifics (Master, Lady, Old), never -san or -sama | Lady Sayo, Old Haruto, Master Ren |
| Graveyard chapel | Clerical or churchyard titles with English surnames | Sister Mabry, Sexton Crane, Brother Ashby |
| Enchanted forest | Old English and old Welsh sounds; Name, the Role | Elowen, the Thornwarden; Gwil; Maren, the Moss-Speaker |
| Wasteland camp | Single hard names and trade nicknames | Rivet, Tallow, Old Juniper, Cass Gasket |
| Space station | Rank or post plus surname; invented alien names in -ok, -ax, -eth | Deckhand Osei, Quartermaster Lindqvist, Vrell |
| Neon city | Street handles in quotation marks, like "Layaway"; real names rare | "Static", "Lowlight", "Two-Step" |
| Elven realm | Soft, vowel-rich invented names, never borrowed from famous fantasy | Ithrael, Saevien |
| Pirate island | A nickname plus a surname | "Bilge" Harrow, Long Tamsin |
| Snowfield | Sparse names like the fjord's, fewer syllables | Ulla, Torvi |

Generic challenger personas follow the same table: a role ("Ice Miners",
"Ronin", "Scrappers", "Runners") with individual names for any persona who
speaks as a person.

### Items

- **Quest items** are Title Case with a definite article, name a concrete
  object, and stay within four words: "The Bell's Tongue", "The Harvest
  Maiden". The object belongs to the dream's world (a plaited sheaf, a
  smith's tongs, a ship's lantern) and is unique within its dream.
- **Quest titles** follow the same pattern: "The Feast Bell", "The Last
  Sheaf". A quest step's description is one imperative sentence naming the
  landmark and the person ("Find the bell's tongue in the pine meadow, through
  the dry hollow, and bring it to the reeve.").
- **Cross-dream quest text** names the person, never the dream they live in.
- **Amulets** are named only by the game's UI. Writers never name an amulet
  or give one flavor text; dialogue says "an amulet".
- **No quest item is called a key,** so it never reads as an endgame key.
- **Keys** are "keys" and open "key dreams" (S14). A key shows only its
  prize; no key carries a flavor name, and no key dream is ever named.
- **Dreamsigns, cards and Avatars** are existing content. Writers never
  invent one, and never rename one in dialogue.

## Rulings and open questions

### Rulings this bible makes

The design documents are silent on these points; each ruling is chosen so it
cannot contradict them.

1. **Premise:** the dreaming as dreams joined door to door; the player as a
   dreamer wearing an Avatar; cards as dreamed things; Apollyon as the end
   of everything at once, set against endings in their time.
2. **Dream-bound and walkers:** locals know only their dream; guides,
   Avatars, incarnations and Apollyon are dream-aware.
3. **Guardians are not Apollyon's servants;** only the incarnations are his.
4. **Acts as depth:** dialogue never says "act" or an act number.
5. **Limbo may be named** by walkers, because the game itself labels its
   door "Limbo".
6. **"Dreamer"** is reserved for Apollyon's voices; each guide has their own
   address or none; no gendered address to the player.
7. **No design numbers in lines,** except through module placeholders.
8. **Incarnation looks** pair with the visual guide's head list in Appendix
   C's order (World's End a wolf, Butcher a boar, End of Causality an alien,
   Unplaceable a lizard, Doom of Humanity an orc, Herald of Revelation a
   minotaur, Last Word a skeleton, Broken Cycle a zombie, Keeper of Names a
   vampire, Sovereign of the Void the crowned void-king). The visual guide
   lists the heads without pairing them; its scenes agree (Last Word at the
   chapel as a skeleton, End of Causality on the station).
9. **Master Takeshi's authored lines** come from his journey purge site; in
   D97 they speak to a trial's constraint.
10. **Guide memory** uses two flags per guide ("met", "met again").
11. **Placed role NPCs** speak tileset-agnostic trade lines.
12. **Resonance words** may appear only as ordinary lowercase words with no
    game meaning.
13. **Guardian-anchor lore** names the role, never the occupant, because the
    anchor can hold an Avatar, an incarnation or no one.
14. **Apollyon after defeat:** whether he stays on his dais is a game design
    question this page does not decide; if he stays, he has one line and no
    challenge.

### Tensions found in the design documents

These are reported for the owners of those documents; this bible does not
resolve them.

- **Guide appearances per act.** Appendix B §B7 says 13 Dream Guide
  appearances per act, but the §B13 table sums to 12 per act (60 per
  campaign).
- **Limbo's name.** The glossary calls Limbo "the final campaign dream" and
  P10 says dreams have no names, yet the visual guide gives the door to
  Limbo a "Limbo" nameplate. This bible treats Limbo as the one place that
  is named (ruling 5).
- **Hope's End's category.** Appendix B names Hope's End as a home tileset
  without a category; the visual guide files it under Fantasy.
- **The first dream and empty guardian anchors.** The first dream's brief
  says someone always stands in the ember arch, and its guardian's lines
  refer to the arch. Under act assembly (B4) that anchor may hold an
  incarnation, any Avatar, or no one, and key dreams leave guardian anchors
  empty (C6).

### Open questions

- **Conditions for the through-line.** The dialogue schema has no condition
  for Limbo as a band, for Apollyon's defeat, for being inside a key dream,
  for a guide's service being spent or enhanced, or for a guardian anchor
  being empty. The bands above need these, or flags set by the game, before
  their lines can be gated.
- **Battle results in dialogue.** A retry greeting (Apollyon's "Gather
  yourself", an incarnation after a loss) needs a condition on an earlier
  loss to that opponent.
- **Which incarnations fell.** Apollyon's lines stay general because no
  condition says which five incarnations built him. A per-incarnation
  condition would let him borrow their voices by name.
- **Where Avatar dialogue lives.** The first dream's guardian lines sit in
  the dream's module. Once assembly places Avatars, each Avatar probably
  needs one dialogue module per role, reused wherever it stands.
- **Key-dream residents.** Key dreams reuse catalog dreams without their
  quests (C6). Residents need a way to hide quest offers there, and the
  bible assumes meeting flags carry over between a dream's act and key-dream
  visits.
- **Cross-dream quest text.** Bound roles (B15) resolve to a concrete
  character at assembly; quest step descriptions need a placeholder for that
  character's name.
- **Guide dialogue modules.** The guides' journey lines live in
  `guides.ts` with only site contexts; their D97 banded dialogue needs its
  own typed graphs (P17), and the bead that writes them (Phase 4's
  through-line dialogue) decides their shape.
