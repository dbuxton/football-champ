import { useId } from 'react';
import type { Club, Kit } from '../../data/clubs';
import { readableOn } from '../../data/colour';
import type { Look } from '../../engine/career';

/** Pictures drawn in SVG: shirts, club badges and the kid's own footballer. */

const SHIRT = 'M30 10 L42 5 Q50 12 58 5 L70 10 L93 24 L84 43 L74 37 L74 95 L26 95 L26 37 L16 43 L7 24 Z';

function Pattern({ kit, id }: { kit: Kit; id: string }) {
  const clip = `url(#${id})`;
  switch (kit.pattern) {
    case 'stripes':
      return (
        <g clipPath={clip} fill={kit.trim}>
          {[22, 40, 58, 76].map((x) => (
            <rect key={x} x={x} y="0" width="9" height="100" />
          ))}
        </g>
      );
    case 'hoops':
      return (
        <g clipPath={clip} fill={kit.trim}>
          {[30, 52, 74].map((y) => (
            <rect key={y} x="0" y={y} width="100" height="11" />
          ))}
        </g>
      );
    case 'halves':
      return <rect clipPath={clip} x="50" y="0" width="50" height="100" fill={kit.trim} />;
    case 'sleeves':
      return (
        <g clipPath={clip} fill={kit.trim}>
          <path d="M7 24 L30 10 L28 40 L16 43 Z" />
          <path d="M93 24 L70 10 L72 40 L84 43 Z" />
        </g>
      );
    case 'sash':
      return <path clipPath={clip} d="M20 0 L40 0 L100 80 L100 100 L85 100 L10 12 Z" fill={kit.trim} />;
    default:
      return null;
  }
}

/** A football shirt in a club's kit, with a number on the back if you like. */
export function Shirt({ kit, number, size = 64, title }: { kit: Kit; number?: number; size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <clipPath id={id}>
          <path d={SHIRT} />
        </clipPath>
      </defs>
      <path d={SHIRT} fill={kit.shirt} />
      <Pattern kit={kit} id={id} />
      <path d="M42 5 Q50 16 58 5" fill="none" stroke={kit.trim} strokeWidth="4" />
      <path d={SHIRT} fill="none" stroke="#1b1b3a" strokeWidth="4" strokeLinejoin="round" />
      {number !== undefined && (
        <text
          x="50"
          y="72"
          textAnchor="middle"
          fontSize="34"
          fontWeight="900"
          fill={kit.number}
          stroke={readableOn(kit.number) === '#ffffff' ? 'none' : 'rgba(0,0,0,0.15)'}
          style={{ fontFamily: 'inherit' }}
        >
          {number}
        </text>
      )}
    </svg>
  );
}

/** A club's badge: a shield in its colours with its three-letter name. */
export function ClubBadge({ club, size = 48 }: { club: Club; size?: number }) {
  const id = useId().replace(/:/g, '');
  const shield = 'M50 4 L92 16 Q92 64 50 96 Q8 64 8 16 Z';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={club.name}>
      <defs>
        <clipPath id={id}>
          <path d={shield} />
        </clipPath>
      </defs>
      <path d={shield} fill={club.colour} />
      <rect clipPath={`url(#${id})`} x="50" y="0" width="50" height="100" fill={club.colour2} />
      <circle cx="50" cy="50" r="24" fill="#fff" stroke="#1b1b3a" strokeWidth="4" />
      <text x="50" y="58" textAnchor="middle" fontSize="20" fontWeight="900" fill="#1b1b3a" style={{ fontFamily: 'inherit' }}>
        {club.code}
      </text>
      <path d={shield} fill="none" stroke="#1b1b3a" strokeWidth="5" strokeLinejoin="round" />
    </svg>
  );
}

