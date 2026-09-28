import { CLUBS, getClub } from '../../data/clubs';
import { squadFor, squadStrength } from '../../data/squads';
import { barsFor, nextMatch, rankOf, type Career } from '../../engine/career';
import { afterTransfer, chooseTransfer, useGame } from '../../store/game';
import { playSound } from '../sound';
import { Confetti, ordinal, useEnterToContinue } from '../components/Bits';
import { ClubBadge, Shirt, clubStars } from '../components/Kit';
import { BADGES } from '../../engine/badges';

/**
 * Transfer news. Play well and bigger clubs come calling: pick one, or stay put. Have a tough
 * time and it's a move to a smaller club — you pick which, and they're glad to have you.
 */
export function Transfer({ career }: { career: Career }) {
  const movedTo = useGame((s) => s.movedTo);
  const fresh = useGame((s) => s.fresh);
  if (movedTo) return <Welcome career={career} clubId={movedTo} badges={fresh} />;
  const pending = career.pending;
  if (!pending) return <Welcome career={career} clubId={null} badges={[]} />;
  const club = getClub(career.clubId);
  const up = pending.kind === 'up';

  const choose = (clubId: string | null) => {
    if (career.sound) playSound(clubId ? 'transfer' : 'click');
    chooseTransfer(clubId);
  };

  return (
    <div className="ss-app ss-club-bg">
      <main className="ss-screen">
        <div className="ss-news-banner ss-pop">📰 TRANSFER NEWS</div>
        <h1 className="ss-headline">{up ? 'Big clubs want you!' : 'Time for a new club'}</h1>
        <p className="ss-hello-sub" style={{ textAlign: 'center' }}>
          {up
            ? `Your form of ${pending.form.toFixed(1)} has got everyone talking. Who do you want to sign for?`
            : `It's been tough at ${club.shortName} (form ${pending.form.toFixed(1)}). These clubs can't wait to give you lots of games — pick one!`}
        </p>

        <div className="ss-offers">
          {pending.offers.map((id) => {
            const c = getClub(id);
            const rank = rankOf(career, id);
            const star = [...squadFor(id, career.season)].sort((a, b) => b.ability - a.ability)[0];
            return (
              <section key={id} className="ss-card ss-offer ss-rise" style={{ '--club': c.colour, '--club2': c.colour2 } as React.CSSProperties} data-offer={id}>
                <div className="ss-offer-top">
                  <ClubBadge club={c} size={64} />
                  <Shirt kit={c.home} number={career.number} size={72} />
                </div>
                <h2>{c.name}</h2>
                <p className="ss-small" style={{ margin: 0 }}>
                  {clubStars(rank)} The {ordinal(rank)} biggest club · {c.stadium}
                </p>
                <ul className="ss-offer-facts">
                  <li>Team rating: {Math.round(squadStrength(id, career.season))}</li>
                  <li>
                    Star player: {star.name} ({star.ability})
                  </li>
                  <li>They expect a form of {barsFor(career, id).down.toFixed(1)} or better</li>
                </ul>
                <button type="button" className="ss-btn ss-btn-green ss-wide" onClick={() => choose(id)}>
                  ✍️ Sign for {c.shortName}!
                </button>
              </section>
            );
          })}
        </div>

        {up && (
          <div className="ss-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="ss-btn ss-btn-white" onClick={() => choose(null)}>
              No thanks, I'll stay at {club.shortName}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Welcome({ career, clubId, badges }: { career: Career; clubId: string | null; badges: import('../../engine/badges').BadgeId[] }) {
  useEnterToContinue(afterTransfer, true, 1200);
  const club = getClub(clubId ?? career.clubId);
  const rank = rankOf(career, club.id);
  const next = nextMatch(career);
  const biggest = rank === 1;
  return (
    <div className="ss-app ss-club-bg" style={{ '--club': club.colour, '--club2': club.colour2 } as React.CSSProperties}>
      {clubId && <Confetti colours={[club.colour, club.colour2, club.home.trim, '#ffd23f', '#ffffff']} />}
      <main className="ss-screen" style={{ alignItems: 'center' }}>
        <h1 className="ss-headline ss-pop">{clubId ? `Welcome to ${club.name}!` : `Staying at ${club.name}!`}</h1>
        <div className="ss-card ss-welcome ss-rise">
          <ClubBadge club={club} size={96} />
          <Shirt kit={club.home} number={career.number} size={120} />
          <div>
            <p className="ss-rating-word" style={{ margin: 0 }}>
              {career.name} · #{career.number}
            </p>
            <p style={{ margin: '6px 0' }}>
              {biggest ? '👑 The biggest club of them all!' : `${clubStars(rank)} The ${ordinal(rank)} biggest of ${CLUBS.length} clubs.`}
            </p>
            {next && <p className="ss-small">Your next match: v {getClub(next.opponentId).name}</p>}
          </div>
        </div>
        {badges.length > 0 && (
          <div className="ss-new-badges">
            {badges.map((id) => (
              <span key={id} className="ss-new-badge ss-pop">
                <span className="ss-badge">{BADGES[id].emoji}</span>
                <b>New badge: {BADGES[id].name}</b>
              </span>
            ))}
          </div>
        )}
        <button type="button" className="ss-btn ss-btn-green ss-btn-big" onClick={afterTransfer}>
          Let's go! →
        </button>
      </main>
    </div>
  );
}
