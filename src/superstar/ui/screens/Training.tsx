import { MAX_ATTRIBUTE, overall, trainingCost, type Career } from '../../engine/career';
import { ATTRIBUTE_KEYS } from '../../engine/skills';
import { train } from '../../store/game';
import { playSound } from '../sound';
import { ATTRIBUTE_NAMES, PlayerCard, TopBar } from '../components/Bits';

/** The training ground: spend the points your matches earned to make your player better. */
export function Training({ career }: { career: Career }) {
  return (
    <div className="ss-app ss-club-bg">
      <TopBar career={career} />
      <main className="ss-screen">
        <h1 className="ss-headline">Training ground</h1>
        <p className="ss-hello-sub" style={{ textAlign: 'center' }}>
          Every match earns training points — more for playing well, scoring and setting up goals.
        </p>
        <div className="ss-training">
          <PlayerCard career={career} />
          <section className="ss-card">
            <h2>
              💪 You have <span className="ss-points-big">{career.points}</span> training {career.points === 1 ? 'point' : 'points'}
            </h2>
            <p className="ss-small">Your rating: {overall(career.attributes, career.position)}</p>
            <div className="ss-train-list">
              {ATTRIBUTE_KEYS.map((key) => {
                const value = career.attributes[key];
                const cost = trainingCost(value);
                const info = ATTRIBUTE_NAMES[key];
                const maxed = value >= MAX_ATTRIBUTE;
                return (
                  <div key={key} className="ss-train-row">
                    <span className="ss-train-emoji">{info.emoji}</span>
                    <span className="ss-train-name">
                      <b>{info.name}</b>
                      <span className="ss-small">{info.what}</span>
                    </span>
                    <span className="ss-train-bar">
                      <span style={{ width: `${value}%` }} />
                    </span>
                    <b className="ss-train-value">{value}</b>
                    <button
                      type="button"
                      className="ss-btn ss-btn-small ss-btn-green"
                      disabled={maxed || career.points < cost}
                      onClick={() => {
                        if (career.sound) playSound('click');
                        train(key);
                      }}
                      aria-label={`Train ${info.name}`}
                    >
                      {maxed ? 'Max!' : `+1 (${cost} pt${cost > 1 ? 's' : ''})`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
