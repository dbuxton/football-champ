# Superstar — work in progress

Superstar is a second game in this repo, built from Football Champ's data. Football Champ makes you
the manager. In Superstar **you are a footballer**, and **you play every match yourself**. It's made
for kids, with bright colours, big buttons and friendly words.

The idea came from a kid:

> Turn Championship Manager into a different football game, from the perspective of a player. If you
> are good you get moved to a good team, and if you are bad you get moved to a bad team. More
> colourful. Play the matches, don't just watch. Only Premier League clubs. Pick your team. FA Cup and
> EFL Cup depending on your half of the table. Put all the info about the players on their cards.
> Update everything every season.

- `/` → **Superstar** (`index.html` → `src/superstar/`)
- `/manager/` → the original **Football Champ** management game (`manager/index.html` → `src/main.tsx`,
  unchanged apart from a link to Superstar on its start screen)

## Running it

```bash
git fetch origin claude/confident-newton-3pm0d3
git checkout claude/confident-newton-3pm0d3
npm ci
npm run dev            # http://localhost:5173/          → Superstar
                       # http://localhost:5173/manager/  → the manager game
npm run typecheck      # tsc -b --force
npm run build          # both pages into dist/
npx vitest run src/superstar   # Superstar's unit tests (a few seconds)
```

**Controls:** arrow keys (or WASD) to run, **X** to pass (or shout for the ball when a teammate has it),
hold **Space** to shoot (longer = harder; too long goes over the bar), **Shift** to sprint, **Esc** to
pause. Hold ↑ or ↓ while shooting to aim for a corner; otherwise the shot aims away from the keeper.
Without the ball, **Space** is a slide tackle, and running into whoever has the ball tries a tackle. A
game controller works too (A pass, B shoot, a trigger to sprint). On a touchscreen there's a
thumb-stick and PASS / SHOOT / SPRINT buttons.

**Quick matches while testing.** The settings only offer 3, 4 or 6-minute matches. To get
12-second matches, paste this into the browser console on the Superstar page, then reload:

```js
const k = 'superstar.save.v1'; const s = JSON.parse(localStorage.getItem(k));
s.careers.forEach((c) => (c.halfMinutes = 0.1)); localStorage.setItem(k, JSON.stringify(s)); location.reload();
```

## How the game works

1. **Make your footballer.** Choose a name, shirt number, position (striker, winger, midfielder or
   defender), a look, **any of the 20 Premier League clubs**, a difficulty (easy, medium or hard) and a
   match length.
2. **Your club screen** shows your player card (overall rating, the six skills, age, games, goals,
   assists and average rating), the next match, your form, the league, the cups and your badges.
3. **Before kick-off** both line-ups appear as player cards: rating, position, shirt number, flag and
   age for every real player.
4. **The match.** It's 11-a-side, and you control only your player (yellow ring and name tag). Your
   teammates love passing to you. There are throw-ins, corners, goal kicks, headers, saves and parries,
   posts and goal celebrations. The camera follows you and the ball, and a radar in the corner shows the
   whole pitch.
5. **Full time.** You get a **rating out of 10**, your stats, any new badges and training points.
   The rating counts what you did per standard 4-minute match (`STANDARD_HALF_SECONDS` in
   `engine/rating.ts`), so 3-minute and 6-minute matches are judged fairly.
6. **Transfers.** Your form is your average rating over your last 3 matches at your club. You need at
   least 3 matches at a club before a move, or only 2 if both were brilliant.
   - **Good form:** 2–3 bigger clubs make offers. Pick one, or stay.
   - **Poor form:** you're moved to a smaller club, choosing from 2.
   - Every club expects a level of form: 6.0 at the smallest club rising to 7.9 at the biggest
     (`EXPECTED`). Average more than 0.75 above it (`BAND`) and bigger clubs call; more than 0.75
     below and you move down. So weak, average and good players each find a natural home.
   - Clubs expect 0.06 more for every point training has added to your overall rating
     (`EXPECT_PER_OVERALL`, up to 30 points), so training makes you better on the pitch but it's
     still how you play that moves you. Nothing expects more than 8.5, so the top stays reachable.
   - Easy expects 0.15 more and hard 0.8 less (`EXPECT_FOR_DIFFICULTY`): less than the difference
     the difficulty makes to ratings, so easy gives a small leg-up and hard a small handicap.
   - It's all in `thresholds()` / `barsFor()` in `engine/career.ts`.
7. **Season.** There are 19 league matches, one against every other club. Other results are simulated
   from squad strength. The league table and Golden Boot race are live and include real players.
