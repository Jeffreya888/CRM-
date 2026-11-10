import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunk, guessColumns, mapRows, missingRequired, parseCsv } from './spreadsheetImport';

test('CSV: quotes, commas and new lines inside quotes, BOM, CRLF', () => {
  const rows = parseCsv('﻿Name,Notes\r\n"Blake, Jordan","Line one\nline ""two"""\r\nPriya,\r\n\r\n');
  assert.deepEqual(rows, [['Name', 'Notes'], ['Blake, Jordan', 'Line one\nline "two"'], ['Priya', '']]);
});

test('CSV: semicolon and tab separated files', () => {
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('guesses columns from common exports', () => {
  const jobber = ['First Name', 'Last Name', 'Company Name', 'E-mail', 'Mobile Phone', 'Billing Address'];
  const c = guessColumns('customers', jobber);
  assert.equal(c.first, 0); assert.equal(c.last, 1); assert.equal(c.company, 2); assert.equal(c.email, 3); assert.equal(c.phone, 4); assert.equal(c.address, 5);
  const a = guessColumns('assets', ['Tail Number', 'Manufacturer', 'Model', 'Year', 'Serial Number', 'Owner Email']);
  assert.equal(a.tail, 0); assert.equal(a.make, 1); assert.equal(a.model, 2); assert.equal(a.serial, 4); assert.equal(a.owner, 5);
  const s = guessColumns('services', ['Service Name', 'Unit Price', 'Duration']);
  assert.equal(s.name, 0); assert.equal(s.price, 1); assert.equal(s.hours, 2);
});

test('maps rows and joins first and last names', () => {
  const rows = mapRows('customers', [['Jordan', 'Blake', '', 'j@x.com'], ['', '', 'Acme Air', ''], ['', '', '', '']], { first: 0, last: 1, company: 2, email: 3, name: null, phone: null, address: null, notes: null });
  assert.deepEqual(rows, [{ email: 'j@x.com', name: 'Jordan Blake' }, { company: 'Acme Air' }]);
  assert.equal(missingRequired('customers', rows), 0);
  assert.equal(missingRequired('services', [{ name: 'Wash' }, { name: 'Wax', price: '50' }]), 1);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
