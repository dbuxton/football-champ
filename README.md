# Football Champ

A football management game in the spirit of Championship Manager, running **entirely in your
browser**. No backend, no accounts, no API keys — a static site that saves to your browser's local
storage and is hosted free on GitHub Pages.

You do not pick your club. A mid-table Championship side appoints you, and it is your job to do
something about it.

---

## Playing it

Open the deployed page, enter a manager name, choose a difficulty, and press **Begin your career**.
The game builds 92 clubs and around 2,200 players (this takes a few seconds), then tells you who
has hired you.

From there, **Continue** (or the space bar) advances the calendar day by day and stops whenever
something needs you: a match to play, a bid to answer, a press conference, a board meeting, the end
of the season.

## What's in it

**Match day.** A minute-by-minute possession engine where individual players are the actors —
goalscorers, assists and ratings emerge from attributes rather than being assigned afterwards.
Ticking commentary, live statistics including expected goals, a 2D pitch showing where play is,
and in-match substitutions, mentality changes and pressing tweaks. Play at four speeds or skip
straight to the result.

**Players.** The full Championship Manager attribute model: 12 technical, 14 mental, 8 physical
and 10 goalkeeping attributes on the 1–20 scale, plus 12 hidden ones (Consistency, Injury
Proneness, Professionalism, Ambition and the rest) you never see directly. Current and Potential
Ability on the 1–200 scale. Per-position familiarity, so playing a striker at left back is possible
but costly.

**Squad management.** Tactics with 12 formations, player roles, team instructions, set-piece takers
and captaincy. Training schedules, intensity, and per-player focus. Injuries with real types and
recurrence risk, suspensions, condition and match sharpness, morale, and players who ask to leave
when you stop picking them.

**Transfers.** Separate negotiations with the selling club and the player, as it should be. Fees,
instalments, sell-on clauses, add-ons; wages, contract length, signing-on fees, release clauses and
squad-status promises you will be held to. Loans with wage splits. Free agents and Bosman moves.
Deadline day. A scouting network whose reports are *ranges*, not numbers — and a bad scout gives
you confidently wrong ones.

**Money.** Gate receipts driven by a real attendance model, season tickets, TV distribution split
correctly between the Premier League and the EFL, parachute payments, sponsorship, merchandise,
prize money, wages, stadium upkeep, bank loans and agent fees. EFL **Profitability &
Sustainability** rules with transfer embargoes and points deductions, and administration if you run
the club into the ground.

**The club.** Stadium expansion and new-build projects with real costs and build times, training
ground and academy upgrades that pay off two or three seasons later, per-stand ticket pricing,
backroom staff whose ratings actually drive training and recovery, an annual March youth intake,
and a board with expectations, a confidence meter and a limited amount of patience.

**The season.** All four divisions of the English pyramid with correct promotion, relegation and
play-offs; the FA Cup, EFL Cup and EFL Trophy; awards, Manager of the Month, press conferences,
rivalries and a full career history.

## Difficulty

The game is deliberately kind on **Easy**, and forgiving of obvious mistakes at every level.

On Easy your side gets a hidden bonus to chance creation and defensive solidity, rivals bid far
less aggressively for your best players, morale decays more slowly, the board is much more patient,
targets are likelier to sign, injuries are rarer, and a guardrail nudges luck back your way after a
run of defeats so a season never death-spirals.

Separately, at every difficulty except Legend: an illegal team sheet is repaired automatically
before kick-off rather than costing you the game, you get warnings before an unbalanced formation or
a wage-budget breach, and you can undo your last transfer or contract action on the same day you
made it.

Difficulty is fixed for a career. It's shown in full on the Settings screen.

## Saves

Saves live in your browser's local storage, compressed with a bundled LZW implementation (a full
season compresses to roughly a quarter of its size). Multiple named slots, an autosave after every
match, and an automatic IndexedDB fallback if a long career outgrows the storage quota.

Because browser storage can be cleared, **export your save to a file** from the Settings screen if
you care about a career. You can import it again from the start screen.

---

## Deploying it yourself

The included GitHub Action builds and publishes to GitHub Pages on every push to `main`.

**One manual step is required after the first push:** go to **Settings → Pages** in your repository
and set **Source** to **GitHub Actions**. GitHub does not allow a workflow to change that for you.

The site is then served from `https://<your-username>.github.io/football-champ/`. If you fork this
under a different repository name, change `base` in `vite.config.ts` to match.

## Running it locally

```bash
npm install
npm run dev          # development server
npm run build        # production build (typecheck + bundle)
npm run preview      # serve the production build
```

## Testing

```bash
npm test             # unit tests, including a full simulated season
npm run soak         # ten consecutive seasons, headless (takes several minutes)
```

The unit suite checks the things that make a career playable: deterministic generation from a seed,
a balanced double round-robin with nobody double-booked, league-table maths and tiebreakers,
financial invariants, save round-tripping — and that a simulated season produces **realistic
statistics**. Goals per game, home-win rate, shots, cards and attendances are all asserted against
real English league ranges, so a change that quietly turns the engine into a pinball machine fails
CI rather than shipping.

The soak test simulates ten consecutive seasons and asserts the world doesn't rot: divisions stay
the right size, squads stay viable, nobody is still playing at 50, the player pool neither collapses
nor explodes, finances stay plausible, and the pyramid stays a pyramid. That's what catches
slow-burn balance bugs. It's excluded from CI for runtime and run locally.

## Project structure

```
src/
  engine/     pure TypeScript simulation — no React, no DOM, deterministic and seeded
  data/       clubs, squads, name pools, competition definitions
  game/       save/load, the day-advance loop, difficulty, the action layer
  ui/         React screens and components
  test/       unit tests and the season soak
```

`src/engine` never imports React. That separation is what makes a simulation this size tractable
and lets the soak test run ten seasons headlessly in a few minutes.

## About the squad data

Squads for the Premier League and Championship are authored into the repository — see
[docs/DATA.md](docs/DATA.md) for the format and how to update them. There is no free, licence-clean
football API and the game must run with no backend, so the data is a point-in-time snapshot rather
than a live feed. Some players will have moved on. It is deliberately isolated in
`src/data/squads/` so correcting it is a small, contained edit.

League One and League Two squads, youth intake and regens are generated procedurally.
