// Task 6.4d-3: a folder whose name starts with "_" (e.g. _sistem, the app's own data) is not a book:
// the library doesn't show it, it is on no shelf and search never scans it.

export const gizliKlasorMu = (ad: string): boolean => ad.startsWith('_');
