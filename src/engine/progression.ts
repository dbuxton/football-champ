/**
 * Player development, training, ageing, the youth intake and retirement.
 *
 * Development is deliberately slow and lumpy: a 19-year-old with high potential improves over
 * seasons, not weeks, and only if they're playing and being coached. That's what makes building a
 * side from the academy feel earned.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { addDaysISO, dateToISO, parseISO, seasonLabel } from './date';
import { Attributes, Player, Position, Staff } from './types';
import { GameState, squadOf, staffOf } from './gamestate';
import {
  ageOf, buildPlayer, computeValue, makeContract, totalStats, PlayerSeed,
} from './players';
import { computeCurrentAbility } from './attributes';
import { generateName } from './generate';
import { addNews } from './news';
import { tickInjury } from './injuries';
import { settingsFor } from './difficulty';
import { GENERATED_NATIONALITY_WEIGHTS } from '../data/names';
import { autoPickTeam } from './selection';

/** Attributes each training focus pushes. */
const FOCUS_ATTRIBUTES: Record<string, (keyof Attributes)[]> = {
  None: [],
  Finishing: ['finishing', 'composure', 'longShots'],
  Passing: ['passing', 'technique', 'creativity'],
  Tackling: ['tackling', 'marking', 'positioning'],
  Fitness: ['stamina', 'naturalFitness', 'workRate'],
  Strength: ['strength', 'jumping', 'bravery'],
  Pace: ['pace', 'acceleration', 'agility'],
  Technique: ['technique', 'dribbling', 'flair'],
  Heading: ['heading', 'jumping', 'bravery'],
  Positioning: ['positioning', 'anticipation', 'decisions', 'concentration'],
  Goalkeeping: ['handling', 'reflexes', 'oneOnOnes', 'commandOfArea'],
};

const SCHEDULE_ATTRIBUTES: Record<string, (keyof Attributes)[]> = {
  Balanced: [],
  Fitness: ['stamina', 'naturalFitness', 'strength', 'pace'],
  Attacking: ['finishing', 'offTheBall', 'creativity', 'dribbling'],
  Defending: ['tackling', 'marking', 'positioning', 'concentration'],
  Tactical: ['decisions', 'teamwork', 'anticipation', 'positioning'],
  Technical: ['technique', 'passing', 'crossing', 'dribbling'],
  Light: [],
};

/** Best coach rating available at a club for a given discipline. */
function coachQuality(staff: Staff[], key: keyof Staff['attributes']): number {
  const coaches = staff.filter((s) =>
    s.role === 'Coach' || s.role === 'Assistant Manager' ||
    s.role === 'Fitness Coach' || s.role === 'Goalkeeping Coach');
  if (coaches.length === 0) return 6;
  // The best coach matters most, but depth helps.
  const sorted = coaches.map((c) => c.attributes[key]).sort((a, b) => b - a);
  return sorted[0] * 0.6 + (sorted[1] ?? sorted[0]) * 0.25 + (sorted[2] ?? sorted[0]) * 0.15;
}

/**
 * Weekly training. Runs for every club: development is a world-wide process, not a player-only
 * privilege, otherwise the human's squad would drift out of step with everyone else's.
 */
export function processWeeklyTraining(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `training:${state.date}`));
  const settings = settingsFor(state.difficulty);

  for (const club of Object.values(state.clubs)) {
    const staff = staffOf(state, club.id);
    const squad = squadOf(state, club.id);
    const isHuman = club.isPlayerControlled;

    const technical = coachQuality(staff, 'technical');
    const tactical = coachQuality(staff, 'tactical');
    const fitness = coachQuality(staff, 'fitness');
    const keeping = coachQuality(staff, 'goalkeeping');
    const facilities = club.facilities.trainingGround;

    const schedule = isHuman ? state.training.schedule : 'Balanced';
    const intensity = isHuman ? state.training.intensity : 3;

    for (const player of squad) {
      developPlayer(state, player, {
        rng,
        technical, tactical, fitness, keeping, facilities,
        schedule,
        intensity,
        focus: isHuman ? state.training.individual[player.id] ?? 'None' : 'None',
        youthBonus: isHuman ? settings.youthQuality : 1,
      });
    }
  }
}

interface TrainingContext {
  rng: Rng;
  technical: number;
  tactical: number;
  fitness: number;
  keeping: number;
  facilities: number;
  schedule: string;
  intensity: number;
  focus: string;
  youthBonus: number;
}

