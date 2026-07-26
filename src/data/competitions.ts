/**
 * Competition definitions: the four league divisions, the domestic cups, the play-offs and a
 * simplified set of European competitions.
 *
 * Prize money is in GBP and roughly tracks the real distributions — the gulf between the Premier
 * League and the Championship is the single most important economic fact in the game, and the
 * numbers here are what make promotion transformative and relegation catastrophic.
 */

import type { Competition } from '../engine/types';

/** Premier League: an equal share plus a merit payment that scales steeply with finishing place. */
function premierLeaguePrizeMoney(): number[] {
  const equalShare = 86_000_000;
  const meritPerPlace = 3_100_000;
  return Array.from({ length: 20 }, (_, i) => equalShare + meritPerPlace * (20 - i));
}

/** EFL basic award plus a modest merit ladder. Nothing like the top flight, by design. */
function eflPrizeMoney(clubs: number, basic: number, meritTop: number): number[] {
  return Array.from({ length: clubs }, (_, i) => basic + Math.round(meritTop * ((clubs - i) / clubs)));
}

export const COMPETITIONS: Competition[] = [
  {
    id: 'premier-league',
    name: 'Premier League',
    shortName: 'Prem',
    kind: 'league',
    tier: 1,
    reputation: 96,
    clubIds: [],
    promotionSpots: 0,
    playoffSpots: 0,
    relegationSpots: 3,
    prizeMoney: premierLeaguePrizeMoney(),
  },
  {
    id: 'championship',
    name: 'EFL Championship',
    shortName: 'Champ',
    kind: 'league',
    tier: 2,
    reputation: 68,
    clubIds: [],
    promotionSpots: 2,
    playoffSpots: 4,
    relegationSpots: 3,
    prizeMoney: eflPrizeMoney(24, 8_200_000, 3_000_000),
  },
  {
    id: 'league-one',
    name: 'EFL League One',
    shortName: 'Lg 1',
    kind: 'league',
    tier: 3,
    reputation: 45,
    clubIds: [],
    promotionSpots: 2,
    playoffSpots: 4,
    relegationSpots: 4,
    prizeMoney: eflPrizeMoney(24, 1_400_000, 700_000),
  },
  {
    id: 'league-two',
    name: 'EFL League Two',
    shortName: 'Lg 2',
    kind: 'league',
    tier: 4,
    reputation: 32,
    clubIds: [],
    promotionSpots: 3,
    playoffSpots: 4,
    // There is no National League in the game, so the bottom of the pyramid is a floor.
    relegationSpots: 0,
    prizeMoney: eflPrizeMoney(24, 1_000_000, 400_000),
  },
  {
    id: 'fa-cup',
    name: 'FA Cup',
    shortName: 'FA Cup',
    kind: 'cup',
    tier: 1,
    reputation: 85,
    clubIds: [],
    hasReplays: true,
    // Round 1 through to the final.
    roundPrizeMoney: [
      45_000, 68_000, 105_000, 120_000, 225_000, 450_000, 1_000_000, 2_000_000, 4_500_000,
    ],
  },
  {
    id: 'efl-cup',
    name: 'EFL Cup',
    shortName: 'EFL Cup',
    kind: 'cup',
    tier: 1,
    reputation: 70,
    clubIds: [],
    hasReplays: false,
    roundPrizeMoney: [40_000, 60_000, 100_000, 200_000, 500_000, 1_200_000, 3_000_000],
  },
  {
    id: 'efl-trophy',
    name: 'EFL Trophy',
    shortName: 'Trophy',
    kind: 'cup',
    tier: 3,
    reputation: 28,
    clubIds: [],
    hasReplays: false,
    roundPrizeMoney: [20_000, 30_000, 50_000, 80_000, 130_000, 250_000, 500_000],
  },
  {
    id: 'championship-playoff',
    name: 'Championship Play-offs',
    shortName: 'Play-offs',
    kind: 'playoff',
    tier: 2,
    reputation: 72,
    clubIds: [],
  },
  {
    id: 'league-one-playoff',
    name: 'League One Play-offs',
    shortName: 'Play-offs',
    kind: 'playoff',
    tier: 3,
    reputation: 48,
    clubIds: [],
  },
  {
    id: 'league-two-playoff',
    name: 'League Two Play-offs',
    shortName: 'Play-offs',
    kind: 'playoff',
    tier: 4,
    reputation: 35,
    clubIds: [],
  },
  {
    id: 'champions-league',
    name: 'UEFA Champions League',
    shortName: 'UCL',
    kind: 'continental',
    tier: 1,
    reputation: 99,
    clubIds: [],
    roundPrizeMoney: [18_600_000, 2_100_000, 11_000_000, 12_500_000, 15_000_000, 18_500_000, 25_000_000],
  },
  {
    id: 'europa-league',
    name: 'UEFA Europa League',
    shortName: 'UEL',
    kind: 'continental',
    tier: 1,
    reputation: 82,
    clubIds: [],
    roundPrizeMoney: [4_310_000, 630_000, 1_750_000, 2_500_000, 4_200_000, 7_000_000, 13_000_000],
  },
  {
    id: 'conference-league',
    name: 'UEFA Conference League',
    shortName: 'UECL',
    kind: 'continental',
    tier: 1,
    reputation: 68,
    clubIds: [],
    roundPrizeMoney: [3_170_000, 400_000, 800_000, 1_300_000, 2_000_000, 3_500_000, 6_000_000],
  },
];

/** Foreign clubs, used to populate European competitions and the overseas transfer market. */
export interface ForeignClubSeed {
  id: string;
  name: string;
  country: string;
  reputation: number;
  /** Rough wealth multiplier applied when they bid for your players. */
  wealth: number;
}

