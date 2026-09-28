// NEO — screenplay mode (roteiro)
//
// A roteiro is still a NEO book: book.json plus chapters/*.html. What
// changes is the paragraph. Each <p data-el="…"> is one Fountain element
// (cena, acao, personagem, parentese, fala, transicao). Novels never set
// book.kind, so their files stay ordinary paragraphs.
//
// This file is the rules: which element comes next, and how a list of
// elements becomes Fountain and comes back. The editor in app.js only
// applies them. The same file runs in the window (window.NeoRoteiro) and
// in Node (require), which is what the tests load.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoRoteiro = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = ['cena', 'acao', 'personagem', 'parentese', 'fala', 'transicao'];
  const LABELS = {
    cena: 'Cena',
    acao: 'Ação',
    personagem: 'Personagem',
    parentese: 'Parêntese',
    fala: 'Fala',
    transicao: 'Transição'
  };
  const UPPER = new Set(['cena', 'personagem', 'transicao']);
  const DIALOGUE = new Set(['parentese', 'fala']);

  // Enter at the end of a line: the element that follows.
  const ENTER_NEXT = {
    cena: 'acao', acao: 'acao', personagem: 'fala',
    parentese: 'fala', fala: 'personagem', transicao: 'cena'
  };
  // Shift+Enter: another line of the same kind, except a scene or a
  // transition, which still open what comes after them.
  const SHIFT_NEXT = {
    cena: 'acao', acao: 'acao', personagem: 'fala',
    parentese: 'fala', fala: 'fala', transicao: 'cena'
  };
  // Enter on an empty line: change that line instead of opening another.
  const EMPTY_NEXT = {
    cena: 'acao', acao: 'personagem', personagem: 'acao',
    parentese: 'fala', fala: 'acao', transicao: 'cena'
  };
  // Tab cycles the line. Dialogue only swaps with its parenthetical.
  const TAB_NEXT = {
    acao: 'personagem', personagem: 'transicao', transicao: 'cena',
    cena: 'acao', fala: 'parentese', parentese: 'fala'
  };
  const TAB_PREV = {
    personagem: 'acao', transicao: 'personagem', cena: 'transicao',
    acao: 'cena', parentese: 'fala', fala: 'parentese'
  };
  const STEP = { enter: ENTER_NEXT, shift: SHIFT_NEXT, empty: EMPTY_NEXT, tab: TAB_NEXT, untab: TAB_PREV };

  // The status line under the page. Portuguese only — the rest of NEO
  // keeps whatever language the writer picked.
  const HINT = {
    cena: { blank: 'INT. ou EXT. · Enter abre a ação', filled: 'Enter abre a ação' },
    acao: { blank: 'Enter vira personagem · Tab muda o tipo', filled: 'Enter abre outra ação' },
    personagem: { blank: 'Enter volta para a ação', filled: 'Enter abre a fala' },
    parentese: { blank: 'Enter volta para a fala', filled: 'Enter volta para a fala' },
    fala: { blank: 'Enter abre a ação · ( abre um parêntese', filled: 'Enter abre o próximo personagem · Shift+Enter continua a fala' },
    transicao: { blank: 'Enter abre uma cena', filled: 'Enter abre uma cena' }
  };

  const SCENE_RE = /^(?:int|ext|est|int\.?\/ext|ext\.?\/int|i\/e)[.\s]/i;
  const TRANSITIONS = [
    'FADE IN:', 'FADE OUT.', 'FADE OUT:', 'FADE TO BLACK.', 'CUT TO BLACK.',
    'CORTA PARA:', 'CORTE PARA:', 'CORTA:', 'CORTE:', 'CORTE SECO:',
    'FUSÃO PARA:', 'FUSÃO:', 'ESCURECE.', 'BLACKOUT.'
  ];

  const upper = (s) => String(s == null ? '' : s).toLocaleUpperCase('pt-BR');
  const isType = (t) => TYPES.includes(t);
  const isUpper = (t) => UPPER.has(t);

  function step(type, action) {
    const table = STEP[action] || ENTER_NEXT;
    const t = isType(type) ? type : 'acao';
    return table[t];
  }

  function statusLine(type, blank) {
    const t = isType(type) ? type : 'acao';
    const hint = HINT[t][blank ? 'blank' : 'filled'];
    return LABELS[t] + ' · ' + hint;
  }

  function looksLikeTransition(text, loose) {
    const raw = String(text || '').trim();
    const t = loose ? upper(raw) : raw;
    if (!loose && t !== upper(t)) return false;
    if (!t) return false;
    return /(?:^|\s)(?:TO|PARA):$/.test(t) || TRANSITIONS.includes(t);
  }

  // A name typed in capitals on an action line, ready to become a character.
  function looksLikeCue(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 40 || t.split(/\s+/).length > 4) return false;
    if (/[.!?\u2026:;,]$/.test(t)) return false;
    return t === upper(t) && /\p{L}/u.test(t);
  }

  function stripExtensions(s) {
    let t = String(s || '').trim().replace(/\s*\^$/, '');
    let prev;
    do { prev = t; t = t.replace(/\s*\([^()]*\)\s*$/, ''); } while (t !== prev);
    return t.trim();
  }

  function looksLikeCharacter(text) {
    const t = String(text || '').trim();
    if (!t || /^[!.>~=#[@]/.test(t)) return false;
    const name = stripExtensions(t);
    return name.length > 0 && /\p{L}/u.test(name) && name === upper(name);
  }

  function looksLikeScene(text) {
    return SCENE_RE.test(String(text || '').trim());
  }

  // Drop empties, force capitals, and keep the parentheses on a parenthetical.
  function normalize(blocks) {
    const out = [];
    for (const b of blocks || []) {
      if (!b || !isType(b.type)) continue;
      let text = String(b.text == null ? '' : b.text).replace(/\s*\n\s*/g, ' ');
      text = b.type === 'acao' ? text.replace(/\s+$/, '') : text.trim();
      if (isUpper(b.type)) text = upper(text);
      if (b.type === 'parentese') {
        const inner = text.replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim();
        text = inner ? '(' + inner + ')' : '';
      }
      if (!String(text).trim()) continue;
      out.push({ type: b.type, text });
    }
    return out;
  }

  function forceAction(text) {
    const t = String(text || '').trim();
    const risky = looksLikeScene(t) || /^\.[^.]/.test(t) || /^[@!]/.test(t) ||
      (t.startsWith('>') && !t.endsWith('<')) || looksLikeTransition(t);
    return risky ? '!' + text : text;
  }

  function serializeBody(blocks) {
    const list = normalize(blocks);
    const out = [];
    const gap = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
    let open = false;
    list.forEach((b, k) => {
      const next = list[k + 1];
      if (b.type === 'personagem') {
        gap();
        const hasLines = next && DIALOGUE.has(next.type);
        out.push(hasLines && looksLikeCharacter(b.text) ? b.text : '@' + b.text);
        open = true;
      } else if (DIALOGUE.has(b.type) && open) {
        out.push(b.text);
      } else if (b.type === 'cena') {
        open = false;
        gap();
        out.push(looksLikeScene(b.text) ? b.text : '.' + b.text);
      } else if (b.type === 'transicao') {
        open = false;
        gap();
        out.push(/(?:^|\s)(?:TO|PARA):$/.test(b.text) ? b.text : '> ' + b.text);
      } else {
        open = false;
        gap();
        out.push(forceAction(b.text));
      }
    });
    return out;
  }

  function serialize(doc) {
    const lines = [];
    const title = String((doc && doc.title) || '').replace(/\s+/g, ' ').trim();
    const author = String((doc && doc.author) || '').replace(/\s+/g, ' ').trim();
    if (title) lines.push('Title: ' + title);
    if (author) lines.push('Author: ' + author);
    if (lines.length) lines.push('');
    lines.push(...serializeBody(doc && doc.blocks));
    return lines.join('\n').replace(/\n+$/, '') + '\n';
  }

  function titleKey(line) {
    const m = /^(title|author)\s*:\s*(.*)$/i.exec(String(line || ''));
    if (!m) return null;
    return { key: m[1].toLowerCase(), value: m[2].trim() };
  }

  function parseBody(lines) {
    if (typeof lines === 'string') lines = String(lines).replace(/\r\n?/g, '\n').split('\n');
    const src = lines || [];
    const n = src.length;
    const blank = (k) => k < 0 || k >= n || String(src[k]).trim() === '';
    const blocks = [];
    let i = 0;
    while (i < n) {
      const raw = String(src[i]);
      const t = raw.trim();
      if (!t) { i++; continue; }
      const prevBlank = blank(i - 1);
      const nextBlank = blank(i + 1);
      if (t.startsWith('!')) { blocks.push({ type: 'acao', text: t.slice(1) }); i++; continue; }
      if (/^\.[^.]/.test(t)) { blocks.push({ type: 'cena', text: t.slice(1).trim() }); i++; continue; }
      if (prevBlank && looksLikeScene(t)) { blocks.push({ type: 'cena', text: t }); i++; continue; }
      if (t.startsWith('>')) {
        if (t.endsWith('<')) blocks.push({ type: 'acao', text: t });
        else blocks.push({ type: 'transicao', text: t.slice(1).trim() });
        i++;
        continue;
      }
      if (prevBlank && nextBlank && looksLikeTransition(t)) {
        blocks.push({ type: 'transicao', text: t });
        i++;
        continue;
      }
      if (t.startsWith('@') || (prevBlank && !nextBlank && looksLikeCharacter(t))) {
        blocks.push({ type: 'personagem', text: t.startsWith('@') ? t.slice(1).trim() : t });
        i++;
        while (i < n && String(src[i]).trim() !== '') {
          const d = String(src[i]).trim();
          blocks.push({ type: /^\(.*\)$/.test(d) ? 'parentese' : 'fala', text: d });
          i++;
        }
        continue;
      }
      blocks.push({ type: 'acao', text: raw.replace(/\s+$/, '') });
      i++;
    }
    return blocks;
  }

  function parse(text) {
    const src = String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const lines = src.split('\n');
    let title = '';
    let author = '';
    let i = 0;
    if (titleKey(lines[0])) {
      for (; i < lines.length && lines[i].trim() !== ''; i++) {
        const k = titleKey(lines[i]);
        if (!k) continue;
        if (k.key === 'title') title = k.value;
        else if (k.key === 'author') author = k.value;
      }
    }
    return { title, author, blocks: parseBody(lines.slice(i)) };
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function unescapeHtml(s) {
    return String(s)
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  // The chapter file. An empty roteiro is one blank scene heading, which
  // is what a new chapter opens on.
  function htmlFromBlocks(blocks) {
    const list = (blocks || []).filter((b) => b && isType(b.type));
    if (!list.length) return '<p data-el="cena"><br></p>';
    return list.map((b) => {
      const text = String(b.text == null ? '' : b.text);
      if (!text) return `<p data-el="${b.type}"><br></p>`;
      return `<p data-el="${b.type}">${escapeHtml(text)}</p>`;
    }).join('');
  }

  function blocksFromHtml(html) {
    const src = String(html || '');
    const blocks = [];
    const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = re.exec(src))) {
      const typeM = /\bdata-el=["']([a-z]+)["']/i.exec(m[1]);
      const type = typeM && isType(typeM[1]) ? typeM[1] : 'acao';
      const text = unescapeHtml(m[2].replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, ''));
      blocks.push({ type, text });
    }
    return blocks;
  }

  return {
    TYPES, LABELS, ENTER_NEXT, SHIFT_NEXT, EMPTY_NEXT, TAB_NEXT, TAB_PREV,
    upper, isType, isUpper, step, statusLine,
    looksLikeTransition, looksLikeCue, looksLikeCharacter, looksLikeScene,
    normalize, serialize, serializeBody, parse, parseBody,
    htmlFromBlocks, blocksFromHtml
  };
});
