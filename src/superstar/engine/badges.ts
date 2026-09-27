/**
 * Badges: little trophies for the kid's sticker book. Every one is something to be proud of, and
 * once earned it's kept for ever.
 */

export type BadgeId =
  | 'debut'
  | 'first-win'
  | 'first-goal'
  | 'first-assist'
  | 'hat-trick'
  | 'player-of-the-match'
  | 'perfect-ten'
  | 'clean-sheet'
  | 'tackle-master'
  | 'big-move'
  | 'top-club'
  | 'ten-matches'
  | 'fifty-matches'
  | 'twenty-five-goals'
  | 'hundred-goals'
  | 'cup-final'
  | 'cup-winner'
  | 'penalty-hero'
  | 'champions'
  | 'golden-boot';

export type Badge = { emoji: string; name: string; how: string };

export const BADGES: Record<BadgeId, Badge> = {
  debut: { emoji: '👟', name: 'Debut!', how: 'Play your first match' },
  'first-win': { emoji: '🙌', name: 'First win', how: 'Win a match' },
  'first-goal': { emoji: '⚽', name: 'First goal', how: 'Score a goal' },
  'first-assist': { emoji: '🤝', name: 'Team player', how: 'Set up a teammate’s goal' },
  'hat-trick': { emoji: '🎩', name: 'Hat-trick hero', how: 'Score three goals in one match' },
  'player-of-the-match': { emoji: '🌟', name: 'Player of the Match', how: 'Get a rating of 8.5 or more' },
  'perfect-ten': { emoji: '💯', name: 'Perfect 10', how: 'Get a rating of 10' },
  'clean-sheet': { emoji: '🧤', name: 'Clean sheet', how: 'Keep the other team out (midfielders and defenders)' },
  'tackle-master': { emoji: '💪', name: 'Tackle master', how: 'Win five tackles in one match' },
  'big-move': { emoji: '✈️', name: 'Big move', how: 'Get transferred to a bigger club' },
  'top-club': { emoji: '👑', name: 'Top of the ladder', how: 'Sign for the biggest club of all' },
  'ten-matches': { emoji: '🔟', name: 'Ten matches', how: 'Play ten matches' },
  'fifty-matches': { emoji: '🏅', name: 'Fifty matches', how: 'Play fifty matches' },
  'twenty-five-goals': { emoji: '🥅', name: 'Goal machine', how: 'Score 25 goals' },
  'hundred-goals': { emoji: '💥', name: 'Century', how: 'Score 100 goals' },
  'cup-final': { emoji: '🏟️', name: 'Wembley!', how: 'Reach a cup final' },
  'cup-winner': { emoji: '🏆', name: 'Cup winner', how: 'Win the FA Cup or the EFL Cup' },
  'penalty-hero': { emoji: '🎯', name: 'Penalty hero', how: 'Win a penalty shootout' },
  champions: { emoji: '🥇', name: 'Champions!', how: 'Win the Premier League' },
  'golden-boot': { emoji: '👢', name: 'Golden Boot', how: 'Be the league’s top scorer' },
};

export const BADGE_ORDER = Object.keys(BADGES) as BadgeId[];
