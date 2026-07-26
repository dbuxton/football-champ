/**
 * Backroom staff: who you have, what they're good at, dismissing the ones who aren't — and,
 * crucially, hiring better. Coaching quality is the biggest lever on player development.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, staffOf } from '../../engine/gamestate';
import { Staff, StaffRole } from '../../engine/types';
import { yearsBetween } from '../../engine/date';
import { hireStaff, sackStaff } from '../../game/actions';
import { clubCoachingRating } from '../../engine/progression';
import { ROLE_CAPS, freeAgentStaff, roleCapReached, staffWageDemand } from '../../engine/staffmarket';
import { Attr, ConfirmDialog, Panel, Tabs, exactMoney } from '../components';

/** Which attributes matter for each role, so the table shows the ones that count. */
const RELEVANT: Record<StaffRole, (keyof Staff['attributes'])[]> = {
  'Assistant Manager': ['tactical', 'manManagement', 'motivating', 'judgingAbility'],
  Coach: ['attacking', 'defending', 'technical', 'tactical'],
  'Goalkeeping Coach': ['goalkeeping', 'technical', 'motivating'],
  'Fitness Coach': ['fitness', 'motivating', 'discipline'],
  Physio: ['physiotherapy', 'fitness'],
  Scout: ['judgingAbility', 'judgingPotential'],
  'Head of Youth': ['youth', 'judgingPotential', 'manManagement'],
};

const ALL_ROLES = Object.keys(RELEVANT) as StaffRole[];

export function StaffScreen() {
  const { state, refresh, showToast } = useGame();
  const club = getClub(state, state.manager.clubId);
  const staff = staffOf(state, club.id);
  const [tab, setTab] = useState<'ours' | 'hire'>('ours');
  const [sacking, setSacking] = useState<Staff | null>(null);
  const [hiring, setHiring] = useState<Staff | null>(null);
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'All'>('All');

  const grouped = staff.reduce<Record<string, Staff[]>>((acc, member) => {
    (acc[member.role] ??= []).push(member);
    return acc;
  }, {});

  const coaching = clubCoachingRating(state, club.id);
  const coachingLabel = coaching >= 14 ? 'excellent' : coaching >= 10 ? 'good'
    : coaching >= 7 ? 'adequate' : 'poor';

  const market = useMemo(() => {
    const pool = freeAgentStaff(state)
      .filter((m) => roleFilter === 'All' || m.role === roleFilter);
    return pool.sort((a, b) => b.reputation - a.reputation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, roleFilter, staff.length]);

  return (
    <>
      <Panel
        title="Backroom staff"
        actions={
          <span className={`muted small ${coaching < 7 ? 'warn' : ''}`}>
            Coaching set-up: <b>{coachingLabel}</b> — it drives how fast your players develop
          </span>
        }
        flush
      >
        <Tabs
          tabs={[
            { id: 'ours', label: `Your staff (${staff.length})` },
            { id: 'hire', label: 'Hire', badge: freeAgentStaff(state).length || undefined },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Panel>

      {tab === 'ours' && (
        <>
          {Object.entries(grouped).map(([role, members]) => (
            <Panel
              key={role}
              title={`${role} (${members.length}/${ROLE_CAPS[role as StaffRole] ?? 1})`}
              flush
            >
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th><th className="num">Age</th><th>Nationality</th>
                    {RELEVANT[role as StaffRole].map((key) => (
                      <th key={key} className="num">{formatAttributeName(key)}</th>
                    ))}
                    <th className="num">Wage</th><th>Contract</th><th />
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>{member.firstName} {member.lastName}</td>
                      <td className="num">{yearsBetween(member.birthDate, state.date)}</td>
                      <td className="muted">{member.nationality}</td>
                      {RELEVANT[role as StaffRole].map((key) => (
                        <td key={key} className="num"><Attr value={member.attributes[key]} /></td>
                      ))}
                      <td className="num">{exactMoney(member.wage)}/w</td>
                      <td className="mono faint small">{member.contractExpires}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn btn--small btn--danger"
                          onClick={() => setSacking(member)}
                        >
                          Dismiss
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ))}

          <Panel title="How your staff affect the club">
            <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Coaches drive how quickly players improve in training. The best one in each discipline matters most, but depth helps.</li>
              <li>Physios shorten injury layoffs, alongside your medical facilities.</li>
              <li>Scouts decide how accurate your reports on other clubs' players are — a bad scout gives you confidently wrong numbers.</li>
              <li>Your Head of Youth shapes both the quality of the annual intake and how reliably it is assessed.</li>
              <li>The assistant manager picks the side and manages the bench when you hand it over.</li>
            </ul>
          </Panel>
        </>
      )}

      {tab === 'hire' && (
        <Panel
          title="Available staff"
          actions={
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as StaffRole | 'All')}>
              <option value="All">All roles</option>
              {ALL_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          }
          flush
        >
          <table className="data">
            <thead>
              <tr>
                <th>Name</th><th>Role</th><th className="num">Age</th>
                <th className="num" title="The attributes that matter for the role">Key attributes</th>
                <th className="num">Wants</th><th />
              </tr>
            </thead>
            <tbody>
              {market.length === 0 && (
                <tr><td colSpan={6} className="muted">Nobody suitable on the market right now — check back next week.</td></tr>
              )}
              {market.map((member) => {
                const capped = roleCapReached(state, club.id, member.role);
                return (
                  <tr key={member.id}>
                    <td>{member.firstName} {member.lastName}</td>
                    <td className="muted">{member.role}</td>
                    <td className="num">{yearsBetween(member.birthDate, state.date)}</td>
                    <td className="num">
                      <span className="row" style={{ gap: 7, justifyContent: 'flex-end' }}>
                        {RELEVANT[member.role].slice(0, 3).map((key) => (
                          <span key={key} className="small" title={formatAttributeName(key)}>
                            <Attr value={member.attributes[key]} />
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="num">{exactMoney(staffWageDemand(state, member))}/w</td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn btn--small btn--primary"
                        disabled={capped}
                        title={capped ? 'You already carry a full complement in this role' : undefined}
                        onClick={() => setHiring(member)}
                      >
                        {capped ? 'Full' : 'Hire'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {sacking && (
        <ConfirmDialog
          title={`Dismiss ${sacking.shortName}?`}
          danger
          confirmLabel="Dismiss"
          body={
            <p>
              You will have to pay up a share of the remaining contract, and the role will sit
              vacant until it is filled — which will hurt training, recovery or scouting depending
              on the job.
            </p>
          }
          onCancel={() => setSacking(null)}
          onConfirm={() => {
            const result = sackStaff(state, sacking.id);
            refresh();
            showToast(result.message, !result.ok);
            setSacking(null);
          }}
        />
      )}

      {hiring && (
        <ConfirmDialog
          title={`Appoint ${hiring.shortName} as ${hiring.role}?`}
          confirmLabel="Appoint"
          body={
            <p>
              {hiring.firstName} {hiring.lastName} wants{' '}
              <b>{exactMoney(staffWageDemand(state, hiring))} per week</b> on a two-year deal.
              Staff wages come straight off the bottom line every week.
            </p>
          }
          onCancel={() => setHiring(null)}
          onConfirm={() => {
            const result = hireStaff(state, hiring.id);
            refresh();
            showToast(result.message, !result.ok);
            setHiring(null);
          }}
        />
      )}
    </>
  );
}

function formatAttributeName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace('Judging ', 'Judge ');
}
