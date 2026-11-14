const nyFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const dhakaFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

let isDhaka = false;

export function startClock(el) {
  if (!el) return;
  const tick = () => {
    const fmt = isDhaka ? dhakaFormat : nyFormat;
    const loc = isDhaka ? 'DHAKA, BD' : 'NEW YORK, US';
    el.textContent = `${loc}_${fmt.format(new Date())}`;
  };

  el.style.cursor = 'pointer';
  el.title = 'Click to toggle New York / Dhaka studio timezone';
  el.addEventListener('click', () => {
    isDhaka = !isDhaka;
    tick();
  });

  tick();
  setInterval(tick, 1000);
}
