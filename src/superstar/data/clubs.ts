/**
 * The twenty Premier League clubs, as Superstar sees them: a ladder from the biggest club to the
 * smallest. Playing well moves you up it, playing badly moves you down.
 *
 * Names, grounds and reputations come from the management game's club list (`src/data/clubs.ts`),
 * so there is one place to fix a club. What's added here is what a player on the pitch needs: the
 * kits, drawn with their real patterns (Newcastle's stripes, Arsenal's white sleeves), and an away
 * kit for when two teams would look the same.
 */

import { PREMIER_LEAGUE_CLUBS } from '../../data/clubs';
import { colourDistance } from './colour';
import { squadStrength } from './squads';

export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'sleeves' | 'halves' | 'sash';

export type Kit = {
  shirt: string;
  /** Stripes, hoops, sleeves or sash, and the collar. */
  trim: string;
  shorts: string;
  socks: string;
  pattern: KitPattern;
  /** The number printed on the back. */
  number: string;
};

export type Club = {
  id: string;
  name: string;
  shortName: string;
  nickname: string;
  city: string;
  stadium: string;
  capacity: number;
  founded: number;
  /** 1–100, from the management game. Decides where the club sits on the ladder. */
  reputation: number;
  /** Scoreboard code, like ARS. */
  code: string;
  /** Place on the ladder: 1 is the biggest club, 20 the smallest. */
  rank: number;
  home: Kit;
  away: Kit;
  /** Colours the club's screens are painted in. Never white, so text and badges show up. */
  colour: string;
  colour2: string;
};

type KitInfo = { home: Kit; away: Kit; colours: [string, string] };

const k = (
  shirt: string,
  trim: string,
  shorts: string,
  socks: string,
  pattern: KitPattern,
  number: string,
): Kit => ({ shirt, trim, shorts, socks, pattern, number });

