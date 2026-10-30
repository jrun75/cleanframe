// Send one remote key to the TV, the same way phone remote apps do.
// Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/tv-key.mjs KEY_HDMI2
// The first time, the TV asks whether to allow "CleanFrame". Choose Allow.
const tv = process.env.TV_IP || '192.168.7.41';
const key = process.argv[2] || 'KEY_HDMI';
const name = Buffer.from('CleanFrame').toString('base64');
const ws = new WebSocket(`wss://${tv}:8002/api/v2/channels/samsung.remote.control?name=${name}`);
const quit = setTimeout(() => { console.log('No answer from the TV. Check the TV for an Allow prompt and try again.'); process.exit(1); }, 30000);
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  console.log('TV says:', m.event);
  if (m.event === 'ms.channel.connect') {
    ws.send(JSON.stringify({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' } }));
    console.log('Sent', key);
    setTimeout(() => { clearTimeout(quit); process.exit(0); }, 1500);
  }
  if (m.event === 'ms.channel.unauthorized') { console.log('The TV declined. Run it again and choose Allow.'); process.exit(1); }
};
ws.onerror = (e) => { console.log('Connection error:', e.message || e.type); };