function developPlayer(state: GameState, player: Player, ctx: TrainingContext): void {
  const { rng } = ctx;
  const age = ageOf(player, state.date);

  // Condition recovers through the week.
  const recovery = 4 + player.attributes.naturalFitness * 0.35 - (ctx.intensity - 3) * 1.2;
  player.condition = clamp(player.condition + recovery, 0, 100);
  // Sharpness drifts down without games.
  player.matchSharpness = clamp(player.matchSharpness - 0.7, 10, 100);

  if (player.injury) return;

  // High-intensity training risks knocks.
  if (ctx.intensity >= 4 && rng.chance(0.0025 * ctx.intensity * (player.attributes.injuryProneness / 10))) {
    player.injury = {
      type: 'Training-ground knock',
      daysRemaining: rng.int(3, 12),
      totalDays: 8,
      recurring: false,
    };
    if (player.clubId && state.clubs[player.clubId]?.isPlayerControlled) {
      addNews(state, {
        category: 'injury',
        subject: `${player.shortName} injured in training`,
        body: `${player.firstName} ${player.lastName} has picked up a knock in training and will miss the next week or so. High training intensity carries this risk.`,
        relatedPlayerId: player.id,
      });
    }
    return;
  }

  // How much room is there to grow?
  const headroom = player.potentialAbility - player.currentAbility;

  // The age curve: rapid improvement to 24, a plateau, then decline from about 30.
  let ageFactor: number;
  if (age < 18) ageFactor = 1.5;
  else if (age < 21) ageFactor = 1.3;
  else if (age < 24) ageFactor = 0.9;
  else if (age < 28) ageFactor = 0.4;
  else if (age < 31) ageFactor = 0.1;
  else ageFactor = -0.5;

  const coaching = (ctx.technical + ctx.tactical + ctx.fitness) / 3;
  const coachFactor = 0.5 + coaching / 20 + ctx.facilities / 40;

  // Playing time and professionalism decide whether the potential gets realised.
  const stats = totalStats(player);
  const minutesFactor = clamp(0.55 + stats.minutes / 1800, 0.55, 1.5);
  const mentality = 0.6 + (player.attributes.professionalism + player.attributes.determination +
    player.attributes.ambition) / 60;

  const intensityFactor = 0.75 + ctx.intensity * 0.1;

  let delta = ageFactor * coachFactor * minutesFactor * mentality * intensityFactor * ctx.youthBonus * 0.16;
  if (headroom <= 0 && delta > 0) delta *= 0.08;
  delta += rng.gaussian(0, 0.12);

  if (Math.abs(delta) < 0.02) return;

  // Apply the change to real attributes, biased toward whatever is being trained.
  const emphasised = new Set<keyof Attributes>([
    ...(SCHEDULE_ATTRIBUTES[ctx.schedule] ?? []),
    ...(FOCUS_ATTRIBUTES[ctx.focus] ?? []),
  ]);

  const isKeeper = player.naturalPosition === 'GK';
  const pool = attributePoolFor(player.naturalPosition, isKeeper);

  // A handful of attributes move each week, not all of them.
  const changes = Math.max(1, Math.round(Math.abs(delta) * 6));
  for (let i = 0; i < changes; i++) {
    const key = emphasised.size > 0 && rng.chance(0.62)
      ? rng.pick([...emphasised].filter((k) => k in player.attributes) as (keyof Attributes)[])
      : rng.pick(pool);
    if (!key) continue;

    const current = player.attributes[key];
    if (delta > 0 && current < 20) {
      // Improvement gets harder the higher the attribute already is.
      if (rng.chance(clamp(1 - current / 24, 0.15, 1))) player.attributes[key] = current + 1;
    } else if (delta < 0 && current > 1) {
      // Physical attributes decline first with age; technique and mental hold up.
      const physical = ['pace', 'acceleration', 'agility', 'stamina', 'jumping', 'balance'];
      const declineChance = physical.includes(key as string) ? 0.7 : 0.25;
      if (rng.chance(declineChance)) player.attributes[key] = current - 1;
    }
  }

  // Goalkeeping coaching is its own discipline.
  if (isKeeper && ctx.keeping > 10 && delta > 0 && rng.chance(0.3)) {
    const key = rng.pick(['handling', 'reflexes', 'oneOnOnes', 'commandOfArea'] as (keyof Attributes)[]);
    if (player.attributes[key] < 20) player.attributes[key] += 1;
  }

  const newCA = computeCurrentAbility(player.attributes, player.naturalPosition);
  if (newCA !== player.currentAbility) {
    const improved = newCA > player.currentAbility;
    player.currentAbility = newCA;
    player.value = computeValue(player, state.date);

    // Tell the manager when a youngster takes a real step forward.
    if (player.clubId && state.clubs[player.clubId]?.isPlayerControlled && age <= 21 && improved) {
      // Deliberately rare — one line a season per prospect, not a weekly drip.
      if (rng.chance(0.02)) {
        addNews(state, {
          category: 'youth',
          subject: `${player.shortName} is coming on well`,
          body: `Your coaches report that ${player.firstName} ${player.lastName} has made noticeable progress in training.`,
          relatedPlayerId: player.id,
        });
      }
    }
  }
}

