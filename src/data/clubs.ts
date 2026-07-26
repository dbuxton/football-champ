/**
 * The English league pyramid: 92 clubs across four divisions.
 *
 * Clubs are authored as compact tuples to keep this file scannable. See `docs/DATA.md` for the
 * format and for guidance on editing it when squads or divisions change.
 */

export type ClubSeed = [
  /** Stable id — never change these, saves reference them. */
  id: string,
  name: string,
  shortName: string,
  nickname: string,
  city: string,
  founded: number,
  stadiumName: string,
  capacity: number,
  /** Primary and secondary kit colours as hex, plus the text colour that reads on the primary. */
  primary: string,
  secondary: string,
  text: string,
  /** 1-100. Drives player interest, sponsorship value, media attention and attendance. */
  reputation: number,
  /** Supporter base in thousands. */
  fanbase: number,
];

export const PREMIER_LEAGUE_CLUBS: ClubSeed[] = [
  ['ars', 'Arsenal', 'Arsenal', 'The Gunners', 'London', 1886, 'Emirates Stadium', 60704, '#EF0107', '#FFFFFF', '#FFFFFF', 92, 4200],
  ['avl', 'Aston Villa', 'Aston Villa', 'The Villans', 'Birmingham', 1874, 'Villa Park', 42918, '#95BFE5', '#670E36', '#670E36', 79, 1300],
  ['bou', 'AFC Bournemouth', 'Bournemouth', 'The Cherries', 'Bournemouth', 1899, 'Vitality Stadium', 11307, '#DA291C', '#000000', '#FFFFFF', 68, 260],
  ['bre', 'Brentford', 'Brentford', 'The Bees', 'London', 1889, 'Gtech Community Stadium', 17250, '#E30613', '#FFFFFF', '#FFFFFF', 69, 300],
  ['bha', 'Brighton & Hove Albion', 'Brighton', 'The Seagulls', 'Brighton', 1901, 'Amex Stadium', 31800, '#0057B8', '#FFFFFF', '#FFFFFF', 74, 480],
  ['bur', 'Burnley', 'Burnley', 'The Clarets', 'Burnley', 1882, 'Turf Moor', 21944, '#6C1D45', '#99D6EA', '#FFFFFF', 63, 200],
  ['che', 'Chelsea', 'Chelsea', 'The Blues', 'London', 1905, 'Stamford Bridge', 40343, '#034694', '#FFFFFF', '#FFFFFF', 89, 3600],
  ['cry', 'Crystal Palace', 'Crystal Palace', 'The Eagles', 'London', 1905, 'Selhurst Park', 25486, '#1B458F', '#C4122E', '#FFFFFF', 71, 420],
  ['eve', 'Everton', 'Everton', 'The Toffees', 'Liverpool', 1878, 'Hill Dickinson Stadium', 52888, '#003399', '#FFFFFF', '#FFFFFF', 74, 1100],
  ['ful', 'Fulham', 'Fulham', 'The Cottagers', 'London', 1879, 'Craven Cottage', 28000, '#FFFFFF', '#000000', '#000000', 70, 340],
  ['lee', 'Leeds United', 'Leeds', 'The Whites', 'Leeds', 1919, 'Elland Road', 37645, '#FFFFFF', '#1D428A', '#1D428A', 73, 1400],
  ['liv', 'Liverpool', 'Liverpool', 'The Reds', 'Liverpool', 1892, 'Anfield', 61276, '#C8102E', '#00B2A9', '#FFFFFF', 94, 5100],
  ['mci', 'Manchester City', 'Man City', 'The Cityzens', 'Manchester', 1880, 'Etihad Stadium', 52900, '#6CABDD', '#1C2C5B', '#FFFFFF', 95, 3400],
  ['mun', 'Manchester United', 'Man Utd', 'The Red Devils', 'Manchester', 1878, 'Old Trafford', 74310, '#DA291C', '#FBE122', '#FFFFFF', 91, 6200],
  ['new', 'Newcastle United', 'Newcastle', 'The Magpies', 'Newcastle', 1892, 'St James’ Park', 52305, '#241F20', '#FFFFFF', '#FFFFFF', 82, 1600],
  ['nfo', 'Nottingham Forest', 'Nottm Forest', 'The Tricky Trees', 'Nottingham', 1865, 'The City Ground', 30404, '#DD0000', '#FFFFFF', '#FFFFFF', 74, 480],
  ['sun', 'Sunderland', 'Sunderland', 'The Black Cats', 'Sunderland', 1879, 'Stadium of Light', 49000, '#EB172B', '#FFFFFF', '#FFFFFF', 68, 900],
  ['tot', 'Tottenham Hotspur', 'Tottenham', 'Spurs', 'London', 1882, 'Tottenham Hotspur Stadium', 62850, '#FFFFFF', '#132257', '#132257', 85, 2900],
  ['whu', 'West Ham United', 'West Ham', 'The Hammers', 'London', 1895, 'London Stadium', 62500, '#7A263A', '#1BB1E7', '#FFFFFF', 77, 1200],
  ['wol', 'Wolverhampton Wanderers', 'Wolves', 'Wolves', 'Wolverhampton', 1877, 'Molineux', 31750, '#FDB913', '#231F20', '#231F20', 70, 420],
];

