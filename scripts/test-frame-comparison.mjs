import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareRasterFrames } from '../server/frameComparison.ts';

test('frame validation accepts exact pixels and tiny edge rasterization noise', () => {
  const original = new Uint8Array(100 * 100 * 3).fill(128);
  assert.equal(compareRasterFrames(original, original, 100, 100).matches, true);
  const repeated = original.slice(); repeated[600] += 8;
  assert.equal(compareRasterFrames(original, repeated, 100, 100).matches, true);
});
test('frame validation rejects a changed surface, missing detail or wrong dimensions', () => {
  const original = new Uint8Array(100 * 100 * 3).fill(128);
  const surface = original.map(value => value + 1);
  assert.equal(compareRasterFrames(original, surface, 100, 100).matches, false);
  const missing = original.slice(); missing[600] = 0;
  assert.equal(compareRasterFrames(original, missing, 100, 100).matches, false);
  const shifted = original.slice(); shifted[600]++; shifted[900]++; shifted[1200]++;
  assert.equal(compareRasterFrames(original, shifted, 100, 100).matches, false);
  assert.throws(() => compareRasterFrames(original, original.slice(3), 100, 100));
});