function attributePoolFor(position: Position, isKeeper: boolean): (keyof Attributes)[] {
  if (isKeeper) {
    return ['handling', 'reflexes', 'oneOnOnes', 'aerialAbility', 'commandOfArea', 'communication',
      'rushingOut', 'throwing', 'kicking', 'positioning', 'concentration', 'anticipation',
      'decisions', 'composure', 'agility', 'jumping', 'strength'];
  }
  const common: (keyof Attributes)[] = [
    'passing', 'technique', 'decisions', 'teamwork', 'workRate', 'stamina', 'pace', 'acceleration',
    'strength', 'balance', 'agility', 'composure', 'anticipation', 'concentration', 'positioning',
    'offTheBall', 'bravery', 'jumping', 'aggression', 'creativity', 'flair',
  ];
  const attacking: (keyof Attributes)[] = ['finishing', 'dribbling', 'longShots', 'crossing', 'heading'];
  const defensive: (keyof Attributes)[] = ['tackling', 'marking', 'heading'];

  if (['ST', 'AMC', 'AMR', 'AML', 'MR', 'ML'].includes(position)) return [...common, ...attacking];
  if (['DC', 'DR', 'DL', 'DM', 'WBR', 'WBL'].includes(position)) return [...common, ...defensive];
  return [...common, ...attacking.slice(0, 2), ...defensive.slice(0, 2)];
}

// ---------------------------------------------------------------------------------------------
// Youth intake
// ---------------------------------------------------------------------------------------------

/**
 * The March youth intake. Crop quality is driven by the academy and recruitment ratings, so
 * investing in facilities visibly pays off two or three seasons later.
 */
