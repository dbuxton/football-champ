import { useCallback, useEffect, useRef, useState } from 'react';
import { readableOn } from '../../data/colour';
import { createMatch, minuteOf, stepMatch } from '../../engine/match/sim';
import { DT } from '../../engine/match/tuning';
import type { Input, MatchEvent, MatchSetup, MatchState, Side } from '../../engine/match/types';
import { playSound } from '../sound';
import { createControls, touchScreen, type Controls } from './controls';
import { drawMatch, drawMiniMap, followCamera, type Camera, type Particle, type Scene, type View } from './render';
import { TouchPad } from './TouchPad';

/**
 * A match you play. The engine runs at a steady sixty steps a second behind a canvas; this
 * component only draws it, feeds it the kid's buttons, and puts the score, the clock and the
 * cheering on top.
 */

type Banner = { key: number; big: string; small?: string; tone: 'goal' | 'sad' | 'info' | 'praise' };

export type MatchScreenProps = {
  setup: MatchSetup;
  scene: Scene;
  sound: boolean;
  /** Show the controls card until the kid presses something. */
  showHelp: boolean;
  onFinish: (state: MatchState) => void;
  onQuit: () => void;
  /** Plays itself (the title screen's demo, and the tests). */
  autopilot?: (s: MatchState) => Input;
  /** Show the whole pitch, like the TV's wide shot, instead of following the kid. */
  wide?: boolean;
};

