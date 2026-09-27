import { useEffect, useRef } from 'react';
import { getClub, type Kit } from '../../data/clubs';
import { flagFor } from '../../data/flags';
import { careerTotals, overall, type Career } from '../../engine/career';
import type { PlayerPosition } from '../../engine/formation';
import { ratingColour } from '../../engine/rating';
import { ATTRIBUTE_KEYS, type Attributes } from '../../engine/skills';
import { goTo, toTitle, toggleSound, useGame, type Screen } from '../../store/game';
import { ClubBadge, Footballer, Shirt } from './Kit';

/** Small pieces shared by the career screens. */

export const POSITION_NAMES: Record<PlayerPosition, { name: string; code: string; emoji: string; job: string }> = {
  striker: { name: 'Striker', code: 'ST', emoji: '⚽', job: 'Score the goals' },
  winger: { name: 'Winger', code: 'WG', emoji: '💨', job: 'Race down the wing' },
  midfielder: { name: 'Midfielder', code: 'MID', emoji: '🎯', job: 'Pass, tackle and score' },
  defender: { name: 'Defender', code: 'DEF', emoji: '🛡️', job: 'Stop the other team' },
};

export const ATTRIBUTE_NAMES: Record<keyof Attributes, { short: string; name: string; emoji: string; what: string }> = {
  pace: { short: 'PAC', name: 'Pace', emoji: '⚡', what: 'Run faster' },
  shooting: { short: 'SHO', name: 'Shooting', emoji: '🎯', what: 'Harder, straighter shots' },
  passing: { short: 'PAS', name: 'Passing', emoji: '🤝', what: 'Passes that find your teammates' },
  dribbling: { short: 'DRI', name: 'Dribbling', emoji: '✨', what: 'Keep the ball when they tackle' },
  tackling: { short: 'TAC', name: 'Tackling', emoji: '🛡️', what: 'Win the ball back' },
  stamina: { short: 'STA', name: 'Stamina', emoji: '❤️', what: 'Sprint for longer' },
};

function cardStyle(rating: number): { background: string; tier: string } {
  if (rating >= 90) return { background: 'linear-gradient(145deg, #ff4f9a, #9b5cff 45%, #4fc3f7)', tier: 'Superstar' };
  if (rating >= 80) return { background: 'linear-gradient(145deg, #ffe680, #f5c518 55%, #d99a00)', tier: 'Gold' };
  if (rating >= 70) return { background: 'linear-gradient(145deg, #f4f7fb, #c0c7d0 60%, #9aa4b1)', tier: 'Silver' };
  return { background: 'linear-gradient(145deg, #f3c89a, #cd7f32 60%, #a8631f)', tier: 'Bronze' };
}

/** The kid's player card: overall rating, position, their footballer and six numbers. */
export function PlayerCard({ career, size = 'normal' }: { career: Career; size?: 'normal' | 'small' }) {
  const club = getClub(career.clubId);
  const rating = overall(career.attributes, career.position);
  const style = cardStyle(rating);
  const position = POSITION_NAMES[career.position];
  const totals = careerTotals(career);
  return (
    <div className={`ss-player-card ${size === 'small' ? 'ss-player-card-small' : ''}`} style={{ background: style.background }} data-testid="player-card">
      <div className="ss-player-card-top">
        <div className="ss-player-card-ovr">
          <span className="ss-player-card-num">{rating}</span>
          <span className="ss-player-card-pos">{position.code}</span>
          <ClubBadge club={club} size={size === 'small' ? 30 : 40} />
        </div>
        <Footballer look={career.look} kit={club.home} number={career.number} size={size === 'small' ? 110 : 150} />
      </div>
      <div className="ss-player-card-name">{career.name}</div>
      <div className="ss-player-card-info">
        #{career.number} · {position.name} · {club.shortName} · Age {career.age}
      </div>
      {size === 'normal' && (
        <>
          <div className="ss-player-card-stats">
            {ATTRIBUTE_KEYS.map((key) => (
              <span key={key} title={ATTRIBUTE_NAMES[key].name}>
                <b>{career.attributes[key]}</b> {ATTRIBUTE_NAMES[key].short}
              </span>
            ))}
          </div>
          <div className="ss-player-card-career">
            <span>
              <b>{totals.matches}</b> games
            </span>
            <span>
              <b>{totals.goals}</b> goals
            </span>
            <span>
              <b>{totals.assists}</b> assists
            </span>
            <span>
              <b>{totals.matches ? totals.averageRating.toFixed(1) : '–'}</b> avg
            </span>
          </div>
        </>
      )}
      <div className="ss-player-card-tier">{style.tier} card</div>
    </div>
  );
}