export const CHAMPIONSHIP_CLUBS: ClubSeed[] = [
  ['bir', 'Birmingham City', 'Birmingham', 'Blues', 'Birmingham', 1875, 'St Andrew’s', 29409, '#0000FF', '#FFFFFF', '#FFFFFF', 52, 420],
  ['bla', 'Blackburn Rovers', 'Blackburn', 'Rovers', 'Blackburn', 1875, 'Ewood Park', 31367, '#009EE0', '#FFFFFF', '#FFFFFF', 48, 240],
  ['bri', 'Bristol City', 'Bristol City', 'The Robins', 'Bristol', 1894, 'Ashton Gate', 27000, '#E21C38', '#FFFFFF', '#FFFFFF', 47, 260],
  ['cha', 'Charlton Athletic', 'Charlton', 'The Addicks', 'London', 1905, 'The Valley', 27111, '#D4021D', '#FFFFFF', '#FFFFFF', 44, 210],
  ['cov', 'Coventry City', 'Coventry', 'The Sky Blues', 'Coventry', 1883, 'Coventry Building Society Arena', 32609, '#78D0F3', '#FFFFFF', '#0B3B60', 51, 280],
  ['der', 'Derby County', 'Derby', 'The Rams', 'Derby', 1884, 'Pride Park', 33597, '#FFFFFF', '#000000', '#000000', 48, 340],
  ['hul', 'Hull City', 'Hull', 'The Tigers', 'Hull', 1904, 'MKM Stadium', 25586, '#F5A12D', '#000000', '#000000', 46, 220],
  ['ips', 'Ipswich Town', 'Ipswich', 'The Tractor Boys', 'Ipswich', 1878, 'Portman Road', 30311, '#0044A9', '#FFFFFF', '#FFFFFF', 57, 300],
  ['lei', 'Leicester City', 'Leicester', 'The Foxes', 'Leicester', 1884, 'King Power Stadium', 32261, '#003090', '#FDBE11', '#FFFFFF', 63, 620],
  ['mid', 'Middlesbrough', 'Middlesbrough', 'Boro', 'Middlesbrough', 1876, 'Riverside Stadium', 34742, '#E21C38', '#FFFFFF', '#FFFFFF', 52, 320],
  ['mil', 'Millwall', 'Millwall', 'The Lions', 'London', 1885, 'The Den', 20146, '#001D5E', '#FFFFFF', '#FFFFFF', 44, 150],
  ['nor', 'Norwich City', 'Norwich', 'The Canaries', 'Norwich', 1902, 'Carrow Road', 27359, '#FFF200', '#00A650', '#00A650', 53, 320],
  ['oxf', 'Oxford United', 'Oxford', 'The U’s', 'Oxford', 1893, 'Kassam Stadium', 12500, '#FFE500', '#001E62', '#001E62', 39, 90],
  ['por', 'Portsmouth', 'Portsmouth', 'Pompey', 'Portsmouth', 1898, 'Fratton Park', 20899, '#001489', '#FFFFFF', '#FFFFFF', 45, 260],
  ['pre', 'Preston North End', 'Preston', 'The Lilywhites', 'Preston', 1880, 'Deepdale', 23404, '#FFFFFF', '#00214D', '#00214D', 43, 150],
  ['qpr', 'Queens Park Rangers', 'QPR', 'The Hoops', 'London', 1882, 'Loftus Road', 18439, '#1D5BA4', '#FFFFFF', '#FFFFFF', 45, 190],
  ['shu', 'Sheffield United', 'Sheff Utd', 'The Blades', 'Sheffield', 1889, 'Bramall Lane', 32050, '#EE2737', '#FFFFFF', '#FFFFFF', 55, 340],
  ['shw', 'Sheffield Wednesday', 'Sheff Wed', 'The Owls', 'Sheffield', 1867, 'Hillsborough', 34835, '#0066B3', '#FFFFFF', '#FFFFFF', 47, 340],
  ['sou', 'Southampton', 'Southampton', 'The Saints', 'Southampton', 1885, 'St Mary’s Stadium', 32384, '#D71920', '#FFFFFF', '#FFFFFF', 58, 380],
  ['sto', 'Stoke City', 'Stoke', 'The Potters', 'Stoke-on-Trent', 1863, 'bet365 Stadium', 30089, '#E03A3E', '#FFFFFF', '#FFFFFF', 47, 280],
  ['swa', 'Swansea City', 'Swansea', 'The Swans', 'Swansea', 1912, 'Swansea.com Stadium', 21088, '#FFFFFF', '#000000', '#000000', 45, 200],
  ['wat', 'Watford', 'Watford', 'The Hornets', 'Watford', 1881, 'Vicarage Road', 22200, '#FBEE23', '#ED2127', '#000000', 47, 180],
  ['wba', 'West Bromwich Albion', 'West Brom', 'The Baggies', 'West Bromwich', 1878, 'The Hawthorns', 26850, '#122F67', '#FFFFFF', '#FFFFFF', 51, 300],
  ['wre', 'Wrexham', 'Wrexham', 'The Red Dragons', 'Wrexham', 1864, 'STok Cae Ras', 13500, '#DA291C', '#FFFFFF', '#FFFFFF', 42, 220],
];

