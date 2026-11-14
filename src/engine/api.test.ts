import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { CityNetwork, RecoveryPlan } from '../types/recovery';

test('all HTTP endpoints validate inputs, recompute plans, store distinct runs and export every row', async () => {
  const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts', '--production'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      server.once('error', reject);
      server.once('exit', (code) => reject(new Error('Test server exited: ' + code)));
      server.stdout.on('data', (chunk) => {
        const match = String(chunk).match(/localhost:(\d+)/);
        if (match) resolve('http://127.0.0.1:' + match[1]);
      });
    });
    const get = (url: string) => fetch(base + '/api/' + url);
    const post = (url: string, body: unknown) =>
      fetch(base + '/api/' + url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    assert.equal((await (await get('health')).json()).status, 'ok');
    const cities = (await (await get('cities')).json()).cities;
    assert.ok(cities.length >= 6);
    assert.ok(cities.some((c: { cityId: string }) => c.cityId === 'multi_city'));
    const network: CityNetwork = (await (await get('network/mumbai')).json()).network;
    assert.ok(network.orders.length > 100);
    assert.equal((await get('network/toString')).status, 404);
    assert.equal((await post('network/validate', { network: { ...network, orders: [null] } })).status, 422);
    network.orders[0].customerName = 'Customer, "West"';
    assert.equal((await post('network/validate', { network })).status, 200);
    assert.equal((await (await get('network/mumbai')).json()).network.orders[0].customerName, 'Customer, "West"');
    const impact = (await (await post('scenarios/impact', { network })).json()).impact;
    assert.equal(impact.totalOrders, network.orders.length);
    const { stageA, stageB } = await (await post('recovery/max-service', { cityId: 'mumbai' })).json();
    assert.notEqual(stageA.runId, stageB.runId);
    for (const result of [stageA, stageB])
      assert.equal((await (await get('runs/' + result.runId)).json()).plan.stage, result.stage);
    const config = {
      targetServicePct: 80,
      availableBudget: 0,
      protectCriticalOrders: true,
      permittedInterventionIds: network.interventions.map((i) => i.id),
    };
    const plan: RecoveryPlan = (await (await post('recovery/optimize', { network, config })).json()).plan;
    assert.equal(plan.verification.overallStatus, 'PASS');
    assert.equal(plan.budgetShortfall, plan.totalRecoveryCost);
    const verify = async (body: unknown) => (await (await post('recovery/verify', body)).json()).verification;
    assert.equal((await verify({ network, plan, config })).overallStatus, 'PASS');
    assert.equal((await verify({ network, plan, config, corruptMode: 'FABRICATE_COST' })).overallStatus, 'FAIL');
    assert.equal((await post('recovery/verify', { network, plan: {} })).status, 422);
    assert.equal((await post('recovery/optimize', { network, config: { ...config, targetServicePct: -5 } })).status, 422);
    for (const url of ['scenarios/impact', 'recovery/max-service', 'recovery/optimize', 'recovery/verify'])
      assert.equal((await post(url, { network: { orders: [] } })).status, 422);
    const csv = await (await get('runs/' + plan.runId + '/export')).text();
    assert.equal(csv.split('\n').length, network.orders.length + 1);
    assert.match(csv, /"Customer, ""West"""/);
    assert.equal((await get('runs/missing')).status, 404);
    assert.equal((await get('runs/missing/export')).status, 404);
  } finally {
    if (server.exitCode === null) {
      const exit = once(server, 'exit');
      server.kill();
      await exit;
    }
  }
});
