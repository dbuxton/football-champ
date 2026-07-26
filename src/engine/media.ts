/**
 * Media: press conferences, awards, pundit predictions and the storylines that make a season
 * feel like it's about something.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { PressAnswer, PressQuestion } from './types';
import { GameState, getClub, squadOf } from './gamestate';
import { positionOf, tableFor } from './table';
import { addNews } from './news';
import { totalStats } from './players';
import { ordinal } from './board';

/**
 * Build a pre-match press conference. Answers trade squad morale against board confidence and
 * fan happiness — there is rarely a free option.
 */
export function buildPressConference(state: GameState, opponentClubId: string): PressQuestion[] {
  const rng = new Rng(deriveSeed(state.rngState, `press:${state.date}`));
  const club = getClub(state, state.manager.clubId);
  const opponent = getClub(state, opponentClubId);
  const comp = state.competitions[club.leagueId];
  const position = comp ? positionOf(state, comp.id, club.id) : 0;
  const isDerby = club.rivalIds.includes(opponentClubId);

  const questions: PressQuestion[] = [];

  questions.push({
    question: isDerby
      ? `This is the derby. How much does a game against ${opponent.name} mean to these supporters?`
      : `${opponent.name} are up next. How do you assess them?`,
    options: [
      {
        text: isDerby
          ? 'Everything. We know exactly what this fixture means and we will be ready.'
          : 'They are a good side and we respect them, but we will focus on ourselves.',
        moraleDelta: 2, boardDelta: 1, fanDelta: isDerby ? 4 : 1,
      },
      {
        text: isDerby
          ? "It's three points like any other. I won't get drawn into it."
          : 'Honestly, if we play our football we should be beating teams like this.',
        moraleDelta: isDerby ? -1 : 3, boardDelta: 0, fanDelta: isDerby ? -4 : -1,
      },
      {
        text: 'We are under no illusions. This will be a very difficult afternoon.',
        moraleDelta: -1, boardDelta: 1, fanDelta: -1,
      },
    ],
  });

  // A question about a specific player: form, or lack of it.
  const squad = squadOf(state, club.id).filter((p) => !p.injury);
  const inForm = squad
    .filter((p) => p.form.length >= 3)
    .sort((a, b) => (b.form.slice(-3).reduce((x, y) => x + y, 0)) - (a.form.slice(-3).reduce((x, y) => x + y, 0)));

  if (inForm.length >= 2) {
    const star = inForm[0];
    const struggler = inForm[inForm.length - 1];
    const aboutStar = rng.chance(0.5);
    const subject = aboutStar ? star : struggler;

    questions.push({
      question: aboutStar
        ? `${subject.firstName} ${subject.lastName} has been excellent lately. Are you worried about keeping him?`
        : `${subject.firstName} ${subject.lastName} has struggled recently. Is his place under threat?`,
      options: aboutStar
        ? [
          { text: 'He is not for sale at any price. He is central to what we are building.', moraleDelta: 5, boardDelta: -2, fanDelta: 3, targetPlayerId: subject.id },
          { text: 'Every player has a price. That is the reality at this level.', moraleDelta: -4, boardDelta: 3, fanDelta: -3, targetPlayerId: subject.id },
          { text: "I don't discuss transfers in press conferences.", moraleDelta: 0, boardDelta: 1, fanDelta: 0 },
        ]
        : [
          { text: 'He has my full backing. Form is temporary — he will come through it.', moraleDelta: 4, boardDelta: 0, fanDelta: 1, targetPlayerId: subject.id },
          { text: 'Nobody is guaranteed a shirt. He knows he has to do more.', moraleDelta: -4, boardDelta: 2, fanDelta: 2, targetPlayerId: subject.id },
          { text: 'I would rather talk about the team than individuals.', moraleDelta: 0, boardDelta: 0, fanDelta: -1 },
        ],
    });
  }

  // A question about the table.
  if (comp && position > 0) {
    const chasing = position > 6;
    questions.push({
      question: chasing
        ? `You sit ${ordinal(position)} in the table. Is this season already about damage limitation?`
        : `${ordinal(position)} in the table. Are you in a promotion race?`,
      options: [
        {
          text: chasing
            ? 'Absolutely not. There are more than enough games left to change this.'
            : 'We are right in it, and we intend to stay there.',
          moraleDelta: 3, boardDelta: 2, fanDelta: 3,
        },
        {
          text: 'I take each game as it comes. The table looks after itself.',
          moraleDelta: 0, boardDelta: 0, fanDelta: -1,
        },
        {
          text: chasing
            ? 'We have been well short of the standard required. That is on me.'
            : 'Let us not get carried away. We are a work in progress.',
          moraleDelta: -1, boardDelta: 3, fanDelta: -2,
        },
      ],
    });
  }

  return questions;
}

