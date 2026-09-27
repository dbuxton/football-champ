import { useState } from 'react';
import { CLUBS, getClub } from '../../data/clubs';
import { STARTING_ATTRIBUTES, overall, type Look } from '../../engine/career';
import { PLAYER_POSITIONS, type PlayerPosition } from '../../engine/formation';
import type { Difficulty } from '../../engine/match/types';
import { createCareer, goTo } from '../../store/game';
import { ATTRIBUTE_NAMES, POSITION_NAMES } from '../components/Bits';
import { ClubBadge, Footballer, Shirt, clubStars } from '../components/Kit';
import { ATTRIBUTE_KEYS } from '../../engine/skills';

/**
 * Making your footballer, one friendly step at a time: name and number, position, look, your
 * Premier League team, and how hard you'd like it.
 */

const SKINS = ['#f6d8bf', '#f1c9a5', '#e0ac85', '#c68e67', '#a8744f', '#8a5a3b', '#6f4a33', '#4e3423'];
const HAIR_COLOURS = ['#1a1a1a', '#2b1b0e', '#4a2c16', '#8a5a2b', '#b5462b', '#d9a441', '#f3e3a1', '#ff4f9a', '#4fc3f7'];
const HAIR_STYLES: { value: Look['hairStyle']; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'buzz', label: 'Buzz' },
  { value: 'curly', label: 'Curly' },
  { value: 'spiky', label: 'Spiky' },
  { value: 'long', label: 'Long' },
  { value: 'bun', label: 'Bun' },
];
const BOOTS = ['#ff4f9a', '#ffd23f', '#2fd158', '#4fc3f7', '#9b5cff', '#ff8a00', '#ffffff', '#1b1b1b'];

const DIFFICULTIES: { value: Difficulty; label: string; hint: string; emoji: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Best to start with. Defenders are slower and keepers make mistakes.', emoji: '😊' },
  { value: 'medium', label: 'Medium', hint: 'A proper game. You’ll have to work for your goals.', emoji: '😎' },
  { value: 'hard', label: 'Hard', hint: 'Premier League defenders at their toughest.', emoji: '🔥' },
];

const LENGTHS = [
  { value: 1.5, label: 'Quick', hint: '3 minutes' },
  { value: 2, label: 'Normal', hint: '4 minutes' },
  { value: 3, label: 'Long', hint: '6 minutes' },
];

const STEPS = ['You', 'Position', 'Look', 'Team', 'Ready'] as const;

