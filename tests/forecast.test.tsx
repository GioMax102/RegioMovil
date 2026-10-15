import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Forecast } from '../src/components/Primitives';

function highlightedHours(data: { hour: string; occupancy: number }[], compact = false) {
  const dom = new JSDOM(renderToStaticMarkup(<Forecast data={data} compact={compact} />));
  try {
    return [...dom.window.document.querySelectorAll('.forecast-column')]
      .filter((column) => column.querySelector('.bar-fill.least-crowded.current'))
      .map((column) => column.querySelector('.bar-hour')?.textContent);
  } finally {
    dom.window.close();
  }
}

test('forecast highlights every least-crowded hour instead of the first hour', () => {
  assert.deepEqual(
    highlightedHours([
      { hour: '09:00', occupancy: 69 },
      { hour: '10:00', occupancy: 32 },
      { hour: '11:00', occupancy: 27 },
      { hour: '12:00', occupancy: 27 },
    ]),
    ['11:00', '12:00'],
  );
});

test('compact forecast chooses the minimum of visible hours', () => {
  const data = [69, 32, 30, 29, 28, 27, 20].map((occupancy, index) => ({
    hour: `${index + 9}:00`,
    occupancy,
  }));
  assert.deepEqual(highlightedHours(data, true), ['14:00']);
  assert.deepEqual(highlightedHours(data), ['15:00']);
  assert.deepEqual(highlightedHours([]), []);
});
