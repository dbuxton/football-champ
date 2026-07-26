/**
 * Transfers: player search with deep filters, the shortlist, and every offer in flight.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { POSITIONS, Player } from '../../engine/types';
import { PlayerSearchFilters, searchPlayers } from '../../engine/scouting';
import { respondToIncomingBid, withdrawBid, pressForAnswer, confirmSigning } from '../../game/actions';
import { canSign } from '../../engine/finance';
import {
  DataTable, Field, Kit, Panel, Tabs, money, squadColumns, exactMoney,
} from '../components';
import { BidDialog, ContractDialog } from './TransferDialogs';

type Tab = 'search' | 'shortlist' | 'offers' | 'incoming';

export function TransfersScreen() {
  const { state, refresh, showToast, inspectPlayer } = useGame();
  const club = getClub(state, state.manager.clubId);
  const [tab, setTab] = useState<Tab>('search');
  const [bidPlayer, setBidPlayer] = useState<string | null>(null);
  const [contractPlayer, setContractPlayer] = useState<string | null>(null);

  const [filters, setFilters] = useState<PlayerSearchFilters>({
    maxAge: 40, minAge: 15, positions: [],
  });

  const results = useMemo(() => searchPlayers(state, filters, 150), [state, filters]);
  const shortlisted = state.shortlist
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.retired);

  const outgoing = state.transferOffers.filter((o) => o.fromClubId === club.id && o.status !== 'expired');
  const incoming = state.transferOffers.filter((o) => o.toClubId === club.id && o.status === 'pending');
  const contractTalks = state.contractOffers.filter(
    (o) => o.clubId === club.id && o.status !== 'expired' && o.status !== 'completed',
  );

  const permission = canSign(state, club.id);

  const columns = squadColumns(state, { showClub: true, showKnowledge: true });
  const withActions = [
    ...columns,
    {
      key: 'action',
      label: '',
      render: (player: Player) => (
        <button
          type="button"
          className="btn btn--small"
          onClick={(event) => {
            event.stopPropagation();
            if (player.clubId) setBidPlayer(player.id);
            else setContractPlayer(player.id);
          }}
        >
          {player.clubId ? 'Bid' : 'Offer terms'}
        </button>
      ),
    },
  ];

  return (
    <>
      <Panel
        title="Transfer market"
        actions={
          <span className="muted small">
            Budget {money(club.finances.transferBudget)} ·{' '}
            Wages {exactMoney(club.finances.wageBudget)}/w ·{' '}
            <span className={state.transferWindowOpen ? 'pos' : 'warn'}>
              Window {state.transferWindowOpen ? 'open' : 'closed'}
            </span>
          </span>
        }
        flush
      >
        <Tabs
          tabs={[
            { id: 'search', label: 'Search' },
            { id: 'shortlist', label: 'Shortlist', badge: shortlisted.length || undefined },
            { id: 'offers', label: 'My offers', badge: outgoing.filter((o) => o.status !== 'completed').length || undefined },
            { id: 'incoming', label: 'Bids received', badge: incoming.length || undefined },
          ]}
          active={tab}
          onChange={setTab}
        />

        {!permission.allowed && (
          <p className="neg" style={{ padding: 11, margin: 0 }}>{permission.reason}</p>
        )}

        {tab === 'search' && (
          <>
            <div className="panel__body grid grid--3">
              <Field label="Name">
                <input
                  value={filters.name ?? ''}
                  placeholder="Search by name"
                  onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value || undefined }))}
                />
              </Field>
              <Field label="Position">
                <select
                  value={filters.positions?.[0] ?? ''}
                  onChange={(e) => setFilters((f) => ({
                    ...f, positions: e.target.value ? [e.target.value] : [],
                  }))}
                >
                  <option value="">Any</option>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Division">
                <select
                  value={filters.leagueId ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, leagueId: e.target.value || undefined }))}
                >
                  <option value="">Any</option>
                  {Object.values(state.competitions)
                    .filter((c) => c.kind === 'league')
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Maximum age">
                <input
                  type="number" min={15} max={45} value={filters.maxAge ?? 40}
                  onChange={(e) => setFilters((f) => ({ ...f, maxAge: Number(e.target.value) }))}
                />
              </Field>
              <Field label="Maximum value">
                <input
                  type="number" min={0} step={250_000} value={filters.maxValue ?? ''}
                  placeholder="No limit"
                  onChange={(e) => setFilters((f) => ({
                    ...f, maxValue: e.target.value ? Number(e.target.value) : undefined,
                  }))}
                />
              </Field>
              <Field label="Maximum wage (weekly)">
                <input
                  type="number" min={0} step={500} value={filters.maxWage ?? ''}
                  placeholder="No limit"
                  onChange={(e) => setFilters((f) => ({
                    ...f, maxWage: e.target.value ? Number(e.target.value) : undefined,
                  }))}
                />
              </Field>
              <div className="col" style={{ gridColumn: 'span 2' }}>
                {([
                  ['transferListedOnly', 'Transfer listed only'],
                  ['loanListedOnly', 'Available on loan'],
                  ['freeAgentsOnly', 'Free agents only'],
                  ['expiringContractsOnly', 'Contract expiring within a year'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="row" style={{ gap: 5 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(filters[key])}
                      onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked || undefined }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="col">
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => setFilters({ maxAge: 40, minAge: 15, positions: [] })}
                >
                  Reset filters
                </button>
                <span className="faint small">{results.length} players match</span>
              </div>
            </div>
            <DataTable
              columns={withActions}
              rows={results}
              rowKey={(p) => p.id}
              onRowClick={(p) => inspectPlayer(p.id)}
              defaultSort={{ key: 'stars', desc: true }}
              maxHeight={480}
              emptyMessage="Nobody matches those filters."
            />
          </>
        )}

        {tab === 'shortlist' && (
          <DataTable
            columns={withActions}
            rows={shortlisted}
            rowKey={(p) => p.id}
            onRowClick={(p) => inspectPlayer(p.id)}
            emptyMessage="Your shortlist is empty. Add players from their profile or from a scout report."
          />
        )}

        {tab === 'offers' && (
          <div className="panel__body col">
            {outgoing.length === 0 && contractTalks.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>You have no offers in progress.</p>
            )}

            {outgoing.length > 0 && (
              <table className="data">
                <thead>
                  <tr>
                    <th>Player</th><th>Club</th><th className="num">Offer</th>
                    <th>Status</th><th>Their response</th><th />
                  </tr>
                </thead>
                <tbody>
                  {outgoing.map((offer) => {
                    const player = state.players[offer.playerId];
                    return (
                      <tr key={offer.id}>
                        <td className="clickable" onClick={() => inspectPlayer(offer.playerId)}>
                          {player?.shortName}
                        </td>
                        <td>{state.clubs[offer.toClubId]?.shortName ?? 'Free agent'}</td>
                        <td className="num">{offer.isLoan ? 'Loan' : money(offer.fee)}</td>
                        <td>
                          <span className={`pill${offer.status === 'accepted' ? ' pill--good' : offer.status === 'rejected' ? ' pill--bad' : ''}`}>
                            {offer.status}
                          </span>
                        </td>
                        <td className="muted small">{offer.responseText}</td>
                        <td className="num">
                          <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            {offer.status === 'accepted' && (
                              <button
                                type="button"
                                className="btn btn--small btn--primary"
                                onClick={() => setContractPlayer(offer.playerId)}
                              >
                                Agree terms
                              </button>
                            )}
                            {(offer.status === 'negotiating' || offer.status === 'rejected') && (
                              <button
                                type="button"
                                className="btn btn--small"
                                onClick={() => setBidPlayer(offer.playerId)}
                              >
                                Improve
                              </button>
                            )}
                            {offer.status === 'pending' && (
                              <button
                                type="button"
                                className="btn btn--small"
                                onClick={() => { pressForAnswer(state, offer.id); refresh(); }}
                              >
                                Chase
                              </button>
                            )}
                            {offer.status !== 'completed' && (
                              <button
                                type="button"
                                className="btn btn--small btn--danger"
                                onClick={() => { withdrawBid(state, offer.id); refresh(); }}
                              >
                                Withdraw
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {contractTalks.length > 0 && (
              <>
                <div className="panel__head">Contract talks</div>
                <table className="data">
                  <thead>
                    <tr><th>Player</th><th className="num">Wage offered</th><th>Status</th><th>Response</th><th /></tr>
                  </thead>
                  <tbody>
                    {contractTalks.map((offer) => (
                      <tr key={offer.id}>
                        <td>{state.players[offer.playerId]?.shortName}</td>
                        <td className="num">{exactMoney(offer.wage)}/w</td>
                        <td>
                          <span className={`pill${offer.status === 'accepted' ? ' pill--good' : offer.status === 'rejected' ? ' pill--bad' : ''}`}>
                            {offer.status}
                          </span>
                        </td>
                        <td className="muted small">{offer.responseText}</td>
                        <td className="num">
                          {offer.status === 'accepted' ? (
                            <button
                              type="button"
                              className="btn btn--small btn--primary"
                              onClick={() => {
                                const result = confirmSigning(state, offer.id);
                                refresh();
                                showToast(result.message, !result.ok);
                              }}
                            >
                              Complete
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--small"
                              onClick={() => setContractPlayer(offer.playerId)}
                            >
                              Revise
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {tab === 'incoming' && (
          <div className="panel__body">
            {incoming.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Nobody has bid for your players.</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Player</th><th>From</th><th className="num">Fee</th>
                    <th className="num">Value</th><th>Terms</th><th />
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((offer) => {
                    const player = state.players[offer.playerId];
                    const bidder = state.clubs[offer.fromClubId];
                    return (
                      <tr key={offer.id}>
                        <td className="clickable" onClick={() => inspectPlayer(offer.playerId)}>
                          {player?.shortName}
                        </td>
                        <td><Kit club={bidder} /> {bidder?.shortName}</td>
                        <td className="num strong">{money(offer.fee)}</td>
                        <td className="num muted">{money(player?.value ?? 0)}</td>
                        <td className="muted small">
                          {offer.instalments ? `${offer.instalments + 1} instalments. ` : ''}
                          {offer.sellOnPercent ? `${offer.sellOnPercent}% sell-on. ` : ''}
                        </td>
                        <td className="num">
                          <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn--small"
                              onClick={() => {
                                const result = respondToIncomingBid(state, offer.id, false);
                                refresh();
                                showToast(result.message);
                              }}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              className="btn btn--small btn--primary"
                              onClick={() => {
                                const result = respondToIncomingBid(state, offer.id, true);
                                refresh();
                                showToast(result.message, !result.ok);
                              }}
                            >
                              Accept
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Panel>

      {bidPlayer && <BidDialog playerId={bidPlayer} onClose={() => setBidPlayer(null)} />}
      {contractPlayer && <ContractDialog playerId={contractPlayer} onClose={() => setContractPlayer(null)} />}
    </>
  );
}
