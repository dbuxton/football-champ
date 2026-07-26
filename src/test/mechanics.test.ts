/**
 * The overhaul's mechanics: set pieces, substitute minutes, tactics isolation, contract money,
 * the attention system, the staff market and the save migration.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, NewGameOptions } from '../engine/generate';
import { GameState } from '../engine/gamestate';
import { MatchSim } from '../engine/match';
import { simulateFixture } from '../engine/postmatch';
import { Rng, deriveSeed } from '../engine/rng';
import { attentionItems } from '../engine/attention';
import { freeAgentStaff, replenishStaffMarket, ROLE_CAPS } from '../engine/staffmarket';
import { hireStaff, sackStaff } from '../game/actions';
import { migrate } from '../game/save';
import { advance } from '../game/loop';
import { addDaysISO } from '../engine/date';

const BASE_OPTIONS: NewGameOptions = {
  seed: 424242,
  managerFirstName: 'Mech', managerLastName: 'Test', managerNationality: 'England',
  managerBackground: 'Professional Footballer',
  difficulty: 'Normal', preferredFormation: '4-4-2',
};

function newState(seed = 424242): GameState {
  return createNewGame({ ...BASE_OPTIONS, seed });
}

function leagueFixtures(state: GameState, count: number) {
  return state.fixtures
    .filter((f) => state.competitions[f.competitionId]?.kind === 'league')
    .slice(0, count);
}

describe('set pieces', () => {
  it('produces a realistic number of in-play penalties', () => {
    const state = newState();
    let pens = 0;
    const fixtures = leagueFixtures(state, 200);
    for (const fixture of fixtures) {
      const sim = new MatchSim(state, fixture, new Rng(deriveSeed(state.seed, `t:${fixture.id}`)));
      sim.simulateToEnd();
      pens += sim.events.filter((e) => e.type === 'penalty-goal' || e.type === 'penalty-miss').length;
    }
    const rate = pens / fixtures.length;
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.5);
  });

  it('gives in-play penalties to the nominated taker', () => {
    const state = newState();
    const club = state.clubs[state.manager.clubId];
    // Nominate an outfielder who would NOT top the ability sort: the left back.
    const nominee = club.tactics.slots.find(
      (s) => s.playerId && s.position.startsWith('D'),
    )!.playerId!;
    club.tactics.setPieces.penalties = nominee;

    const fixture = state.fixtures.find(
      (f) => f.homeClubId === club.id && state.competitions[f.competitionId]?.kind === 'league',
    )!;

    let ourPens = 0;
    let byNominee = 0;
    for (let i = 0; i < 80; i++) {
      const sim = new MatchSim(state, fixture, new Rng(deriveSeed(state.seed + i, 'pen-test')));
      sim.simulateToEnd();
      for (const event of sim.events) {
        if ((event.type === 'penalty-goal' || event.type === 'penalty-miss') && event.side === 'home') {
          ourPens += 1;
          if (event.playerId === nominee) byNominee += 1;
        }
      }
    }
    expect(ourPens).toBeGreaterThan(0);
    expect(byNominee / ourPens).toBeGreaterThanOrEqual(0.8);
  });
});

describe('substitute minutes', () => {
  it('credits a late substitute only the minutes actually played', () => {
    const state = newState();
    const club = state.clubs[state.manager.clubId];
    const fixture = state.fixtures.find(
      (f) => f.homeClubId === club.id && state.competitions[f.competitionId]?.kind === 'league',
    )!;
    const sim = new MatchSim(state, fixture, new Rng(deriveSeed(state.seed, 'subs-test')));

    while (sim.minute < 74 && !sim.isComplete) sim.step();
    const off = sim.home.onPitch.find((mp) => mp.onPitch && !mp.red && mp.position !== 'GK')!;
    const on = sim.home.bench[0]!;
    expect(sim.substitute('home', off.player.id, on.player.id)).toBe(true);
    sim.simulateToEnd();

    expect(on.minutesPlayed).toBeGreaterThanOrEqual(10);
    expect(on.minutesPlayed).toBeLessThanOrEqual(25);
    expect(off.minutesPlayed).toBeGreaterThanOrEqual(70);
    expect(off.minutesPlayed).toBeLessThanOrEqual(76);

    const fullMatch = sim.home.onPitch.find((mp) => mp.onPitch && mp.position === 'GK');
    expect(fullMatch?.minutesPlayed).toBe(90);
  });
});

describe('in-match tactics isolation', () => {
  it('never writes mid-match changes back to the club', () => {
    const state = newState();
    const club = state.clubs[state.manager.clubId];
    const before = club.tactics.mentality;
    const fixture = state.fixtures.find((f) => f.homeClubId === club.id)!;
    const sim = new MatchSim(state, fixture, new Rng(1));

    sim.updateTactics('home', { mentality: 'Overload', pressing: 'Gegenpress' });
    expect(sim.home.tactics.mentality).toBe('Overload');
    expect(club.tactics.mentality).toBe(before);
    expect(club.tactics.pressing).not.toBe('Gegenpress');
  });
});

describe('contract money', () => {
  it('debits appearance and goal bonuses after a match', () => {
    const state = newState();
    const club = state.clubs[state.manager.clubId];
    const fixture = state.fixtures.find(
      (f) => (f.homeClubId === club.id || f.awayClubId === club.id) &&
        state.competitions[f.competitionId]?.kind === 'league',
    )!;
    simulateFixture(state, fixture);
    const bonuses = club.finances.ledger.filter(
      (e) => e.category === 'Bonuses' && e.description === 'Appearance and goal bonuses',
    );
    expect(bonuses.length).toBe(1);
    expect(bonuses[0].amount).toBeLessThan(0);
  });
});

describe('the attention system', () => {
  it('surfaces incoming bids, expiring key contracts and unhappy players', () => {
    const state = newState();
    const club = state.clubs[state.manager.clubId];
    const squad = club.playerIds.map((id) => state.players[id]);

    // An incoming bid.
    const target = squad[0];
    state.transferOffers.push({
      id: 't-test', playerId: target.id, fromClubId: 'lee', toClubId: club.id,
      fee: 1_000_000, instalments: 0, sellOnPercent: 0, appearanceBonus: 0, goalBonus: 0,
      promotionBonus: 0, isLoan: false, loanWageShare: 0, loanMonths: 0,
      status: 'pending', date: state.date, expiresInDays: 5,
    });

    // A key player running out of contract.
    const keyPlayer = squad[1];
    keyPlayer.contract!.squadStatus = 'Key Player';
    keyPlayer.contract!.expires = addDaysISO(state.date, 90);

    // A miserable player.
    const unhappy = squad[2];
    unhappy.morale = 20;

    const items = attentionItems(state);
    expect(items.find((i) => i.id === `bid:t-test`)?.severity).toBe('action');
    expect(items.find((i) => i.id === `contract:${keyPlayer.id}`)?.severity).toBe('warn');
    expect(items.find((i) => i.id === `morale:${unhappy.id}`)?.severity).toBe('info');

    // Actions sort above warnings, warnings above info.
    const order = items.map((i) => i.severity);
    expect(order.indexOf('action')).toBeLessThan(order.indexOf('warn'));
  });
});

describe('the staff market', () => {
  it('keeps a bounded pool of free agents and lets the manager hire into open roles', () => {
    const state = newState();
    replenishStaffMarket(state);
    const pool = freeAgentStaff(state);
    expect(pool.length).toBeGreaterThanOrEqual(30);
    expect(pool.length).toBeLessThanOrEqual(60);

    const club = state.clubs[state.manager.clubId];
    // Coaches cap at 4 and clubs start with 3 — a hire should succeed.
    const coach = pool.find((s) => s.role === 'Coach')!;
    const result = hireStaff(state, coach.id);
    expect(result.ok).toBe(true);
    expect(coach.clubId).toBe(club.id);
    expect(club.staffIds).toContain(coach.id);

    // Now the role is full; the next hire is refused.
    const another = freeAgentStaff(state).find((s) => s.role === 'Coach')!;
    expect(hireStaff(state, another.id).ok).toBe(false);

    // Sacking reopens the slot.
    sackStaff(state, coach.id);
    expect(hireStaff(state, another.id).ok).toBe(true);
  });

  it('respects every role cap', () => {
    for (const cap of Object.values(ROLE_CAPS)) {
      expect(cap).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('save migration', () => {
  it('upgrades a v1 save to v2 with snapshots and objectives', () => {
    const state = newState();
    // Regress the state to v1 shape.
    const v1 = JSON.parse(JSON.stringify(state)) as GameState;
    v1.version = 1;
    delete (v1 as Partial<GameState>).attributeSnapshots;
    delete (v1 as Partial<GameState>).lastTrainingReportCA;
    delete v1.clubs[v1.manager.clubId].board.objectives;

    const migrated = migrate(v1);
    expect(migrated.version).toBeGreaterThanOrEqual(2);
    expect(Object.keys(migrated.attributeSnapshots).length).toBeGreaterThan(10);
    expect(migrated.lastTrainingReportCA).toBeNull();
    const objectives = migrated.clubs[migrated.manager.clubId].board.objectives;
    expect(objectives?.length).toBeGreaterThanOrEqual(2);
    expect(objectives?.[0].kind).toBe('league');
  });
});

describe('objectives over time', () => {
  it('keeps the scoreboard populated and statuses legal through a season stretch', () => {
    const state = newState(777);
    state.autoPlayMatches = true;
    for (let i = 0; i < 20; i++) {
      const result = advance(state, 60);
      if (result.stop.kind === 'sacked' || result.stop.kind === 'season-end') break;
    }
    const objectives = state.clubs[state.manager.clubId].board.objectives ?? [];
    expect(objectives.length).toBeGreaterThanOrEqual(2);
    for (const objective of objectives) {
      expect(['on-track', 'behind', 'met', 'failed']).toContain(objective.status);
    }
  });
});
