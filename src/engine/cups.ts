/**
 * Cup competitions and play-offs.
 *
 * The FA Cup and EFL Cup are drawn round by round, with the seeding conventions that make them
 * feel right: Premier League clubs enter the FA Cup at the third round, European entrants get a
 * bye in the League Cup, and the EFL Trophy is for the bottom two divisions.
 */

import { Rng, deriveSeed } from './rng';
import { Fixture } from './types';
import { CupState, GameState, PlayoffState, getCompetition } from './gamestate';
import { createFixture, cupDatesFor, findFreeDate } from './fixtures';
import { addDaysISO, parseISO } from './date';
import { payCupPrizeMoney } from './finance';
import { addNews } from './news';
import { winnerOf } from './postmatch';

/** The later of two ISO dates. */
function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

const FA_CUP_ROUNDS = [
  'First Round', 'Second Round', 'Third Round', 'Fourth Round', 'Fifth Round',
  'Quarter-Final', 'Semi-Final', 'Final',
];

const EFL_CUP_ROUNDS = [
  'First Round', 'Second Round', 'Third Round', 'Fourth Round', 'Quarter-Final',
  'Semi-Final', 'Final',
];

const TROPHY_ROUNDS = [
  'Group Stage', 'Second Round', 'Third Round', 'Quarter-Final', 'Semi-Final', 'Final',
];

export function initialiseCups(state: GameState): void {
  const rng = new Rng(deriveSeed(state.seed, `cups:${state.season}`));

  const tierClubs = (tiers: number[]) => Object.values(state.clubs)
    .filter((c) => tiers.includes(state.competitions[c.leagueId]?.tier ?? 99))
    .map((c) => c.id);

  // FA Cup: everyone, but the top two divisions join at the third round.
  state.cups['fa-cup'] = {
    competitionId: 'fa-cup',
    remainingClubIds: rng.shuffle(tierClubs([3, 4])),
    currentRound: 0,
    roundNames: FA_CUP_ROUNDS,
    winnerClubId: null,
    eliminatedInRound: {},
  };

  // EFL Cup: all 92, with the biggest clubs entering later.
  state.cups['efl-cup'] = {
    competitionId: 'efl-cup',
    remainingClubIds: rng.shuffle(tierClubs([2, 3, 4])),
    currentRound: 0,
    roundNames: EFL_CUP_ROUNDS,
    winnerClubId: null,
    eliminatedInRound: {},
  };

  // EFL Trophy: League One and Two only.
  state.cups['efl-trophy'] = {
    competitionId: 'efl-trophy',
    remainingClubIds: rng.shuffle(tierClubs([3, 4])),
    currentRound: 0,
    roundNames: TROPHY_ROUNDS,
    winnerClubId: null,
    eliminatedInRound: {},
  };

  scheduleNextCupRound(state, 'fa-cup');
  scheduleNextCupRound(state, 'efl-cup');
  scheduleNextCupRound(state, 'efl-trophy');
}

/** Clubs that join a cup partway through, by round index. */
function lateEntrants(state: GameState, competitionId: string, round: number): string[] {
  const byTier = (tier: number) => Object.values(state.clubs)
    .filter((c) => state.competitions[c.leagueId]?.tier === tier)
    .map((c) => c.id);

  if (competitionId === 'fa-cup' && round === 2) {
    // Third round proper: the Premier League and Championship arrive.
    return [...byTier(1), ...byTier(2)];
  }
  if (competitionId === 'efl-cup' && round === 1) {
    // Second round: Premier League clubs without European football.
    return byTier(1).slice(7);
  }
  if (competitionId === 'efl-cup' && round === 2) {
    // Third round: the European entrants join.
    return byTier(1).slice(0, 7);
  }
  return [];
}

