'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../roteiro.js');

test('Enter, Shift+Enter, linha vazia e Tab seguem o roteiro', () => {
  assert.equal(R.step('cena', 'enter'), 'acao');
  assert.equal(R.step('acao', 'enter'), 'acao');
  assert.equal(R.step('personagem', 'enter'), 'fala');
  assert.equal(R.step('parentese', 'enter'), 'fala');
  assert.equal(R.step('fala', 'enter'), 'personagem');
  assert.equal(R.step('transicao', 'enter'), 'cena');

  assert.equal(R.step('fala', 'shift'), 'fala');
  assert.equal(R.step('personagem', 'shift'), 'fala');

  assert.equal(R.step('acao', 'empty'), 'personagem');
  assert.equal(R.step('personagem', 'empty'), 'acao');
  assert.equal(R.step('fala', 'empty'), 'acao');
  assert.equal(R.step('cena', 'empty'), 'acao');

  assert.equal(R.step('acao', 'tab'), 'personagem');
  assert.equal(R.step('personagem', 'tab'), 'transicao');
  assert.equal(R.step('transicao', 'tab'), 'cena');
  assert.equal(R.step('cena', 'tab'), 'acao');
  assert.equal(R.step('fala', 'tab'), 'parentese');
  assert.equal(R.step('parentese', 'tab'), 'fala');

  assert.equal(R.step('personagem', 'untab'), 'acao');
  assert.equal(R.step('cena', 'untab'), 'transicao');
  assert.equal(R.step('parentese', 'untab'), 'fala');
});

test('a barra do modo fala português e não traduz o resto', () => {
  assert.match(R.statusLine('fala', false), /^Fala · /);
  assert.match(R.statusLine('acao', true), /Tab muda o tipo/);
  assert.equal(R.LABELS.parentese, 'Parêntese');
});

test('uma cena com personagem e fala volta igual em Fountain', () => {
  const doc = {
    title: 'A Porta',
    author: 'Ana Lima',
    blocks: [
      { type: 'cena', text: 'int. cozinha - dia' },
      { type: 'acao', text: 'A chaleira apita.' },
      { type: 'personagem', text: 'maria' },
      { type: 'parentese', text: 'baixo' },
      { type: 'fala', text: 'Quem está aí?' },
      { type: 'acao', text: 'Silêncio.' },
      { type: 'transicao', text: 'corta para:' }
    ]
  };
  const text = R.serialize(doc);
  assert.match(text, /^Title: A Porta\nAuthor: Ana Lima\n\nINT\. COZINHA - DIA\n/);
  assert.match(text, /\nMARIA\n\(baixo\)\nQuem está aí\?\n/);
  assert.match(text, /\nCORTA PARA:\n$/);

  const again = R.serialize(R.parse(text));
  assert.equal(again, text);

  const back = R.parse(text);
  assert.equal(back.title, 'A Porta');
  assert.equal(back.author, 'Ana Lima');
  assert.deepEqual(back.blocks.map((b) => b.type), [
    'cena', 'acao', 'personagem', 'parentese', 'fala', 'acao', 'transicao'
  ]);
  assert.equal(back.blocks[2].text, 'MARIA');
  assert.equal(back.blocks[3].text, '(baixo)');
});

test('Fountain força o que seria lido como outro elemento', () => {
  const text = R.serialize({
    title: '',
    author: '',
    blocks: [
      { type: 'cena', text: 'Cozinha' },
      { type: 'acao', text: 'INT. RUA - NOITE' },
      { type: 'personagem', text: 'JOÃO' },
      { type: 'transicao', text: 'escurece.' }
    ]
  });
  assert.match(text, /^\.COZINHA\n/);
  assert.match(text, /\n!INT\. RUA - NOITE\n/);
  assert.match(text, /\n@JOÃO\n/);
  assert.match(text, /\n> ESCURECE\.\n$/);
  assert.equal(R.serialize(R.parse(text)), text);
});

test('gravar e reabrir o HTML não perde o tipo do elemento', () => {
  const blocks = [
    { type: 'cena', text: 'INT. SALA – NOITE' },
    { type: 'acao', text: 'A & B se olham.' },
    { type: 'personagem', text: 'BIA' },
    { type: 'fala', text: 'Fica.' },
    { type: 'parentese', text: '' },
    { type: 'transicao', text: 'CORTA PARA:' }
  ];
  const html = R.htmlFromBlocks(blocks);
  assert.match(html, /data-el="cena"/);
  assert.match(html, /A &amp; B se olham\./);
  const back = R.blocksFromHtml(html);
  assert.deepEqual(back.map((b) => b.type), blocks.map((b) => b.type));
  assert.equal(back[1].text, 'A & B se olham.');
  assert.equal(back[4].text, '');
  assert.equal(R.htmlFromBlocks(back), html);
});

test('um parágrafo de romance, sem data-el, continua sendo ação', () => {
  const back = R.blocksFromHtml('<p>Era uma vez.</p><p class="poetry">um verso</p>');
  assert.deepEqual(back, [
    { type: 'acao', text: 'Era uma vez.' },
    { type: 'acao', text: 'um verso' }
  ]);
});

test('nome em maiúsculas vira deixa; frase comum não', () => {
  assert.equal(R.looksLikeCue('MARIA'), true);
  assert.equal(R.looksLikeCue('Maria'), false);
  assert.equal(R.looksLikeCue('A CHALEIRA APITA.'), false);
  assert.equal(R.looksLikeTransition('corta para:', true), true);
  assert.equal(R.looksLikeTransition('A chaleira apita.', true), false);
});
