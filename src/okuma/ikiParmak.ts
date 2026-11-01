import type { Pt } from './yakinlastirma';

export const PAN_THRESHOLD_PX = 8;
export const PINCH_THRESHOLD_PX = 12;
export const PINCH_THRESHOLD_RATIO = 0.08;

export interface FingerFrame { distance: number; center: Pt }
export interface FingerGesture {
  initial: FingerFrame;
  previous: FingerFrame;
  mode: 'waiting' | 'pan' | 'pinch';
}

export function fingerFrame(a: Pt, b: Pt): FingerFrame {
  return { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

export function startFingerGesture(frame: FingerFrame): FingerGesture {
  return { initial: frame, previous: frame, mode: 'waiting' };
}

// Pure: thresholds are measured from the start; pinch stays latched until the contacts lift.
export function decideFingerGesture(state: FingerGesture, frame: FingerFrame): {
  state: FingerGesture; dx: number; dy: number; scale: number;
} {
  const distanceChange = Math.abs(frame.distance - state.initial.distance);
  const pinch = state.mode === 'pinch' || (distanceChange >= PINCH_THRESHOLD_PX
    && distanceChange >= state.initial.distance * PINCH_THRESHOLD_RATIO);
  const displacement = Math.hypot(frame.center.x - state.initial.center.x, frame.center.y - state.initial.center.y);
  const mode = pinch ? 'pinch' : state.mode === 'pan' || displacement >= PAN_THRESHOLD_PX ? 'pan' : 'waiting';
  const previous = state.mode === 'waiting' ? state.initial : state.previous;
  return {
    state: { ...state, previous: frame, mode },
    dx: mode === 'pan' ? previous.center.x - frame.center.x : 0,
    dy: mode === 'pan' ? previous.center.y - frame.center.y : 0,
    scale: mode === 'pinch' ? frame.distance / Math.max(1, state.initial.distance) : 1,
  };
}
