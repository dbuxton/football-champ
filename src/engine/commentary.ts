/**
 * Commentary text.
 *
 * The original games' atmosphere came almost entirely from a scrolling text feed, so the phrasing
 * matters. Lines are grouped by event and picked at random from the seeded match RNG, which keeps
 * a replayed match word-for-word identical.
 */

import { Rng } from './rng';

type Vars = Record<string, string | number>;

function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

export const COMMENTARY = {
  kickoff: [
    'The referee blows the whistle and we are under way at {venue}.',
    'We\'re off at {venue}, {home} getting us started.',
    '{referee} gets the game going here at {venue}.',
  ],
  buildUp: [
    '{team} knocking it about patiently in midfield.',
    '{player} picks it up in space and looks for options.',
    'Steady build-up from {team}, nothing on just yet.',
    '{player} switches the play out to the flank.',
    '{team} recycling possession, waiting for a gap.',
    '{player} drops deep to collect and turns forward.',
  ],
  chance: [
    '{player} works a yard of space on the edge of the box!',
    'Lovely ball in behind and {player} is through!',
    '{player} gets in down the channel — this looks dangerous!',
    'A moment of quality from {creator}, and {player} is in!',
    '{creator} threads it through and {player} has a sight of goal!',
    '{player} cuts inside and shapes to shoot!',
  ],
  goal: [
    'GOAL! {player} buries it! {home} {hg} - {ag} {away}',
    'IT\'S IN! {player} makes no mistake! {home} {hg} - {ag} {away}',
    'GOAL! What a finish from {player}! {home} {hg} - {ag} {away}',
    'GOAL! {player} slots it past the keeper! {home} {hg} - {ag} {away}',
    'THAT\'S A GOAL! {player} finds the bottom corner! {home} {hg} - {ag} {away}',
  ],
  goalAssisted: [
    'GOAL! {creator} sets it up and {player} finishes! {home} {hg} - {ag} {away}',
    'GOAL! Superb work from {creator}, tapped home by {player}! {home} {hg} - {ag} {away}',
    'GOAL! {player} converts {creator}\'s cross! {home} {hg} - {ag} {away}',
  ],
  headerGoal: [
    'GOAL! {player} rises highest and heads it home! {home} {hg} - {ag} {away}',
    'GOAL! A towering header from {player}! {home} {hg} - {ag} {away}',
  ],
  longRangeGoal: [
    'GOAL! {player} from distance — unstoppable! {home} {hg} - {ag} {away}',
    'GOAL! What a strike from {player}, right into the top corner! {home} {hg} - {ag} {away}',
  ],
  save: [
    '{keeper} gets down well to keep out {player}\'s effort.',
    'Good save! {keeper} pushes {player}\'s shot around the post.',
    '{player} strikes it cleanly but {keeper} is equal to it.',
    'Fine stop from {keeper} to deny {player}.',
  ],
  offTarget: [
    '{player} drags it wide of the far post.',
    'Over the bar from {player} — he\'ll be disappointed with that.',
    '{player} snatches at it and it flies harmlessly wide.',
    'A wasteful finish from {player}, well off target.',
  ],
  blocked: [
    '{defender} throws himself in the way to block {player}\'s shot.',
    'Brilliant block by {defender}!',
    '{player}\'s effort is deflected behind by {defender}.',
  ],
  woodwork: [
    'OFF THE POST! {player} is inches away!',
    'CROSSBAR! {player} rattles the frame of the goal!',
    'So close! {player} hits the upright and it stays out.',
  ],
  ownGoal: [
    'OWN GOAL! {player} turns it into his own net! {home} {hg} - {ag} {away}',
    'Disaster for {player} — into his own goal! {home} {hg} - {ag} {away}',
  ],
  penaltyAwarded: [
    'PENALTY! {player} is brought down in the area and the referee points to the spot!',
    'The referee gives a penalty! {player} was hauled down.',
  ],
  penaltyScored: [
    'Penalty converted by {player}! {home} {hg} - {ag} {away}',
    '{player} sends the keeper the wrong way from the spot! {home} {hg} - {ag} {away}',
  ],
  penaltyMissed: [
    'SAVED! {keeper} guesses right and keeps out {player}\'s penalty!',
    '{player} blazes the penalty over the bar!',
  ],
  corner: [
    'Corner to {team}.',
    '{team} win a corner on the right.',
    'It\'s deflected behind — corner {team}.',
  ],
  foul: [
    'Free kick to {team}, {player} the offender.',
    '{player} clatters into the back of his man. Free kick.',
    'The referee spots a foul by {player}.',
  ],
  yellow: [
    'Booked. {player} goes into the book for that challenge.',
    'Yellow card for {player}.',
    '{player} is cautioned by the referee.',
  ],
  secondYellow: [
    'Second yellow — and {player} is off! {team} down to ten.',
    'That\'s a second booking for {player}. He has to go.',
  ],
  red: [
    'RED CARD! {player} is sent off! {team} are down to ten men.',
    'Straight red for {player}. He walks.',
  ],
  offside: [
    'The flag goes up against {player}.',
    'Offside. {player} was just ahead of the last man.',
  ],
  injury: [
    '{player} is down and needs treatment.',
    'Concern for {team} — {player} is holding his hamstring.',
    '{player} has pulled up. That doesn\'t look good.',
  ],
  substitution: [
    'Substitution for {team}: {playerOn} replaces {playerOff}.',
    '{team} make a change — {playerOff} off, {playerOn} on.',
  ],
  halfTime: [
    'That\'s half time. {home} {hg} - {ag} {away}',
    'The whistle goes for the interval. {home} {hg} - {ag} {away}',
  ],
  secondHalf: [
    'We\'re back under way for the second half.',
    'The second half is under way at {venue}.',
  ],
  fullTime: [
    'FULL TIME. {home} {hg} - {ag} {away}',
    'That\'s the end of the game. {home} {hg} - {ag} {away}',
  ],
  pressure: [
    '{team} are camped in the opposition half now.',
    'Real pressure from {team} at the moment.',
    '{team} have turned the screw here.',
  ],
  quiet: [
    'It\'s gone a little flat here.',
    'A scrappy spell of football.',
    'Neither side able to string much together.',
    'The game has settled into a rhythm.',
  ],
  extraTime: ['We go to extra time.', 'Level after ninety — extra time it is.'],
  penaltyShootout: ['It will be settled from the penalty spot.', 'We go to penalties.'],
};

export function line(rng: Rng, bucket: keyof typeof COMMENTARY, vars: Vars): string {
  const options = COMMENTARY[bucket];
  return fill(rng.pick(options), vars);
}

const REFEREES = [
  'Michael Oliver', 'Anthony Taylor', 'Paul Tierney', 'Craig Pawson', 'Stuart Attwell',
  'Robert Jones', 'Darren England', 'Simon Hooper', 'Tim Robinson', 'John Brooks',
  'Andrew Madley', 'Peter Bankes', 'Sam Barrott', 'Tony Harrington', 'Josh Smith',
];

export function pickReferee(rng: Rng): string {
  return rng.pick(REFEREES);
}