export function MatchScreen({ setup, scene, sound, showHelp, onFinish, onQuit, autopilot, wide = false }: MatchScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<MatchState | null>(null);
  const controlsRef = useRef<Controls | null>(null);
  const pausedRef = useRef(false);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const [hud, setHud] = useState({ score: [0, 0] as [number, number], minute: 0, energy: 1, half: 1 });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(showHelp && !autopilot);
  // The match waits while the "how to play" card is up.
  const helpRef = useRef(help);
  helpRef.current = help;

  const pause = useCallback(() => {
    if (stateRef.current?.phase === 'fulltime') return;
    pausedRef.current = true;
    setPaused(true);
    controlsRef.current?.release();
  }, []);
  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const map = mapRef.current;
    const mapCtx = map?.getContext('2d') ?? null;
    const state = createMatch(setup);
    stateRef.current = state;
    const controls = createControls();
    controlsRef.current = controls;
    const cam: Camera = { x: state.ball.x, y: state.ball.y, scale: 16 };
    const view: View = { width: 0, height: 0, dpr: 1 };
    const particles: Particle[] = [];
    let lastSeq = 0;
    let lastOwner = -1;
    let bannerKey = 0;
    let finishedAt = 0;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let time = 0;
    let hudMinute = -1;
    let hudEnergy = -1;
    let hudGoals = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      view.width = rect.width;
      view.height = rect.height;
      view.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * view.dpr);
      canvas.height = Math.round(rect.height * view.dpr);
      if (map) {
        const r = map.getBoundingClientRect();
        map.width = Math.round(r.width * view.dpr);
        map.height = Math.round(r.height * view.dpr);
      }
      cam.scale = Math.min(view.width / 44, view.height / 24);
    };
    resize();
    window.addEventListener('resize', resize);

    const show = (big: string, tone: Banner['tone'], small?: string) => {
      bannerKey += 1;
      setBanner({ key: bannerKey, big, small, tone });
    };

    const confetti = (side: Side, x: number, y: number) => {
      const kit = scene.kits[side];
      const colours = [kit.shirt, kit.trim, '#ffe600', '#ff4f9a', '#4fc3f7', '#ffffff'];
      for (let i = 0; i < 140; i++) {
        particles.push({
          x,
          y: y + (Math.random() - 0.5) * 6,
          z: 1 + Math.random() * 2,
          vx: (Math.random() - 0.5) * 14,
          vy: (Math.random() - 0.5) * 14,
          vz: 4 + Math.random() * 9,
          colour: colours[i % colours.length],
          life: 2.5 + Math.random(),
          spin: Math.random() * 6,
        });
      }
    };

    const react = (e: MatchEvent) => {
      const kid = state.humanId;
      const who = (id: number) => (id >= 0 ? state.agents[id] : null);
      const name = (id: number) => (id === kid ? scene.kidLabel : who(id)?.shortName ?? '');
      switch (e.kind) {
        case 'kickoff':
          if (sound) playSound('whistle');
          break;
        case 'goal':
        case 'own-goal': {
          if (sound) playSound('goal');
          const scorer = e.agent;
          if (e.side === 0) {
            confetti(0, state.ball.x, state.ball.y);
            if (scorer === kid) show('GOAL!', 'goal', `${scene.kidLabel} scores! 🎉`);
            else if (e.other === kid) show('GOAL!', 'goal', `${name(scorer)} scores — what a pass, ${scene.kidLabel}!`);
            else show('GOAL!', 'goal', e.kind === 'own-goal' ? 'An own goal!' : `${name(scorer)} scores!`);
          } else {
            show('They scored', 'sad', 'Keep going — you can get it back!');
          }
          break;
        }
        case 'save':
          if (e.other === kid) {
            if (sound) playSound('ooh');
            show('So close!', 'info', `Great save by ${name(e.agent)}`);
          }
          break;
        case 'miss':
          if (e.agent === kid) {
            if (sound) playSound('ooh');
            show('Just wide!', 'info', 'Keep shooting!');
          }
          break;
        case 'woodwork':
          if (sound) playSound('ooh');
          if (e.agent === kid) show('Off the post!', 'info', 'Unlucky!');
          break;
        case 'tackle':
          if (sound) playSound('tackle');
          if (e.agent === kid) show('Great tackle!', 'praise');
          break;
        case 'interception':
          if (e.agent === kid) show('Nice interception!', 'praise');
          break;
        case 'half-time':
          if (sound) playSound('whistle');
          show('Half time', 'info', `${state.score[0]} – ${state.score[1]}`);
          break;
        case 'full-time':
          if (sound) playSound('final-whistle');
          show('Full time!', 'info', `${state.score[0]} – ${state.score[1]}`);
          break;
        default:
          break;
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !helpRef.current) {
        time += dt;
        acc += dt;
        let steps = 0;
        while (acc >= DT && steps < 6) {
          const input = autopilot ? autopilot(state) : controls.read();
          stepMatch(state, input);
          acc -= DT;
          steps++;
        }
        if (steps === 6) acc = 0;

        // Sounds for kicks, and a reaction to anything that happened.
        const ball = state.ball;
        if (lastOwner >= 0 && ball.owner < 0 && Math.hypot(ball.vx, ball.vy) > 6 && sound) playSound(ball.shot ? 'shot' : 'kick');
        lastOwner = ball.owner;
        for (const e of state.events) {
          if (e.seq > lastSeq) react(e);
        }
        lastSeq = state.seq;

        for (let i = particles.length - 1; i >= 0; i--) {
          const q = particles[i];
          q.vz -= 9 * dt;
          q.vx *= 1 - 1.2 * dt;
          q.vy *= 1 - 1.2 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.z = Math.max(0, q.z + q.vz * dt);
          q.spin += dt * 8;
          q.life -= dt;
          if (q.life <= 0) particles.splice(i, 1);
        }

        const minute = minuteOf(state);
        const energy = Math.round(state.agents[state.humanId].energy * 20) / 20;
        const goals = state.score[0] + state.score[1];
        if (minute !== hudMinute || energy !== hudEnergy || goals !== hudGoals) {
          hudMinute = minute;
          hudEnergy = energy;
          hudGoals = goals;
          setHud({ score: [state.score[0], state.score[1]], minute, energy, half: state.half });
        }

        if (state.phase === 'fulltime') {
          finishedAt ||= now;
          if (now - finishedAt > 2600) {
            finishRef.current(state);
            return;
          }
        }
      }
      followCamera(cam, state, view, dt, wide);
      drawMatch(ctx, state, scene, cam, view, time, particles);
      if (mapCtx && map) drawMiniMap(mapCtx, state, scene, map.width / view.dpr, map.height / view.dpr, view.dpr);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Wander off and the match waits for you.
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    const onKey = (event: KeyboardEvent) => {
      if (helpRef.current) {
        // The first key just closes the help card; it doesn't also start a run or a shot.
        setHelp(false);
        controls.release();
        return;
      }
      if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
        if (pausedRef.current) resume();
        else pause();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', pause);
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', pause);
      window.removeEventListener('keydown', onKey);
      controls.dispose();
    };
    // The match is set up once; everything it needs is fixed for its lifetime.
  }, []);

  // A banner fades on its own.
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner((b) => (b?.key === banner.key ? null : b)), banner.tone === 'goal' ? 2600 : 1700);
    return () => clearTimeout(timer);
  }, [banner]);

  const home = setup.teams[setup.homeSide];
  const away = setup.teams[setup.homeSide === 0 ? 1 : 0];
  const homeScore = hud.score[setup.homeSide];
  const awayScore = hud.score[setup.homeSide === 0 ? 1 : 0];

  return (
    <div className="ss-match" data-testid="match">
      <canvas ref={canvasRef} className="ss-pitch" />

      <div className="ss-scoreboard" aria-live="polite">
        <span className="ss-score-team" style={{ background: home.kit.shirt, color: readableOn(home.kit.shirt), borderColor: home.kit.trim }}>
          {home.code}
        </span>
        <span className="ss-score-numbers" data-testid="score">
          {homeScore} – {awayScore}
        </span>
        <span className="ss-score-team" style={{ background: away.kit.shirt, color: readableOn(away.kit.shirt), borderColor: away.kit.trim }}>
          {away.code}
        </span>
        <span className="ss-clock" data-testid="clock">
          {hud.minute}'
        </span>
      </div>

      <button type="button" className="ss-pause-button" onClick={pause} aria-label="Pause">
        ⏸
      </button>

      <div className="ss-energy" aria-label="Sprint energy">
        <span>⚡</span>
        <span className="ss-energy-bar">
          <span style={{ width: `${Math.round(hud.energy * 100)}%` }} />
        </span>
      </div>

      <canvas ref={mapRef} className="ss-minimap" aria-hidden />

      {banner && (
        <div key={banner.key} className={`ss-banner ss-banner-${banner.tone}`} role="status">
          <span className="ss-banner-big">{banner.big}</span>
          {banner.small && <span className="ss-banner-small">{banner.small}</span>}
        </div>
      )}

      {help && (
        <div className="ss-help" onClick={() => setHelp(false)} role="dialog" aria-label="How to play">
          <p className="ss-help-title">How to play</p>
          {touchScreen ? (
            <ul>
              <li>🕹️ Drag the stick to run</li>
              <li>⚽ Tap <b>PASS</b> to pass — or to shout for the ball</li>
              <li>🥅 Hold <b>SHOOT</b>, then let go to shoot</li>
            </ul>
          ) : (
            <ul>
              <li>
                <kbd>←</kbd>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>→</kbd> run
              </li>
              <li>
                <kbd>X</kbd> pass — or shout for the ball
              </li>
              <li>
                <kbd className="ss-kbd-wide">Space</kbd> shoot — hold it for more power
              </li>
              <li>
                <kbd className="ss-kbd-wide">Shift</kbd> sprint
              </li>
            </ul>
          )}
          <p className="ss-help-small">You're the one with the yellow ring. Press any key (or tap here) to start!</p>
        </div>
      )}

      {touchScreen && !autopilot && <TouchPad controls={controlsRef} />}

      {paused && (
        <div className="ss-overlay" role="dialog" aria-label="Paused">
          <div className="ss-card ss-pause-card">
            <h2>Paused</h2>
            <button type="button" className="ss-btn ss-btn-green ss-btn-big" onClick={resume}>
              Keep playing ▶
            </button>
            <button type="button" className="ss-btn ss-btn-pink" onClick={onQuit}>
              Stop this match
            </button>
            <p className="ss-small">A match you stop doesn't count. You can play it again.</p>
          </div>
        </div>
      )}
    </div>
  );
}

