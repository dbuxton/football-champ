# Editing the game data

All of the game's authored data lives in `src/data/`. Everything else — attributes, valuations,
lower-league squads, youth intake — is derived or generated, so these are the only files you need
to touch to change who plays where.

## Squads

`src/data/squads/premier-league.ts` and `src/data/squads/championship.ts` map a club id to a list
of players. Each player is a compact tuple:

```ts
['Bukayo Saka', 'AMR', 2001, 'England', 88, 91]
//  name         pos   born  nationality  ability  potential
```

| Field | Meaning |
| --- | --- |
| `name` | Full name. The first word becomes the first name, the rest the surname. |
| `pos` | Natural position: `GK`, `DR`, `DC`, `DL`, `WBR`, `WBL`, `DM`, `MR`, `MC`, `ML`, `AMR`, `AMC`, `AML`, `ST`. |
| `born` | Birth **year**. The exact date is generated so ageing doesn't happen to everyone at once. |
| `nationality` | Free text. Add an entry to `NATION_ABBREVIATIONS` in `src/ui/components.tsx` if you want a three-letter code in tables. |
| `ability` | 1–100, how good they are **now**. |
| `potential` | 1–100, their ceiling. Must be ≥ `ability` in spirit; the engine clamps it anyway. |
| `foot` | Optional seventh element: `'L'`, `'R'` or `'B'`. Generated if omitted. |

### Calibrating ability

The 1–100 scale is human-readable and gets expanded into the full 56-attribute profile by
`src/engine/attributes.ts`. Rough anchors:

| Rating | Level |
| --- | --- |
| 90+ | World-class. A handful of players in the game. |
| 83–89 | Elite. Wins a Premier League title on their own. |
| 75–82 | Quality Premier League starter. |
| 66–74 | Premier League squad player. |
| 58–65 | Top of the Championship, or recently relegated. |
| 50–57 | Solid Championship starter. |
| 44–49 | Championship squad player. |
| 36–43 | League One starter. |
| 26–34 | League Two. |

### How attributes are derived

You don't write 56 attributes per player. The engine takes the position, uses it to look up an
*archetype* (a Poacher's Finishing matters, their Tackling doesn't), scales it by the ability
rating, and adds individual variation from a PRNG seeded on the player's own name and birth year.

That last part matters: **the same name and birth year always generate the same footballer**. Squads
are stable across sessions and across machines without storing a wall of numbers in the repo. It
also means changing a player's birth year re-rolls their attribute profile.

If you want a specific, distinctive profile — a target man who is genuinely enormous in the air —
pass `attributeOverrides` to `buildPlayer`. The generator respects them.

## Clubs

`src/data/clubs.ts` holds all 92 clubs, also as tuples:

```ts
['ars', 'Arsenal', 'Arsenal', 'The Gunners', 'London', 1886,
 'Emirates Stadium', 60704, '#EF0107', '#FFFFFF', '#FFFFFF', 92, 4200]
```

In order: id, name, short name, nickname, city, year founded, stadium name, capacity, primary kit
colour, secondary kit colour, text colour that reads on the primary, reputation (1–100), and
fanbase in thousands.

**Never change an existing `id`.** Saves reference clubs by id, and changing one orphans every save
that mentions it. Adding a club is fine; renaming one is fine; changing its id is not.

Reputation drives a lot: player interest, sponsorship value, attendance, media attention, board
expectations, and what a club can afford. Rough bands are 88–95 for the European elite, 68–82 for
the rest of the Premier League, 42–63 for the Championship, 25–41 for League One and 15–24 for
League Two.

Two other exports in the same file:

- `RIVALRIES` — pairs of club ids. Derby fixtures draw bigger crowds, swing fan happiness harder,
  always trigger a press conference, and cost more when you try to buy from a rival.
- `STARTING_CLUB_POOL` — the Championship clubs the game will appoint you to. All are established
  second-tier sides with a decent ground, no parachute money and no realistic promotion
  expectation. Edit this if you want a different flavour of starting job.

## Competitions

`src/data/competitions.ts` defines the four divisions, the cups, the play-offs and the European
competitions, along with prize money, parachute payments and the Profitability & Sustainability
limits.

Prize money is the single most important economic lever in the game — the gulf between the Premier
League's central distribution and the Championship's is what makes promotion transformative and
relegation ruinous. Change it carefully, and run `npm run soak` afterwards: the ten-season soak test
is what catches an economy that quietly bankrupts every club by 2032.

## Names

`src/data/names.ts` holds first and last name pools by nationality, the weights used when picking a
nationality for a generated player, and the (deliberately fictional) sponsor names.

The English pool is by far the largest, since most generated players in an English pyramid game are
English. If you add a nationality, add it to both `NAME_POOLS` and
`GENERATED_NATIONALITY_WEIGHTS`.

## After editing

```bash
npm run typecheck
npm test
```

The unit suite will catch a malformed tuple immediately, and the season-statistics test will catch a
data change that accidentally makes the whole league brilliant or terrible.
