import { useEffect, useRef } from 'react';
import { CLUBS, getClub } from '../../data/clubs';
import { lineUp } from '../../engine/lineup';
import { createMatch, stepMatch } from '../../engine/match/sim';
import { DT } from '../../engine/match/tuning';
import { NO_INPUT, type MatchState } from '../../engine/match/types';
import { drawMatch, followCamera, type Camera, type Scene, type View } from './render';

/**
 * A match playing itself behind the title screen, filmed from the TV's wide camera: two random
 * clubs, computer players all over the pitch. When one finishes, another kicks off.
 */
export function DemoPitch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const view: View = { width: 0, height: 0, dpr: 1 };
    const cam: Camera = { x: 52, y: 34, scale: 8 };
    let state: MatchState;
    let scene: Scene;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let time = 0;
    let game = 0;

    const newMatch = () => {
      game++;
      const a = CLUBS[Math.floor(Math.random() * CLUBS.length)];
      let b = a;
      while (b.id === a.id) b = CLUBS[Math.floor(Math.random() * CLUBS.length)];
      const setup = lineUp({
        seed: Math.floor(Math.random() * 1e9) + game,
        clubId: a.id,
        opponentId: b.id,
        home: true,
        footballer: { name: 'Demo', number: 9, position: 'striker', attributes: { pace: 70, shooting: 70, passing: 70, dribbling: 70, tackling: 70, stamina: 70 } },
        difficulty: 'hard',
        halfSeconds: 60,
      });
      setup.autopilotKid = true;
      state = createMatch(setup);
      scene = {
        kits: [setup.teams[0].kit, setup.teams[1].kit],
        keeperColours: [setup.teams[0].keeperColour, setup.teams[1].keeperColour],
        crowd: [getClub(a.id).colour, getClub(a.id).colour2],
        kidLook: { skin: '#e0ac85', hair: '#4a2c16', hairStyle: 'short', boots: '#1b1b1b' },
        kidLabel: '',
      };
    };
    newMatch();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      view.width = rect.width;
      view.height = rect.height;
      view.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * view.dpr);
      canvas.height = Math.round(rect.height * view.dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      time += dt;
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 4) {
        stepMatch(state, NO_INPUT);
        acc -= DT;
        steps++;
      }
      if (steps === 4) acc = 0;
      if (state.phase === 'fulltime') newMatch();
      followCamera(cam, state, view, dt, true);
      drawMatch(ctx, state, scene, cam, view, time, []);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="ss-demo-pitch" aria-hidden />;
}