/** Apply the manager's chosen answers. */
export function applyPressAnswers(state: GameState, answers: PressAnswer[]): void {
  const club = getClub(state, state.manager.clubId);
  let moraleDelta = 0;

  for (const answer of answers) {
    if (answer.targetPlayerId) {
      const player = state.players[answer.targetPlayerId];
      if (player) player.morale = clamp(player.morale + answer.moraleDelta * 2.5, 5, 100);
      moraleDelta += answer.moraleDelta * 0.4;
    } else {
      moraleDelta += answer.moraleDelta;
    }
    club.board.confidence = clamp(club.board.confidence + answer.boardDelta, 0, 100);
    club.fanHappiness = clamp(club.fanHappiness + answer.fanDelta, 0, 100);
  }

  for (const player of squadOf(state, club.id)) {
    player.morale = clamp(player.morale + moraleDelta * 0.5, 5, 100);
  }
}

/** Offer a press conference before a notable fixture. */
export function maybeSchedulePressConference(state: GameState, opponentClubId: string): void {
  const rng = new Rng(deriveSeed(state.rngState, `pressgate:${state.date}`));
  const club = getClub(state, state.manager.clubId);
  const isDerby = club.rivalIds.includes(opponentClubId);
  // Derbies always draw the press; other games about a third of the time.
  if (!isDerby && !rng.chance(0.34)) return;

  addNews(state, {
    category: 'media',
    important: isDerby,
    subject: isDerby ? 'Press conference: derby week' : 'Press conference',
    body: `The media are here ahead of the ${state.clubs[opponentClubId]?.name} game. What you say will be read by your players, your board and your supporters.`,
    action: { kind: 'press-conference', questions: buildPressConference(state, opponentClubId) },
  });
}

// ---------------------------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------------------------

/** Manager and player of the month, awarded at the start of each month. */
export function monthlyAwards(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `awards:${state.date}`));

  for (const comp of Object.values(state.competitions)) {
    if (comp.kind !== 'league') continue;
    const table = tableFor(state, comp.id);
    if (table.length === 0 || table[0].played < 3) continue;

    // Manager of the month goes to whoever has the best recent form.
    const best = table
      .slice()
      .sort((a, b) => formPoints(b.form) - formPoints(a.form))[0];
    if (!best) continue;

    const club = state.clubs[best.clubId];
    if (!club) continue;

    if (club.isPlayerControlled) {
      state.manager.reputation = Math.min(100, state.manager.reputation + 2);
      club.board.confidence = clamp(club.board.confidence + 3, 0, 100);
      addNews(state, {
        category: 'award',
        important: true,
        subject: `${comp.name} Manager of the Month`,
        body: `You have been named ${comp.name} Manager of the Month after an excellent run of results.`,
      });
    }

    // Player of the month, from the winning club or thereabouts.
    const candidates = squadOf(state, best.clubId)
      .filter((p) => totalStats(p).appearances > 1)
      .sort((a, b) => {
        const sa = totalStats(a);
        const sb = totalStats(b);
        return (sb.ratingSum / Math.max(1, sb.appearances)) - (sa.ratingSum / Math.max(1, sa.appearances));
      });
    const winner = candidates[0];
    if (winner && club.isPlayerControlled) {
      winner.morale = clamp(winner.morale + 8, 5, 100);
      addNews(state, {
        category: 'award',
        subject: `${comp.name} Player of the Month`,
        body: `${winner.firstName} ${winner.lastName} has been voted ${comp.name} Player of the Month.`,
        relatedPlayerId: winner.id,
      });
    }
    void rng;
  }
}

