/**
 * Debug script - run this directly to see exactly what NetGuardian's
 * discovery logic sees, step by step, without needing the full app running.
 *
 * Usage:
 *   node debug-scan.js
 *
 * Edit CIDR and WATCH_IPS below before running.
 */
require('dotenv').config();
const { pingSweep, readArpTable, discoverDevices } = require('./services/discoveryService');

const CIDR = process.env.NETWORK_RANGE || '192.168.1.0/24';
const WATCH_IPS = ['192.168.1.200', '192.168.1.219']; // <-- put the IPs you care about here

(async () => {
  console.log(`\n=== Debugging discovery for ${CIDR} ===\n`);

  console.log('--- Step 1: Ping sweep ---');
  const alive = await pingSweep(CIDR);
  console.log(`Total hosts that responded to ping: ${alive.length}`);
  WATCH_IPS.forEach((ip) => {
    const found = alive.find((h) => h.ip === ip);
    console.log(`  ${ip}: ${found ? `ALIVE (${found.timeMs}ms)` : 'NOT in ping-alive list'}`);
  });

  console.log('\n--- Step 2: ARP table read ---');
  const arp = await readArpTable();
  console.log(`Total ARP entries parsed: ${arp.length}`);
  WATCH_IPS.forEach((ip) => {
    const found = arp.find((e) => e.ip === ip);
    console.log(`  ${ip}: ${found ? `MAC = ${found.mac}` : 'NOT FOUND in parsed ARP table'}`);
  });

  if (arp.length === 0) {
    console.log('\n  WARNING: zero ARP entries were parsed at all.');
    console.log('  This usually means the regex parsing raw `arp -a` output is failing');
    console.log('  on this Windows version\'s exact formatting. Run `arp -a` manually');
    console.log('  and compare its raw output to what this script expects.');
  }

  console.log('\n--- Step 3: Full discoverDevices() result ---');
  const discovered = await discoverDevices(CIDR);
  console.log(`Total devices discovered (ping + ARP matched): ${discovered.length}`);
  WATCH_IPS.forEach((ip) => {
    const found = discovered.find((d) => d.ipAddress === ip);
    console.log(`  ${ip}: ${found ? `INCLUDED (MAC ${found.macAddress})` : 'MISSING from final discovered list'}`);
  });

  console.log('\n--- Raw ARP output for manual inspection ---');
  const { exec } = require('child_process');
  exec('arp -a', (err, stdout) => {
    console.log(stdout);
    process.exit(0);
  });
})().catch((err) => {
  console.error('Debug script error:', err);
  process.exit(1);
});
