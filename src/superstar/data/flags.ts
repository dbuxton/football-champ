/**
 * A flag for each nationality in the squad list, for the player cards. Most are built from the
 * country's two-letter code; England, Scotland and Wales have flags of their own.
 */

const CODES: Record<string, string> = {
  Netherlands: 'NL',
  France: 'FR',
  Brazil: 'BR',
  Spain: 'ES',
  Germany: 'DE',
  Portugal: 'PT',
  Belgium: 'BE',
  Italy: 'IT',
  Argentina: 'AR',
  Denmark: 'DK',
  Sweden: 'SE',
  'Ivory Coast': 'CI',
  'Republic of Ireland': 'IE',
  Norway: 'NO',
  Nigeria: 'NG',
  Senegal: 'SN',
  Morocco: 'MA',
  Japan: 'JP',
  Switzerland: 'CH',
  Serbia: 'RS',
  'United States': 'US',
  Cameroon: 'CM',
  Colombia: 'CO',
  'Northern Ireland': 'GB',
  Ghana: 'GH',
  Turkey: 'TR',
  Greece: 'GR',
  'Czech Republic': 'CZ',
  Croatia: 'HR',
  Uruguay: 'UY',
  Ecuador: 'EC',
  Poland: 'PL',
  Ukraine: 'UA',
  'Burkina Faso': 'BF',
  Paraguay: 'PY',
  Mali: 'ML',
  Mexico: 'MX',
  Slovenia: 'SI',
  Hungary: 'HU',
  Egypt: 'EG',
  Iceland: 'IS',
  Jamaica: 'JM',
  Gambia: 'GM',
  Slovakia: 'SK',
  Tunisia: 'TN',
  'South Africa': 'ZA',
  Albania: 'AL',
  'Guinea-Bissau': 'GW',
  Bulgaria: 'BG',
  Georgia: 'GE',
  Uzbekistan: 'UZ',
  Algeria: 'DZ',
  'New Zealand': 'NZ',
  Mozambique: 'MZ',
  Austria: 'AT',
  Romania: 'RO',
  Zimbabwe: 'ZW',
  'South Korea': 'KR',
};

/** England, Scotland and Wales: black flag plus tag letters. */
const SUBDIVISIONS: Record<string, string> = {
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  Wales: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
};

export function flagFor(nationality: string): string {
  const special = SUBDIVISIONS[nationality];
  if (special) return special;
  const code = CODES[nationality];
  if (!code) return '🏳️';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