/** Home and away kits, plus the two colours each club's menus use. */
const KITS: Record<string, KitInfo> = {
  ars: {
    home: k('#EF0107', '#FFFFFF', '#FFFFFF', '#EF0107', 'sleeves', '#FFFFFF'),
    away: k('#F5D130', '#0B2A5B', '#0B2A5B', '#F5D130', 'plain', '#0B2A5B'),
    colours: ['#EF0107', '#0B2A5B'],
  },
  avl: {
    home: k('#670E36', '#95BFE5', '#FFFFFF', '#95BFE5', 'sleeves', '#FFFFFF'),
    away: k('#95BFE5', '#670E36', '#670E36', '#95BFE5', 'plain', '#670E36'),
    colours: ['#670E36', '#95BFE5'],
  },
  bou: {
    home: k('#DA291C', '#111111', '#111111', '#111111', 'stripes', '#FFFFFF'),
    away: k('#FFFFFF', '#DA291C', '#FFFFFF', '#FFFFFF', 'sash', '#DA291C'),
    colours: ['#DA291C', '#111111'],
  },
  bre: {
    home: k('#E30613', '#FFFFFF', '#111111', '#E30613', 'stripes', '#111111'),
    away: k('#111111', '#FFD100', '#111111', '#111111', 'plain', '#FFD100'),
    colours: ['#E30613', '#111111'],
  },
  bha: {
    home: k('#0057B8', '#FFFFFF', '#0057B8', '#FFFFFF', 'stripes', '#FFD000'),
    away: k('#FFD000', '#0057B8', '#0057B8', '#FFD000', 'plain', '#0057B8'),
    colours: ['#0057B8', '#FFD000'],
  },
  bur: {
    home: k('#6C1D45', '#99D6EA', '#FFFFFF', '#6C1D45', 'sleeves', '#FFFFFF'),
    away: k('#99D6EA', '#6C1D45', '#6C1D45', '#99D6EA', 'plain', '#6C1D45'),
    colours: ['#6C1D45', '#99D6EA'],
  },
  che: {
    home: k('#034694', '#FFFFFF', '#034694', '#FFFFFF', 'plain', '#FFFFFF'),
    away: k('#F7B500', '#034694', '#034694', '#F7B500', 'plain', '#034694'),
    colours: ['#034694', '#DBA111'],
  },
  cry: {
    home: k('#1B458F', '#C4122E', '#1B458F', '#1B458F', 'stripes', '#FFFFFF'),
    away: k('#FFFFFF', '#C4122E', '#1B458F', '#FFFFFF', 'sash', '#1B458F'),
    colours: ['#C4122E', '#1B458F'],
  },
  eve: {
    home: k('#003399', '#FFFFFF', '#FFFFFF', '#FFFFFF', 'plain', '#FFFFFF'),
    away: k('#F47FA4', '#1A1A5E', '#1A1A5E', '#F47FA4', 'plain', '#1A1A5E'),
    colours: ['#003399', '#6CC0FF'],
  },
  ful: {
    home: k('#FFFFFF', '#111111', '#111111', '#FFFFFF', 'plain', '#111111'),
    away: k('#E5202A', '#111111', '#111111', '#E5202A', 'plain', '#FFFFFF'),
    colours: ['#111111', '#E5202A'],
  },
  lee: {
    home: k('#FFFFFF', '#1D428A', '#FFFFFF', '#FFFFFF', 'plain', '#1D428A'),
    away: k('#1D428A', '#FFCD00', '#1D428A', '#1D428A', 'plain', '#FFCD00'),
    colours: ['#1D428A', '#FFCD00'],
  },
  liv: {
    home: k('#C8102E', '#F6EB61', '#C8102E', '#C8102E', 'plain', '#FFFFFF'),
    away: k('#00B2A9', '#FFFFFF', '#00B2A9', '#00B2A9', 'plain', '#FFFFFF'),
    colours: ['#C8102E', '#00B2A9'],
  },
  mci: {
    home: k('#6CABDD', '#FFFFFF', '#FFFFFF', '#6CABDD', 'plain', '#1C2C5B'),
    away: k('#1C2C5B', '#6CABDD', '#1C2C5B', '#1C2C5B', 'plain', '#6CABDD'),
    colours: ['#6CABDD', '#1C2C5B'],
  },
  mun: {
    home: k('#DA291C', '#FFFFFF', '#FFFFFF', '#111111', 'plain', '#FFFFFF'),
    away: k('#1E2A5A', '#FBE122', '#1E2A5A', '#1E2A5A', 'plain', '#FBE122'),
    colours: ['#DA291C', '#FBE122'],
  },
  new: {
    home: k('#241F20', '#FFFFFF', '#241F20', '#241F20', 'stripes', '#41B6E6'),
    away: k('#22A38C', '#FFFFFF', '#22A38C', '#22A38C', 'plain', '#FFFFFF'),
    colours: ['#241F20', '#41B6E6'],
  },
  nfo: {
    home: k('#DD0000', '#FFFFFF', '#FFFFFF', '#DD0000', 'plain', '#FFFFFF'),
    away: k('#FFFFFF', '#DD0000', '#FFFFFF', '#FFFFFF', 'plain', '#DD0000'),
    colours: ['#DD0000', '#111111'],
  },
  sun: {
    home: k('#EB172B', '#FFFFFF', '#111111', '#EB172B', 'stripes', '#111111'),
    away: k('#1C2A4A', '#EB172B', '#1C2A4A', '#1C2A4A', 'plain', '#FFFFFF'),
    colours: ['#EB172B', '#111111'],
  },
  tot: {
    home: k('#FFFFFF', '#132257', '#132257', '#FFFFFF', 'plain', '#132257'),
    away: k('#6A3FA0', '#132257', '#132257', '#6A3FA0', 'plain', '#FFFFFF'),
    colours: ['#132257', '#6A3FA0'],
  },
  whu: {
    home: k('#7A263A', '#1BB1E7', '#FFFFFF', '#7A263A', 'sleeves', '#1BB1E7'),
    away: k('#1BB1E7', '#7A263A', '#1BB1E7', '#1BB1E7', 'plain', '#7A263A'),
    colours: ['#7A263A', '#1BB1E7'],
  },
  wol: {
    home: k('#FDB913', '#231F20', '#231F20', '#FDB913', 'plain', '#231F20'),
    away: k('#231F20', '#FDB913', '#231F20', '#231F20', 'plain', '#FDB913'),
    colours: ['#FDB913', '#231F20'],
  },
};

