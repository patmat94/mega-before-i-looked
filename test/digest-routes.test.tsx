import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

const OK = '2026-10-27';
const EMPTY = '2026-10-26';
const BAD = '2026-10-25';
const MISSING = '2026-10-24';

const jl = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(
    join(dir, `${OK}.jsonl`),
    jl(
      { at: '2026-10-27T01:00:00+01:00', job: 'zeta-sync', status: 'ok', owner: 'ann' },
      { at: '2026-10-27T01:05:00+01:00', job: 'alpha-backup', status: 'retry', owner: 'bob', error: 'timeout' },
      { at: '2026-10-27T01:06:00+01:00', job: 'alpha-backup', status: 'retry', owner: 'bob', error: 'timeout' },
      { at: '2026-10-27T01:07:00+01:00', job: 'alpha-backup', status: 'retry', owner: 'bob', error: 'timeout' },
      { at: '2026-10-27T01:08:00+01:00', job: 'alpha-backup', status: 'ok', owner: 'bob' },
      { at: '2026-10-27T02:00:00+01:00', job: 'mid-export', status: 'fail', owner: 'cy', error: 'disk full' },
      { at: '2026-10-27T03:00:00+01:00', job: 'orphan-clean', status: 'ok', owner: null },
    ),
  );
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD}.jsonl`),
    jl({ at: '2026-10-25T01:00:00+01:00', job: 'beta', status: 'ok', owner: 'ann' }) +
      '{"at":"2026-10-25T02:00:00+01:00","job":"gam\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

function jobsInHtml(html: string, jobs: string[]): string[] {
  return jobs
    .map((j) => ({ j, i: html.indexOf(j) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.j);
}

describe('digest page', () => {
  it('renders a found night as 200 with a row per job, sorted by job', async () => {
    const res = await app.request(`/digest/${OK}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    const jobs = ['alpha-backup', 'mid-export', 'orphan-clean', 'zeta-sync'];
    expect(jobsInHtml(html, jobs)).toEqual(jobs);
    expect(html.match(/<tr/g)?.length).toBeGreaterThanOrEqual(jobs.length);
  });

  it('renders null owner and null error as a dash', async () => {
    const html = await (await app.request(`/digest/${OK}`)).text();
    expect(html).toContain('—');
  });

  it('marks retries >= 3 and failed jobs with class warn', async () => {
    const html = await (await app.request(`/digest/${OK}`)).text();
    expect(html).toMatch(/class="warn"/);
    expect((html.match(/class="warn"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('reports one bad line and still renders the night', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line did not parse');
    expect(html).toContain('beta');
  });
});

describe('digest JSON', () => {
  it('returns the night exactly as readNight gives it', async () => {
    const res = await app.request(`/api/digest/${OK}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(readNight(dir, OK));
  });

  it('returns empty rows for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[] };
    expect(body.rows).toEqual([]);
  });

  it('counts a bad line and keeps the good ones', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(readNight(dir, BAD));
    expect(readNight(dir, BAD)?.badLines).toBe(1);
  });

  it('returns 404 with an error body for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `no run log for ${MISSING}` });
  });
});

describe('page and JSON agree', () => {
  it('lists the jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${OK}`)).text();
    const json = (await (await app.request(`/api/digest/${OK}`)).json()) as { rows: { job: string }[] };
    const jobs = json.rows.map((r) => r.job);
    expect(jobsInHtml(html, jobs)).toEqual(jobs);
  });
});