export function scheduleNextCupRound(state: GameState, competitionId: string): void {
  const cup = state.cups[competitionId];
  if (!cup || cup.winnerClubId) return;

  const rng = new Rng(deriveSeed(state.rngState, `cup:${competitionId}:${cup.currentRound}`));
  const seasonStartYear = parseISO(state.date).getUTCMonth() + 1 >= 7
    ? parseISO(state.date).getUTCFullYear()
    : parseISO(state.date).getUTCFullYear() - 1;
  const dates = cupDatesFor(seasonStartYear)[competitionId] ?? [];

  // Bring in any clubs joining at this round.
  const joining = lateEntrants(state, competitionId, cup.currentRound);
  if (joining.length) {
    cup.remainingClubIds = rng.shuffle([...cup.remainingClubIds, ...joining]);
  }

  if (cup.remainingClubIds.length <= 1) {
    cup.winnerClubId = cup.remainingClubIds[0] ?? null;
    if (cup.winnerClubId) awardCup(state, competitionId, cup.winnerClubId);
    return;
  }

  const scheduled = dates[cup.currentRound] ?? findFreeDate(state, cup.remainingClubIds, state.date, 3);
  const date = laterOf(scheduled, addDaysISO(state.date, 3));
  const isFinal = cup.remainingClubIds.length === 2;

  // Byes if we have an odd number of clubs.
  const entrants = [...cup.remainingClubIds];
  if (entrants.length % 2 === 1) {
    // Give the bye to a lower-ranked club, which is both kinder and more realistic.
    const weakest = entrants
      .slice()
      .sort((a, b) => (state.clubs[a]?.reputation ?? 0) - (state.clubs[b]?.reputation ?? 0))[0];
    entrants.splice(entrants.indexOf(weakest), 1);
  }

  rng.shuffle(entrants);
  const fixtures: Fixture[] = [];
  for (let i = 0; i < entrants.length; i += 2) {
    const a = entrants[i];
    const b = entrants[i + 1];
    if (!b) break;
    // The lower-division club gets home advantage, as the FA Cup draw effectively gives them.
    const aTier = state.competitions[state.clubs[a].leagueId]?.tier ?? 4;
    const bTier = state.competitions[state.clubs[b].leagueId]?.tier ?? 4;
    const [home, away] = isFinal
      ? [a, b]
      : aTier >= bTier ? [a, b] : [b, a];

    fixtures.push(createFixture(competitionId, date, home, away, cup.currentRound + 1, rng, {
      roundName: cup.roundNames[cup.currentRound] ?? `Round ${cup.currentRound + 1}`,
      neutralVenue: isFinal ? 'Wembley Stadium' : undefined,
    }));
  }

  state.fixtures.push(...fixtures);
  state.fixtures.sort((a, b) => a.date.localeCompare(b.date));

  const managed = state.manager.clubId;
  const ourTie = fixtures.find((f) => f.homeClubId === managed || f.awayClubId === managed);
  if (ourTie) {
    const opponent = ourTie.homeClubId === managed ? ourTie.awayClubId : ourTie.homeClubId;
    addNews(state, {
      category: 'competition',
      important: true,
      subject: `${getCompetition(state, competitionId).name} draw`,
      body: `${cup.roundNames[cup.currentRound] ?? 'The next round'}: you have been drawn ${ourTie.homeClubId === managed ? 'at home to' : 'away to'} ${state.clubs[opponent]?.name}.`,
    });
  }
}

