import { describe, expect, it } from "vitest";
import { coverScrollStep, defaultCoverScrollStep, scrollEventCover, startCoverSelection } from "@/components/prototype/home-events-cover";

const step = defaultCoverScrollStep;

describe("event cover scroll distance", () => {
  it("starts at half a step and combines small movements within a gesture", () => {
    const partial = scrollEventCover(startCoverSelection(), 70, step, 4, 10);
    expect(partial).toMatchObject({ index: 0, remainder: 70, moved: false });
    expect(scrollEventCover(partial, 2, step, 4, 20)).toMatchObject({ index: 1, remainder: 0, moved: true });
    expect(scrollEventCover(startCoverSelection(1), 143, step, 4, 30)).toMatchObject({ index: 1, remainder: 143, moved: false });
  });

  it("moves only once per series and discards the remaining movement", () => {
    const first = scrollEventCover(startCoverSelection(), 350, step, 4, 10);
    expect(first).toMatchObject({ index: 1, remainder: 0, moved: true });
    const momentum = scrollEventCover(first, 350, step, 4, 70);
    expect(momentum).toMatchObject({ index: 1, remainder: 0, lastAt: 70 });
    expect(scrollEventCover(momentum, 1, step, 4, 300)).toMatchObject({ index: 1, remainder: 1, moved: false });
    expect(scrollEventCover(momentum, step, step, 4, 300)).toMatchObject({ index: 2, remainder: 0, moved: true });
  });

  it("keeps the same gesture while a finger is still on the screen", () => {
    const first = scrollEventCover(startCoverSelection(2), step, step, 5, 10, true);
    expect(scrollEventCover(first, step, step, 5, 300, true).index).toBe(3);
  });

  it("subtracts a small reversal and respects the ends of the list", () => {
    const forward = scrollEventCover(startCoverSelection(2), 45, step, 4, 10);
    expect(scrollEventCover(forward, -70, step, 4, 20)).toMatchObject({ index: 2, remainder: -25 });
    expect(scrollEventCover(forward, -189, step, 4, 20).index).toBe(1);
    expect(scrollEventCover(startCoverSelection(1), -72, step, 4, 30).index).toBe(0);
    expect(scrollEventCover(startCoverSelection(), -600, step, 4, 30)).toMatchObject({ index: 0, remainder: 0 });
    expect(scrollEventCover(startCoverSelection(3), 600, step, 4, 30)).toMatchObject({ index: 3, remainder: 0 });
  });

  it("uses a shorter step when the archive has less available scrolling", () => {
    expect(coverScrollStep(840, 13)).toBe(73);
    expect(coverScrollStep(1800, 13)).toBe(step);
    expect(scrollEventCover(startCoverSelection(), 37, coverScrollStep(840, 13), 13, 10).index).toBe(1);
  });
});