function formPoints(form: string[]): number {
  return form.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
}

/** End-of-season awards. */
export function seasonAwards(state: GameState): {
  playerOfTheYear: string | null;
  youngPlayerOfTheYear: string | null;
  topScorer: { playerId: string; goals: number } | null;
} {
  const rated = Object.values(state.players)
    .filter((p) => !p.retired)
    .map((p) => ({ player: p, stats: totalStats(p) }))
    .filter((e) => e.stats.appearances >= 15);

  const byRating = rated
    .slice()
    .sort((a, b) =>
      (b.stats.ratingSum / b.stats.appearances) - (a.stats.ratingSum / a.stats.appearances));

  const byGoals = rated.slice().sort((a, b) => b.stats.goals - a.stats.goals);

  const young = byRating.filter((e) => {
    const birthYear = Number(e.player.birthDate.slice(0, 4));
    const year = Number(state.date.slice(0, 4));
    return year - birthYear <= 21;
  });

  const result = {
    playerOfTheYear: byRating[0]?.player.id ?? null,
    youngPlayerOfTheYear: young[0]?.player.id ?? null,
    topScorer: byGoals[0]
      ? { playerId: byGoals[0].player.id, goals: byGoals[0].stats.goals }
      : null,
  };

  if (result.playerOfTheYear) {
    const player = state.players[result.playerOfTheYear];
    addNews(state, {
      category: 'award',
      important: true,
      subject: 'Player of the Year',
      body: `${player.firstName} ${player.lastName} of ${state.clubs[player.clubId ?? '']?.name ?? 'a rival club'} has been voted Player of the Year.`,
      relatedPlayerId: player.id,
    });
  }
  if (result.topScorer) {
    const player = state.players[result.topScorer.playerId];
    addNews(state, {
      category: 'award',
      subject: 'Golden Boot',
      body: `${player.firstName} ${player.lastName} finishes as the season's top scorer with ${result.topScorer.goals} goals.`,
      relatedPlayerId: player.id,
    });
  }

  return result;
}

/** Pre-season predictions, published on the first day of the season. */
export function publishPredictions(state: GameState): void {
  const club = getClub(state, state.manager.clubId);
  const comp = state.competitions[club.leagueId];
  if (!comp) return;

  const ranked = comp.clubIds
    .map((id) => ({ id, strength: squadStrength(state, id) }))
    .sort((a, b) => b.strength - a.strength);

  const predicted = ranked.findIndex((r) => r.id === club.id) + 1;
  const favourites = ranked.slice(0, 3).map((r) => state.clubs[r.id]?.shortName).filter(Boolean);

  addNews(state, {
    category: 'media',
    important: true,
    subject: `${state.season} season preview`,
    body: `The pundits make ${favourites.join(', ')} the ones to watch in the ${comp.name}. ${club.name} are predicted to finish ${ordinal(predicted)}. Your board expects you to ${club.board.expectation.toLowerCase()}.`,
  });
}

export function squadStrength(state: GameState, clubId: string): number {
  const squad = squadOf(state, clubId);
  if (squad.length === 0) return 0;
  // Weight the best players most heavily — depth matters, but the first XI matters more.
  const sorted = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility);
  let total = 0;
  let weight = 0;
  sorted.slice(0, 20).forEach((player, index) => {
    const w = index < 11 ? 1 : 0.35;
    total += player.currentAbility * w;
    weight += w;
  });
  return total / Math.max(1, weight);
}