/** Called once every fixture in a cup round has been played. */
export function processCupRound(state: GameState, competitionId: string): void {
  const cup = state.cups[competitionId];
  if (!cup || cup.winnerClubId) return;

  const roundFixtures = state.fixtures.filter(
    (f) => f.competitionId === competitionId && f.round === cup.currentRound + 1,
  );
  if (roundFixtures.length === 0) return;
  if (roundFixtures.some((f) => !f.played)) return;

  const survivors: string[] = [];
  const byes = cup.remainingClubIds.filter(
    (id) => !roundFixtures.some((f) => f.homeClubId === id || f.awayClubId === id),
  );
  survivors.push(...byes);

  for (const fixture of roundFixtures) {
    const winner = winnerOf(fixture);
    if (!winner) continue;
    survivors.push(winner);
    const loser = winner === fixture.homeClubId ? fixture.awayClubId : fixture.homeClubId;
    cup.eliminatedInRound[loser] = cup.currentRound;
    payCupPrizeMoney(state, competitionId, loser, cup.currentRound);

    if (loser === state.manager.clubId) {
      addNews(state, {
        category: 'competition',
        important: true,
        subject: `Knocked out of the ${getCompetition(state, competitionId).shortName}`,
        body: `Defeat to ${state.clubs[winner]?.name} ends your ${getCompetition(state, competitionId).name} run at the ${(cup.roundNames[cup.currentRound] ?? 'this round').toLowerCase()}.`,
      });
    }
  }

  cup.remainingClubIds = survivors;
  cup.currentRound += 1;

  if (survivors.length === 1) {
    cup.winnerClubId = survivors[0];
    awardCup(state, competitionId, survivors[0]);
    return;
  }
  scheduleNextCupRound(state, competitionId);
}

function awardCup(state: GameState, competitionId: string, clubId: string): void {
  const comp = getCompetition(state, competitionId);
  const club = state.clubs[clubId];
  if (!club) return;

  club.honours.push({ competitionName: comp.name, season: state.season });
  payCupPrizeMoney(state, competitionId, clubId, comp.roundPrizeMoney ? comp.roundPrizeMoney.length - 1 : 0);
  club.reputation = Math.min(100, club.reputation + (comp.reputation > 70 ? 2 : 1));

  if (clubId === state.manager.clubId) {
    state.manager.honours.push({
      competitionName: comp.name, season: state.season, clubName: club.name,
    });
    const current = state.manager.career[state.manager.career.length - 1];
    if (current) current.honours.push(`${comp.name} ${state.season}`);
    state.manager.reputation = Math.min(100, state.manager.reputation + 6);
    club.board.confidence = Math.min(100, club.board.confidence + 15);
    club.fanHappiness = Math.min(100, club.fanHappiness + 18);
  }

  addNews(state, {
    category: 'competition',
    important: clubId === state.manager.clubId,
    subject: `${club.name} win the ${comp.name}`,
    body: `${club.name} are the ${state.season} ${comp.name} winners.`,
    relatedClubId: clubId,
  });
}

// ---------------------------------------------------------------------------------------------
// Play-offs
// ---------------------------------------------------------------------------------------------

const PLAYOFF_FOR: Record<string, string> = {
  championship: 'championship-playoff',
  'league-one': 'league-one-playoff',
  'league-two': 'league-two-playoff',
};

/** Set up the play-offs from a finished league table. */
export function initialisePlayoffs(state: GameState, leagueId: string, orderedClubIds: string[]): void {
  const comp = state.competitions[leagueId];
  const playoffId = PLAYOFF_FOR[leagueId];
  if (!comp || !playoffId) return;

  const promotion = comp.promotionSpots ?? 0;
  const spots = comp.playoffSpots ?? 0;
  if (spots === 0) return;

  const contenders = orderedClubIds.slice(promotion, promotion + spots);
  if (contenders.length < spots) return;

  const playoff: PlayoffState = {
    competitionId: playoffId,
    leagueId,
    semiFinalists: contenders,
    finalists: [],
    winnerClubId: null,
    stage: 'semis',
  };
  state.playoffs[playoffId] = playoff;
  state.competitions[playoffId].clubIds = contenders;

  const rng = new Rng(deriveSeed(state.rngState, `playoff:${playoffId}`));
  const year = parseISO(state.date).getUTCFullYear();
  // If the league programme overran, start the play-offs a few days from now rather than on a
  // date that has already been and gone.
  const firstLegDate = laterOf(`${year}-05-15`, addDaysISO(state.date, 4));
  const secondLegDate = addDaysISO(firstLegDate, 3);

  // 3rd v 6th and 4th v 5th, higher seed at home in the second leg.
  const pairs: [string, string][] = [
    [contenders[3], contenders[0]],
    [contenders[2], contenders[1]],
  ];

  for (const [lower, higher] of pairs) {
    const firstLeg = createFixture(playoffId, firstLegDate, lower, higher, 1, rng, {
      roundName: 'Semi-Final, First Leg',
    });
    const secondLeg = createFixture(playoffId, secondLegDate, higher, lower, 1, rng, {
      roundName: 'Semi-Final, Second Leg',
      legOf: firstLeg.id,
      isSecondLeg: true,
    });
    state.fixtures.push(firstLeg, secondLeg);
  }
  state.fixtures.sort((a, b) => a.date.localeCompare(b.date));

  if (contenders.includes(state.manager.clubId)) {
    addNews(state, {
      category: 'competition',
      important: true,
      subject: 'Play-offs reached',
      body: `You have qualified for the ${state.competitions[playoffId].name}. Three games from promotion.`,
    });
  }
}