/** The kid's footballer, standing proud in their kit. */
export function Footballer({ look, kit, number, size = 150 }: { look: Look; kit: Kit; number: number; size?: number }) {
  const id = useId().replace(/:/g, '');
  const skin = look.skin;
  return (
    <svg width={size * 0.75} height={size} viewBox="0 0 120 160" aria-hidden>
      <defs>
        <clipPath id={id}>
          <path d="M34 60 L46 54 L74 54 L86 60 L98 80 L88 88 L82 80 L82 110 L38 110 L38 80 L32 88 L22 80 Z" />
        </clipPath>
      </defs>
      {/* Legs, socks and boots */}
      <rect x="44" y="118" width="12" height="22" rx="5" fill={skin} />
      <rect x="64" y="118" width="12" height="22" rx="5" fill={skin} />
      <rect x="43" y="128" width="14" height="18" rx="5" fill={kit.socks} stroke="#1b1b3a" strokeWidth="2.5" />
      <rect x="63" y="128" width="14" height="18" rx="5" fill={kit.socks} stroke="#1b1b3a" strokeWidth="2.5" />
      <path d="M38 146 Q38 139 50 140 L58 140 L58 150 L38 150 Z" fill={look.boots} stroke="#1b1b3a" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M82 146 Q82 139 70 140 L62 140 L62 150 L82 150 Z" fill={look.boots} stroke="#1b1b3a" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Shorts */}
      <path d="M38 106 L82 106 L84 126 L62 126 L60 118 L58 126 L36 126 Z" fill={kit.shorts} stroke="#1b1b3a" strokeWidth="3" strokeLinejoin="round" />
      {/* Hands */}
      <circle cx="26" cy="92" r="6" fill={skin} stroke="#1b1b3a" strokeWidth="2.5" />
      <circle cx="94" cy="92" r="6" fill={skin} stroke="#1b1b3a" strokeWidth="2.5" />
      {/* Shirt */}
      <path d="M34 60 L46 54 L74 54 L86 60 L98 80 L88 88 L82 80 L82 110 L38 110 L38 80 L32 88 L22 80 Z" fill={kit.shirt} />
      <g clipPath={`url(#${id})`}>
        <KitPatternBody kit={kit} />
      </g>
      <path
        d="M34 60 L46 54 L74 54 L86 60 L98 80 L88 88 L82 80 L82 110 L38 110 L38 80 L32 88 L22 80 Z"
        fill="none"
        stroke="#1b1b3a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <text x="60" y="94" textAnchor="middle" fontSize="22" fontWeight="900" fill={kit.number} style={{ fontFamily: 'inherit' }}>
        {number}
      </text>
      {/* Neck and head */}
      <rect x="54" y="46" width="12" height="10" fill={skin} />
      <circle cx="60" cy="32" r="20" fill={skin} stroke="#1b1b3a" strokeWidth="3" />
      <circle cx="53" cy="33" r="2.6" fill="#1b1b3a" />
      <circle cx="67" cy="33" r="2.6" fill="#1b1b3a" />
      <path d="M52 41 Q60 47 68 41" fill="none" stroke="#1b1b3a" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="48" cy="39" r="3" fill="#ff8fa3" opacity="0.6" />
      <circle cx="72" cy="39" r="3" fill="#ff8fa3" opacity="0.6" />
      <HairSvg look={look} />
    </svg>
  );
}

function KitPatternBody({ kit }: { kit: Kit }) {
  switch (kit.pattern) {
    case 'stripes':
      return (
        <g fill={kit.trim}>
          {[42, 56, 70].map((x) => (
            <rect key={x} x={x} y="50" width="7" height="64" />
          ))}
        </g>
      );
    case 'hoops':
      return (
        <g fill={kit.trim}>
          {[70, 88].map((y) => (
            <rect key={y} x="20" y={y} width="80" height="8" />
          ))}
        </g>
      );
    case 'halves':
      return <rect x="60" y="50" width="40" height="64" fill={kit.trim} />;
    case 'sleeves':
      return (
        <g fill={kit.trim}>
          <path d="M20 60 L40 56 L40 84 L20 84 Z" />
          <path d="M100 60 L80 56 L80 84 L100 84 Z" />
        </g>
      );
    case 'sash':
      return <path d="M36 54 L50 54 L90 110 L76 110 Z" fill={kit.trim} />;
    default:
      return null;
  }
}

function HairSvg({ look }: { look: Look }) {
  const c = look.hair;
  const stroke = { stroke: '#1b1b3a', strokeWidth: 3, strokeLinejoin: 'round' as const };
  switch (look.hairStyle) {
    case 'buzz':
      return <path d="M41 28 Q42 12 60 11 Q78 12 79 28 Q70 20 60 20 Q50 20 41 28 Z" fill={c} {...stroke} />;
    case 'long':
      return <path d="M39 44 Q34 12 60 10 Q86 12 81 44 L76 44 Q78 22 60 20 Q44 22 44 44 Z" fill={c} {...stroke} />;
    case 'bun':
      return (
        <g>
          <circle cx="60" cy="9" r="8" fill={c} {...stroke} />
          <path d="M40 30 Q40 11 60 11 Q80 11 80 30 Q72 19 60 19 Q48 19 40 30 Z" fill={c} {...stroke} />
        </g>
      );
    case 'curly':
      return (
        <g fill={c} {...stroke}>
          {[
            [44, 22],
            [52, 14],
            [62, 12],
            [72, 16],
            [78, 25],
            [40, 31],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="8" />
          ))}
        </g>
      );
    case 'spiky':
      return <path d="M40 30 L42 14 L48 22 L52 8 L58 20 L64 7 L68 20 L74 10 L76 22 L80 16 L80 30 Q70 21 60 21 Q50 21 40 30 Z" fill={c} {...stroke} />;
    default:
      return <path d="M40 30 Q40 11 60 11 Q80 11 80 30 Q72 20 58 20 Q48 20 40 30 Z" fill={c} {...stroke} />;
  }
}

/** One to three stars for how big a club is. */
export function clubStars(rank: number): string {
  return rank <= 6 ? '⭐⭐⭐' : rank <= 13 ? '⭐⭐' : '⭐';
}