export const LEAGUE_ONE_CLUBS: ClubSeed[] = [
  ['bar', 'Barnsley', 'Barnsley', 'The Tykes', 'Barnsley', 1887, 'Oakwell', 23287, '#E4022D', '#FFFFFF', '#FFFFFF', 35, 110],
  ['bpl', 'Blackpool', 'Blackpool', 'The Seasiders', 'Blackpool', 1877, 'Bloomfield Road', 16616, '#F68712', '#FFFFFF', '#FFFFFF', 34, 120],
  ['bol', 'Bolton Wanderers', 'Bolton', 'The Trotters', 'Bolton', 1874, 'Toughsheet Community Stadium', 28723, '#FFFFFF', '#001C58', '#001C58', 37, 160],
  ['brd', 'Bradford City', 'Bradford', 'The Bantams', 'Bradford', 1903, 'Valley Parade', 25136, '#FFB612', '#7C2529', '#7C2529', 33, 130],
  ['bta', 'Burton Albion', 'Burton', 'The Brewers', 'Burton upon Trent', 1950, 'Pirelli Stadium', 6912, '#FFF200', '#000000', '#000000', 26, 25],
  ['car', 'Cardiff City', 'Cardiff', 'The Bluebirds', 'Cardiff', 1899, 'Cardiff City Stadium', 33280, '#0070B5', '#FFFFFF', '#FFFFFF', 41, 200],
  ['don', 'Doncaster Rovers', 'Doncaster', 'Donny', 'Doncaster', 1879, 'Eco-Power Stadium', 15231, '#E4022D', '#FFFFFF', '#FFFFFF', 28, 55],
  ['exe', 'Exeter City', 'Exeter', 'The Grecians', 'Exeter', 1901, 'St James Park', 8715, '#E4022D', '#FFFFFF', '#FFFFFF', 27, 40],
  ['hud', 'Huddersfield Town', 'Huddersfield', 'The Terriers', 'Huddersfield', 1908, 'John Smith’s Stadium', 24121, '#0E63AD', '#FFFFFF', '#FFFFFF', 37, 130],
  ['ley', 'Leyton Orient', 'Leyton Orient', 'The O’s', 'London', 1881, 'Brisbane Road', 9271, '#E4022D', '#FFFFFF', '#FFFFFF', 28, 45],
  ['lin', 'Lincoln City', 'Lincoln', 'The Imps', 'Lincoln', 1884, 'LNER Stadium', 10669, '#E4022D', '#FFFFFF', '#FFFFFF', 29, 50],
  ['lut', 'Luton Town', 'Luton', 'The Hatters', 'Luton', 1885, 'Kenilworth Road', 12000, '#F78F1E', '#002D62', '#002D62', 38, 110],
  ['man', 'Mansfield Town', 'Mansfield', 'The Stags', 'Mansfield', 1897, 'One Call Stadium', 9186, '#FFF200', '#0033A0', '#0033A0', 26, 35],
  ['nrt', 'Northampton Town', 'Northampton', 'The Cobblers', 'Northampton', 1897, 'Sixfields Stadium', 7798, '#8B1538', '#FFFFFF', '#FFFFFF', 26, 35],
  ['pet', 'Peterborough United', 'Peterborough', 'The Posh', 'Peterborough', 1934, 'Weston Homes Stadium', 15314, '#0000FF', '#FFFFFF', '#FFFFFF', 30, 50],
  ['ply', 'Plymouth Argyle', 'Plymouth', 'The Pilgrims', 'Plymouth', 1886, 'Home Park', 17900, '#046A38', '#FFFFFF', '#FFFFFF', 35, 110],
  ['prt', 'Port Vale', 'Port Vale', 'The Valiants', 'Stoke-on-Trent', 1876, 'Vale Park', 15036, '#FFFFFF', '#000000', '#000000', 26, 40],
  ['rea', 'Reading', 'Reading', 'The Royals', 'Reading', 1871, 'Select Car Leasing Stadium', 24161, '#004494', '#FFFFFF', '#FFFFFF', 36, 120],
  ['rot', 'Rotherham United', 'Rotherham', 'The Millers', 'Rotherham', 1925, 'AESSEAL New York Stadium', 12021, '#E4022D', '#FFFFFF', '#FFFFFF', 29, 45],
  ['stv', 'Stevenage', 'Stevenage', 'Boro', 'Stevenage', 1976, 'Lamex Stadium', 7800, '#E4022D', '#FFFFFF', '#FFFFFF', 25, 20],
  ['stk', 'Stockport County', 'Stockport', 'The Hatters', 'Stockport', 1883, 'Edgeley Park', 10852, '#0033A0', '#FFFFFF', '#FFFFFF', 28, 45],
  ['wig', 'Wigan Athletic', 'Wigan', 'The Latics', 'Wigan', 1932, 'Brick Community Stadium', 25138, '#0000FF', '#FFFFFF', '#FFFFFF', 32, 70],
  ['wyc', 'Wycombe Wanderers', 'Wycombe', 'The Chairboys', 'High Wycombe', 1887, 'Adams Park', 9558, '#0033A0', '#8CC63F', '#FFFFFF', 27, 30],
  ['afw', 'AFC Wimbledon', 'AFC Wimbledon', 'The Dons', 'London', 2002, 'Cherry Red Records Stadium', 9300, '#0033A0', '#FFFF00', '#FFFFFF', 26, 35],
];

