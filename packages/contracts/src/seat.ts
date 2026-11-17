/**
 * A seat is addressed by its position inside a section, so the inventory does
 * not need one database row per seat: `sectionId:row:number`, 1-based.
 */
export interface SeatRef {
  sectionId: string;
  row: number;
  number: number;
}

export interface SectionLayout {
  id: string;
  rows: number;
  seatsPerRow: number;
}

export const MAX_SEATS_PER_HOLD = 6;

const SEAT_ID_PATTERN = /^([a-z0-9-]{1,40}):(\d{1,3}):(\d{1,3})$/;

export function formatSeatId({ sectionId, row, number }: SeatRef): string {
  return `${sectionId}:${row}:${number}`;
}

export function parseSeatId(seatId: string): SeatRef | null {
  const match = SEAT_ID_PATTERN.exec(seatId);
  if (!match) return null;
  const [, sectionId, row, number] = match;
  if (sectionId === undefined || row === undefined || number === undefined) return null;
  return { sectionId, row: Number(row), number: Number(number) };
}

export function isSeatInLayout(seat: SeatRef, section: SectionLayout): boolean {
  return (
    seat.sectionId === section.id &&
    seat.row >= 1 &&
    seat.row <= section.rows &&
    seat.number >= 1 &&
    seat.number <= section.seatsPerRow
  );
}

/** Row 1 -> "A". Sections are capped at 26 rows by the catalog schema. */
export function rowLabel(row: number): string {
  return String.fromCharCode(64 + row);
}