8. **Cups.** After 6 league matches, clubs in the **top half go into the FA Cup** and the **bottom half
   into the EFL Cup**. You play the quarter-final (after league match 6), semi-final (after 11) and final
   at Wembley (after 16). A draw goes to a **penalty shootout**: you pick the corner for your team's
   kicks and which way to dive for theirs.
9. **End of season.** You see the final table, trophies (league champions, Golden Boot, Player of the
   Season, FA Cup, EFL Cup) and a **"What's new"** screen. Every season:
   - clubs that finished high grow and clubs that finished low shrink, so the ladder reshuffles;
   - every real player is a year older: young ones improve towards their potential, older ones decline
     and retire at 38, and the league average is kept level;
   - you're a year older and get 3 bonus pre-season training points.
10. **Training.** Spend points earned in matches on pace, shooting, passing, dribbling, tackling and
    stamina.
11. **My career.** The shirts of every club you've played for, a trophy cabinet, a badge book (20
    badges), season history, recent matches, and settings for difficulty and match length.

Saves are stored in `localStorage` under `superstar.save.v1`, with several players per computer. Every
save passes through `sanitizeSave` (`store/save.ts`). A corrupt save is copied to
`superstar.save.v1.corrupt`. The manager game's saves are untouched.

## Where things are

```
src/superstar/
  main.tsx, App.tsx          entry point; screens are switched on a field in the store
  superstar.css              all the styles (colourful, chunky, "sticker" look)
  data/
    clubs.ts                 the 20 clubs, kits (real patterns), away/third kits, clash rules, keeper colours
    squads.ts                real squads from src/data/squads/premier-league.ts, plus ageing per season
    flags.ts, colour.ts      nationality flags; colour helpers
  engine/                    pure TypeScript, no React
    match/
      types.ts               match state, players, ball, events, input
      sim.ts                 createMatch / stepMatch: movement, ball physics, contacts, rules, restarts, clock
      ai.ts                  computer players: shape, chasing, pressing, marking, decisions, keepers
      actions.ts             passing, shooting, crossing, headers, who the kid's pass goes to
      core.ts                shared helpers (kick, taking the ball, predicting the ball)
      tuning.ts              EVERY match number, including difficulty settings
      bot.ts                 a pretend kid at the controls, used by the balance scripts (not in the game)
    lineup.ts                builds a match from "your club v their club" with the kid in the team
    formation.ts, skills.ts  4-4-2 slots and choosing an eleven; ability → skills
    rating.ts                match rating out of 10
    career.ts                the career: form, transfers, ladder, cups in the season, season end, training
    season.ts                fixtures, simulated results, league table, top scorers
    cup.ts                   FA Cup / EFL Cup rules and penalty kicks
    badges.ts                the 20 badges
  store/
    save.ts                  save format + sanitiser + localStorage
    game.ts                  app state (screen, current match, last result) and every action
  ui/
    match/                   MatchScreen (canvas + HUD), render.ts (all drawing), controls (keys, pad,
                             touch), TouchPad, DemoPitch (the title screen's background match)
    screens/                 Title, Create, Hub, PreMatch, Penalties, FullTime, Transfer, SeasonEnd,
                             Table, Training, CareerScreen
  test/                      vitest unit tests (node); helpers.ts plays quick headless matches
    components/              Kit.tsx (shirts, badges, the footballer drawing), Bits.tsx (player cards,
                             mini cards, rating bubbles, top bar, confetti…)
    sound.ts                 synthesised whistle, kicks, crowd
scripts/superstar/           headless balance scripts (sim, grid, rating, journey); see the header of each
```

## Where we are

### Done

- [x] **Two games, one site.** Superstar at `/` and the manager game at `/manager/`, with links both
  ways. The Vite build is multi-page, and a trailing-slash redirect is in place for dev and preview.
- [x] **Premier League only:** 20 clubs, real squads, real kit patterns, clash detection, keeper colours.
- [x] **Match engine.** Tuned with the bot on Medium, Brighton v Everton, 12 matches each:

  | Robot kid | Goals per match | Wins / draws / losses |
  |---|---|---|
  | Weak | 0.8 | 3 / 4 / 5 |
  | Average | 1.25 | 7 / 1 / 4 |
  | Good | 2.5 | 8 / 1 / 3 |

  Computer against computer produces about 2.5 goals a match.
