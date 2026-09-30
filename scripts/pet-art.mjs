// Original articulated artwork shared by built-in assets and import examples.
const smooth = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const earPoint = (x, y, pivotX, angle) => {
  const radians = angle * Math.PI / 180, dx = x - pivotX, dy = y - 105;
  return `${+(pivotX + dx * Math.cos(radians) - dy * Math.sin(radians)).toFixed(3)} ${+(105 + dx * Math.sin(radians) + dy * Math.cos(radians)).toFixed(3)}`;
};
export function cat(color, action = 'idle', frame = 0, count = 24, variant = 0) {
  const looping = ['idle', 'sleepy', 'drag', 'thinking'].includes(action);
  const t = frame / Math.max(1, looping ? count : count - 1), phase = t * Math.PI * 2;
  const pulse = Math.sin(Math.PI * t) ** 2, direction = variant % 2 ? -1 : 1;
  let sx = 1, sy = 1 + Math.sin(phase) * .007, lift = 0, lean = 0, gaze = 0, faceY = 0;
  let lid = 0, ear = 0, tail = 0, paws = 0, pawsOpacity = 1, mouth = '', prop = '', decoration = '';
  if (action === 'pet') { lean = direction * (variant === 2 ? 6 : 4) * pulse; gaze = direction * 2 * pulse; lid = pulse; sy = 1 - .025 * pulse; tail = 15 * Math.sin(phase) * pulse; ear = -5 * pulse; }
  if (action === 'happy') {
    const hold = smooth(.06, .3, t) * (1 - smooth(.7, .94, t));
    const visible = smooth(.02, .1, t) * (1 - smooth(.9, .98, t));
    const chew = t > .3 && t < .7 ? Math.sin((t - .3) / .4 * Math.PI * (variant ? 3 : 2)) ** 2 : 0;
    lid = .72 * hold + .08 * chew; sy = 1 - .008 * chew; faceY = .55 * chew; pawsOpacity = 1 - visible;
    if (hold > .85) mouth = `<ellipse cx="128" cy="162" rx="${3 + chew}" ry="${1.2 + .9 * chew}" fill="#5b6151"/>`;
    // The bitten rim meets the mouth at full reach. Food and both paws follow
    // the same face offset, including each chew, instead of floating below it.
    const snackY = 193 - 24 * hold + faceY, handY = snackY + 6;
    const hand = `M113 ${handY + 8}C109 ${handY + 4} 111 ${handY - 3} 115 ${handY - 5}C118 ${handY - 8} 122 ${handY - 5} 123 ${handY - 1}C125 ${handY + 3} 122 ${handY + 7} 119 ${handY + 9}`;
    prop = `<g opacity="${visible}"><g fill="${color}" stroke="#5b6151" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${hand}"/><path d="${hand}" transform="translate(256 0) scale(-1 1)"/></g>
      <path d="M124.5 ${snackY - 7.7}Q128 ${snackY - 3.9} 131.5 ${snackY - 7.7}A8.5 8.5 0 1 1 124.5 ${snackY - 7.7}Z" fill="#dca566" stroke="#a77947" stroke-width="1.6"/>
      <g fill="#996d46"><circle cx="124.5" cy="${snackY + 1}" r="1"/><circle cx="130.5" cy="${snackY + 4}" r="1.1"/><circle cx="131" cy="${snackY - 1}" r=".8"/></g>
      <g fill="none" stroke="#aaa38d" stroke-width="1.1" stroke-linecap="round"><path d="M114 ${handY + 1}q2 0 3-2"/><path d="M114 ${handY + 1}q2 0 3-2" transform="translate(256 0) scale(-1 1)"/></g></g>`;
    tail = direction * 7 * pulse;
  }
  if (action === 'sleepy') { lid = 1; sy = .94 + Math.sin(phase) * .009; sx = 1.025; lean = -4; faceY = 4; ear = -6; decoration = `<text x="193" y="99" font-family="sans-serif" font-size="15" fill="#8a9b82" opacity="${.35 + .25 * Math.sin(phase)}">z</text>`; }
  if (action === 'doze') { const nod = smooth(.05, .35, t) * (1 - smooth(.72, 1, t)); lid = nod; lean = -5 * nod; faceY = 5 * nod; sy = 1 - .06 * nod; ear = -6 * nod; }
  if (action === 'stretch') { sx = 1 - .06 * pulse; sy = 1 + .09 * pulse; faceY = -4 * pulse; lid = pulse; paws = 9 * pulse; ear = -12 * pulse; tail = direction * 13 * pulse; lean = direction * 1.5 * pulse; }
  if (action === 'look') { const turn = smooth(.08, .28, t) - 2 * smooth(.42, .65, t) + smooth(.82, 1, t); gaze = direction * 5 * turn; lean = direction * 1.4 * turn; ear = direction * 5 * turn; faceY = -pulse; }
  if (action === 'stroll') { const step = Math.sin(t * Math.PI * 6) * pulse; lift = -Math.abs(step) * 2; paws = step * 5; tail = -step * 6; gaze = 2 * Math.sin(phase); }
  if (action === 'drag') { sy = 1.035 + Math.sin(phase) * .008; paws = -4; faceY = -2; ear = 6; }
  if (action === 'thinking') { gaze = 1.5 * Math.sin(phase); faceY = 2; lid = .15; }
  if (action === 'attention') { faceY = -4 * pulse; sy = 1 + .015 * pulse; ear = 8 * pulse; gaze = direction * pulse; prop = `<path d="M170 189q${10 * pulse} ${-22 * pulse} 16 -4" stroke="${color}" stroke-width="13" fill="none" stroke-linecap="round"/>`; }
  if (action === 'error') { lean = -3 * pulse; gaze = -3 * pulse; ear = -8 * pulse; prop = `<path d="M168 184q16 ${-30 * pulse} 10 ${-26 * pulse}" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round"/><path d="m90 ${128 - 2 * pulse} 13 -2m48 0 13 2" stroke="#5b6151" stroke-width="2" opacity="${pulse}"/>`; }
  if (action === 'blink') lid = smooth(.1, .38, t) * (1 - smooth(.6, .95, t));
  if (action === 'ear') ear = Math.sin(phase) * 12 * pulse;
  if (action === 'tail') tail = Math.sin(phase) * 24 * pulse;
  if (action === 'celebrate') {
    lift = -pulse * (variant ? 21 : 16); lean = direction * Math.sin(phase) * 3; lid = pulse; paws = -9 * pulse; tail = 15 * pulse;
    decoration = `<g opacity="${pulse}" fill="#dca55b"><path d="m38 76 3-10 3 10 10 3-10 3-3 10-3-10-10-3Z"/><path d="m210 49 3-8 3 8 8 3-8 3-3 8-3-8-8-3Z"/></g>`;
  }
  const eyes = [98, 158].map(x => lid > .85
    ? `<path d="M${x - 7} 142q7 ${action === 'sleepy' || action === 'doze' ? 4 : -5} 14 0" fill="none" stroke="#4b5146" stroke-width="4" stroke-linecap="round"/>`
    : `<ellipse cx="${x + gaze}" cy="140" rx="4.5" ry="${Math.max(1, 7 * (1 - lid))}" fill="#4b5146"/><circle cx="${x + gaze + 1}" cy="${138 + lid * 2}" r="${1.4 * (1 - lid)}" fill="#fff"/>`).join('');
  // Keep the original continuous face/ear silhouette. Fixed ear roots let the tips
  // move without drawing a second forehead outline or opening gaps at the cheeks.
  const outline = `M62 105L${earPoint(56, 54, 79, -ear)}Q${earPoint(57, 40, 79, -ear)} ${earPoint(70, 50, 79, -ear)}L102 75q26-8 51 0L${earPoint(187, 48, 180, ear)}Q${earPoint(200, 40, 180, ear)} ${earPoint(199, 55, 180, ear)}L194 107q23 26 18 62q-6 50-82 51q-76 0-83-48q-5-37 15-67Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <ellipse cx="128" cy="224" rx="${64 + lift * .35}" ry="8" fill="#5d6849" opacity=".10"/>
    <g transform="translate(0 ${lift}) rotate(${lean} 128 216) translate(128 216) scale(${sx} ${sy}) translate(-128 -216)">
      <g transform="rotate(${tail} 192 191)"><path d="M191 179q36-36 39-5q2 25-35 25" fill="${color}" stroke="#5b6151" stroke-width="4"/></g>
      <path d="${outline}" fill="${color}" stroke="#5b6151" stroke-width="4" stroke-linejoin="round"/>
      <path d="m67 66 4 32 17-16Z" transform="rotate(${-ear} 79 105)" fill="#e4a99c" opacity=".8"/>
      <path d="m188 65-22 19 18 12Z" transform="rotate(${ear} 180 105)" fill="#e4a99c" opacity=".8"/>
      <ellipse cx="126" cy="186" rx="42" ry="24" fill="#fff8e9" opacity=".6"/>
      <g transform="translate(${gaze * .3} ${faceY})"><ellipse cx="78" cy="156" rx="11" ry="6" fill="#eaaea0" opacity=".72"/><ellipse cx="178" cy="156" rx="11" ry="6" fill="#eaaea0" opacity=".72"/>${eyes}
        <path d="m124 151 4 3 4-3m-4 3v5" stroke="#5b6151" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        ${mouth || '<path d="m120 160q4 5 8-1q4 6 8 1" stroke="#5b6151" stroke-width="2.6" fill="none" stroke-linecap="round"/>'}</g>
      <path d="M${94 - Math.max(0, paws)} 202v${10 + paws}m${62 + Math.max(0, paws) * 2} ${-10 - paws}v${10 + (action === 'stroll' ? -paws : paws)}" opacity="${pawsOpacity}" stroke="#aaa38d" stroke-width="3" stroke-linecap="round"/>
      <path d="M127 74q-18-23 0-27q16 8 0 27Z" fill="#819c74"/><path d="M129 74q2-28 23-23q6 18-23 23Z" fill="#9eb18c"/>${prop}
    </g>${decoration}</svg>`;
}
