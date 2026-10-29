// Plan morning-digest § 1. The contract every part of § 2 builds against: the reader fills it,
// the page and the JSON only render it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // owner on the job's last line; null renders as "—"
  runs: number; // lines for this job
  retries: number; // lines with status "retry"
  lastStatus: RunStatus;
  lastError: string | null; // error of the job's most recent line that had one
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job, so the page and the JSON never disagree (ADR 0001)
  badLines: number; // lines that did not parse: counted, never thrown
};

// null: no file for that night (or not a YYYY-MM-DD night) → 404. An empty file → rows: [].
export type ReadNight = (runsDir: string, night: string) => Night | null;