export const LEAGUE_TWO_CLUBS: ClubSeed[] = [
  ['acc', 'Accrington Stanley', 'Accrington', 'Stanley', 'Accrington', 1968, 'Wham Stadium', 5450, '#E4022D', '#FFFFFF', '#FFFFFF', 18, 12],
  ['bnt', 'Barnet', 'Barnet', 'The Bees', 'London', 1888, 'The Hive Stadium', 6500, '#F5A12D', '#000000', '#000000', 17, 12],
  ['brw', 'Barrow', 'Barrow', 'The Bluebirds', 'Barrow-in-Furness', 1901, 'Holker Street', 5045, '#0033A0', '#FFFFFF', '#FFFFFF', 17, 10],
  ['brs', 'Bristol Rovers', 'Bristol Rovers', 'The Gas', 'Bristol', 1883, 'Memorial Stadium', 12300, '#0033A0', '#FFFFFF', '#FFFFFF', 24, 45],
  ['brm', 'Bromley', 'Bromley', 'The Ravens', 'London', 1892, 'Hayes Lane', 5000, '#FFFFFF', '#000000', '#000000', 16, 8],
  ['cam', 'Cambridge United', 'Cambridge', 'The U’s', 'Cambridge', 1912, 'Abbey Stadium', 8127, '#FFB612', '#000000', '#000000', 20, 20],
  ['chl', 'Cheltenham Town', 'Cheltenham', 'The Robins', 'Cheltenham', 1892, 'Whaddon Road', 7066, '#E4022D', '#FFFFFF', '#FFFFFF', 18, 15],
  ['chs', 'Chesterfield', 'Chesterfield', 'The Spireites', 'Chesterfield', 1867, 'SMH Group Stadium', 10504, '#0000FF', '#FFFFFF', '#FFFFFF', 20, 22],
  ['col', 'Colchester United', 'Colchester', 'The U’s', 'Colchester', 1937, 'JobServe Community Stadium', 10105, '#0033A0', '#FFFFFF', '#FFFFFF', 18, 15],
  ['crw', 'Crawley Town', 'Crawley', 'The Red Devils', 'Crawley', 1896, 'Broadfield Stadium', 5800, '#E4022D', '#FFFFFF', '#FFFFFF', 17, 10],
  ['cre', 'Crewe Alexandra', 'Crewe', 'The Railwaymen', 'Crewe', 1877, 'Mornflake Stadium', 10153, '#E4022D', '#FFFFFF', '#FFFFFF', 20, 18],
  ['fle', 'Fleetwood Town', 'Fleetwood', 'The Cod Army', 'Fleetwood', 1997, 'Highbury Stadium', 5327, '#E4022D', '#FFFFFF', '#FFFFFF', 17, 8],
  ['gil', 'Gillingham', 'Gillingham', 'The Gills', 'Gillingham', 1893, 'Priestfield Stadium', 11582, '#0000FF', '#FFFFFF', '#FFFFFF', 20, 22],
  ['gri', 'Grimsby Town', 'Grimsby', 'The Mariners', 'Grimsby', 1878, 'Blundell Park', 9052, '#000000', '#FFFFFF', '#FFFFFF', 20, 25],
  ['har', 'Harrogate Town', 'Harrogate', 'The Sulphurites', 'Harrogate', 1914, 'Wetherby Road', 5000, '#FFF200', '#000000', '#000000', 15, 7],
  ['mkd', 'Milton Keynes Dons', 'MK Dons', 'The Dons', 'Milton Keynes', 2004, 'Stadium MK', 30500, '#FFFFFF', '#000000', '#000000', 23, 30],
  ['nwp', 'Newport County', 'Newport', 'The Exiles', 'Newport', 1912, 'Rodney Parade', 7850, '#F5A12D', '#000000', '#000000', 17, 12],
  ['not', 'Notts County', 'Notts County', 'The Magpies', 'Nottingham', 1862, 'Meadow Lane', 19841, '#000000', '#FFFFFF', '#FFFFFF', 21, 30],
  ['old', 'Oldham Athletic', 'Oldham', 'The Latics', 'Oldham', 1895, 'Boundary Park', 13513, '#0033A0', '#FFFFFF', '#FFFFFF', 20, 25],
  ['sal', 'Salford City', 'Salford', 'The Ammies', 'Salford', 1940, 'Peninsula Stadium', 5108, '#E4022D', '#FFFFFF', '#FFFFFF', 17, 8],
  ['shr', 'Shrewsbury Town', 'Shrewsbury', 'The Shrews', 'Shrewsbury', 1886, 'Croud Meadow', 9875, '#0033A0', '#FFB612', '#FFFFFF', 20, 18],
  ['swi', 'Swindon Town', 'Swindon', 'The Robins', 'Swindon', 1879, 'County Ground', 15728, '#E4022D', '#FFFFFF', '#FFFFFF', 21, 28],
  ['tra', 'Tranmere Rovers', 'Tranmere', 'The Superwhites', 'Birkenhead', 1884, 'Prenton Park', 16587, '#FFFFFF', '#0033A0', '#0033A0', 20, 22],
  ['wal', 'Walsall', 'Walsall', 'The Saddlers', 'Walsall', 1888, 'Bescot Stadium', 11300, '#E4022D', '#000000', '#FFFFFF', 20, 18],
];