export function Create() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [number, setNumber] = useState(7);
  const [position, setPosition] = useState<PlayerPosition>('striker');
  const [look, setLook] = useState<Look>({ skin: SKINS[2], hair: HAIR_COLOURS[2], hairStyle: 'short', boots: BOOTS[0] });
  const [clubId, setClubId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [halfMinutes, setHalfMinutes] = useState(2);

  const club = clubId ? getClub(clubId) : null;
  const previewKit = club?.home ?? { shirt: '#ffffff', trim: '#1b1b3a', shorts: '#1b1b3a', socks: '#ffffff', pattern: 'plain' as const, number: '#1b1b3a' };
  const trimmed = name.trim();
  const canGo = [trimmed.length > 0, true, true, clubId !== null, true][step];

  const next = () => {
    if (!canGo) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else if (clubId) createCareer({ name: trimmed, number, position, look, difficulty, halfMinutes, clubId });
  };

  return (
    <div className="ss-app ss-club-bg" style={club ? ({ '--club': club.colour, '--club2': club.colour2 } as React.CSSProperties) : undefined}>
      <main className="ss-screen">
        <div className="ss-row" style={{ justifyContent: 'space-between' }}>
          <h1 className="ss-headline">Make your footballer</h1>
          <button type="button" className="ss-btn ss-btn-small ss-btn-white" onClick={() => (step > 0 ? setStep(step - 1) : goTo('title'))}>
            ← Back
          </button>
        </div>

        <ol className="ss-steps" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'ss-step-now' : i < step ? 'ss-step-done' : ''}>
              {i < step ? '✓' : i + 1} {label}
            </li>
          ))}
        </ol>

        <div className="ss-create">
          <aside className="ss-card ss-create-preview">
            <Footballer look={look} kit={previewKit} number={number} size={190} />
            <p className="ss-create-name">{trimmed || 'Your name'}</p>
            <p className="ss-small">
              {POSITION_NAMES[position].emoji} {POSITION_NAMES[position].name}
              {club ? ` · ${club.shortName}` : ''}
            </p>
          </aside>

          <section className="ss-card ss-create-step ss-rise" key={step}>
            {step === 0 && (
              <>
                <h2>What's your name?</h2>
                <input
                  className="ss-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={12}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') next();
                  }}
                />
                <h2 style={{ marginTop: 18 }}>Pick your shirt number</h2>
                <div className="ss-row">
                  <button type="button" className="ss-btn ss-btn-small ss-btn-white" onClick={() => setNumber(number <= 1 ? 99 : number - 1)} aria-label="Lower number">
                    −
                  </button>
                  <span className="ss-big-number">{number}</span>
                  <button type="button" className="ss-btn ss-btn-small ss-btn-white" onClick={() => setNumber(number >= 99 ? 1 : number + 1)} aria-label="Higher number">
                    +
                  </button>
                  {[7, 9, 10, 11, 4, 23].map((n) => (
                    <button key={n} type="button" className={`ss-chip ${n === number ? 'ss-chip-on' : ''}`} onClick={() => setNumber(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h2>Where do you like to play?</h2>
                <div className="ss-choice-grid">
                  {PLAYER_POSITIONS.map((p) => {
                    const info = POSITION_NAMES[p];
                    const stats = STARTING_ATTRIBUTES[p];
                    const best = [...ATTRIBUTE_KEYS].sort((a, b) => stats[b] - stats[a]).slice(0, 2);
                    return (
                      <button key={p} type="button" className={`ss-choice ${p === position ? 'ss-choice-on' : ''}`} onClick={() => setPosition(p)} aria-pressed={p === position}>
                        <span className="ss-choice-emoji">{info.emoji}</span>
                        <b>{info.name}</b>
                        <span>{info.job}</span>
                        <span className="ss-small">
                          Best at {ATTRIBUTE_NAMES[best[0]].name.toLowerCase()} and {ATTRIBUTE_NAMES[best[1]].name.toLowerCase()} · rated {overall(stats, p)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2>How do you look?</h2>
                <p className="ss-label">Skin</p>
                <div className="ss-row">
                  {SKINS.map((c) => (
                    <button key={c} type="button" className={`ss-swatch ${c === look.skin ? 'ss-swatch-on' : ''}`} style={{ background: c }} onClick={() => setLook({ ...look, skin: c })} aria-label="Skin colour" />
                  ))}
                </div>
                <p className="ss-label">Hair</p>
                <div className="ss-row">
                  {HAIR_STYLES.map((h) => (
                    <button key={h.value} type="button" className={`ss-chip ${h.value === look.hairStyle ? 'ss-chip-on' : ''}`} onClick={() => setLook({ ...look, hairStyle: h.value })}>
                      {h.label}
                    </button>
                  ))}
                </div>
                <div className="ss-row" style={{ marginTop: 8 }}>
                  {HAIR_COLOURS.map((c) => (
                    <button key={c} type="button" className={`ss-swatch ${c === look.hair ? 'ss-swatch-on' : ''}`} style={{ background: c }} onClick={() => setLook({ ...look, hair: c })} aria-label="Hair colour" />
                  ))}
                </div>
                <p className="ss-label">Boots</p>
                <div className="ss-row">
                  {BOOTS.map((c) => (
                    <button key={c} type="button" className={`ss-swatch ${c === look.boots ? 'ss-swatch-on' : ''}`} style={{ background: c }} onClick={() => setLook({ ...look, boots: c })} aria-label="Boot colour" />
                  ))}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2>Pick your Premier League team</h2>
                <p className="ss-small">
                  ⭐⭐⭐ big clubs expect a lot. Start at a ⭐ club and play well, and the big clubs will come and sign you!
                </p>
                <div className="ss-club-grid">
                  {[...CLUBS]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`ss-club-choice ${c.id === clubId ? 'ss-club-choice-on' : ''}`}
                        style={{ '--club': c.colour, '--club2': c.colour2 } as React.CSSProperties}
                        onClick={() => setClubId(c.id)}
                        aria-pressed={c.id === clubId}
                        data-club={c.id}
                      >
                        <Shirt kit={c.home} size={52} />
                        <b>{c.shortName}</b>
                        <span className="ss-small">{clubStars(c.rank)}</span>
                      </button>
                    ))}
                </div>
              </>
            )}

            {step === 4 && club && (
              <>
                <h2>How hard?</h2>
                <div className="ss-choice-grid">
                  {DIFFICULTIES.map((d) => (
                    <button key={d.value} type="button" className={`ss-choice ${d.value === difficulty ? 'ss-choice-on' : ''}`} onClick={() => setDifficulty(d.value)} aria-pressed={d.value === difficulty}>
                      <span className="ss-choice-emoji">{d.emoji}</span>
                      <b>{d.label}</b>
                      <span className="ss-small">{d.hint}</span>
                    </button>
                  ))}
                </div>
                <h2 style={{ marginTop: 18 }}>How long are matches?</h2>
                <div className="ss-row">
                  {LENGTHS.map((l) => (
                    <button key={l.value} type="button" className={`ss-chip ${l.value === halfMinutes ? 'ss-chip-on' : ''}`} onClick={() => setHalfMinutes(l.value)}>
                      {l.label} <span className="ss-small">({l.hint})</span>
                    </button>
                  ))}
                </div>
                <div className="ss-row" style={{ marginTop: 18 }}>
                  <ClubBadge club={club} size={56} />
                  <p style={{ margin: 0, fontWeight: 800 }}>
                    {trimmed} signs for {club.name}! You can change difficulty and match length later.
                  </p>
                </div>
              </>
            )}

            <div className="ss-row" style={{ marginTop: 22, justifyContent: 'flex-end' }}>
              <button type="button" className="ss-btn ss-btn-green ss-btn-big" onClick={next} disabled={!canGo}>
                {step < STEPS.length - 1 ? 'Next →' : '⚽ Start my career!'}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