/** Advance a play-off after its fixtures have been played. */
export function processPlayoff(state: GameState, playoffId: string): void {
  const playoff = state.playoffs[playoffId];
  if (!playoff || playoff.stage === 'complete') return;

  const fixtures = state.fixtures.filter((f) => f.competitionId === playoffId);

  if (playoff.stage === 'semis') {
    const legs = fixtures.filter((f) => f.round === 1);
    if (legs.length === 0 || legs.some((f) => !f.played)) return;

    const winners: string[] = [];
    for (const second of legs.filter((f) => f.isSecondLeg)) {
      const first = legs.find((f) => f.id === second.legOf);
      if (!first?.result || !second.result) continue;
      // First leg's home side is the second leg's away side.
      const aggregate = { home: first.result.awayGoals, away: first.result.homeGoals };
      const winner = winnerOf(second, aggregate);
      if (winner) winners.push(winner);
    }

    if (winners.length < 2) return;
    playoff.finalists = winners;
    playoff.stage = 'final';

    const rng = new Rng(deriveSeed(state.rngState, `playoff-final:${playoffId}`));
    const year = parseISO(state.date).getUTCFullYear();
    const finalDate = laterOf(`${year}-05-25`, addDaysISO(state.date, 5));
    state.fixtures.push(createFixture(playoffId, finalDate, winners[0], winners[1], 2, rng, {
      roundName: 'Final',
      neutralVenue: 'Wembley Stadium',
    }));
    state.fixtures.sort((a, b) => a.date.localeCompare(b.date));

    if (winners.includes(state.manager.clubId)) {
      const opponent = winners.find((w) => w !== state.manager.clubId);
      addNews(state, {
        category: 'competition',
        important: true,
        subject: 'Wembley awaits',
        body: `You have reached the ${state.competitions[playoffId].name} final, where you will face ${state.clubs[opponent ?? '']?.name}. One game for promotion.`,
      });
    }
    return;
  }

  if (playoff.stage === 'final') {
    const final = fixtures.find((f) => f.round === 2);
    if (!final?.played) return;
    const winner = winnerOf(final);
    if (!winner) return;
    playoff.winnerClubId = winner;
    playoff.stage = 'complete';
  }
}

/** Whether a play-off fixture needs extra time and penalties. */
export function playoffNeedsWinner(fixture: Fixture): boolean {
  return Boolean(fixture.isSecondLeg) || fixture.roundName === 'Final';
}

/** Aggregate carried into a second leg. */
export function aggregateFor(state: GameState, fixture: Fixture): { home: number; away: number } | undefined {
  if (!fixture.isSecondLeg || !fixture.legOf) return undefined;
  const first = state.fixtures.find((f) => f.id === fixture.legOf);
  if (!first?.result) return undefined;
  // The home side of the second leg was away in the first.
  return { home: first.result.awayGoals, away: first.result.homeGoals };
}

export function cupProgressLabel(cup: CupState): string {
  return cup.roundNames[cup.currentRound] ?? 'Complete';
}
