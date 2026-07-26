/**
 * Player profile: the full attribute breakdown for your own players, a scout report for
 * everyone else.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { ageOf, totalStats, monthsUntil } from '../../engine/players';
import {
  ATTRIBUTE_LABELS, Attributes, GOALKEEPING_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, Player, POSITIONS,
  TECHNICAL_KEYS,
} from '../../engine/types';
import { knowledgeOf } from '../../engine/scouting';
import { setIndividualFocus, releasePlayer, setTransferStatus, toggleShortlist } from '../../game/actions';
import { IndividualFocus } from '../../engine/gamestate';
import {
  Attr, Bar, ConfirmDialog, Kit, Modal, Panel, abbreviateNation, exactMoney, money, stars,
} from '../components';
import { BidDialog, ContractDialog } from './TransferDialogs';

const FOCUS_OPTIONS: IndividualFocus[] = [
  'None', 'Finishing', 'Passing', 'Tackling', 'Fitness', 'Strength', 'Pace', 'Technique',
  'Heading', 'Positioning', 'Goalkeeping',
];

export function PlayerProfile({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { state, refresh, showToast } = useGame();
  const [bidding, setBidding] = useState(false);
  const [offering, setOffering] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const player = state.players[playerId];
  if (!player) return null;

  const club = player.clubId ? state.clubs[player.clubId] : null;
  const isOurs = player.clubId === state.manager.clubId;
  const knowledge = knowledgeOf(state, player);
  const stats = totalStats(player);
  const apps = stats.appearances + stats.substituteAppearances;
  const contractMonths = player.contract ? monthsUntil(state.date, player.contract.expires) : 0;

  const footer = (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => { toggleShortlist(state, player.id); refresh(); }}
      >
        {state.shortlist.includes(player.id) ? 'Remove from shortlist' : 'Add to shortlist'}
      </button>
      {isOurs ? (
        <>
          <button
            type="button"
            className={`btn${player.transferListed ? ' btn--danger' : ''}`}
            onClick={() => {
              setTransferStatus(state, player.id, { transferListed: !player.transferListed });
              refresh();
            }}
          >
            {player.transferListed ? 'Unlist' : 'Transfer list'}
          </button>
          <button type="button" className="btn btn--danger" onClick={() => setConfirmRelease(true)}>
            Release
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setOffering(true)}>
            Offer new contract
          </button>
        </>
      ) : (
        <>
          {!player.clubId ? (
            <button type="button" className="btn btn--primary" onClick={() => setOffering(true)}>
              Offer a contract
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => setBidding(true)}>
              Make an offer
            </button>
          )}
        </>
      )}
    </>
  );

  return (
    <>
      <Modal
        title={
          <span className="row">
            {club && <Kit club={club} />}
            {player.firstName} {player.lastName}
            <span className="pill">{player.naturalPosition}</span>
            {player.injury && <span className="pill pill--bad">Injured</span>}
            {player.suspensionMatches > 0 && <span className="pill pill--warn">Suspended</span>}
          </span>
        }
        onClose={onClose}
        footer={footer}
      >
        <div className="grid grid--2">
          <Panel title="Personal">
            <table className="data">
              <tbody>
                <tr><td>Club</td><td className="num">{club?.name ?? 'Free agent'}</td></tr>
                <tr><td>Age</td><td className="num">{ageOf(player, state.date)} ({player.birthDate})</td></tr>
                <tr><td>Nationality</td><td className="num">{player.nationality} ({abbreviateNation(player.nationality)})</td></tr>
                <tr><td>Height / weight</td><td className="num">{player.height}cm / {player.weight}kg</td></tr>
                <tr><td>Preferred foot</td><td className="num">{{ L: 'Left', R: 'Right', B: 'Both' }[player.foot]}</td></tr>
                <tr><td>Squad number</td><td className="num">{player.squadNumber || '—'}</td></tr>
                <tr><td>Value</td><td className="num strong">{money(player.value)}</td></tr>
                {player.contract && (
                  <>
                    <tr>
                      <td>Wage</td>
                      <td className="num">{isOurs ? `${exactMoney(player.contract.wage)}/w` : `~${money(player.contract.wage, { compact: false })}/w`}</td>
                    </tr>
                    <tr>
                      <td>Contract until</td>
                      <td className={`num${contractMonths < 6 ? ' neg strong' : contractMonths < 12 ? ' warn' : ''}`}>
                        {player.contract.expires}
                      </td>
                    </tr>
                    <tr><td>Squad status</td><td className="num">{player.contract.squadStatus}</td></tr>
                    {player.contract.releaseClause > 0 && (
                      <tr><td>Release clause</td><td className="num">{money(player.contract.releaseClause)}</td></tr>
                    )}
                  </>
                )}
                {player.loan && (
                  <tr>
                    <td>On loan from</td>
                    <td className="num">{state.clubs[player.loan.parentClubId]?.name} until {player.loan.returnDate}</td>
                  </tr>
                )}
                {player.injury && (
                  <tr>
                    <td>Injury</td>
                    <td className="num neg">{player.injury.type} — {player.injury.daysRemaining} days</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>

          <Panel title="This season">
            <table className="data">
              <tbody>
                <tr><td>Appearances</td><td className="num">{stats.appearances}{stats.substituteAppearances ? ` (${stats.substituteAppearances})` : ''}</td></tr>
                <tr><td>Minutes</td><td className="num">{stats.minutes.toLocaleString()}</td></tr>
                <tr><td>Goals</td><td className="num strong">{stats.goals}</td></tr>
                <tr><td>Assists</td><td className="num">{stats.assists}</td></tr>
                <tr><td>Average rating</td><td className="num">{apps ? (stats.ratingSum / apps).toFixed(2) : '—'}</td></tr>
                <tr><td>Man of the match</td><td className="num">{stats.motm}</td></tr>
                <tr><td>Cards</td><td className="num">{stats.yellowCards}Y {stats.redCards}R</td></tr>
                {player.naturalPosition === 'GK' && (
                  <>
                    <tr><td>Clean sheets</td><td className="num">{stats.cleanSheets}</td></tr>
                    <tr><td>Goals conceded</td><td className="num">{stats.goalsConceded}</td></tr>
                  </>
                )}
              </tbody>
            </table>
            <div className="col" style={{ marginTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Condition</span><Bar value={player.condition} showValue />
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Match sharpness</span><Bar value={player.matchSharpness} showValue />
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Morale</span><Bar value={player.morale} showValue />
              </div>
            </div>
          </Panel>
        </div>

        {knowledge.full ? (
          <>
            <div className="grid grid--2">
              <Panel title="Technical">
                <AttributeList keys={TECHNICAL_KEYS} player={player} />
              </Panel>
              <Panel title="Mental">
                <AttributeList keys={MENTAL_KEYS} player={player} />
              </Panel>
              <Panel title="Physical">
                <AttributeList keys={PHYSICAL_KEYS} player={player} />
              </Panel>
              {player.naturalPosition === 'GK' && (
                <Panel title="Goalkeeping">
                  <AttributeList keys={GOALKEEPING_KEYS} player={player} />
                </Panel>
              )}
            </div>

            <Panel title="Positions">
              <div className="row row--wrap">
                {POSITIONS.filter((p) => player.positions[p] >= 8).map((position) => (
                  <span key={position} className="pill" title={`Familiarity ${player.positions[position]}/20`}>
                    {position} <Attr value={player.positions[position]} />
                  </span>
                ))}
              </div>
            </Panel>

            {isOurs && (
              <Panel title="Individual training focus">
                <select
                  value={state.training.individual[player.id] ?? 'None'}
                  onChange={(event) => {
                    setIndividualFocus(state, player.id, event.target.value as IndividualFocus);
                    refresh();
                  }}
                >
                  {FOCUS_OPTIONS.map((focus) => <option key={focus} value={focus}>{focus}</option>)}
                </select>
                <p className="faint small" style={{ marginBottom: 0 }}>
                  Focused training pushes the related attributes harder, at the cost of balance
                  elsewhere. Progress is measured in seasons, not weeks.
                </p>
              </Panel>
            )}
          </>
        ) : (
          <Panel title="Scout report">
            {knowledge.report ? (
              <div className="col">
                <div className="row" style={{ gap: 24 }}>
                  <span>Ability <span className="warn">{stars(knowledge.stars)}</span></span>
                  <span>Potential <span className="warn">{stars(knowledge.potentialStars)}</span></span>
                  <span className="muted small">
                    Confidence {Math.round(knowledge.report.accuracy * 100)}%
                  </span>
                </div>
                <p style={{ margin: 0 }}>{knowledge.report.verdict}</p>
                <p className="faint small" style={{ margin: 0 }}>
                  Reported {knowledge.report.date} by {state.staff[knowledge.report.scoutId]?.shortName ?? 'a scout'}.
                  Send a scout to watch him for longer to narrow this down.
                </p>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Your scouts have not watched this player. Assign a scout on the Scouting screen to
                get a report.
              </p>
            )}
          </Panel>
        )}

        {player.history.length > 0 && (
          <Panel title="Career history" flush>
            <table className="data">
              <thead>
                <tr>
                  <th>Season</th><th>Club</th><th className="num">Apps</th>
                  <th className="num">Goals</th><th className="num">Assists</th><th className="num">Av rating</th>
                </tr>
              </thead>
              <tbody>
                {[...player.history].reverse().map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.season}</td>
                    <td>{entry.clubName}</td>
                    <td className="num">{entry.appearances}</td>
                    <td className="num">{entry.goals}</td>
                    <td className="num">{entry.assists}</td>
                    <td className="num">{entry.averageRating.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </Modal>

      {bidding && (
        <BidDialog playerId={player.id} onClose={() => setBidding(false)} />
      )}
      {offering && (
        <ContractDialog playerId={player.id} onClose={() => setOffering(false)} />
      )}
      {confirmRelease && (
        <ConfirmDialog
          title={`Release ${player.shortName}?`}
          danger
          confirmLabel="Release him"
          body={
            <p>
              Terminating the contract means paying up a share of what is left on it. He will
              become a free agent and any club can sign him — including a rival. This cannot be
              undone once the day advances.
            </p>
          }
          onCancel={() => setConfirmRelease(false)}
          onConfirm={() => {
            const result = releasePlayer(state, player.id);
            refresh();
            showToast(result.message, !result.ok);
            setConfirmRelease(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

function AttributeList({
  keys,
  player,
}: {
  keys: readonly string[];
  player: Player;
}) {
  return (
    <table className="data">
      <tbody>
        {keys.map((key) => (
          <tr key={key}>
            <td>{ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS]}</td>
            <td className="num"><Attr value={player.attributes[key as keyof Attributes]} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
