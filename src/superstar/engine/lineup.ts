import { getClub, keeperColours, matchKits } from '../data/clubs';
import { squadFor } from '../data/squads';
import { FORMATION, POSITION_SLOT, pickEleven, type PlayerPosition } from './formation';
import type { Difficulty, MatchSetup, TeamPlayer, TeamSetup } from './match/types';
import { skillsFor, skillsFromAttributes, type Attributes } from './skills';

/** The kid's footballer, as a match needs to know them. */
export type Footballer = {
  name: string;
  number: number;
  position: PlayerPosition;
  attributes: Attributes;
};

/**
 * Line up a match: the kid's club with the kid in it, against real opponents, in kits that
 * don't clash.
 */
export function lineUp(opts: {
  seed: number;
  clubId: string;
  opponentId: string;
  /** Is the kid's club at home? */
  home: boolean;
  footballer: Footballer;
  difficulty: Difficulty;
  halfSeconds: number;
  /** Which season's squads to use (players age as the seasons pass). */
  season?: number;
}): MatchSetup {
  const homeId = opts.home ? opts.clubId : opts.opponentId;
  const awayId = opts.home ? opts.opponentId : opts.clubId;
  const kits = matchKits(homeId, awayId);
  const ourKit = opts.home ? kits.home : kits.away;
  const theirKit = opts.home ? kits.away : kits.home;
  const [ourKeeper, theirKeeper] = keeperColours(ourKit, theirKit);
  const humanSlot = POSITION_SLOT[opts.footballer.position];

  const season = opts.season ?? 1;
  const ours = team(opts.clubId, humanSlot, ourKit, ourKeeper, opts.footballer, season);
  const theirs = team(opts.opponentId, null, theirKit, theirKeeper, null, season);

  return {
    seed: opts.seed,
    halfSeconds: opts.halfSeconds,
    difficulty: opts.difficulty,
    homeSide: opts.home ? 0 : 1,
    teams: [ours, theirs],
    humanSlot,
  };
}

function team(
  clubId: string,
  humanSlot: number | null,
  kit: TeamSetup['kit'],
  keeperColour: string,
  footballer: Footballer | null,
  season: number,
): TeamSetup {
  const club = getClub(clubId);
  const eleven = pickEleven(squadFor(clubId, season), humanSlot);
  const players: TeamPlayer[] = FORMATION.map((slot, index) => {
    if (index === humanSlot && footballer) {
      return {
        name: footballer.name,
        shortName: footballer.name,
        number: footballer.number,
        skills: skillsFromAttributes(footballer.attributes),
        human: true,
      };
    }
    const player = eleven[index];
    // Shirt numbers follow the position, unless the kid has already taken that one.
    const number = footballer && slot.number === footballer.number && humanSlot !== null ? FORMATION[humanSlot].number : slot.number;
    if (!player) {
      return { name: 'Trialist', shortName: 'Trialist', number, skills: skillsFor('Trialist', 'MC', 50), position: 'MC', ability: 50, nationality: 'England' };
    }
    return {
      name: player.name,
      shortName: player.shortName,
      number,
      skills: skillsFor(player.name, player.position, player.ability),
      position: player.position,
      ability: player.ability,
      nationality: player.nationality,
      age: player.age,
    };
  });
  return {
    clubId,
    name: club.name,
    shortName: club.shortName,
    code: club.code,
    kit,
    keeperColour,
    players,
  };
}
