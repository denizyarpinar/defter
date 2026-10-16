// Task 3.6: generates the demo PDFs in public/demo/ for the sample library (?demo).
//   demo-dikey.pdf  64 pages, A4 portrait: a made-up course text with figures
//   demo-slayt.pdf  24 slides, 16:9 landscape
//   kalem-testi.pdf  6 pages with notes (task 4.4): Defter's own Ink notes + notes from "other apps";
//                    pages 3–6 rotated / cropped, for the pen layer's alignment (task 4.5)
// All text is written for this script: no copyrighted content, free to share.
// The first two need no packages: a small PDF writer with the PDF's built-in Helvetica fonts
// (ASCII text only, so nothing has to be embedded). kalem-testi.pdf is made with pdf-lib, and its
// Defter notes with the app's own writer (src/kalem/pdfNotlari.ts, loaded through Vite).
// The output is the same on every run.
// Run: npm run demo-pdf

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFString, StandardFonts, degrees, rgb as libRgb } from 'pdf-lib';
import { createServer } from 'vite';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo');

// ---- text measuring ----

// Helvetica glyph widths (1/1000 em) for ASCII 32..126, from the standard font metrics.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584
];
const FONT = { R: 'F1', B: 'F2', I: 'F3' };
const BOLD = 1.08;   // Helvetica-Bold is a little wider; close enough for headings

function ascii(s) {
  if (/[^\x20-\x7e]/.test(s)) throw new Error(`Only ASCII text is possible with the built-in fonts: "${s}"`);
  return s;
}

function textWidth(s, size, font = 'R') {
  let w = 0;
  for (const ch of ascii(s)) w += WIDTHS[ch.charCodeAt(0) - 32];
  return w * size / 1000 * (font === 'B' ? BOLD : 1);
}

function wrap(s, size, maxWidth, font = 'R') {
  const lines = [];
  let line = '';
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, font) > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// ---- one page: drawing with the origin at the top left ----

