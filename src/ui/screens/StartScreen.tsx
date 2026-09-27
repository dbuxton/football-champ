/**
 * The start screen: manager creation, difficulty, and loading an existing career.
 *
 * Notably absent: a club picker. The brief is explicit that the game chooses for you — you find
 * out who has appointed you when you press Begin, exactly as a real manager finds out who wants
 * them.
 */

import { useEffect, useState } from 'react';
import { GameState } from '../../engine/gamestate';
import { createNewGame } from '../../engine/generate';
import { Difficulty, Manager } from '../../engine/types';
import { FORMATIONS } from '../../engine/formations';
import { listSaves, loadGame, deleteSave, importSaveFile, SaveSlotMeta } from '../../game/save';
import { Field, OptionGroup, Panel } from '../components';

const BACKGROUNDS: { value: Manager['background']; label: string; hint: string }[] = [
  { value: 'Sunday League Footballer', label: 'Sunday League', hint: 'No reputation at all. The hard road.' },
  { value: 'Semi-Professional Footballer', label: 'Semi-Pro', hint: 'A name in non-league circles.' },
  { value: 'Professional Footballer', label: 'Professional', hint: 'Players will have heard of you.' },
  { value: 'International Footballer', label: 'International', hint: 'Real standing in the game.' },
  { value: 'National Coaching Badges', label: 'National Badges', hint: 'Coaching credentials, no playing career.' },
  { value: 'Continental Coaching Badges', label: 'Continental Badges', hint: 'The highest coaching qualification.' },
];

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: 'Easy', label: 'Easy', hint: 'The game leans your way. Patient board, forgiving results.' },
  { value: 'Normal', label: 'Normal', hint: 'A fair fight with a small nudge in your favour.' },
  { value: 'Hard', label: 'Hard', hint: 'No help. Rivals bid hard for your best players.' },
  { value: 'Legend', label: 'Legend', hint: 'Actively against you. Impatient board, no undo.' },
];

export function StartScreen({ onStart }: { onStart: (state: GameState) => void }) {
  const [firstName, setFirstName] = useState('Alex');
  const [lastName, setLastName] = useState('Morgan');
  const [nationality, setNationality] = useState('England');
  const [background, setBackground] = useState<Manager['background']>('National Coaching Badges');
  const [difficulty, setDifficulty] = useState<Difficulty>('Easy');
  const [formation, setFormation] = useState('4-4-2');
  const [saves, setSaves] = useState<SaveSlotMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSaves(listSaves()); }, []);

  const begin = () => {
    setBusy(true);
    setError(null);
    // Generating ~2,200 players takes a moment; yield first so the button shows its busy state.
    setTimeout(() => {
      try {
        const state = createNewGame({
          seed: Math.floor(Math.random() * 0xffffffff),
          managerFirstName: firstName.trim() || 'Alex',
          managerLastName: lastName.trim() || 'Morgan',
          managerNationality: nationality,
          managerBackground: background,
          difficulty,
          preferredFormation: formation,
        });
        onStart(state);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start a new game.');
        setBusy(false);
      }
    }, 30);
  };

  const load = async (id: string) => {
    setBusy(true);
    const state = await loadGame(id);
    if (state) onStart(state);
    else {
      setError('That save could not be loaded — it may be corrupt.');
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      onStart(await importSaveFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
      setBusy(false);
    }
  };

  return (
    <div className="newgame">
      <div className="newgame__card">
        <div style={{ padding: '20px 22px 4px' }}>
          <h1 className="newgame__title">Football Champ</h1>
          <p className="newgame__sub">
            Take charge of a Championship club and build something. Your appointment is not your
            choice — someone has to want you first.
          </p>
          <p className="newgame__sub">
            Rather be out on the pitch yourself?{' '}
            <a href="../" style={{ color: 'var(--accent)', fontWeight: 700 }}>Play Superstar</a>, where you are the
            footballer.
          </p>
        </div>

        <div style={{ padding: '10px 22px 20px' }} className="col">
          <div className="row row--wrap" style={{ gap: 10 }}>
            <Field label="First name">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={20} />
            </Field>
            <Field label="Surname">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={24} />
            </Field>
            <Field label="Nationality">
              <select value={nationality} onChange={(e) => setNationality(e.target.value)}>
                {['England', 'Scotland', 'Wales', 'Republic of Ireland', 'Northern Ireland',
                  'France', 'Spain', 'Portugal', 'Italy', 'Germany', 'Netherlands', 'Brazil',
                  'Argentina', 'Sweden', 'Norway', 'Denmark'].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
              </select>
            </Field>
            <Field label="Preferred formation">
              <select value={formation} onChange={(e) => setFormation(e.target.value)}>
                {FORMATIONS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Background">
            <OptionGroup options={BACKGROUNDS} value={background} onChange={setBackground} />
          </Field>

          <Field label="Difficulty">
            <OptionGroup options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />
          </Field>

          {error && <p className="neg small" style={{ margin: 0 }}>{error}</p>}

          <button type="button" className="btn btn--primary" onClick={begin} disabled={busy}
            style={{ padding: '10px', fontSize: 15 }}>
            {busy ? 'Building the football world…' : 'Begin your career'}
          </button>
          <p className="faint small" style={{ margin: 0 }}>
            Building the world generates 92 clubs and around 2,200 players. It takes a few seconds.
          </p>
        </div>

        {saves.length > 0 && (
          <div style={{ padding: '0 22px 18px' }}>
            <Panel title="Continue a career" flush>
              {saves.map((save) => (
                <div key={save.id} className="news-item" onClick={() => void load(save.id)}>
                  <span className="news-item__date">{save.date}</span>
                  <span className="news-item__body">
                    <span className="news-item__subject">{save.clubName}</span>
                    <span className="news-item__preview">
                      {save.managerName} · {save.season} · saved {new Date(save.savedAt).toLocaleString()}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--small btn--danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteSave(save.id).then(() => setSaves(listSaves()));
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </Panel>
          </div>
        )}

        <div style={{ padding: '0 22px 20px' }}>
          <label className="btn btn--small" style={{ display: 'inline-block' }}>
            Import a save file
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