export const FOREIGN_CLUBS: ForeignClubSeed[] = [
  { id: 'f-rma', name: 'Real Madrid', country: 'Spain', reputation: 98, wealth: 1.6 },
  { id: 'f-bar', name: 'Barcelona', country: 'Spain', reputation: 95, wealth: 1.2 },
  { id: 'f-atm', name: 'Atletico Madrid', country: 'Spain', reputation: 88, wealth: 1.0 },
  { id: 'f-sev', name: 'Sevilla', country: 'Spain', reputation: 78, wealth: 0.7 },
  { id: 'f-vil', name: 'Villarreal', country: 'Spain', reputation: 79, wealth: 0.8 },
  { id: 'f-rsc', name: 'Real Sociedad', country: 'Spain', reputation: 78, wealth: 0.8 },
  { id: 'f-ath', name: 'Athletic Club', country: 'Spain', reputation: 79, wealth: 0.8 },
  { id: 'f-bay', name: 'Bayern Munich', country: 'Germany', reputation: 96, wealth: 1.5 },
  { id: 'f-bvb', name: 'Borussia Dortmund', country: 'Germany', reputation: 87, wealth: 1.0 },
  { id: 'f-rbl', name: 'RB Leipzig', country: 'Germany', reputation: 84, wealth: 1.0 },
  { id: 'f-b04', name: 'Bayer Leverkusen', country: 'Germany', reputation: 86, wealth: 1.0 },
  { id: 'f-sge', name: 'Eintracht Frankfurt', country: 'Germany', reputation: 78, wealth: 0.8 },
  { id: 'f-stu', name: 'VfB Stuttgart', country: 'Germany', reputation: 76, wealth: 0.7 },
  { id: 'f-int', name: 'Inter Milan', country: 'Italy', reputation: 91, wealth: 1.1 },
  { id: 'f-mil', name: 'AC Milan', country: 'Italy', reputation: 89, wealth: 1.0 },
  { id: 'f-juv', name: 'Juventus', country: 'Italy', reputation: 89, wealth: 1.1 },
  { id: 'f-nap', name: 'Napoli', country: 'Italy', reputation: 87, wealth: 1.0 },
  { id: 'f-rom', name: 'Roma', country: 'Italy', reputation: 82, wealth: 0.8 },
  { id: 'f-laz', name: 'Lazio', country: 'Italy', reputation: 80, wealth: 0.8 },
  { id: 'f-ata', name: 'Atalanta', country: 'Italy', reputation: 83, wealth: 0.9 },
  { id: 'f-psg', name: 'Paris Saint-Germain', country: 'France', reputation: 94, wealth: 1.6 },
  { id: 'f-mon', name: 'Monaco', country: 'France', reputation: 81, wealth: 0.9 },
  { id: 'f-mar', name: 'Marseille', country: 'France', reputation: 80, wealth: 0.8 },
  { id: 'f-lyo', name: 'Lyon', country: 'France', reputation: 78, wealth: 0.7 },
  { id: 'f-lil', name: 'Lille', country: 'France', reputation: 77, wealth: 0.7 },
  { id: 'f-ren', name: 'Rennes', country: 'France', reputation: 74, wealth: 0.7 },
  { id: 'f-aja', name: 'Ajax', country: 'Netherlands', reputation: 82, wealth: 0.8 },
  { id: 'f-psv', name: 'PSV Eindhoven', country: 'Netherlands', reputation: 81, wealth: 0.8 },
  { id: 'f-fey', name: 'Feyenoord', country: 'Netherlands', reputation: 78, wealth: 0.7 },
  { id: 'f-por', name: 'Porto', country: 'Portugal', reputation: 84, wealth: 0.8 },
  { id: 'f-ben', name: 'Benfica', country: 'Portugal', reputation: 85, wealth: 0.9 },
  { id: 'f-spo', name: 'Sporting CP', country: 'Portugal', reputation: 84, wealth: 0.9 },
  { id: 'f-cel', name: 'Celtic', country: 'Scotland', reputation: 74, wealth: 0.6 },
  { id: 'f-ran', name: 'Rangers', country: 'Scotland', reputation: 71, wealth: 0.5 },
  { id: 'f-gal', name: 'Galatasaray', country: 'Turkey', reputation: 76, wealth: 0.8 },
  { id: 'f-fen', name: 'Fenerbahce', country: 'Turkey', reputation: 75, wealth: 0.8 },
  { id: 'f-cfr', name: 'Club Brugge', country: 'Belgium', reputation: 72, wealth: 0.6 },
  { id: 'f-sal', name: 'Red Bull Salzburg', country: 'Austria', reputation: 71, wealth: 0.6 },
  { id: 'f-sha', name: 'Shakhtar Donetsk', country: 'Ukraine', reputation: 72, wealth: 0.6 },
  { id: 'f-olm', name: 'Olympiacos', country: 'Greece', reputation: 71, wealth: 0.6 },
];

/**
 * Parachute payments for clubs relegated from the Premier League, by season since relegation.
 * These are the reason a recently relegated club can outspend the rest of the Championship, and
 * modelling them is what makes the division feel unfair in the right way.
 */
export const PARACHUTE_PAYMENTS = [48_000_000, 39_000_000, 17_000_000];

/**
 * EFL Profitability & Sustainability: clubs may lose up to £39m across a rolling three-year
 * window (£13m per season). Exceeding it brings an embargo, and serious breaches a deduction.
 */
export const PS_ALLOWABLE_LOSS_3_YEARS = 39_000_000;
export const PS_POINTS_DEDUCTION_THRESHOLD = 20_000_000;
