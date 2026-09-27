import { useRef, useState, type RefObject } from 'react';
import type { Controls } from './controls';

/**
 * On-screen controls for a tablet: a thumb-stick on the left, big PASS / SHOOT / SPRINT buttons
 * on the right. They write straight into the same input the keyboard does.
 */
export function TouchPad({ controls }: { controls: RefObject<Controls | null> }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  const moveStick = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    const touch = controls.current?.touch;
    if (!base || !touch) return;
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (clientX - (rect.left + radius)) / radius;
    let dy = (clientY - (rect.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    touch.x = Math.abs(dx) < 0.15 ? 0 : dx;
    touch.y = Math.abs(dy) < 0.15 ? 0 : dy;
    setKnob({ x: dx, y: dy });
  };

  const releaseStick = () => {
    pointer.current = null;
    const touch = controls.current?.touch;
    if (touch) {
      touch.x = 0;
      touch.y = 0;
    }
    setKnob({ x: 0, y: 0 });
  };

  const button = (key: 'pass' | 'shoot' | 'sprint', label: string, className: string) => (
    <button
      type="button"
      className={`ss-touch-button ${className}`}
      onPointerDown={(event) => {
        event.preventDefault();
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        if (controls.current) controls.current.touch[key] = true;
      }}
      onPointerUp={() => {
        if (controls.current) controls.current.touch[key] = false;
      }}
      onPointerCancel={() => {
        if (controls.current) controls.current.touch[key] = false;
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="ss-touchpad">
      <div
        ref={baseRef}
        className="ss-stick"
        onPointerDown={(event) => {
          event.preventDefault();
          pointer.current = event.pointerId;
          (event.target as HTMLElement).setPointerCapture(event.pointerId);
          moveStick(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (pointer.current === event.pointerId) moveStick(event.clientX, event.clientY);
        }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
      >
        <span className="ss-stick-knob" style={{ transform: `translate(${knob.x * 40}%, ${knob.y * 40}%)` }} />
      </div>
      <div className="ss-touch-buttons">
        {button('sprint', 'SPRINT', 'ss-touch-sprint')}
        {button('pass', 'PASS', 'ss-touch-pass')}
        {button('shoot', 'SHOOT', 'ss-touch-shoot')}
      </div>
    </div>
  );
}
