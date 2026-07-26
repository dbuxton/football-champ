/**
 * The match engine.
 *
 * Not a coin flip weighted by team rating: a minute-by-minute possession model where individual
 * players are the actors. Each minute one side has the ball, tries to progress it, and may create
 * a chance whose quality depends on who is involved; the chance then resolves into a goal, a save,
 * a block, the woodwork or nothing. Goalscorers, assists and ratings all fall out of that rather
 * than being assigned afterwards, which is what makes a season's statistics look like football.
 *
 * The simulation is stepped a minute at a time so the UI can drive it live, with substitutions and
 * tactical changes applied between steps — exactly how the classic match screen worked.
 */

import { Rng, clamp } from './rng';
import {
  CommentaryLine, Fixture, MatchEvent, MatchResult, MatchTeamStats, Player, Position,
  POSITION_COORDS, Tactics, Weather,
} from './types';
import { GameState, getClub } from './gamestate';
import { matchEffectiveness, isAvailable } from './players';
import { ROLE_PROFILES, mentalityValue, formationByName } from './formations';
import { line, pickReferee } from './commentary';
import { settingsFor, guardrailBoost, DifficultySettings } from './difficulty';

// ---------------------------------------------------------------------------------------------
// Per-match player and team state
// ---------------------------------------------------------------------------------------------

export interface MatchPlayer {
  player: Player;
  position: Position;
  role: string;
  /** 0..1 contribution, recomputed as condition drains. */
  effectiveness: number;
  /** Condition within this match, starts at the player's current condition. */
  condition: number;
  onPitch: boolean;
  minutesPlayed: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  yellow: number;
  red: boolean;
  saves: number;
  tackles: number;
  /** Set when forced off injured. */
  injured: boolean;
}

export interface MatchTeam {
  clubId: string;
  name: string;
  shortName: string;
  colors: { primary: string; secondary: string; text: string };
  tactics: Tactics;
  onPitch: MatchPlayer[];
  bench: MatchPlayer[];
  stats: MatchTeamStats;
  subsUsed: number;
  isHuman: boolean;
  /** Cached phase strengths, refreshed whenever the side changes. */
  strength: TeamStrength;
  /** Difficulty bias applied to this side. */
  bias: { attack: number; defence: number; conversion: number };
}

interface TeamStrength {
  defence: number;
  midfield: number;
  buildUp: number;
  creation: number;
  finishing: number;
  aerial: number;
  keeper: number;
  discipline: number;
}