export function processYouthIntake(state: GameState): void {
  const settings = settingsFor(state.difficulty);

  for (const club of Object.values(state.clubs)) {
    const rng = new Rng(deriveSeed(state.rngState, `youth:${club.id}:${state.season}`));
    const academy = club.facilities.youthAcademy;
    const recruitment = club.facilities.youthRecruitment;
    const headOfYouth = staffOf(state, club.id).find((s) => s.role === 'Head of Youth');
    const judging = headOfYouth ? headOfYouth.attributes.youth : 8;

    const count = clamp(Math.round(rng.gaussian(3 + recruitment / 6, 1.2)), 1, 8);
    const intake: Player[] = [];
    const startYear = parseISO(state.date).getUTCFullYear();

    for (let i = 0; i < count; i++) {
      const position = rng.weighted(
        ['GK', 'DC', 'DR', 'DL', 'DM', 'MC', 'MR', 'ML', 'AMC', 'ST'] as Position[],
        (p) => (p === 'GK' ? 1 : p === 'DC' || p === 'MC' ? 2.2 : 1.5),
      );

      // The academy sets the ceiling, the club's own level sets the floor.
      const potentialBase = 26 + academy * 1.9 + club.reputation * 0.18;
      const potential = clamp(
        Math.round(rng.gaussian(potentialBase, 9) * (club.isPlayerControlled ? settings.youthQuality : 1)),
        18,
        94,
      );
      // Occasionally, a genuine gem.
      const gem = rng.chance(0.03 + academy * 0.004);
      const finalPotential = gem ? clamp(potential + rng.int(10, 25), 18, 96) : potential;
      const ability = clamp(Math.round(finalPotential * rng.float(0.32, 0.5)), 8, 62);

      const nationality = rng.weighted(GENERATED_NATIONALITY_WEIGHTS, ([, w]) => w)[0];
      const { first, last } = generateName(rng, nationality);

      const seed: PlayerSeed = [
        `${first} ${last}`, position, startYear - rng.int(16, 17), nationality, ability, finalPotential,
      ];
      const player = buildPlayer(seed, club.id, state.date, { homegrown: true, salt: i });
      player.contract = makeContract(player, club.reputation, state.date, 3, 'Youngster', rng);
      player.contract.wage = Math.max(300, Math.round(player.contract.wage * 0.25 / 50) * 50);
      player.value = computeValue(player, state.date);
      player.squadNumber = 0;

      state.players[player.id] = player;
      club.playerIds.push(player.id);
      intake.push(player);
    }

    if (!club.isPlayerControlled) continue;

    // The head of youth's report is only as reliable as they are.
    const best = intake.slice().sort((a, b) => b.potentialAbility - a.potentialAbility)[0];
    const confidence = judging >= 15 ? 'is convinced' : judging >= 10 ? 'believes' : 'suspects';
    const verdict = best.potentialAbility > 70
      ? 'has a genuine chance of playing at a high level'
      : best.potentialAbility > 52
        ? 'could make a career in the professional game'
        : 'is worth persevering with, but there is a long way to go';

    addNews(state, {
      category: 'youth',
      important: true,
      subject: 'Youth intake',
      body: `${intake.length} young players have joined the academy. Your Head of Youth ${confidence} that ${best.firstName} ${best.lastName} (${best.naturalPosition}) ${verdict}.`,
      relatedPlayerId: best.id,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Ageing, retirement and regens
// ---------------------------------------------------------------------------------------------

/** End-of-season ageing pass: retirements and squad churn. */
export function processRetirements(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `retire:${state.season}`));

  for (const player of Object.values(state.players)) {
    if (player.retired) continue;
    const age = ageOf(player, state.date);
    if (age < 31) continue;

    // Retirement odds rise steeply with age and fall with ability — a good 36-year-old plays on.
    const abilityFactor = clamp(1.4 - player.currentAbility / 130, 0.35, 1.5);
    const chance = clamp((age - 31) * 0.11 * abilityFactor, 0, 0.95);
    if (age >= 40) {
      player.retired = true;
    } else if (!rng.chance(chance)) {
      continue;
    }
    player.retired = true;

    const club = player.clubId ? state.clubs[player.clubId] : null;
    if (club) {
      club.playerIds = club.playerIds.filter((id) => id !== player.id);
      autoPickTeam(state, club.id);
      if (club.isPlayerControlled) {
        addNews(state, {
          category: 'squad',
          important: true,
          subject: `${player.shortName} retires`,
          body: `${player.firstName} ${player.lastName} has announced his retirement at the age of ${age} after ${player.history.length + 1} seasons in the game.`,
          relatedPlayerId: player.id,
        });
      }
    }
    player.clubId = null;
    player.contract = null;
  }

  // Replace the retired with new blood so squad sizes and the transfer market stay healthy.
  replenishFreeAgents(state, rng);
}

function replenishFreeAgents(state: GameState, rng: Rng): void {
  const active = Object.values(state.players).filter((p) => !p.retired).length;
  const target = 2400;
  const shortfall = Math.max(0, target - active);
  const startYear = parseISO(state.date).getUTCFullYear();

  for (let i = 0; i < Math.min(shortfall, 120); i++) {
    const nationality = rng.weighted(GENERATED_NATIONALITY_WEIGHTS, ([, w]) => w)[0];
    const { first, last } = generateName(rng, nationality);
    const position = rng.pick(['GK', 'DC', 'DR', 'DL', 'DM', 'MC', 'MR', 'ML', 'AMC', 'ST'] as Position[]);
    const potential = clamp(Math.round(rng.gaussian(48, 14)), 18, 90);
    const age = rng.int(18, 30);
    const ability = age > 23
      ? clamp(Math.round(potential * rng.float(0.8, 1)), 10, 90)
      : clamp(Math.round(potential * rng.float(0.4, 0.75)), 10, 90);

    const player = buildPlayer(
      [`${first} ${last}`, position, startYear - age, nationality, ability, potential],
      null,
      state.date,
      { salt: i },
    );
    state.players[player.id] = player;
  }
}

/** Archive this season's statistics into each player's career history, then reset. */
export function archiveSeasonStats(state: GameState): void {
  for (const player of Object.values(state.players)) {
    const total = totalStats(player);
    if (total.appearances + total.substituteAppearances > 0) {
      const club = player.clubId ? state.clubs[player.clubId] : null;
      const apps = total.appearances + total.substituteAppearances;
      player.history.push({
        season: state.season,
        clubId: club?.id ?? '',
        clubName: club?.name ?? 'Free agent',
        competitionName: club ? state.competitions[club.leagueId]?.name ?? '' : '',
        appearances: apps,
        goals: total.goals,
        assists: total.assists,
        averageRating: Math.round((total.ratingSum / apps) * 100) / 100,
      });
      if (player.history.length > 25) player.history.shift();
    }
    player.stats = [];
    player.bookingPoints = 0;
    player.suspensionMatches = 0;
    player.form = [];
    player.condition = 90;
    player.matchSharpness = 55;
  }
}

/** Daily injury recovery for every injured player in the world. */
export function processDailyRecovery(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `recovery:${state.date}`));
  for (const player of Object.values(state.players)) {
    if (!player.injury) continue;
    const club = player.clubId ? state.clubs[player.clubId] : null;
    const physios = club ? staffOf(state, club.id).filter((s) => s.role === 'Physio') : [];
    const physioQuality = physios.length
      ? Math.max(...physios.map((p) => p.attributes.physiotherapy)) + (club?.facilities.medical ?? 8)
      : 8;

    if (tickInjury(player, physioQuality, rng) && club?.isPlayerControlled) {
      addNews(state, {
        category: 'injury',
        subject: `${player.shortName} is fit again`,
        body: `${player.firstName} ${player.lastName} has recovered and is available for selection, though he will need games to regain match sharpness.`,
        relatedPlayerId: player.id,
      });
      autoPickTeam(state, club.id);
    }
  }
}