- [x] **Drawing and controls:** colourful canvas renderer, HUD, radar, confetti, banners with kind
  messages ("So close!", "Great tackle!"), pause, a "how to play" card that holds the match until
  dismissed, keyboard, game controller and touchscreen.
- [x] **Ratings.** Rescaled so a weak game is about 6.3, an average one about 7 and a strong one 7.5–8.4.
- [x] **Transfers:** form, offers from bigger clubs (you can stay), moves to smaller clubs (you pick
  which), and a welcome screen with confetti.
- [x] **Season:** fixtures, simulated results, league table, Golden Boot race, trophies, badges and
  training.
- [x] **Cups:** FA Cup and EFL Cup by table half, three rounds, final at Wembley, and a penalty
  shootout screen.
- [x] **Pick any Premier League club** when creating a player.
- [x] **Every-season updates:** the ladder reshuffles, players age, retire and are levelled, you age,
  you get pre-season points, and a "What's new" section appears.
- [x] **Player cards** with everything on them: overall rating, the six skills, position, number, club,
  age and career totals. Real players' mini cards show rating, position, number, flag and age.
- [x] **Save:** sanitised and versioned, with a corrupt-save backup.
- [x] **Checked in a real browser (headless Chromium):** the title screen, all 5 steps of making a
  player, the club screen, the team sheets and the start of a match. There were no console errors.
- [x] **Career balance, checked with `scripts/superstar/journey.ts`.** Robot kids of three skills,
  8 careers each, 60 matches (about 2½ seasons), starting at the 12th-biggest club with 4-minute
  matches and spending their training points. Average final ladder rank (1 = biggest):

  | Robot kid | Easy | Medium | Hard |
  |---|---|---|---|
  | Weak (0.2) | 18.0 | 19.1 | 18.6 |
  | Average (0.5) | 4.4 | 9.4 | 13.9 |
  | Good (0.8) | 1.0 | 1.0 | 4.3 |

  Before the rework, on medium the average kid reached the 1st-biggest club, on easy even the weak
  kid did, and the result also depended on match length (60s halves rated about a point lower than
  120s halves). Reproduce with
  `npx vite-node scripts/superstar/journey.ts 0.2,0.5,0.8 60 medium 12 striker 120 train 8`.
  On easy a good player now scores about 3.4 goals a match (it was 4.7).
- [x] **Played through in a browser** (Playwright, 12-second matches, a whole season and into the
  next): full time → transfer news → welcome; the cup draw after match 6, the cup ties and the final
  at Wembley; penalty shootouts; the end of the season and "What's new"; training, the table and My
  career, at desktop and phone widths. No console errors. Fixed on the way: the penalty buttons sat
  below the fold, the carry-on button could be pushed off screen by new badges, the top bar covered a
  quarter of a phone screen, and the form card said "No matches yet" to players who had just moved.
- [x] **Unit tests:** 99 vitest tests in `src/superstar/test/` (about 7 seconds), run in CI. They found
  and fixed three bugs: offers near the top or bottom of the ladder only ever gave one club, a save
  could keep duplicate player ids, and Champions / Golden Boot badges were dated a season late.
- [x] **README** describes both games.

### Still to do (in rough order)

- [ ] **Try on real devices:** touch controls on a real tablet, and a real game controller.
- [ ] **Deploy.** Merging to `main` publishes both games through the existing workflow: Superstar at
  `https://dbuxton.github.io/football-champ/` and the manager at `…/football-champ/manager/`.

### Known rough edges and ideas

- **The balance is tuned against a robot kid** (`engine/match/bot.ts`). Real kids may play
  differently: if careers feel off, adjust `EXPECTED`, `BAND` and `EXPECT_FOR_DIFFICULTY` in
  `engine/career.ts` first, then `DIFFICULTY` in `engine/match/tuning.ts`.
- **Moves are frequent:** about one every 5–6 matches on average. `BAND` (wider = fewer moves) and
  `SETTLE_MATCHES` control it.
- **Computer shots rarely miss the target.** Most end as goals or saves; `shoot()` in
  `engine/match/actions.ts` sets the error.
- **Transfers can happen after any match** once you've played 3 at a club. There's no transfer window.
- **Cup-tied rules are ignored.** If you transfer mid-cup, your cup run comes with you.
- **Squads come from the manager game's snapshot.** When the real Premier League changes, update
  `src/data/squads/premier-league.ts` and `src/data/clubs.ts` (see `docs/DATA.md`), which updates both
  games.
- **Possible extras:** a goalkeeper position, crowd ambience sound, choosing boots in training, and
  showing a real player's card when you tap them.