const num = v => String(Math.round(v * 100) / 100);
const esc = s => ascii(s).replace(/[\\()]/g, m => '\\' + m);
const rgb = hex => [1, 3, 5].map(i => num(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
const mix = (hex, other, t) => '#' + [1, 3, 5].map(i => {
  const a = parseInt(hex.slice(i, i + 2), 16), b = parseInt(other.slice(i, i + 2), 16);
  return Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
}).join('');

const INK = '#22252b';
const GREY = '#6b6f78';
const RULE = '#c9ccd2';
const WHITE = '#ffffff';

class Page {
  constructor(w, h) { this.w = w; this.h = h; this.ops = []; }

  paint({ fill, stroke, lw = 1, dash }) {
    if (fill) this.ops.push(`${rgb(fill)} rg`);
    if (stroke) this.ops.push(`${rgb(stroke)} RG ${num(lw)} w ${dash ? `[${dash.join(' ')}] 0 d` : '[] 0 d'}`);
    return fill && stroke ? 'B' : fill ? 'f' : 'S';
  }

  rect(x, y, w, h, style) {
    const op = this.paint(style);
    this.ops.push(`${num(x)} ${num(this.h - y - h)} ${num(w)} ${num(h)} re ${op}`);
  }

  line(x1, y1, x2, y2, style = { stroke: INK }) {
    const op = this.paint(style);
    this.ops.push(`${num(x1)} ${num(this.h - y1)} m ${num(x2)} ${num(this.h - y2)} l ${op}`);
  }

  poly(points, style) {
    const op = this.paint(style);
    const [first, ...rest] = points;
    this.ops.push(`${num(first[0])} ${num(this.h - first[1])} m ${rest.map(p => `${num(p[0])} ${num(this.h - p[1])} l`).join(' ')} h ${op}`);
  }

  // four Bézier quarters
  circle(cx, cy, r, style) {
    const op = this.paint(style);
    const k = 0.5523 * r, y = this.h - cy;
    const c = (x1, y1, x2, y2, x3, y3) => `${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)} ${num(x3)} ${num(y3)} c`;
    this.ops.push([
      `${num(cx + r)} ${num(y)} m`,
      c(cx + r, y + k, cx + k, y + r, cx, y + r),
      c(cx - k, y + r, cx - r, y + k, cx - r, y),
      c(cx - r, y - k, cx - k, y - r, cx, y - r),
      c(cx + k, y - r, cx + r, y - k, cx + r, y),
      op
    ].join(' '));
  }

  arrow(x1, y1, x2, y2, color = INK, lw = 1.2) {
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, s = 7;
    this.line(x1, y1, x2 - ux * s * 0.8, y2 - uy * s * 0.8, { stroke: color, lw });
    this.poly([[x2, y2], [x2 - ux * s - uy * s * 0.5, y2 - uy * s + ux * s * 0.5], [x2 - ux * s + uy * s * 0.5, y2 - uy * s - ux * s * 0.5]], { fill: color });
  }

  // y = baseline
  text(x, y, s, { size = 11, font = 'R', color = INK } = {}) {
    this.ops.push(`${rgb(color)} rg BT /${FONT[font]} ${num(size)} Tf ${num(x)} ${num(this.h - y)} Td (${esc(s)}) Tj ET`);
  }

  textCenter(cx, y, s, opts = {}) {
    this.text(cx - textWidth(s, opts.size ?? 11, opts.font) / 2, y, s, opts);
  }

  textRight(x, y, s, opts = {}) {
    this.text(x - textWidth(s, opts.size ?? 11, opts.font), y, s, opts);
  }

  // Wrapped text from y (first baseline = y + size). Stops at maxY. Returns the y below it.
  paragraph(x, y, w, s, { size = 10.5, leading = size * 1.5, font = 'R', color = INK, maxY = Infinity } = {}) {
    for (const line of wrap(s, size, w, font)) {
      if (y + leading > maxY) break;
      this.text(x, y + size, line, { size, font, color });
      y += leading;
    }
    return y;
  }

  lines(s, size, w, font) { return wrap(s, size, w, font).length; }
}

// ---- PDF file ----

function writePdf(file, pages, title) {
  const objects = [];
  const add = body => objects.push(body);
  const catalog = add(null), pagesId = add(null);
  const fonts = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique']
    .map(f => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  const fontRes = `/Font << ${fonts.map((id, i) => `/F${i + 1} ${id} 0 R`).join(' ')} >>`;
  const kids = pages.map(p => {
    const data = deflateSync(Buffer.from(p.ops.join('\n'), 'latin1'), { level: 9 });
    const content = add(Buffer.concat([Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`), data, Buffer.from('\nendstream')]));
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << ${fontRes} >> /Contents ${content} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${esc(title)}) /Author (Defter demo) /Producer (scripts/demo-pdf-uret.mjs) >>`);

  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = parts[0].length;
  const offsets = objects.map((body, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'), Buffer.from('\nendobj\n')]);
    parts.push(b);
    const at = offset;
    offset += b.length;
    return at;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  const bytes = Buffer.concat(parts);
  writeFileSync(file, bytes);
  return bytes.length;
}

// ---- content (written for this demo) ----

const COURSE = 'Foundations of Computing';

const CHAPTERS = [
  {
    title: 'Logic and Propositions', color: '#24476b', figures: ['truth', 'flow'],
    sections: ['Propositions', 'Connectives', 'Truth tables', 'Implication', 'Equivalence', "De Morgan's laws", 'Tautologies', 'Practice'],
    key: 'A truth table is a complete definition: nothing about a connective is left open.',
    paras: [
      "A proposition is a sentence that is either true or false, but not both. 'It is raining in Bremen' is a proposition; 'Close the window' is not, because it has no truth value. Logic gives us a small set of tools to combine propositions and to decide, without guessing, whether a combined statement holds.",
      'The basic connectives are negation (not), conjunction (and), disjunction (or) and implication (if ... then). Each one is defined completely by a truth table: for every combination of truth values of its parts, the table tells us the value of the whole. Two formulas are equivalent when their tables are identical.',
      "Implication is the connective that surprises most beginners. 'If p then q' is false in exactly one case: p is true and q is false. When p is false, the implication is true no matter what q says. This is why a promise is only broken when its condition happened and the result did not.",
      "Laws such as De Morgan's rules let us rewrite formulas: not (p and q) is the same as (not p) or (not q). Rewriting is useful in programming, too. A long condition in an if statement can often be simplified into a shorter one that is easier to read and to test.",
      'A formula that is true in every row of its table is a tautology; one that is false in every row is a contradiction. Checking a table with n variables needs 2^n rows, so for larger problems we use proof rules or clever algorithms instead of writing every row by hand.'
    ]
  },
  {
    title: 'Sets and Functions', color: '#7a3b2e', figures: ['venn', 'mapping'],
    sections: ['Sets and elements', 'Describing sets', 'Set operations', 'Venn diagrams', 'Functions', 'Injective and surjective', 'Bijections', 'Relations'],
    key: 'A function gives every input exactly one output; a bijection can also be reversed.',
    paras: [
      'A set is a collection of distinct objects, called its elements. The order does not matter and nothing appears twice: {1, 2, 3} and {3, 1, 2} are the same set. We write x in A when x is an element of A, and we describe large sets with a rule instead of a list.',
      'Union, intersection and difference build new sets from old ones. The union of A and B contains everything that is in at least one of them; the intersection contains only what they share. A Venn diagram is a quick way to picture these operations, although it is not a proof.',
      'A function f from A to B assigns exactly one element of B to every element of A. A is the domain and B is the codomain. A function is injective if different inputs always give different outputs, and surjective if every element of B is reached by some input.',
      'A function that is both injective and surjective is a bijection. Bijections are exactly the functions that can be reversed. They also let us compare the sizes of sets: two finite sets have the same number of elements precisely when there is a bijection between them.',
      "Relations generalise functions. A relation between A and B is any set of pairs (a, b). Ordering relations such as 'less than or equal' and equivalence relations such as 'has the same remainder modulo 3' appear again and again in computer science."
    ]
  },
  {
    title: 'Algorithms and Complexity', color: '#2f5d3a', figures: ['bars', 'flow'],
    sections: ['What is an algorithm', 'Counting steps', 'Big-O notation', 'Linear search', 'Binary search', 'Sorting', 'Merge sort', 'Growth rates'],
    key: 'For large inputs, the growth rate of an algorithm matters more than the speed of the machine.',
    paras: [
      'An algorithm is a finite list of precise steps that solves a problem for every allowed input. A recipe is a familiar example, but an algorithm must be exact enough that a machine can follow it without asking questions. Correctness and efficiency are the two properties we care about most.',
      'To compare algorithms we count basic steps as a function of the input size n. We are mostly interested in how this count grows when n becomes large, so we ignore constant factors and write the result in big-O notation, such as O(n), O(n log n) or O(n^2).',
      'Linear search looks at the elements one by one and needs up to n comparisons. Binary search works on a sorted list: it compares with the middle element and throws away half of the remaining list in every step. It therefore needs only about log2(n) comparisons.',
      'Sorting is one of the most studied problems. Simple methods like insertion sort take O(n^2) steps in the worst case. Merge sort splits the list in halves, sorts each half and merges the results, which gives O(n log n) steps for every input.',
      'Growth rates matter more than fast hardware. For a million elements, an O(n^2) method performs around a trillion steps, while an O(n log n) method needs about twenty million. A better algorithm can turn a computation of days into one of seconds.'
    ]
  },
  {
    title: 'Data Structures', color: '#5b3f7a', figures: ['array', 'tree'],
    sections: ['Choosing a structure', 'Arrays', 'Linked lists', 'Stacks', 'Queues', 'Hash tables', 'Trees', 'Balanced trees'],
    key: 'Pick the structure from the questions you ask most often, not from habit.',
    paras: [
      'A data structure is a way to store data so that the operations we need are fast. The right choice depends on the questions we ask: do we look up items by position, by key, or do we always need the smallest one? There is no structure that is best for everything.',
      'An array stores elements next to each other in memory. Reading the element at a given index takes constant time, but inserting in the middle requires moving all later elements. A linked list makes insertion cheap, but finding the k-th element means walking through k nodes.',
      'Stacks and queues restrict how we access the data. A stack returns the most recently added element first (last in, first out), like a pile of plates. A queue returns the oldest element first (first in, first out), like people waiting at a counter.',
      'A hash table maps keys to values. A hash function turns each key into an index of an array, so lookups take constant time on average. Two keys can land on the same index; good tables handle these collisions with short lists or by probing the next free slot.',
      'Trees organise data hierarchically. In a binary search tree, every node is larger than all nodes in its left subtree and smaller than all nodes in its right subtree. If the tree stays balanced, searching, inserting and deleting all take O(log n) steps.'
    ]
  },
  {
    title: 'Graphs', color: '#8a6a1f', figures: ['graph', 'tree'],
    sections: ['Vertices and edges', 'Directed and weighted graphs', 'Paths and cycles', 'Breadth-first search', 'Depth-first search', 'Shortest paths', 'Trees in graphs', 'Spanning trees'],
    key: 'Many different problems become the same problem once you see the graph behind them.',
    paras: [
      'A graph consists of vertices and edges that connect pairs of vertices. Road maps, social networks, the links between web pages and the dependencies between course modules are all graphs. Many different questions become the same question once we see the graph behind them.',
      'Edges can be directed, like one-way streets, or undirected. They can also carry weights, such as distances or costs. A path is a sequence of edges that leads from one vertex to another, and a cycle is a path that returns to its starting point.',
      'Breadth-first search explores a graph layer by layer: first all neighbours of the start vertex, then their neighbours, and so on. In a graph without weights it finds shortest paths. Depth-first search instead follows one path as far as possible before it backtracks.',
      "Dijkstra's algorithm finds shortest paths when edges have non-negative weights. It keeps a set of vertices whose distance is final and repeatedly adds the closest remaining vertex. With a priority queue it runs in O((V + E) log V) time.",
      'A tree is a connected graph without cycles. A spanning tree connects all vertices of a graph using as few edges as possible. Choosing the cheapest such tree is the minimum spanning tree problem, which simple greedy algorithms solve exactly.'
    ]
  },
  {
    title: 'Finite Automata', color: '#2b6a6e', figures: ['automaton', 'flow'],
    sections: ['States and transitions', 'Accepting words', 'Languages', 'An example automaton', 'Regular expressions', 'Limits of automata', 'Stronger models', 'Summary'],
    key: 'A finite automaton remembers only its current state, so it cannot count without limit.',
    paras: [
      'A finite automaton is a very small model of a computer. It has a finite set of states, a start state, some accepting states and a transition rule that tells it where to go after reading each input symbol. It reads a word from left to right and accepts or rejects it.',
      "The set of all words an automaton accepts is its language. For example, an automaton with two states can decide whether a binary word contains an even number of ones: it switches between 'even' and 'odd' on every one and stays put on every zero.",
      'Regular expressions describe the same languages as finite automata. The expression (ab)* matches the empty word, ab, abab and so on. Search tools and input validators translate regular expressions into automata behind the scenes.',
      "Not every language is regular. An automaton cannot count without limit, so it cannot check whether a word has the form a^n b^n with equally many a's and b's. Proving such limits is done with the pumping lemma.",
      'Stronger models, such as pushdown automata and Turing machines, add memory to the finite control. The Turing machine is simple enough to analyse and yet strong enough to compute everything that any real computer can compute.'
    ]
  }
];

const EXERCISES = [
  "Write the truth table of (p and not q) or (not p and q). Which connective from the chapter does it describe?",
  "Use De Morgan's laws to simplify the condition not (x > 0 and y > 0) in a program.",
  'Let A = {1, 2, 3, 4} and B = {3, 4, 5}. Write down the union, the intersection and A minus B.',
  'Give a function from {1, 2, 3} to {a, b} that is surjective. Can such a function be injective? Explain.',
  'How many comparisons does binary search need at most for a sorted list with 1000 elements?',
  'Sort the list 7, 3, 9, 1, 5, 2 with merge sort and write down every merge step.',
  'Which data structure would you use for the undo history of a text editor? Give a reason.',
  'Insert 50, 30, 70, 20, 40, 60, 80 into an empty binary search tree. Draw the result.',
  'Draw a graph with five vertices that has a cycle of length four. Find a spanning tree of it.',
  'Run breadth-first search on your graph from exercise 9 and list the vertices in the order they are visited.',
  'Draw an automaton that accepts exactly the binary words that end with 01.',
  'Write a regular expression for all words over {a, b} that contain the letter a at least twice.'
];

const GLOSSARY = [
  ['Algorithm', 'A finite list of precise steps that solves a problem for every allowed input.'],
  ['Automaton', 'A model with finitely many states that reads a word and accepts or rejects it.'],
  ['Big-O', 'Notation for the growth of a step count, ignoring constant factors.'],
  ['Bijection', 'A function that is both injective and surjective; it can be reversed.'],
  ['Binary search', 'Search in a sorted list that halves the remaining part in every step.'],
  ['Breadth-first search', 'Graph search that visits vertices layer by layer from the start.'],
  ['Contradiction', 'A formula that is false for every assignment of its variables.'],
  ['Cycle', 'A path in a graph that returns to its starting vertex.'],
  ['Domain', 'The set of inputs of a function.'],
  ['Graph', 'A set of vertices together with edges between pairs of vertices.'],
  ['Hash table', 'A structure that maps keys to array positions with a hash function.'],
  ['Implication', "The connective 'if p then q'; false only when p is true and q is false."],
  ['Language', 'The set of all words that an automaton accepts.'],
  ['Merge sort', 'Sorting by splitting in halves, sorting them and merging the results.'],
  ['Proposition', 'A sentence that is either true or false.'],
  ['Queue', 'A structure that returns the oldest element first (first in, first out).'],
  ['Relation', 'Any set of pairs (a, b) between two sets.'],
  ['Spanning tree', 'A tree inside a graph that connects all of its vertices.'],
  ['Stack', 'A structure that returns the newest element first (last in, first out).'],
  ['Tautology', 'A formula that is true for every assignment of its variables.'],
  ['Tree', 'A connected graph without cycles.'],
  ['Truth table', 'A table that lists the value of a formula for every assignment.']
];

// ---- figures (x, y, w, h: the box they are drawn in) ----

const FIGURES = {
  truth(pg, x, y, w, h, c) {
    const head = ['p', 'q', 'p and q', 'p or q', 'if p then q'];
    const rows = [['T', 'T', 'T', 'T', 'T'], ['T', 'F', 'F', 'T', 'F'], ['F', 'T', 'F', 'T', 'T'], ['F', 'F', 'F', 'F', 'T']];
    const cw = w / head.length, rh = Math.min(h / 5, 30);
    pg.rect(x, y, w, rh, { fill: mix(c, WHITE, 0.82) });
    head.forEach((t, i) => pg.textCenter(x + cw * (i + 0.5), y + rh * 0.65, t, { size: 10, font: 'B', color: c }));
    rows.forEach((r, j) => r.forEach((t, i) => pg.textCenter(x + cw * (i + 0.5), y + rh * (j + 1.65), t, { size: 10.5, color: t === 'F' ? '#a33a2c' : INK })));
    for (let j = 0; j <= 5; j++) pg.line(x, y + rh * j, x + w, y + rh * j, { stroke: RULE, lw: 0.8 });
    pg.line(x + cw * 2, y, x + cw * 2, y + rh * 5, { stroke: RULE, lw: 0.8 });
  },
  flow(pg, x, y, w, h, c) {
    const labels = ['Input', 'Process', 'Check', 'Output'];
    const bw = w / labels.length * 0.7, gap = (w - bw * labels.length) / (labels.length - 1), bh = Math.min(48, h * 0.4), by = y + h / 2 - bh / 2;
    labels.forEach((t, i) => {
      const bx = x + i * (bw + gap);
      pg.rect(bx, by, bw, bh, { fill: i === 2 ? mix(c, WHITE, 0.15) : mix(c, WHITE, 0.85), stroke: c, lw: 1.2 });
      pg.textCenter(bx + bw / 2, by + bh / 2 + 4, t, { size: 11, font: 'B', color: i === 2 ? WHITE : c });
      if (i) pg.arrow(bx - gap + 3, by + bh / 2, bx - 3, by + bh / 2, c);
    });
    // "not yet" goes back from Check to Process
    const x2 = x + 2 * (bw + gap) + bw / 2, x1 = x + (bw + gap) + bw / 2, top = by - Math.min(26, h * 0.2);
    pg.line(x2, by, x2, top, { stroke: c, lw: 1.2 });
    pg.line(x2, top, x1, top, { stroke: c, lw: 1.2 });
    pg.arrow(x1, top, x1, by - 2, c);
    pg.textCenter((x1 + x2) / 2, top - 5, 'not yet', { size: 9, font: 'I', color: GREY });
  },
  bars(pg, x, y, w, h, c) {
    const data = [['n', 10], ['n log n', 33], ['n^2', 100], ['2^n', 1024]];
    const max = 1024, left = x + 30, base = y + h - 22, bw = (w - 40) / data.length * 0.6;
    pg.line(left, y + 6, left, base, { stroke: INK, lw: 1 });
    pg.line(left, base, x + w, base, { stroke: INK, lw: 1 });
    data.forEach(([label, v], i) => {
      const bh = Math.max(3, Math.sqrt(v / max) * (h - 40));
      const bx = left + 12 + i * ((w - 40) / data.length);
      pg.rect(bx, base - bh, bw, bh, { fill: mix(c, WHITE, 0.15 + i * 0.18) });
      pg.textCenter(bx + bw / 2, base + 14, label, { size: 9.5, color: INK });
      pg.textCenter(bx + bw / 2, base - bh - 5, String(v), { size: 9, color: GREY });
    });
    pg.text(x, y + 10, 'steps', { size: 8.5, font: 'I', color: GREY });
  },
  venn(pg, x, y, w, h, c) {
    const r = Math.min(h * 0.42, w * 0.22), cy = y + h / 2, cx1 = x + w / 2 - r * 0.55, cx2 = x + w / 2 + r * 0.55;
    pg.rect(x + w / 2 - r * 2, y + 4, r * 4, h - 8, { stroke: RULE, lw: 0.8 });
    pg.circle(cx1, cy, r, { fill: mix(c, WHITE, 0.82), stroke: c, lw: 1.3 });
    pg.circle(cx2, cy, r, { stroke: c, lw: 1.3 });
    pg.textCenter(cx1 - r * 0.45, cy + 4, 'A', { size: 14, font: 'B', color: c });
    pg.textCenter(cx2 + r * 0.45, cy + 4, 'B', { size: 14, font: 'B', color: c });
    pg.textCenter(x + w / 2, cy + 4, 'A and B', { size: 8.5, color: INK });
    pg.text(x + w / 2 - r * 2 + 6, y + 18, 'U', { size: 10, font: 'I', color: GREY });
  },
  mapping(pg, x, y, w, h, c) {
    const a = ['1', '2', '3', '4'], b = ['a', 'b', 'c'], to = [0, 2, 1, 2];
    const ax = x + w * 0.25, bx = x + w * 0.75, step = (h - 30) / a.length;
    pg.rect(ax - 26, y + 4, 52, h - 8, { stroke: c, lw: 1.1 });
    pg.rect(bx - 26, y + 4, 52, h - 8, { stroke: c, lw: 1.1 });
    const ay = i => y + 22 + step * (i + 0.5), byy = i => y + 22 + (h - 30) / b.length * (i + 0.5);
    a.forEach((t, i) => { pg.circle(ax, ay(i), 3, { fill: c }); pg.text(ax - 18, ay(i) + 4, t, { size: 10 }); pg.arrow(ax + 5, ay(i), bx - 6, byy(to[i]), mix(c, WHITE, 0.25), 1); });
    b.forEach((t, i) => { pg.circle(bx, byy(i), 3, { fill: c }); pg.text(bx + 10, byy(i) + 4, t, { size: 10 }); });
    pg.textCenter(ax, y + h + 12, 'A (domain)', { size: 9, font: 'I', color: GREY });
    pg.textCenter(bx, y + h + 12, 'B (codomain)', { size: 9, font: 'I', color: GREY });
  },
  array(pg, x, y, w, h, c) {
    const v = [12, 5, 31, 8, 19, 27, 3, 14];
    const cw = Math.min(46, w / v.length), left = x + (w - cw * v.length) / 2, top = y + h / 2 - cw / 2;
    v.forEach((n, i) => {
      pg.rect(left + i * cw, top, cw, cw, { fill: i === 4 ? mix(c, WHITE, 0.75) : WHITE, stroke: c, lw: 1.1 });
      pg.textCenter(left + (i + 0.5) * cw, top + cw / 2 + 4, String(n), { size: 11, font: i === 4 ? 'B' : 'R' });
      pg.textCenter(left + (i + 0.5) * cw, top + cw + 14, String(i), { size: 8.5, color: GREY });
    });
    pg.arrow(left + 4.5 * cw, top - 30, left + 4.5 * cw, top - 4, c);
    pg.textCenter(left + 4.5 * cw, top - 36, 'a[4]', { size: 9.5, font: 'I', color: c });
  },
  tree(pg, x, y, w, h, c) {
    const v = [50, 30, 70, 20, 40, 60, 80];
    const pos = i => {
      const level = Math.floor(Math.log2(i + 1)), first = 2 ** level - 1, count = 2 ** level;
      return [x + w * ((i - first + 0.5) / count), y + 18 + level * ((h - 36) / 2)];
    };
    v.forEach((_, i) => { if (i) { const [px, py] = pos(Math.floor((i - 1) / 2)), [cx, cy] = pos(i); pg.line(px, py, cx, cy, { stroke: c, lw: 1.1 }); } });
    v.forEach((n, i) => { const [cx, cy] = pos(i); pg.circle(cx, cy, 15, { fill: i ? WHITE : mix(c, WHITE, 0.8), stroke: c, lw: 1.2 }); pg.textCenter(cx, cy + 4, String(n), { size: 10, font: 'B' }); });
  },
  graph(pg, x, y, w, h, c) {
    const p = [[0.1, 0.5], [0.35, 0.12], [0.35, 0.88], [0.65, 0.2], [0.65, 0.8], [0.9, 0.5]].map(([a, b]) => [x + a * w, y + b * h]);
    const edges = [[0, 1, 4], [0, 2, 2], [1, 3, 5], [2, 4, 8], [1, 2, 1], [3, 5, 3], [4, 5, 6], [3, 4, 2]];
    edges.forEach(([a, b, wgt]) => {
      pg.line(p[a][0], p[a][1], p[b][0], p[b][1], { stroke: mix(c, WHITE, 0.2), lw: 1.1 });
      const mx = (p[a][0] + p[b][0]) / 2, my = (p[a][1] + p[b][1]) / 2;
      pg.circle(mx, my - 3, 7, { fill: WHITE });
      pg.textCenter(mx, my + 0.5, String(wgt), { size: 8.5, color: GREY });
    });
    'ABCDEF'.split('').forEach((t, i) => { pg.circle(p[i][0], p[i][1], 13, { fill: i === 0 ? c : WHITE, stroke: c, lw: 1.2 }); pg.textCenter(p[i][0], p[i][1] + 4, t, { size: 10.5, font: 'B', color: i === 0 ? WHITE : INK }); });
  },
  automaton(pg, x, y, w, h, c) {
    const r = Math.min(26, h * 0.22), cy = y + h / 2, e = x + w * 0.32, o = x + w * 0.72;
    pg.arrow(e - r - 40, cy, e - r - 2, cy, INK);
    pg.text(e - r - 46, cy - 8, 'start', { size: 8.5, font: 'I', color: GREY });
    pg.circle(e, cy, r, { fill: mix(c, WHITE, 0.82), stroke: c, lw: 1.3 });
    pg.circle(e, cy, r - 4, { stroke: c, lw: 1 });
    pg.circle(o, cy, r, { stroke: c, lw: 1.3 });
    pg.textCenter(e, cy + 4, 'even', { size: 10, font: 'B', color: c });
    pg.textCenter(o, cy + 4, 'odd', { size: 10, font: 'B', color: c });
    pg.arrow(e + r * 0.8, cy - r * 0.6, o - r * 0.8, cy - r * 0.6, c);
    pg.arrow(o - r * 0.8, cy + r * 0.6, e + r * 0.8, cy + r * 0.6, c);
    pg.textCenter((e + o) / 2, cy - r * 0.6 - 6, '1', { size: 10 });
    pg.textCenter((e + o) / 2, cy + r * 0.6 + 14, '1', { size: 10 });
    for (const sx of [e, o]) {
      pg.circle(sx, cy - r - 14, 12, { stroke: GREY, lw: 1, dash: [3, 2] });
      pg.textCenter(sx, cy - r - 30, '0', { size: 10, color: GREY });
    }
  }
};

const FIGURE_NAMES = {
  truth: 'Truth table of the basic connectives', flow: 'A process with a check that repeats a step',
  bars: 'Steps for n = 10 (square-root scale)', venn: 'Two sets inside a universe U',
  mapping: 'A function from A to B', array: 'An array with its indices',
  tree: 'A binary search tree', graph: 'A weighted graph with six vertices', automaton: 'Automaton for an even number of ones'
};

// ---- the portrait document ----

const A4 = [595.28, 841.89];
const M = 64;                 // margin
const TEXT_W = A4[0] - 2 * M;
const BOTTOM = A4[1] - 74;

function footer(pg, n) {
  pg.line(M, A4[1] - 52, A4[0] - M, A4[1] - 52, { stroke: RULE, lw: 0.6 });
  pg.text(M, A4[1] - 36, 'Defter demo document - self-generated, free to share', { size: 8, color: GREY });
  pg.textRight(A4[0] - M, A4[1] - 36, String(n), { size: 9, font: 'B', color: GREY });
}

function header(pg, left, color) {
  pg.text(M, 44, left, { size: 8.5, color: GREY });
  pg.textRight(A4[0] - M, 44, COURSE, { size: 8.5, color: GREY });
  pg.line(M, 52, A4[0] - M, 52, { stroke: color, lw: 1 });
}

function portrait() {
  const pages = [];
  const page = () => { const p = new Page(...A4); pages.push(p); return p; };
  const firstPage = [];   // chapter → page number of its opener

  // 1 cover
  {
    const pg = page(), c = '#24476b';
    pg.rect(0, 0, A4[0], A4[1], { fill: '#f6f2ea' });
    pg.rect(0, 0, A4[0], 330, { fill: c });
    for (let i = 0; i < 6; i++) pg.circle(A4[0] - 90 + i * 9, 120 + i * 20, 60 - i * 8, { stroke: mix(c, WHITE, 0.3 + i * 0.1), lw: 1 });
    pg.text(M, 200, COURSE, { size: 32, font: 'B', color: WHITE });
    pg.text(M, 236, 'A demo course for the Defter reader', { size: 15, color: mix(c, WHITE, 0.75) });
    pg.text(M, 400, 'Six short chapters', { size: 13, font: 'B' });
    CHAPTERS.forEach((ch, i) => {
      pg.rect(M, 420 + i * 30, 6, 18, { fill: ch.color });
      pg.text(M + 18, 434 + i * 30, `${i + 1}  ${ch.title}`, { size: 12 });
    });
    pg.paragraph(M, 640, TEXT_W, 'This document was generated by a script for testing. All text and figures were written for it; it contains no copyrighted material and may be shared freely.', { size: 10, color: GREY });
  }

  // 2 about
  {
    const pg = page();
    header(pg, 'About this document', '#24476b');
    pg.text(M, 110, 'About this document', { size: 20, font: 'B' });
    let y = 130;
    for (const s of [
      'Defter shows notes from Google Drive as books in a 3D study room. To try the reader without a Google account, the sample library opens this document and a set of landscape slides. Both are made by scripts/demo-pdf-uret.mjs, which writes the PDF files directly.',
      'The document is long on purpose. A real lecture script has dozens of pages, and the reader keeps only the visible pages and two on each side as drawn canvases. Scrolling through more than sixty pages shows that memory stays low while pages appear quickly.',
      'The text explains a few basic ideas of computer science in plain language. Some sections repeat ideas from earlier pages; that is fine for a test document. Figures use simple lines, boxes and circles, so they stay sharp at every zoom level.',
      'Try the following: switch between book mode and PDF mode, open the table of contents, drag the page slider, zoom into a figure, and close the reader in the middle of a chapter. When you open the topic again, the ribbon brings you back to the same page.'
    ]) y = pg.paragraph(M, y, TEXT_W, s, { maxY: BOTTOM }) + 10;
    footer(pg, 2);
  }

  // 3 contents (page numbers are known in advance: 4 + 9 per chapter)
  {
    const pg = page();
    header(pg, 'Contents', '#24476b');
    pg.text(M, 110, 'Contents', { size: 20, font: 'B' });
    const entries = [
      ...CHAPTERS.map((ch, i) => [`${i + 1}  ${ch.title}`, 4 + i * 9, ch.color]),
      ['Exercises', 4 + CHAPTERS.length * 9, INK],
      ['Glossary', 8 + CHAPTERS.length * 9, INK]
    ];
    entries.forEach(([t, n, color], i) => {
      const y = 160 + i * 34;
      pg.text(M, y, t, { size: 12.5, font: 'B', color });
      const end = M + textWidth(t, 12.5, 'B') + 8, right = A4[0] - M - 24;
      for (let d = end; d < right; d += 6) pg.circle(d, y - 3, 0.7, { fill: RULE });
      pg.textRight(A4[0] - M, y, String(n), { size: 12, color: GREY });
    });
    footer(pg, 3);
  }

  // chapters: an opener and eight text pages each
  CHAPTERS.forEach((ch, ci) => {
    const c = ch.color;
    firstPage.push(pages.length + 1);
    {
      const pg = page();
      pg.rect(0, 0, A4[0], A4[1], { fill: mix(c, WHITE, 0.92) });
      pg.rect(0, 0, 18, A4[1], { fill: c });
      pg.text(M, 260, `Chapter ${ci + 1}`, { size: 16, color: c });
      pg.text(M, 300, ch.title, { size: 30, font: 'B', color: c });
      pg.line(M, 324, M + 120, 324, { stroke: c, lw: 2 });
      pg.paragraph(M, 350, TEXT_W * 0.85, ch.paras[0], { size: 11.5, color: INK });
      pg.rect(M, 520, TEXT_W, 200, { fill: WHITE, stroke: mix(c, WHITE, 0.6), lw: 0.8 });
      FIGURES[ch.figures[0]](pg, M + 30, 540, TEXT_W - 60, 160, c);
      footer(pg, pages.length);
    }
    for (let k = 0; k < 8; k++) {
      const pg = page(), n = pages.length;
      header(pg, `Chapter ${ci + 1} - ${ch.title}`, c);
      pg.text(M, 98, `${ci + 1}.${k + 1}  ${ch.sections[k]}`, { size: 17, font: 'B', color: c });
      let y = 116;
      const para = i => ch.paras[(k + i) % ch.paras.length];
      y = pg.paragraph(M, y, TEXT_W, para(0), { maxY: BOTTOM }) + 8;
      y = pg.paragraph(M, y, TEXT_W, para(1), { maxY: BOTTOM }) + 12;
      if (k % 2 === 0) {
        const fig = ch.figures[(k / 2) % 2];
        pg.rect(M, y, TEXT_W, 196, { fill: '#fafafa', stroke: RULE, lw: 0.6 });
        FIGURES[fig](pg, M + 30, y + 14, TEXT_W - 60, 150, c);
        pg.text(M + 10, y + 190, `Figure ${ci + 1}.${k / 2 + 1}  ${FIGURE_NAMES[fig]}`, { size: 8.5, font: 'I', color: GREY });
        y += 210;
      } else {
        const lines = pg.lines(ch.key, 11, TEXT_W - 40, 'B');
        const bh = 34 + lines * 16;
        pg.rect(M, y, TEXT_W, bh, { fill: mix(c, WHITE, 0.88) });
        pg.rect(M, y, 4, bh, { fill: c });
        pg.text(M + 20, y + 20, 'Key idea', { size: 9, font: 'B', color: c });
        pg.paragraph(M + 20, y + 24, TEXT_W - 40, ch.key, { size: 11, leading: 16, font: 'B', color: INK });
        y += bh + 14;
      }
      for (let i = 2; i < 5 && y < BOTTOM - 40; i++) y = pg.paragraph(M, y, TEXT_W, para(i), { maxY: BOTTOM }) + 8;
      footer(pg, n);
    }
  });

  // exercises: 3 per page with lines to write on
  for (let p = 0; p < 4; p++) {
    const pg = page(), n = pages.length;
    header(pg, 'Exercises', INK);
    pg.text(M, 98, p ? 'Exercises (continued)' : 'Exercises', { size: 17, font: 'B' });
    let y = 120;
    EXERCISES.slice(p * 3, p * 3 + 3).forEach((ex, i) => {
      pg.text(M, y + 12, `${p * 3 + i + 1}.`, { size: 11, font: 'B', color: CHAPTERS[Math.floor((p * 3 + i) / 2)].color });
      y = pg.paragraph(M + 22, y, TEXT_W - 22, ex, { size: 11 }) + 10;
      for (let l = 0; l < 7; l++) { pg.line(M + 22, y + 18, A4[0] - M, y + 18, { stroke: RULE, lw: 0.5, dash: [2, 3] }); y += 22; }
      y += 16;
    });
    footer(pg, n);
  }

  // glossary: two pages
  for (let p = 0; p < 2; p++) {
    const pg = page(), n = pages.length;
    header(pg, 'Glossary', INK);
    pg.text(M, 98, 'Glossary', { size: 17, font: 'B' });
    let y = 122;
    for (const [term, def] of GLOSSARY.slice(p * 11, p * 11 + 11)) {
      pg.text(M, y + 11, term, { size: 11, font: 'B' });
      y = pg.paragraph(M + 130, y, TEXT_W - 130, def, { size: 10.5 }) + 14;
      pg.line(M, y - 7, A4[0] - M, y - 7, { stroke: RULE, lw: 0.4 });
    }
    footer(pg, n);
  }

  // back page
  {
    const pg = page();
    pg.rect(0, 0, A4[0], A4[1], { fill: '#24476b' });
    pg.textCenter(A4[0] / 2, A4[1] / 2 - 10, 'End of the demo document', { size: 20, font: 'B', color: WHITE });
    pg.textCenter(A4[0] / 2, A4[1] / 2 + 18, `${pages.length} pages, generated by scripts/demo-pdf-uret.mjs`, { size: 10.5, color: mix('#24476b', WHITE, 0.7) });
  }

  if (firstPage.some((p, i) => p !== 4 + i * 9)) throw new Error('Contents page numbers are wrong.');
  return pages;
}

// ---- the slides ----

const SLIDE = [960, 540];
// "... (if ... then) ..." is not the end of a sentence: the next word must start with a capital
const firstSentence = p => p.split(/(?<=[a-z0-9)']\.)\s+(?=[A-Z])/)[0];

function slides() {
  const pages = [];
  const total = 2 + CHAPTERS.length * 3 + 4;
  const slide = (title, c) => {
    const pg = new Page(...SLIDE);
    pages.push(pg);
    pg.rect(0, 0, SLIDE[0], SLIDE[1], { fill: '#fbfaf7' });
    pg.rect(0, 0, SLIDE[0], 88, { fill: c });
    pg.text(56, 56, title, { size: 30, font: 'B', color: WHITE });
    pg.text(56, SLIDE[1] - 24, `${COURSE} - demo slides`, { size: 10, color: GREY });
    pg.textRight(SLIDE[0] - 56, SLIDE[1] - 24, `${pages.length} / ${total}`, { size: 10, font: 'B', color: GREY });
    return pg;
  };
  const bullets = (pg, items, c, w = 460, x = 56) => {
    let y = 130;
    for (const t of items) {
      pg.circle(x + 5, y + 12, 4, { fill: c });
      y = pg.paragraph(x + 22, y, w, t, { size: 18, leading: 26 }) + 14;
    }
  };

  // title slide
  {
    const pg = new Page(...SLIDE), c = '#24476b';
    pages.push(pg);
    pg.rect(0, 0, SLIDE[0], SLIDE[1], { fill: c });
    for (let i = 0; i < 7; i++) pg.circle(740, 270, 36 + i * 26, { stroke: mix(c, WHITE, 0.15 + i * 0.08), lw: 1.2 });
    pg.text(70, 240, COURSE, { size: 44, font: 'B', color: WHITE });
    pg.text(70, 286, 'Demo slides for the Defter reader', { size: 20, color: mix(c, WHITE, 0.75) });
    pg.text(70, 440, 'Self-generated - no copyrighted content - free to share', { size: 12, color: mix(c, WHITE, 0.6) });
  }
  {
    const pg = slide('Agenda', '#24476b');
    CHAPTERS.forEach((ch, i) => {
      const x = i < 3 ? 70 : 500, yy = 132 + (i % 3) * 100;
      pg.rect(x, yy, 360, 76, { fill: mix(ch.color, WHITE, 0.88) });
      pg.rect(x, yy, 6, 76, { fill: ch.color });
      pg.text(x + 24, yy + 32, `Part ${i + 1}`, { size: 12, color: ch.color });
      pg.text(x + 24, yy + 58, ch.title, { size: 20, font: 'B', color: INK });
    });
  }
  CHAPTERS.forEach((ch, i) => {
    const c = ch.color;
    // section title
    {
      const pg = new Page(...SLIDE);
      pages.push(pg);
      pg.rect(0, 0, SLIDE[0], SLIDE[1], { fill: mix(c, WHITE, 0.9) });
      pg.rect(0, 0, 24, SLIDE[1], { fill: c });
      pg.text(80, 230, `Part ${i + 1}`, { size: 22, color: c });
      pg.text(80, 286, ch.title, { size: 46, font: 'B', color: c });
      pg.text(80, 330, ch.sections.slice(0, 4).join('  -  '), { size: 15, color: GREY });
      pg.textRight(SLIDE[0] - 56, SLIDE[1] - 24, `${pages.length} / ${total}`, { size: 10, font: 'B', color: GREY });
    }
    // bullets + figure
    {
      const pg = slide(ch.title, c);
      bullets(pg, ch.paras.slice(1, 4).map(firstSentence), c, 400);
      pg.rect(540, 120, 364, 320, { fill: WHITE, stroke: mix(c, WHITE, 0.6), lw: 1 });
      FIGURES[ch.figures[0]](pg, 570, 160, 304, 230, c);
      pg.textCenter(722, 430, FIGURE_NAMES[ch.figures[0]], { size: 11, font: 'I', color: GREY });
    }
    // key idea
    {
      const pg = slide(`${ch.title}: key idea`, c);
      pg.rect(56, 130, SLIDE[0] - 112, 140, { fill: mix(c, WHITE, 0.88) });
      pg.rect(56, 130, 8, 140, { fill: c });
      pg.paragraph(96, 160, SLIDE[0] - 192, ch.key, { size: 26, leading: 36, font: 'B', color: c });
      pg.rect(56, 300, SLIDE[0] - 112, 150, { stroke: RULE, lw: 0.8 });
      FIGURES[ch.figures[1]](pg, 250, 312, 460, 126, c);
    }
  });
  {
    const pg = slide('Exercises', INK);
    bullets(pg, EXERCISES.filter((_, i) => i % 3 === 0), '#24476b', 820);
  }
  {
    const pg = slide('Summary', '#24476b');
    CHAPTERS.forEach((ch, i) => {
      const x = 56 + (i % 3) * 290, y = 124 + Math.floor(i / 3) * 180;
      pg.rect(x, y, 270, 160, { fill: mix(ch.color, WHITE, 0.9) });
      pg.text(x + 18, y + 30, ch.title, { size: 15, font: 'B', color: ch.color });
      pg.paragraph(x + 18, y + 44, 234, ch.key, { size: 12, leading: 17 });
    });
  }
  {
    const pg = slide('About these slides', '#24476b');
    bullets(pg, [
      'Generated by scripts/demo-pdf-uret.mjs: the script writes the PDF directly, with no extra packages.',
      'Landscape 16:9 pages test how the reader fits wide pages into book mode and PDF mode.',
      'All text and figures were written for this demo. Nothing is copied from real lecture material.'
    ], '#24476b', 820);
  }
  {
    const pg = new Page(...SLIDE), c = '#24476b';
    pages.push(pg);
    pg.rect(0, 0, SLIDE[0], SLIDE[1], { fill: c });
    pg.textCenter(SLIDE[0] / 2, 260, 'Thank you', { size: 44, font: 'B', color: WHITE });
    pg.textCenter(SLIDE[0] / 2, 300, `End of the demo slides - ${pages.length} / ${total}`, { size: 14, color: mix(c, WHITE, 0.7) });
  }
  if (pages.length !== total) throw new Error(`Slide count ${pages.length} != ${total}`);
  return pages;
}

mkdirSync(OUT, { recursive: true });
for (const [name, pages, title] of [
  ['demo-dikey.pdf', portrait(), `${COURSE} (demo document)`],
  ['demo-slayt.pdf', slides(), `${COURSE} (demo slides)`]
]) {
  const size = writePdf(join(OUT, name), pages, title);
  console.log(`public/demo/${name}: ${pages.length} pages, ${(size / 1024).toFixed(0)} kB`);
}

// ---- kalem-testi.pdf (task 4.4) ----
// The reader leaves Defter's own notes (Ink, author "Defter") out of the page; notes from other
// apps stay. With ?defterNot=goster in the address, the Defter notes are drawn too.

const FIXED = new Date(Date.UTC(2026, 9, 15, 12, 0, 0));

async function penTest() {
  const doc = await PDFDocument.create();
  doc.setTitle(`${COURSE} (pen test)`);
  doc.setAuthor('Defter demo');
  doc.setProducer('scripts/demo-pdf-uret.mjs');
  doc.setCreator('scripts/demo-pdf-uret.mjs');
  doc.setCreationDate(FIXED);
  doc.setModificationDate(FIXED);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx = doc.context;
  const text = (page, str, x, y, size = 12, f = font) => page.drawText(str, { x, y, size, font: f, color: libRgb(0.15, 0.15, 0.2) });

  // a note from another app, with its own appearance stream (so every viewer draws it the same)
  const foreign = (page, subtype, rect, ap, extra) => {
    const [x0, y0, x1, y1] = rect;
    const n = ctx.register(ctx.flateStream(ap, { Type: 'XObject', Subtype: 'Form', BBox: [x0, y0, x1, y1] }));
    const ref = ctx.register(ctx.obj({ Type: 'Annot', Subtype: subtype, Rect: rect, F: 4, M: PDFString.of('D:20261015120000Z'), AP: { N: n }, ...extra }));
    page.node.addAnnot(ref);
  };

  const p1 = doc.addPage([595.28, 841.89]);
  text(p1, 'Pen test - page 1', 72, 770, 22, bold);
  [
    "This page checks that the reader hides Defter's own notes and keeps the others.",
    'Normally you see only the blue box on the right (a note from another program).',
    'With ?defterNot=goster in the address you also see a red pen line and a yellow',
    "highlighter stroke over this line of text - those are Defter's own Ink notes."
  ].forEach((l, i) => text(p1, l, 72, 720 - i * 20));
  text(p1, 'Defter pen line (hidden):', 72, 560);
  text(p1, 'Note from another program (always visible):', 300, 560);
  foreign(p1, 'Square', [330, 420, 520, 530], '0 0 0.8 RG 3 w 331.5 421.5 187 107 re S\n', {
    C: [0, 0, 0.8], BS: { W: 3, S: 'S' }, T: PDFString.of('Baska program'), Contents: PDFString.of('Square note from another program')
  });

  const p2 = doc.addPage([595.28, 841.89]);
  text(p2, 'Pen test - page 2', 72, 770, 22, bold);
  [
    'Two Ink notes. The green one on the left comes from another program (author "GoodNotes")',
    "and is always visible. The red one on the right is Defter's (author 'Defter'):",
    'hidden normally, visible with ?defterNot=goster.'
  ].forEach((l, i) => text(p2, l, 72, 720 - i * 20));
  const green = [90, 520, 130, 600, 170, 520, 210, 600, 250, 520];
  const greenPath = `${green[0]} ${green[1]} m ` + green.slice(2).reduce((a, v, i) => a + (i % 2 ? `${v} l ` : `${v} `), '');
  foreign(p2, 'Ink', [80, 510, 260, 610], `0 0.55 0.2 RG 4 w 1 J 1 j ${greenPath}S\n`, {
    InkList: [green], C: [0, 0.55, 0.2], BS: { W: 4, S: 'S' }, T: PDFString.of('GoodNotes')
  });

  // Task 4.5: pages 3–6 check that the pen layer (SVG, reading mode) lands where pdf.js draws the
  // notes: rotated 90 / 180 / 270 and a CropBox that doesn't start at 0 0. Thin grey lines in the
  // page itself mark where each Defter stroke must be; open with ?cizimKontrol=1 to compare.
  const GUIDE = libRgb(0.6, 0.6, 0.6);
  const guide = (page, pts) => {
    if (pts.length === 2) {
      const [x, y] = pts;
      page.drawLine({ start: { x: x - 8, y }, end: { x: x + 8, y }, thickness: 0.5, color: GUIDE });
      page.drawLine({ start: { x, y: y - 8 }, end: { x, y: y + 8 }, thickness: 0.5, color: GUIDE });
      return;
    }
    for (let k = 0; k + 3 < pts.length; k += 2) {
      page.drawLine({ start: { x: pts[k], y: pts[k + 1] }, end: { x: pts[k + 2], y: pts[k + 3] }, thickness: 0.5, color: GUIDE });
    }
  };
  const alignPages = [
    { title: 'Pen test - page 3: rotated 90', rotate: 90 },
    { title: 'Pen test - page 4: rotated 180', rotate: 180 },
    { title: 'Pen test - page 5: rotated 270', rotate: 270 },
    { title: 'Pen test - page 6: CropBox from 120 160', crop: [120, 160, 400, 560] }
  ];
  // task 4.7c: a pen gives a point every 0.5-3 pt; drawn through only its 4 corners, the smooth
  // curve would round each corner widely. So the L gets a point every 2 pt along its sides.
  const penLike = pts => {
    const out = [pts[0], pts[1]];
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const [x0, y0, x1, y1] = pts.slice(k, k + 4), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2);
      for (let j = 1; j <= n; j++) out.push(Math.round((x0 + (x1 - x0) * j / n) * 100) / 100, Math.round((y0 + (y1 - y0) * j / n) * 100) / 100);
    }
    return out;
  };
  const alignStrokes = [];
  for (const [n, a] of alignPages.entries()) {
    const page = doc.addPage([595.28, 841.89]);
    if (a.rotate) page.setRotation(degrees(a.rotate));
    // inside the CropBox, the same shapes moved in: x 120–520, y 160–720
    const [ox, oy] = a.crop ? [a.crop[0] + 20, a.crop[1] + 20] : [72, 120];
    if (a.crop) page.setCropBox(...a.crop);
    text(page, a.title, ox, oy + 500, 16, bold);
    [
      "The grey lines are part of the page. Defter's red pen line, yellow highlighter",
      'and red dot must lie exactly on them. With ?cizimKontrol=1 a cyan dashed line',
      "shows the reader's layer over pdf.js's own drawing of the notes."
    ].forEach((l, i) => text(page, l, ox, oy + 470 - i * 16, 9));
    text(page, 'Highlighted line: the quick brown fox', ox, oy + 380, 12);
    // not symmetric (an L with a tail), so a wrong turn or a mirror shows at once
    const penPts = [ox, oy + 300, ox, oy + 120, ox + 200, oy + 120, ox + 260, oy + 200];
    const hlPts = [ox - 2, oy + 384, ox + 215, oy + 384];
    const dotPts = [ox + 300, oy + 300];
    guide(page, penPts); guide(page, hlPts); guide(page, dotPts);
    alignStrokes.push([2 + n, [
      { id: `demo-hiza-fosforlu-${n + 3}`, arac: 'fosforlu', renk: '#ffeb3b', kalinlik: 14, opaklik: 0.4, noktalar: hlPts },
      { id: `demo-hiza-kalem-${n + 3}`, arac: 'kalem', renk: '#d32f2f', kalinlik: 3, opaklik: 1, noktalar: penLike(penPts) },
      { id: `demo-hiza-nokta-${n + 3}`, arac: 'kalem', renk: '#d32f2f', kalinlik: 6, opaklik: 1, noktalar: dotPts }
    ]]);
  }

  const base = await doc.save({ useObjectStreams: false });

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { writeDefterStrokes } = await vite.ssrLoadModule('/src/kalem/pdfNotlari.ts');
    const pen = (id, noktalar) => ({ id, arac: 'kalem', renk: '#d32f2f', kalinlik: 3, opaklik: 1, noktalar });
    return await writeDefterStrokes(base, new Map([
      [0, [
        pen('demo-kalem-1', [80, 520, 120, 490, 160, 525, 200, 485, 240, 520, 270, 500]),
        { id: 'demo-fosforlu-1', arac: 'fosforlu', renk: '#ffeb3b', kalinlik: 14, opaklik: 0.4, noktalar: [70, 664, 505, 664] }
      ]],
      // task 4.7c: an Apple Pencil stroke, light → hard → light (its width follows the pressure)
      [1, [{ ...pen('demo-kalem-2', [330, 520, 370, 600, 410, 520, 450, 600, 490, 520]), basinc: [0.1, 0.4, 1, 0.4, 0.1] }]],
      ...alignStrokes
    ]), { simdi: FIXED });
  } finally {
    await vite.close();
  }
}

{
  const bytes = await penTest();
  writeFileSync(join(OUT, 'kalem-testi.pdf'), bytes);
  console.log(`public/demo/kalem-testi.pdf: 6 pages, ${(bytes.length / 1024).toFixed(0)} kB`);
}
