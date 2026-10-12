// Temporary sample data until Drive is connected (from referans/prototip.html).

export type ShelfDecor = 'globe' | 'box' | null;

export interface SampleShelf {
  id: string;
  name: string;
  decor: ShelfDecor;
}

// top shelf first
export const SAMPLE_SHELVES: SampleShelf[] = [
  { id: 'ai', name: 'Yapay Zekâ', decor: null },
  { id: 'uni', name: 'Üni Dersleri', decor: null },
  { id: 'java', name: 'Java', decor: null },
  { id: 'r4', name: 'Raf 4', decor: 'globe' },
  { id: 'r5', name: 'Raf 5', decor: 'box' }
];

export interface RoomLook {
  wall: string;
  floor: [string, string];
}

// prototype defaults: wall "Kum", floor "Meşe"
export const SAMPLE_ROOM: RoomLook = { wall: '#efe6d8', floor: ['#d9a46a', '#c48d55'] };