/** Rivalries. Derby fixtures carry extra atmosphere, attendance, morale and board weight. */
export const RIVALRIES: [string, string][] = [
  ['ars', 'tot'], ['liv', 'eve'], ['mci', 'mun'], ['liv', 'mun'], ['che', 'tot'], ['ars', 'che'],
  ['new', 'sun'], ['avl', 'wba'], ['avl', 'bir'], ['wol', 'wba'], ['nfo', 'der'], ['lee', 'mun'],
  ['bha', 'cry'], ['whu', 'mil'], ['bur', 'bla'], ['shu', 'shw'], ['nor', 'ips'], ['bri', 'brs'],
  ['por', 'sou'], ['sto', 'prt'], ['swa', 'car'], ['hul', 'lee'], ['mid', 'sun'], ['pre', 'bla'],
  ['qpr', 'ful'], ['wat', 'lut'], ['cov', 'lei'], ['bol', 'wig'], ['brd', 'hud'], ['ply', 'exe'],
  ['not', 'nfo'], ['gri', 'lin'], ['cre', 'prt'], ['bar', 'don'], ['rot', 'shw'], ['tra', 'che'],
  ['stk', 'man'], ['col', 'cam'], ['chs', 'man'], ['nwp', 'wre'],
];

export const ALL_CLUB_SEEDS: { seeds: ClubSeed[]; leagueId: string }[] = [
  { seeds: PREMIER_LEAGUE_CLUBS, leagueId: 'premier-league' },
  { seeds: CHAMPIONSHIP_CLUBS, leagueId: 'championship' },
  { seeds: LEAGUE_ONE_CLUBS, leagueId: 'league-one' },
  { seeds: LEAGUE_TWO_CLUBS, leagueId: 'league-two' },
];

/**
 * Clubs the game will consider appointing the player to. All sit in the Championship and are
 * projected to finish somewhere between 10th and 16th — established second-tier clubs with a
 * decent ground, no parachute payments and no realistic promotion expectation. Exactly the
 * situation the brief asks for.
 */
export const STARTING_CLUB_POOL: string[] = [
  'bla', 'bri', 'cha', 'der', 'hul', 'mil', 'oxf', 'por', 'pre', 'qpr', 'shw', 'sto', 'swa', 'wat',
];