/** Squad morale drifts based on playing time and squad status promises. */
export function processMorale(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `morale:${state.date}`));
  const settings = settingsFor(state.difficulty);

  for (const club of Object.values(state.clubs)) {
    const squad = squadOf(state, club.id);
    const isHuman = club.isPlayerControlled;
    const decay = isHuman ? settings.moraleDecay : 1;

    for (const player of squad) {
      const stats = totalStats(player);
      const status = player.contract?.squadStatus ?? 'Rotation';
      const expectedMinutes: Record<string, number> = {
        'Key Player': 75, 'First Team': 55, Rotation: 30, Backup: 12,
        'Hot Prospect': 15, Youngster: 5,
      };
      const gamesPlayed = Math.max(1, stats.appearances + stats.substituteAppearances);
      const share = (stats.minutes / gamesPlayed / 90) * 100;

      // Only start judging once there have been enough games to judge.
      if (stats.appearances + stats.substituteAppearances < 4) continue;

      const gap = share - (expectedMinutes[status] ?? 30);
      const drift = clamp(gap * 0.008, -0.6, 0.4);
      player.morale = clamp(player.morale + (drift < 0 ? drift * decay : drift), 5, 100);

      // A deeply unhappy first-teamer will ask to leave.
      if (isHuman && player.morale < 22 && !player.transferListed && rng.chance(0.02)) {
        player.transferListed = true;
        addNews(state, {
          category: 'squad',
          important: true,
          subject: `${player.shortName} has handed in a transfer request`,
          body: `${player.firstName} ${player.lastName} is unhappy with his lack of playing time and has asked to leave. You can reject the request, but it will not improve his mood.`,
          action: { kind: 'player-unhappy', playerId: player.id },
          relatedPlayerId: player.id,
        });
      }
    }
  }
}

/** Squad harmony 0-100, shown on the squad screen. */
export function squadMorale(state: GameState, clubId: string): number {
  const squad = squadOf(state, clubId);
  if (squad.length === 0) return 50;
  return Math.round(squad.reduce((sum, p) => sum + p.morale, 0) / squad.length);
}

/** End-of-season promotion of the best academy players into the senior squad. */
export function promoteYouthPlayers(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `promote:${state.season}`));
  for (const club of Object.values(state.clubs)) {
    if (club.isPlayerControlled) continue;
    const squad = squadOf(state, club.id);
    const youngsters = squad.filter((p) => ageOf(p, state.date) <= 19);
    for (const player of youngsters) {
      if (player.currentAbility > squad.reduce((s, p) => s + p.currentAbility, 0) / squad.length * 0.8 &&
          rng.chance(0.3) && player.contract) {
        player.contract.squadStatus = 'Hot Prospect';
      }
    }
  }
}

export function dateOfBirthLabel(player: Player, currentDate: string): string {
  return `${dateToISO(parseISO(player.birthDate))} (${ageOf(player, currentDate)})`;
}

/** Contract expiry helper used by several screens. */
export function contractExpiryLabel(player: Player, currentDate: string): string {
  if (!player.contract) return 'Free agent';
  const months = Math.round(
    (parseISO(player.contract.expires).getTime() - parseISO(currentDate).getTime()) / (86_400_000 * 30.44),
  );
  if (months <= 0) return 'Expired';
  if (months < 12) return `${player.contract.expires} (${months} mth)`;
  return player.contract.expires;
}

export function seasonOf(state: GameState): string {
  return seasonLabel(state.date);
}

export function nextSeasonStart(state: GameState): string {
  return addDaysISO(state.date, 30);
}