/** A real player's little card for the team sheet: rating, position, name, number and flag. */
export function MiniCard({
  name,
  number,
  position,
  ability,
  nationality,
  age,
  kit,
  you = false,
}: {
  name: string;
  number: number;
  position: string;
  ability: number;
  nationality: string;
  age?: number;
  kit: Kit;
  you?: boolean;
}) {
  const style = cardStyle(ability);
  return (
    <div className={`ss-mini-card ${you ? 'ss-mini-card-you' : ''}`} style={{ background: style.background }}>
      <span className="ss-mini-card-rating">{ability}</span>
      <span className="ss-mini-card-pos">{position}</span>
      <Shirt kit={kit} number={number} size={34} />
      <span className="ss-mini-card-name">{name}</span>
      {age !== undefined && <span className="ss-mini-card-age">Age {age}</span>}
      <span className="ss-mini-card-flag" title={you ? 'You!' : nationality}>
        {you ? '⭐' : flagFor(nationality)}
      </span>
    </div>
  );
}

export function RatingBubble({ rating, size = 'normal' }: { rating: number; size?: 'normal' | 'big' | 'small' }) {
  return (
    <span className={`ss-rating ss-rating-${size}`} style={{ background: ratingColour(rating) }}>
      {rating.toFixed(1)}
    </span>
  );
}

/** Your last few ratings, oldest first, as coloured bubbles. */
export function FormStrip({ ratings }: { ratings: number[] }) {
  if (ratings.length === 0) return <span className="ss-small">No matches yet — your first one is coming up!</span>;
  return (
    <span className="ss-row" style={{ gap: 6 }}>
      {ratings.map((r, i) => (
        <RatingBubble key={i} rating={r} size="small" />
      ))}
    </span>
  );
}

/** The bar across the top of the career screens: who you are, and where to go. */
export function TopBar({ career }: { career: Career }) {
  const screen = useGame((s) => s.screen);
  const club = getClub(career.clubId);
  const nav: { screen: Screen; label: string }[] = [
    { screen: 'hub', label: '🏠 My club' },
    { screen: 'table', label: '📊 Table' },
    { screen: 'training', label: career.points > 0 ? `💪 Training (${career.points})` : '💪 Training' },
    { screen: 'career', label: '🏆 My career' },
  ];
  return (
    <header className="ss-topbar">
      <button type="button" className="ss-topbar-me" onClick={() => goTo('hub')}>
        <ClubBadge club={club} size={40} />
        <span>
          <b>{career.name}</b>
          <small>
            #{career.number} · {club.shortName}
          </small>
        </span>
      </button>
      <nav className="ss-row" style={{ gap: 8 }}>
        {nav.map((item) => (
          <button
            key={item.screen}
            type="button"
            className={`ss-btn ss-btn-small ${screen === item.screen ? 'ss-btn-yellow' : 'ss-btn-white'}`}
            onClick={() => goTo(item.screen)}
            aria-current={screen === item.screen ? 'page' : undefined}
          >
            {item.label}
          </button>
        ))}
        <button type="button" className="ss-btn ss-btn-small ss-btn-white" onClick={toggleSound} aria-pressed={career.sound} title={career.sound ? 'Sound on' : 'Sound off'}>
          {career.sound ? '🔊' : '🔇'}
        </button>
        <button type="button" className="ss-btn ss-btn-small ss-btn-white" onClick={toTitle} title="Switch player">
          👥
        </button>
      </nav>
    </header>
  );
}

/** Paint the page in the current club's colours. */
export function useClubColours(clubId: string | null | undefined): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!clubId) {
      root.style.removeProperty('--club');
      root.style.removeProperty('--club2');
      return;
    }
    const club = getClub(clubId);
    root.style.setProperty('--club', club.colour);
    root.style.setProperty('--club2', club.colour2);
  }, [clubId]);
}

/**
 * Press Enter (or Space) to carry on — but only after a moment, so a kid still hammering keys
 * from the match doesn't skip past their result.
 */
export function useEnterToContinue(action: () => void, enabled = true, delayMs = 900): void {
  const ref = useRef(action);
  ref.current = action;
  useEffect(() => {
    if (!enabled) return;
    const armedAt = Date.now() + delayMs;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || Date.now() < armedAt) return;
      if (event.key !== 'Enter') return;
      if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;
      event.preventDefault();
      ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, delayMs]);
}

/** Confetti raining down the screen, in the colours given. For the big moments. */
export function Confetti({ colours, count = 90 }: { colours: string[]; count?: number }) {
  return (
    <div className="ss-confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colours[i % colours.length],
            animationDelay: `${(i % 20) * 0.12}s`,
            animationDuration: `${2.6 + (i % 7) * 0.35}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
