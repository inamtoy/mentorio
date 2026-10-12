/** Week-view lesson layout, shared by the Admin, Teacher and Student schedule
 * pages: 60px per hour, starting at `hourStart`. */

/** A lesson block is never drawn shorter than this, so its text stays legible. */
const MIN_BLOCK_PX = 40;

export interface LessonTiming {
  id: string;
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
}

export interface LessonBlockStyle {
  top: string;
  height: string;
  left: string;
  width: string;
}

function toMinutes(time: string, hourStart: number): number {
  const [h, m] = time.split(":").map(Number);
  return (h - hourStart) * 60 + m;
}

/**
 * Position for every lesson of one day column, keyed by lesson id.
 *
 * Lessons that overlap in time (e.g. Room A and Room B both at 12:00) used to
 * be drawn full-width on top of each other, so only the last one was visible.
 * Now each group of overlapping lessons shares the column side by side: a
 * lesson takes the first free lane, and every lesson in the group is
 * 1/(lanes used) wide. Overlap is judged on the drawn block, not the real end
 * time, since a short lesson is stretched to MIN_BLOCK_PX.
 */
export function layoutDayLessons(lessons: LessonTiming[], hourStart: number): Map<string, LessonBlockStyle> {
  const blocks = lessons
    .map((l) => {
      const top = toMinutes(l.start_time, hourStart);
      const height = Math.max(toMinutes(l.end_time, hourStart) - top, MIN_BLOCK_PX);
      return { id: l.id, top, bottom: top + height, height, lane: 0 };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const result = new Map<string, LessonBlockStyle>();
  let group: typeof blocks = [];
  let laneEnds: number[] = [];
  let groupBottom = -Infinity;

  const flush = () => {
    const lanes = laneEnds.length;
    for (const b of group) {
      result.set(b.id, {
        top: `${b.top}px`,
        height: `${b.height}px`,
        left: `calc(${(b.lane * 100) / lanes}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
      });
    }
    group = [];
    laneEnds = [];
  };

  for (const b of blocks) {
    if (b.top >= groupBottom) flush();
    const free = laneEnds.findIndex((end) => end <= b.top);
    b.lane = free === -1 ? laneEnds.length : free;
    laneEnds[b.lane] = b.bottom;
    group.push(b);
    groupBottom = group.length === 1 ? b.bottom : Math.max(groupBottom, b.bottom);
  }
  flush();

  return result;
}
