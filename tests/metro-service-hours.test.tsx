import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Forecast } from '../src/components/Primitives';
import {
  filterMetroForecast,
  getMetroServiceWindow,
  getNextMetroOpening,
  isMetroOperating,
} from '../src/components/metroServiceHours';

const local = (value: string) => new Date(`${value}-06:00`);

test('Metro hides closed hours and respects the after-midnight service segment', () => {
  assert.equal(isMetroOperating(local('2026-10-24T00:15:00')), true);
  assert.equal(isMetroOperating(local('2026-10-24T00:30:00')), false);
  assert.equal(isMetroOperating(local('2026-10-24T03:00:00')), false);
  assert.equal(isMetroOperating(local('2026-10-24T04:45:00')), false);
  assert.equal(isMetroOperating(local('2026-10-24T05:00:00')), true);
  assert.equal(isMetroOperating(local('2026-10-24T23:59:00')), true);
});

test('holiday hours do not accidentally show the previous closed evening after midnight', () => {
  assert.deepEqual(getMetroServiceWindow(local('2026-12-24T12:00:00')).closes, '23:00');
  assert.equal(isMetroOperating(local('2026-12-24T23:00:00')), false);
  assert.equal(isMetroOperating(local('2026-12-25T00:00:00')), false);
  assert.equal(isMetroOperating(local('2026-12-25T06:00:00')), false);
  assert.equal(isMetroOperating(local('2026-12-25T07:00:00')), true);
  assert.equal(isMetroOperating(local('2027-01-01T00:00:00')), false);
  assert.equal(isMetroOperating(local('2027-01-01T05:00:00')), false);
  assert.equal(getNextMetroOpening(local('2026-12-24T23:15:00')), '07:00');
  assert.equal(getNextMetroOpening(local('2026-12-31T23:15:00')), '07:00');
  assert.equal(getNextMetroOpening(local('2026-10-24T03:00:00')), '05:00');
});

test('forecast tracks calendar rollover and filters closed slots before rendering', () => {
  const data = ['22:00', '23:00', '00:00', '01:00', '05:00', '07:00'].map((hour) => ({
    hour,
    occupancy: 25,
  }));
  assert.deepEqual(
    filterMetroForecast(data, local('2026-12-24T22:00:00')).map((item) => item.hour),
    ['22:00', '07:00'],
  );
  const html = renderToStaticMarkup(
    <Forecast
      serviceDate={local('2026-10-24T03:00:00')}
      data={['03:00', '04:00', '05:00', '06:00'].map((hour) => ({ hour, occupancy: 30 }))}
    />,
  );
  assert.ok(!html.includes('03:00'));
  assert.ok(!html.includes('04:00'));
  assert.ok(html.includes('05:00'));
  assert.ok(html.includes('class="forecast-scroll" tabindex="0"'));
});