/** Kits for when both of a club's own kits would clash. Loud on purpose. */
export const THIRD_KITS: readonly Kit[] = [
  k('#8BE000', '#1A1A1A', '#1A1A1A', '#8BE000', 'plain', '#1A1A1A'),
  k('#FF4FA3', '#2A0A3A', '#2A0A3A', '#FF4FA3', 'plain', '#FFFFFF'),
  k('#7B2FF7', '#FFD400', '#7B2FF7', '#7B2FF7', 'plain', '#FFD400'),
  k('#FF8A00', '#1A1A1A', '#1A1A1A', '#FF8A00', 'plain', '#1A1A1A'),
];

/** Goalkeeper shirts: bright colours that stand out from everybody else. */
export const KEEPER_COLOURS: readonly string[] = ['#39E639', '#FF7A00', '#FF3EA5', '#9B5CFF', '#FFE600', '#00D5FF'];

export const CLUBS: readonly Club[] = (() => {
  const clubs = PREMIER_LEAGUE_CLUBS.map(
    ([id, name, shortName, nickname, city, founded, stadium, capacity, , , , reputation]) => {
      const kits = KITS[id];
      if (!kits) throw new Error(`No kits for club ${id}`);
      return {
        id,
        name,
        shortName,
        nickname,
        city,
        stadium,
        capacity,
        founded,
        reputation,
        code: id.toUpperCase(),
        rank: 0,
        home: kits.home,
        away: kits.away,
        colour: kits.colours[0],
        colour2: kits.colours[1],
      };
    },
  );
  // Biggest first. Equal reputations are split by the strength of the squad, then by name, so
  // the ladder never changes order between runs.
  clubs.sort(
    (a, b) => b.reputation - a.reputation || squadStrength(b.id) - squadStrength(a.id) || a.name.localeCompare(b.name),
  );
  return clubs.map((club, index) => ({ ...club, rank: index + 1 }));
})();

export const CLUB_COUNT = CLUBS.length;

const BY_ID = new Map(CLUBS.map((club) => [club.id, club]));

export function getClub(id: string): Club {
  const club = BY_ID.get(id);
  if (!club) throw new Error(`No club ${id}`);
  return club;
}

export function isClubId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

export function clubAtRank(rank: number): Club {
  return CLUBS[Math.min(Math.max(Math.round(rank), 1), CLUBS.length) - 1];
}

/** The colours of a kit that catch the eye from a distance: the shirt, and its stripes if it has them. */
function dominantColours(kit: Kit): string[] {
  return kit.pattern === 'plain' || kit.pattern === 'sash' ? [kit.shirt] : [kit.shirt, kit.trim];
}

/** Below this, two shirts are too alike to tell apart at a glance. */
const CLASH = 150;

export function kitsClash(a: Kit, b: Kit): boolean {
  for (const ca of dominantColours(a)) {
    for (const cb of dominantColours(b)) {
      if (colourDistance(ca, cb) < CLASH) return true;
    }
  }
  return false;
}

/**
 * What each team wears. The home team always wears its home kit; the visitors change when their
 * home kit would clash, and fall back to a loud third kit when the away one clashes too.
 */
export function matchKits(homeId: string, awayId: string): { home: Kit; away: Kit } {
  const home = getClub(homeId).home;
  const away = getClub(awayId);
  if (!kitsClash(home, away.home)) return { home, away: away.home };
  if (!kitsClash(home, away.away)) return { home, away: away.away };
  const third = THIRD_KITS.find((kit) => !kitsClash(home, kit)) ?? THIRD_KITS[0];
  return { home, away: third };
}

/** Two keeper shirts that stand out from both teams and from each other. */
export function keeperColours(a: Kit, b: Kit): [string, string] {
  const distinct = (colour: string) =>
    Math.min(...[...dominantColours(a), ...dominantColours(b)].map((c) => colourDistance(colour, c)));
  const ranked = [...KEEPER_COLOURS].sort((x, y) => distinct(y) - distinct(x));
  const first = ranked[0];
  const second = ranked.find((colour) => colour !== first && colourDistance(colour, first) >= CLASH) ?? ranked[1];
  return [first, second];
}
