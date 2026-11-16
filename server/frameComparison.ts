// Allow tiny Chromium antialiasing differences at composited SVG edges while
// rejecting changes to the scene, visibility, positions, or animation state.
export function compareRasterFrames(first: Uint8Array, repeated: Uint8Array, width: number, height: number) {
  if (first.length !== width * height * 3 || repeated.length !== first.length) throw new Error('Unexpected video validation image dimensions.');
  let changedPixels = 0, maximumDifference = 0, squaredError = 0;
  for (let i = 0; i < first.length; i += 3) {
    let changed = false;
    for (let channel = 0; channel < 3; channel++) {
      const difference = Math.abs(first[i + channel] - repeated[i + channel]);
      if (difference) changed = true;
      maximumDifference = Math.max(maximumDifference, difference);
      squaredError += difference * difference;
    }
    if (changed) changedPixels++;
  }
  const rms = Math.sqrt(squaredError / first.length);
  return { matches: maximumDifference <= 16 && changedPixels <= Math.ceil(width * height * .0002) && rms <= .05, changedPixels, maximumDifference, rms };
}