function emptyStats(): MatchTeamStats {
  return {
    shots: 0, shotsOnTarget: 0, possession: 50, corners: 0, fouls: 0, offsides: 0,
    yellowCards: 0, redCards: 0, passes: 0, passesCompleted: 0, tackles: 0, saves: 0, xg: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Team construction
// ---------------------------------------------------------------------------------------------

function buildMatchPlayer(player: Player, position: Position, role: string): MatchPlayer {
  return {
    player,
    position,
    role,
    effectiveness: matchEffectiveness(player, position),
    condition: player.condition,
    onPitch: false,
    minutesPlayed: 0,
    rating: 6.5,
    goals: 0,
    assists: 0,
    shots: 0,
    yellow: 0,
    red: false,
    saves: 0,
    tackles: 0,
    injured: false,
  };
}

/**
 * Tactical multipliers. These are the levers the manager actually pulls, so they need to matter
 * without being so sharp that one setting dominates.
 */
function tacticalModifiers(tactics: Tactics) {
  const mentality = mentalityValue(tactics);

  const tempo = { Slow: -0.06, Normal: 0, Fast: 0.08 }[tactics.tempo];
  const pressingAttack = { Deep: -0.05, Standard: 0, High: 0.06, Gegenpress: 0.11 }[tactics.pressing];
  const pressingDefence = { Deep: 0.08, Standard: 0, High: -0.05, Gegenpress: -0.1 }[tactics.pressing];
  const lineDefence = { Deep: 0.07, Normal: 0, High: -0.06 }[tactics.defensiveLine];
  const lineAttack = { Deep: -0.05, Normal: 0, High: 0.06 }[tactics.defensiveLine];

  return {
    // Attacking output rises with mentality, tempo and pressing; defensive solidity falls.
    attack: 1 + mentality * 0.55 + tempo + pressingAttack + lineAttack,
    defence: 1 - mentality * 0.42 + pressingDefence + lineDefence,
    // A high tempo and a direct style create more chances but of lower average quality.
    chanceQuality: 1 - (tactics.tempo === 'Fast' ? 0.06 : 0) -
      (tactics.passingStyle === 'Long Ball' ? 0.1 : tactics.passingStyle === 'Direct' ? 0.04 : 0) +
      (tactics.passingStyle === 'Short' ? 0.05 : 0),
    // Width feeds crossing and therefore headed chances.
    aerial: tactics.width === 'Wide' ? 1.12 : tactics.width === 'Narrow' ? 0.9 : 1,
    // Aggressive tackling wins the ball back more often, at the cost of cards.
    tackling: { Cautious: 0.9, Normal: 1, Hard: 1.12 }[tactics.tackling],
    cardRisk: { Cautious: 0.7, Normal: 1, Hard: 1.45 }[tactics.tackling] *
      (tactics.pressing === 'Gegenpress' ? 1.2 : 1),
    counter: tactics.counterAttack ? 1.08 : 1,
    offsideTrap: tactics.offsideTrap,
    timeWasting: tactics.timeWasting / 20,
  };
}

/** Sum each phase of play across the eleven on the pitch. */
function computeStrength(team: MatchTeam): TeamStrength {
  const mods = tacticalModifiers(team.tactics);
  const strength: TeamStrength = {
    defence: 0, midfield: 0, buildUp: 0, creation: 0, finishing: 0, aerial: 0, keeper: 0,
    discipline: 0,
  };

  for (const mp of team.onPitch) {
    if (!mp.onPitch || mp.red) continue;
    const profile = ROLE_PROFILES[mp.role as keyof typeof ROLE_PROFILES] ?? ROLE_PROFILES['Box to Box'];
    const eff = mp.effectiveness * (0.55 + 0.45 * (mp.condition / 100));
    const attrs = mp.player.attributes;

    if (mp.position === 'GK') {
      strength.keeper = eff * (attrs.reflexes + attrs.handling + attrs.oneOnOnes + attrs.positioning) / 4 / 20;
      strength.buildUp += eff * profile.buildUp * 0.3;
      continue;
    }

    // Defensive contribution is weighted by how deep the role sits.
    const depth = 1 - clamp((POSITION_COORDS[mp.position].y - 0.05) / 0.8, 0, 1);
    strength.defence += eff * profile.defending * (0.35 + depth * 0.9) *
      (attrs.tackling + attrs.marking + attrs.positioning + attrs.anticipation) / 4 / 20;

    // Midfield control decides who has the ball.
    const central = 1 - Math.abs(POSITION_COORDS[mp.position].x - 0.5) * 1.2;
    strength.midfield += eff * (0.4 + central * 0.8) *
      (attrs.passing + attrs.teamwork + attrs.workRate + attrs.decisions) / 4 / 20;

    strength.buildUp += eff * profile.buildUp * (attrs.passing + attrs.technique + attrs.composure) / 3 / 20;
    strength.creation += eff * profile.creation * (attrs.creativity + attrs.passing + attrs.dribbling + attrs.flair) / 4 / 20;
    strength.finishing += eff * profile.finishing * (attrs.finishing + attrs.composure + attrs.offTheBall) / 3 / 20;
    strength.aerial += eff * (attrs.jumping + attrs.heading + mp.player.height / 12) / 3 / 20;
    strength.discipline += (20 - attrs.dirtiness) / 20 + attrs.aggression / 40;
  }

  strength.defence *= mods.defence * mods.tackling;
  strength.creation *= mods.attack;
  strength.finishing *= mods.attack;
  strength.aerial *= mods.aerial;
  strength.midfield *= 1 + (mods.attack - 1) * 0.3;

  // A keeper of zero means somebody outfield is in goal — punish it, but don't make it fatal.
  if (strength.keeper === 0) strength.keeper = 0.22;

  return strength;
}

function refreshStrength(team: MatchTeam): void {
  team.strength = computeStrength(team);
}

/**
 * How often the defending side's line catches an attacker offside. Running a trap catches more
 * attackers but is also why the line gets played through — that trade-off lives in the chance
 * probability above, not here.
 */
function offsideTrapChance(defending: MatchTeam): number {
  const base = 0.07;
  if (!defending.tactics.offsideTrap) return base;
  // A well-drilled back line runs the trap far better than a poorly organised one.
  const organisation = defending.onPitch
    .filter((mp) => mp.onPitch && mp.position.startsWith('D'))
    .reduce((sum, mp) => sum + mp.player.attributes.positioning + mp.player.attributes.teamwork, 0);
  const drilled = clamp(organisation / 8 / 20, 0.3, 1);
  return base + 0.06 * drilled;
}

/** Weather effects: rain and wind degrade technique and increase errors. */
function weatherModifier(weather: Weather | undefined): { quality: number; error: number } {
  switch (weather) {
    case 'Rain': return { quality: 0.96, error: 1.12 };
    case 'Heavy Rain': return { quality: 0.9, error: 1.3 };
    case 'Snow': return { quality: 0.87, error: 1.35 };
    case 'Windy': return { quality: 0.94, error: 1.18 };
    default: return { quality: 1, error: 1 };
  }
}

// ---------------------------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------------------------

export interface MatchOptions {
  /** Allow extra time and penalties when the tie needs a winner. */
  needsWinner?: boolean;
  /** Aggregate carried in from the first leg, from the home side's perspective. */
  aggregate?: { home: number; away: number };
  /** Consecutive league defeats for the human, feeding the Easy-mode guardrail. */
  humanDefeatStreak?: number;
}

export class MatchSim {
  readonly home: MatchTeam;
  readonly away: MatchTeam;
  readonly fixture: Fixture;
  readonly rng: Rng;
  readonly referee: string;
  readonly venue: string;
  readonly attendance: number;

  minute = 0;
  homeGoals = 0;
  awayGoals = 0;
  addedTime = 0;
  events: MatchEvent[] = [];
  commentary: CommentaryLine[] = [];
  finished = false;
  inExtraTime = false;
  shootout: { home: number; away: number } | null = null;

  private homePossessionMinutes = 0;
  private totalPossessionMinutes = 0;
  private lastCommentaryMinute = -1;
  private options: MatchOptions;
  private weather: ReturnType<typeof weatherModifier>;

  constructor(state: GameState, fixture: Fixture, rng: Rng, options: MatchOptions = {}) {
    this.fixture = fixture;
    this.rng = rng;
    this.options = options;
    this.referee = pickReferee(rng);

    const settings = settingsFor(state.difficulty);
    this.home = this.makeTeam(state, fixture.homeClubId, true, settings, options);
    this.away = this.makeTeam(state, fixture.awayClubId, false, settings, options);

    const homeClub = getClub(state, fixture.homeClubId);
    this.venue = fixture.neutralVenue ?? homeClub.stadiumName;
    this.attendance = fixture.attendance ?? estimateAttendance(state, fixture);
    this.weather = weatherModifier(fixture.weather);

    refreshStrength(this.home);
    refreshStrength(this.away);

    this.push(0, 'kickoff', 'neutral', line(rng, 'kickoff', {
      venue: this.venue, home: this.home.name, away: this.away.name, referee: this.referee,
    }), { x: 0.5, y: 0.5 }, true);
  }

  private makeTeam(
    state: GameState,
    clubId: string,
    isHome: boolean,
    settings: DifficultySettings,
    options: MatchOptions,
  ): MatchTeam {
    const club = getClub(state, clubId);
    const isHuman = club.isPlayerControlled;
    const formation = formationByName(club.tactics.formationName);

    const onPitch: MatchPlayer[] = [];
    club.tactics.slots.forEach((slot, index) => {
      const position = formation.slots[index] ?? slot.position;
      const player = slot.playerId ? state.players[slot.playerId] : null;
      if (!player || !isAvailable(player)) return;
      const mp = buildMatchPlayer(player, position, slot.role);
      mp.onPitch = true;
      onPitch.push(mp);
    });

    const bench: MatchPlayer[] = [];
    for (const id of club.tactics.bench) {
      if (!id) continue;
      const player = state.players[id];
      if (!player || !isAvailable(player)) continue;
      if (onPitch.some((mp) => mp.player.id === id)) continue;
      bench.push(buildMatchPlayer(player, player.naturalPosition, 'Box to Box'));
    }

    // Home advantage: a real and well-documented effect, worth roughly a third of a goal.
    const homeAttack = isHome ? 1.11 : 1;
    const homeDefence = isHome ? 1.07 : 1;

    const guardrail = isHuman ? guardrailBoost(settings, options.humanDefeatStreak ?? 0) : 1;

    return {
      clubId,
      name: club.name,
      shortName: club.shortName,
      colors: club.colors,
      tactics: club.tactics,
      onPitch,
      bench,
      stats: emptyStats(),
      subsUsed: 0,
      isHuman,
      strength: { defence: 0, midfield: 0, buildUp: 0, creation: 0, finishing: 0, aerial: 0, keeper: 0, discipline: 0 },
      bias: {
        attack: homeAttack * (isHuman ? settings.attackBonus * guardrail : 1),
        defence: homeDefence * (isHuman ? settings.defenceBonus : 1),
        conversion: isHuman ? settings.conversionBonus : 0,
      },
    };
  }

  // -------------------------------------------------------------------------------------------
  // Stepping
  // -------------------------------------------------------------------------------------------

  get regulationEnd(): number {
    return this.inExtraTime ? 120 : 90;
  }

  get isComplete(): boolean {
    return this.finished;
  }

  /** Advance one minute. The UI calls this on a timer; `simulateToEnd` calls it in a loop. */
  step(): void {
    if (this.finished) return;
    this.minute += 1;

    if (this.minute === 46) {
      this.push(45, 'half-time', 'neutral', line(this.rng, 'halfTime', this.scoreVars()), { x: 0.5, y: 0.5 }, true);
      this.push(46, 'kickoff', 'neutral', line(this.rng, 'secondHalf', { venue: this.venue }), { x: 0.5, y: 0.5 }, false);
      this.halfTimeRecovery();
    }

    if (this.minute > this.regulationEnd + this.addedTime) {
      this.endOfPeriod();
      return;
    }

    this.simulateMinute();
    this.aiSubstitutions();
  }

  /** Run the whole match, including extra time and penalties if required. */
  simulateToEnd(): void {
    let guard = 0;
    while (!this.finished && guard < 400) {
      this.step();
      guard += 1;
    }
  }

  private endOfPeriod(): void {
    if (!this.inExtraTime && this.minute > 90 + this.addedTime) {
      const needsWinner = this.options.needsWinner ?? false;
      const agg = this.options.aggregate;
      const homeAgg = this.homeGoals + (agg?.home ?? 0);
      const awayAgg = this.awayGoals + (agg?.away ?? 0);

      if (needsWinner && homeAgg === awayAgg) {
        this.inExtraTime = true;
        this.addedTime = this.rng.int(1, 3);
        this.push(90, 'extra-time', 'neutral', line(this.rng, 'extraTime', {}), { x: 0.5, y: 0.5 }, true);
        this.halfTimeRecovery(0.35);
        return;
      }
      this.finish();
      return;
    }

    if (this.inExtraTime) {
      const agg = this.options.aggregate;
      const homeAgg = this.homeGoals + (agg?.home ?? 0);
      const awayAgg = this.awayGoals + (agg?.away ?? 0);
      if (homeAgg === awayAgg) {
        this.penaltyShootout();
      }
      this.finish();
      return;
    }

    this.finish();
  }

  private finish(): void {
    this.finished = true;
    this.push(this.regulationEnd, 'full-time', 'neutral', line(this.rng, 'fullTime', this.scoreVars()), { x: 0.5, y: 0.5 }, true);
    for (const team of [this.home, this.away]) {
      for (const mp of team.onPitch) {
        if (mp.onPitch && !mp.red) mp.minutesPlayed = Math.min(this.regulationEnd, this.minute);
      }
    }
    const total = Math.max(1, this.totalPossessionMinutes);
    this.home.stats.possession = Math.round((this.homePossessionMinutes / total) * 100);
    this.away.stats.possession = 100 - this.home.stats.possession;
  }

  private halfTimeRecovery(factor = 1): void {
    for (const team of [this.home, this.away]) {
      for (const mp of team.onPitch) {
        if (!mp.onPitch) continue;
        // Natural fitness determines how much of a breather the interval actually is.
        mp.condition = Math.min(100, mp.condition + (2 + mp.player.attributes.naturalFitness * 0.22) * factor);
      }
    }
    refreshStrength(this.home);
    refreshStrength(this.away);
  }

  // -------------------------------------------------------------------------------------------
  // Minute simulation
  // -------------------------------------------------------------------------------------------

  private simulateMinute(): void {
    const home = this.home;
    const away = this.away;

    // Fatigue.
    this.drainCondition(home);
    this.drainCondition(away);

    // Possession for this minute.
    const homeMid = home.strength.midfield * home.bias.attack;
    const awayMid = away.strength.midfield * away.bias.attack;
    const homeHasBall = this.rng.next() < homeMid / Math.max(0.001, homeMid + awayMid);
    this.totalPossessionMinutes += 1;
    if (homeHasBall) this.homePossessionMinutes += 1;

    const attacking = homeHasBall ? home : away;
    const defending = homeHasBall ? away : home;
    const side: 'home' | 'away' = homeHasBall ? 'home' : 'away';

    // Passing volume, so the stats screen has something believable in it.
    const passes = this.rng.int(6, 16);
    attacking.stats.passes += passes;
    attacking.stats.passesCompleted += Math.round(
      passes * clamp(0.6 + attacking.strength.buildUp * 0.08 * this.weather.quality, 0.45, 0.94),
    );

    // Does this possession turn into a chance?
    const attackPower = (attacking.strength.creation + attacking.strength.buildUp * 0.35) *
      attacking.bias.attack;
    const defencePower = (defending.strength.defence + defending.strength.keeper * 0.25) *
      defending.bias.defence;

    // Calibrated so a league season lands near the real rates: ~24 shots and ~2.7 goals a game.
    const chanceProb = clamp(
      0.58 * (attackPower / Math.max(0.5, attackPower + defencePower * 0.95)),
      0.03,
      0.62,
    );

    // Fouls and cards happen whether or not a chance materialises.
    this.maybeFoul(defending, attacking, side === 'home' ? 'away' : 'home');
    this.maybeInjury(attacking, side);
    this.maybeInjury(defending, side === 'home' ? 'away' : 'home');

    if (!this.rng.chance(chanceProb)) {
      this.maybeAmbientCommentary(attacking, side);
      return;
    }

    // Offside and corners intercept some attacks before they become shots.
    if (this.rng.chance(offsideTrapChance(defending))) {
      const victim = this.pickAttacker(attacking);
      attacking.stats.offsides += 1;
      this.push(this.minute, 'offside', side,
        line(this.rng, 'offside', { player: victim.player.shortName }),
        this.ballAt(side, 0.75), false);
      return;
    }

    if (this.rng.chance(0.16)) {
      attacking.stats.corners += 1;
      this.push(this.minute, 'corner', side,
        line(this.rng, 'corner', { team: attacking.shortName }),
        this.ballAt(side, 0.92), false);
      // Corners are chances in their own right, mostly aerial ones.
      if (this.rng.chance(0.14)) this.resolveChance(attacking, defending, side, true);
      return;
    }

    this.resolveChance(attacking, defending, side, false);
  }

  private drainCondition(team: MatchTeam): void {
    for (const mp of team.onPitch) {
      if (!mp.onPitch || mp.red) continue;
      mp.minutesPlayed += 1;
      const stamina = mp.player.attributes.stamina;
      const intensity = team.tactics.pressing === 'Gegenpress' ? 1.35
        : team.tactics.pressing === 'High' ? 1.15
        : team.tactics.pressing === 'Deep' ? 0.9 : 1;
      const drain = (0.45 - stamina * 0.012) * intensity;
      mp.condition = Math.max(12, mp.condition - Math.max(0.06, drain));
      mp.effectiveness = matchEffectiveness(mp.player, mp.position) * (0.6 + 0.4 * (mp.condition / 100));
    }
    // Strength is recomputed every few minutes rather than every minute — the difference is
    // negligible and this is the hot loop in a 10-season soak test.
    if (this.minute % 5 === 0) refreshStrength(team);
  }

  /** Resolve a chance into a shot and its outcome. */
  private resolveChance(
    attacking: MatchTeam,
    defending: MatchTeam,
    side: 'home' | 'away',
    fromCorner: boolean,
  ): void {
    const shooter = this.pickAttacker(attacking, fromCorner);
    const creator = this.pickCreator(attacking, shooter);
    const keeper = defending.onPitch.find((mp) => mp.position === 'GK' && mp.onPitch && !mp.red);
    const mods = tacticalModifiers(attacking.tactics);

    // Chance quality (expected goals) from the shooter, the supply and the defence.
    const attrs = shooter.player.attributes;
    const isHeader = fromCorner || (mods.aerial > 1 && this.rng.chance(0.18));
    const longRange = !fromCorner && this.rng.chance(0.2);

    let xg = 0.122;
    xg *= 0.7 + (attacking.strength.creation / Math.max(0.5, attacking.strength.creation + defending.strength.defence)) * 1.2;
    xg *= mods.chanceQuality * this.weather.quality;
    if (isHeader) xg *= 0.72;
    if (longRange) xg *= 0.42;
    if (creator) xg *= 1 + (creator.player.attributes.creativity - 10) * 0.012;
    xg = clamp(xg, 0.015, 0.62);

    attacking.stats.shots += 1;
    attacking.stats.xg += xg;
    shooter.shots += 1;

    // Announce the chance before resolving it, so the feed reads like a match.
    if (xg > 0.16) {
      this.push(this.minute, 'chance', side, line(this.rng, 'chance', {
        player: shooter.player.shortName,
        creator: creator?.player.shortName ?? shooter.player.shortName,
      }), this.ballAt(side, 0.82), false);
    }

    // Blocked?
    if (this.rng.chance(clamp(0.16 + defending.strength.defence * 0.02, 0.1, 0.3))) {
      const blocker = this.pickDefender(defending);
      blocker.tackles += 1;
      defending.stats.tackles += 1;
      this.push(this.minute, 'shot', side, line(this.rng, 'blocked', {
        player: shooter.player.shortName, defender: blocker.player.shortName,
      }), this.ballAt(side, 0.86), false);
      return;
    }

    // On target?
    const accuracy = clamp(
      0.34 + (attrs.finishing + attrs.technique + attrs.composure) / 3 / 20 * 0.4 -
        (longRange ? 0.1 : 0) + (fromCorner ? -0.04 : 0),
      0.24,
      0.72,
    );
    if (!this.rng.chance(accuracy)) {
      if (this.rng.chance(0.07)) {
        this.push(this.minute, 'woodwork', side,
          line(this.rng, 'woodwork', { player: shooter.player.shortName }),
          this.ballAt(side, 0.94), true);
        shooter.rating += 0.15;
      } else {
        this.push(this.minute, 'shot', side,
          line(this.rng, 'offTarget', { player: shooter.player.shortName }),
          this.ballAt(side, 0.9), false);
        shooter.rating -= 0.08;
      }
      return;
    }

    attacking.stats.shotsOnTarget += 1;

    // Goal or save. The keeper's quality is a direct, meaningful subtraction here.
    const keeperQuality = keeper
      ? (keeper.player.attributes.reflexes + keeper.player.attributes.handling +
         keeper.player.attributes.oneOnOnes + keeper.player.attributes.positioning) / 4 / 20 *
        (0.6 + 0.4 * (keeper.condition / 100))
      : 0.25;

    const conversion = clamp(
      xg / accuracy * (1.25 - keeperQuality * 0.5) + attacking.bias.conversion,
      0.02,
      0.85,
    );

    if (this.rng.chance(conversion)) {
      this.scoreGoal(attacking, side, shooter, creator, isHeader, longRange);
    } else if (keeper) {
      keeper.saves += 1;
      keeper.rating += 0.12 + xg * 0.6;
      defending.stats.saves += 1;
      this.push(this.minute, 'save', side, line(this.rng, 'save', {
        keeper: keeper.player.shortName, player: shooter.player.shortName,
      }), this.ballAt(side, 0.95), xg > 0.25);
    }
  }

  private scoreGoal(
    attacking: MatchTeam,
    side: 'home' | 'away',
    shooter: MatchPlayer,
    creator: MatchPlayer | null,
    isHeader: boolean,
    longRange: boolean,
  ): void {
    if (side === 'home') this.homeGoals += 1;
    else this.awayGoals += 1;

    shooter.goals += 1;
    shooter.rating += 1.05;
    if (creator && creator !== shooter) {
      creator.assists += 1;
      creator.rating += 0.6;
    }

    // Everyone on the pitch gets a small lift; the keeper conceding takes a small hit.
    const defending = side === 'home' ? this.away : this.home;
    for (const mp of attacking.onPitch) if (mp.onPitch) mp.rating += 0.12;
    for (const mp of defending.onPitch) {
      if (!mp.onPitch) continue;
      mp.rating -= mp.position === 'GK' ? 0.28 : 0.14;
    }

    const bucket = isHeader ? 'headerGoal' : longRange ? 'longRangeGoal' : creator ? 'goalAssisted' : 'goal';
    this.push(this.minute, 'goal', side, line(this.rng, bucket, {
      ...this.scoreVars(),
      player: shooter.player.shortName,
      creator: creator?.player.shortName ?? '',
    }), this.ballAt(side, 1), true, shooter.player.id, creator?.player.id);
  }

  // -------------------------------------------------------------------------------------------
  // Fouls, cards, injuries
  // -------------------------------------------------------------------------------------------

  private maybeFoul(defending: MatchTeam, attacking: MatchTeam, side: 'home' | 'away'): void {
    const mods = tacticalModifiers(defending.tactics);
    const foulProb = 0.24 * mods.cardRisk * this.weather.error;
    if (!this.rng.chance(foulProb)) return;

    const offender = this.pickDefender(defending);
    defending.stats.fouls += 1;
    this.push(this.minute, 'foul', side, line(this.rng, 'foul', {
      team: attacking.shortName, player: offender.player.shortName,
    }), this.ballAt(side === 'home' ? 'away' : 'home', 0.6), false);

    // Card risk scales with dirtiness, aggression and the tackling instruction. A player already
    // on a yellow visibly pulls out of challenges, which is why second bookings are rare.
    const alreadyBooked = offender.yellow > 0 ? 0.32 : 1;
    const cardProb = clamp(
      0.16 * mods.cardRisk * alreadyBooked *
        (0.6 + offender.player.attributes.dirtiness / 20) *
        (0.7 + offender.player.attributes.aggression / 25),
      0.01,
      0.4,
    );
    if (!this.rng.chance(cardProb)) return;

    // Straight reds are rare; second yellows are the common route to ten men.
    if (this.rng.chance(0.025)) {
      offender.red = true;
      offender.onPitch = false;
      defending.stats.redCards += 1;
      offender.rating -= 2.2;
      this.push(this.minute, 'red', side === 'home' ? 'away' : 'home', line(this.rng, 'red', {
        player: offender.player.shortName, team: defending.shortName,
      }), this.ballAt(side, 0.5), true, offender.player.id);
      refreshStrength(defending);
      return;
    }

    offender.yellow += 1;
    offender.rating -= 0.25;
    defending.stats.yellowCards += 1;
    if (offender.yellow >= 2) {
      offender.red = true;
      offender.onPitch = false;
      defending.stats.redCards += 1;
      this.push(this.minute, 'second-yellow', side === 'home' ? 'away' : 'home',
        line(this.rng, 'secondYellow', { player: offender.player.shortName, team: defending.shortName }),
        this.ballAt(side, 0.5), true, offender.player.id);
      refreshStrength(defending);
    } else {
      this.push(this.minute, 'yellow', side === 'home' ? 'away' : 'home',
        line(this.rng, 'yellow', { player: offender.player.shortName }),
        this.ballAt(side, 0.5), false, offender.player.id);
    }
  }

  private maybeInjury(team: MatchTeam, side: 'home' | 'away'): void {
    // Roughly one injury per eight team-matches, modulated by proneness, fatigue and the pitch.
    const candidates = team.onPitch.filter((mp) => mp.onPitch && !mp.red && !mp.injured);
    if (candidates.length === 0) return;
    const victim = this.rng.pick(candidates);
    const proneness = victim.player.attributes.injuryProneness / 10;
    const fatigue = 1 + (100 - victim.condition) / 90;
    const prob = 0.0009 * proneness * fatigue * this.weather.error;
    if (!this.rng.chance(prob)) return;

    victim.injured = true;
    this.push(this.minute, 'injury', side, line(this.rng, 'injury', {
      player: victim.player.shortName, team: team.shortName,
    }), this.ballAt(side, 0.4), true, victim.player.id);
  }

  // -------------------------------------------------------------------------------------------
  // Substitutions
  // -------------------------------------------------------------------------------------------

  /** Make a substitution. Returns false if it isn't legal. */
  substitute(teamSide: 'home' | 'away', offPlayerId: string, onPlayerId: string): boolean {
    const team = teamSide === 'home' ? this.home : this.away;
    if (team.subsUsed >= 5) return false;

    const off = team.onPitch.find((mp) => mp.player.id === offPlayerId && mp.onPitch);
    const on = team.bench.find((mp) => mp.player.id === onPlayerId);
    if (!off || !on) return false;

    off.onPitch = false;
    on.onPitch = true;
    on.position = off.position;
    on.role = off.role;
    on.effectiveness = matchEffectiveness(on.player, on.position);
    team.onPitch.push(on);
    team.bench.splice(team.bench.indexOf(on), 1);
    team.subsUsed += 1;

    this.push(this.minute, 'substitution', teamSide, line(this.rng, 'substitution', {
      team: team.shortName, playerOn: on.player.shortName, playerOff: off.player.shortName,
    }), { x: 0.5, y: 0.5 }, false, on.player.id, off.player.id);

    refreshStrength(team);
    return true;
  }

  /** AI substitutions: injuries first, then tiredness, then chasing or protecting a result. */
  private aiSubstitutions(): void {
    for (const [side, team] of [['home', this.home], ['away', this.away]] as const) {
      if (team.isHuman) continue;
      this.autoSubstitute(side, team);
    }
  }

  /** Also exposed so a human manager can hand the bench to the assistant. */
  autoSubstitute(side: 'home' | 'away', team: MatchTeam): void {
    if (team.subsUsed >= 5 || team.bench.length === 0) return;

    const injured = team.onPitch.find((mp) => mp.onPitch && mp.injured);
    if (injured) {
      const replacement = this.bestReplacement(team, injured.position);
      if (replacement) this.substitute(side, injured.player.id, replacement.player.id);
      return;
    }

    if (this.minute < 55) return;

    // One change per minute at most, and only if there's a real reason.
    const exhausted = team.onPitch
      .filter((mp) => mp.onPitch && mp.position !== 'GK' && mp.condition < 62)
      .sort((a, b) => a.condition - b.condition)[0];

    if (exhausted && this.rng.chance(0.28)) {
      const replacement = this.bestReplacement(team, exhausted.position);
      if (replacement && replacement.effectiveness > exhausted.effectiveness * 0.85) {
        this.substitute(side, exhausted.player.id, replacement.player.id);
      }
      return;
    }

    // Chasing the game: throw on an attacker for a defensive player.
    const deficit = side === 'home' ? this.awayGoals - this.homeGoals : this.homeGoals - this.awayGoals;
    if (deficit > 0 && this.minute > 65 && this.rng.chance(0.2)) {
      const attacker = team.bench
        .filter((mp) => ['ST', 'AMC', 'AMR', 'AML'].includes(mp.player.naturalPosition))
        .sort((a, b) => b.player.currentAbility - a.player.currentAbility)[0];
      const defender = team.onPitch
        .filter((mp) => mp.onPitch && ['DC', 'DM', 'DR', 'DL'].includes(mp.position))
        .sort((a, b) => a.effectiveness - b.effectiveness)[0];
      if (attacker && defender) this.substitute(side, defender.player.id, attacker.player.id);
    }
  }

  private bestReplacement(team: MatchTeam, position: Position): MatchPlayer | null {
    const candidates = team.bench
      .filter((mp) => (position === 'GK') === (mp.player.naturalPosition === 'GK'))
      .map((mp) => ({ mp, score: matchEffectiveness(mp.player, position) }))
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.mp ?? null;
  }

  // -------------------------------------------------------------------------------------------
  // Penalty shootout
  // -------------------------------------------------------------------------------------------

  private penaltyShootout(): void {
    this.push(120, 'penalties', 'neutral', line(this.rng, 'penaltyShootout', {}), { x: 0.5, y: 0.9 }, true);
    const takers = (team: MatchTeam) => team.onPitch
      .filter((mp) => mp.onPitch && !mp.red)
      .sort((a, b) =>
        (b.player.attributes.penalties * 2 + b.player.attributes.composure) -
        (a.player.attributes.penalties * 2 + a.player.attributes.composure));

    const homeTakers = takers(this.home);
    const awayTakers = takers(this.away);
    let home = 0;
    let away = 0;

    const convert = (taker: MatchPlayer | undefined, opponent: MatchTeam): boolean => {
      if (!taker) return this.rng.chance(0.7);
      const keeper = opponent.onPitch.find((mp) => mp.position === 'GK' && mp.onPitch && !mp.red);
      const skill = (taker.player.attributes.penalties * 2 + taker.player.attributes.composure +
        taker.player.attributes.technique) / 4 / 20;
      const keeping = keeper ? keeper.player.attributes.reflexes / 20 : 0.4;
      return this.rng.chance(clamp(0.55 + skill * 0.4 - keeping * 0.16, 0.4, 0.94));
    };

    for (let round = 0; round < 5; round++) {
      if (convert(homeTakers[round % homeTakers.length], this.away)) home += 1;
      if (convert(awayTakers[round % awayTakers.length], this.home)) away += 1;
      // Early exit once one side can't be caught.
      const remaining = 4 - round;
      if (home > away + remaining || away > home + remaining) break;
    }
    let round = 5;
    while (home === away && round < 20) {
      const h = convert(homeTakers[round % homeTakers.length], this.away);
      const a = convert(awayTakers[round % awayTakers.length], this.home);
      if (h) home += 1;
      if (a) away += 1;
      round += 1;
    }

    this.shootout = { home, away };
    this.push(120, 'penalties', 'neutral',
      `${this.home.name} ${home} - ${away} ${this.away.name} on penalties.`,
      { x: 0.5, y: 0.9 }, true);
  }

  // -------------------------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------------------------

  private pickAttacker(team: MatchTeam, aerial = false): MatchPlayer {
    const candidates = team.onPitch.filter((mp) => mp.onPitch && !mp.red && mp.position !== 'GK');
    if (candidates.length === 0) return team.onPitch[0];
    return this.rng.weighted(candidates, (mp) => {
      const profile = ROLE_PROFILES[mp.role as keyof typeof ROLE_PROFILES] ?? ROLE_PROFILES['Box to Box'];
      const advance = POSITION_COORDS[mp.position].y;
      const base = profile.finishing * (0.3 + advance) * mp.effectiveness;
      if (aerial) {
        return base * (0.5 + (mp.player.attributes.heading + mp.player.attributes.jumping) / 40);
      }
      return base;
    });
  }

  private pickCreator(team: MatchTeam, exclude: MatchPlayer): MatchPlayer | null {
    const candidates = team.onPitch.filter(
      (mp) => mp.onPitch && !mp.red && mp !== exclude && mp.position !== 'GK',
    );
    if (candidates.length === 0) return null;
    // Not every goal has an assist.
    if (this.rng.chance(0.25)) return null;
    return this.rng.weighted(candidates, (mp) => {
      const profile = ROLE_PROFILES[mp.role as keyof typeof ROLE_PROFILES] ?? ROLE_PROFILES['Box to Box'];
      return profile.creation * mp.effectiveness;
    });
  }

  private pickDefender(team: MatchTeam): MatchPlayer {
    const candidates = team.onPitch.filter((mp) => mp.onPitch && !mp.red && mp.position !== 'GK');
    if (candidates.length === 0) return team.onPitch[0];
    return this.rng.weighted(candidates, (mp) => {
      const profile = ROLE_PROFILES[mp.role as keyof typeof ROLE_PROFILES] ?? ROLE_PROFILES['Box to Box'];
      return profile.defending * (1.3 - POSITION_COORDS[mp.position].y);
    });
  }

  // -------------------------------------------------------------------------------------------
  // Commentary plumbing
  // -------------------------------------------------------------------------------------------

  private maybeAmbientCommentary(team: MatchTeam, side: 'home' | 'away'): void {
    // Roughly one filler line every three or four minutes, so the feed keeps moving without
    // becoming noise.
    if (this.minute - this.lastCommentaryMinute < 3) return;
    if (!this.rng.chance(0.5)) return;

    const bucket = this.rng.chance(0.5) ? 'buildUp' : this.rng.chance(0.5) ? 'pressure' : 'quiet';
    const player = this.rng.pick(team.onPitch.filter((mp) => mp.onPitch));
    this.push(this.minute, 'chance', side, line(this.rng, bucket, {
      team: team.shortName, player: player?.player.shortName ?? '',
    }), this.ballAt(side, this.rng.float(0.35, 0.7)), false);
  }

  private push(
    minute: number,
    type: MatchEvent['type'],
    side: 'home' | 'away' | 'neutral',
    text: string,
    ball: { x: number; y: number },
    important: boolean,
    playerId?: string,
    secondaryPlayerId?: string,
  ): void {
    this.events.push({ minute, type, side, text, playerId, secondaryPlayerId });
    this.commentary.push({
      minute,
      text,
      ball,
      important,
      side,
      score: [this.homeGoals, this.awayGoals],
    });
    this.lastCommentaryMinute = minute;
  }

  /**
   * Ball position in pitch coordinates, always from the home team's perspective (y = 0 is the
   * home goal, y = 1 is the away goal). `depth` is how far into the attacking half play has got.
   */
  private ballAt(side: 'home' | 'away', depth: number): { x: number; y: number } {
    const y = side === 'home' ? 0.5 + depth * 0.5 : 0.5 - depth * 0.5;
    return { x: clamp(this.rng.gaussian(0.5, 0.22), 0.05, 0.95), y: clamp(y, 0.03, 0.97) };
  }

  private scoreVars() {
    return {
      home: this.home.name, away: this.away.name,
      hg: this.homeGoals, ag: this.awayGoals,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Result
  // -------------------------------------------------------------------------------------------

  toResult(): MatchResult {
    const ratings: Record<string, number> = {};
    let motmPlayerId: string | null = null;
    let bestRating = -1;

    for (const team of [this.home, this.away]) {
      const all = [...team.onPitch, ...team.bench.filter((mp) => mp.minutesPlayed > 0)];
      for (const mp of all) {
        if (mp.minutesPlayed === 0 && !mp.onPitch) continue;
        // Convert accumulated adjustments into a 1-10 rating, weighted by minutes played.
        const minuteWeight = clamp(mp.minutesPlayed / 90, 0.25, 1);
        let rating = 6.5 + (mp.rating - 6.5) / Math.max(0.4, minuteWeight);
        // A sprinkle of noise keeps identical performances from producing identical numbers.
        rating += this.rng.gaussian(0, 0.22);
        rating = clamp(rating, 1, 10);
        ratings[mp.player.id] = Math.round(rating * 10) / 10;
        if (rating > bestRating && mp.minutesPlayed > 25) {
          bestRating = rating;
          motmPlayerId = mp.player.id;
        }
      }
    }

    return {
      homeGoals: this.homeGoals,
      awayGoals: this.awayGoals,
      extraTime: this.inExtraTime || undefined,
      penalties: this.shootout ?? undefined,
      events: this.events,
      stats: { home: this.home.stats, away: this.away.stats },
      ratings,
      motmPlayerId,
      commentary: this.commentary,
    };
  }
}

/** Attendance model: capacity, form, opponent draw, ticket price and weather all matter. */
export function estimateAttendance(state: GameState, fixture: Fixture): number {
  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];
  if (!home) return 0;

  const rng = new Rng(
    (fixture.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 2654435761) >>> 0,
  );

  // Baseline: how much of the ground this club usually fills.
  let fill = clamp(0.55 + home.reputation / 200 + home.fanHappiness / 400, 0.3, 0.98);

  // A glamour opponent, or a derby, brings people out.
  if (away) {
    fill += clamp((away.reputation - home.reputation) / 400, -0.05, 0.12);
    if (home.rivalIds.includes(away.id)) fill += 0.09;
  }

  // Ticket price relative to what fans at this level expect.
  const expectedPrice = 12 + home.reputation * 0.42;
  fill *= clamp(1 - (home.ticketPricing.general - expectedPrice) / (expectedPrice * 2.4), 0.55, 1.18);

  // Form.
  const table = state.tables[home.leagueId];
  const row = table?.find((r) => r.clubId === home.id);
  if (row && row.played > 3) {
    const wins = row.form.filter((f) => f === 'W').length;
    fill += (wins / Math.max(1, row.form.length) - 0.4) * 0.14;
  }

  // Cup ties away from the league draw smaller crowds; a bad forecast keeps people home.
  const comp = state.competitions[fixture.competitionId];
  if (comp?.kind === 'cup') fill *= comp.id === 'efl-trophy' ? 0.35 : 0.72;
  if (fixture.weather === 'Heavy Rain' || fixture.weather === 'Snow') fill *= 0.93;

  fill *= rng.float(0.95, 1.05);
  return Math.round(clamp(fill, 0.15, 1) * home.stadiumCapacity);
}
