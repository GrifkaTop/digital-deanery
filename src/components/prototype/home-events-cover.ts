export const defaultCoverScrollStep = 144;
const firstStepRatio = 0.5;
const scrollPause = 180;

type CoverSelection = { index: number; remainder: number; lastAt: number | null; moved: boolean };

export function startCoverSelection(index = 0): CoverSelection {
  return { index, remainder: 0, lastAt: null, moved: false };
}

export function coverScrollStep(availableDistance: number, count: number) {
  if (count < 2 || availableDistance <= 0) return defaultCoverScrollStep;
  const intervals = count - 2 + firstStepRatio;
  return Math.max(1, Math.min(defaultCoverScrollStep, Math.floor(availableDistance / intervals)));
}

export function scrollEventCover(current: CoverSelection, delta: number, step: number, count: number, now: number, touchInProgress = false): CoverSelection {
  if (delta === 0) return current;

  // Wheel, touch and momentum events form one series until scrolling pauses.
  const sameGesture = current.lastAt !== null && (touchInProgress || now - current.lastAt < scrollPause);
  if (sameGesture && current.moved) return { ...current, lastAt: now };

  const last = Math.max(0, count - 1);
  const distance = (sameGesture ? current.remainder : 0) + delta;
  const direction = Math.sign(distance);
  const target = current.index + direction;
  if (target < 0 || target > last) {
    return { ...startCoverSelection(current.index), lastAt: now };
  }

  const threshold = Math.min(current.index, target) === 0 ? step * firstStepRatio : step;
  if (Math.abs(distance) >= threshold) {
    return { ...startCoverSelection(target), lastAt: now, moved: true };
  }
  return { index: current.index, remainder: distance, lastAt: now, moved: false };
}
