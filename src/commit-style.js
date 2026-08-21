'use strict';

const CONVENTIONAL_TYPES = new Set([
  'feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'build', 'ci', 'chore'
]);

const SUBJECT_LIMIT_MAX = 50;
const SUBJECT_LENGTH_MAX = 180;

function clampHistoryLimit(value, fallback = 12) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(SUBJECT_LIMIT_MAX, Math.round(n)));
}

function normalizeSubject(value) {
  if (typeof value !== 'string') return '';
  const subject = value.trim();
  if (!subject || subject.length > SUBJECT_LENGTH_MAX) return '';
  if (/[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(subject)) return '';
  return subject;
}

function parseCommitSubjects(stdout, limit = 12) {
  const bounded = clampHistoryLimit(limit);
  if (bounded === 0) return [];
  const result = [];
  for (const raw of String(stdout || '').split('\0')) {
    const subject = normalizeSubject(raw);
    if (!subject) continue;
    result.push(subject);
    if (result.length >= bounded) break;
  }
  return result;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function median(numbers) {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function summarizeRepositoryStyle(subjects) {
  const normalized = (subjects || []).map(normalizeSubject).filter(Boolean).slice(0, SUBJECT_LIMIT_MAX);
  const summary = {
    sampleSize: normalized.length,
    conventionalRatio: 0,
    scopedRatio: 0,
    terminalPeriodRatio: 0,
    englishLowercaseRatio: 0,
    englishCaseSampleSize: 0,
    medianSubjectLength: median(normalized.map(subject => subject.length))
  };
  if (!normalized.length) return summary;

  let conventional = 0;
  let scoped = 0;
  let terminalPeriod = 0;
  let englishCaseSamples = 0;
  let englishLowercase = 0;

  for (const subject of normalized) {
    if (/[.!?。！？]$/.test(subject)) terminalPeriod += 1;

    const match = subject.match(/^([a-z][a-z0-9-]*)(?:\(([a-z0-9][a-z0-9._-]{0,31})\))?(!)?:\s+(.+)$/);
    if (!match || !CONVENTIONAL_TYPES.has(match[1])) continue;

    conventional += 1;
    if (match[2]) scoped += 1;

    const description = match[4].trim();
    const firstAsciiLetter = description.match(/[A-Za-z]/)?.[0];
    if (firstAsciiLetter) {
      englishCaseSamples += 1;
      if (firstAsciiLetter === firstAsciiLetter.toLowerCase()) englishLowercase += 1;
    }
  }

  summary.conventionalRatio = ratio(conventional, normalized.length);
  summary.scopedRatio = ratio(scoped, conventional);
  summary.terminalPeriodRatio = ratio(terminalPeriod, normalized.length);
  summary.englishCaseSampleSize = englishCaseSamples;
  summary.englishLowercaseRatio = ratio(englishLowercase, englishCaseSamples);
  return summary;
}

function percent(value) {
  return Math.round(value * 100);
}

function buildRepositoryStyleGuidance(summary) {
  if (!summary || summary.sampleSize < 3) return [];

  const guidance = [];
  if (summary.scopedRatio >= 0.7) {
    guidance.push(`Recent Conventional Commit subjects usually include a scope (${percent(summary.scopedRatio)}% of matching subjects).`);
  } else if (summary.scopedRatio <= 0.3) {
    guidance.push(`Recent Conventional Commit subjects usually omit a scope (${percent(summary.scopedRatio)}% include one).`);
  }

  if (summary.terminalPeriodRatio <= 0.2) {
    guidance.push(`Recent subjects usually omit terminal punctuation (${percent(summary.terminalPeriodRatio)}% end with punctuation).`);
  } else if (summary.terminalPeriodRatio >= 0.8) {
    guidance.push(`Recent subjects usually use terminal punctuation (${percent(summary.terminalPeriodRatio)}% end with punctuation).`);
  }

  if (summary.englishCaseSampleSize >= 3 && summary.englishLowercaseRatio >= 0.7) {
    guidance.push(`Recent English descriptions usually start lowercase (${percent(summary.englishLowercaseRatio)}% of sampled descriptions).`);
  } else if (summary.englishCaseSampleSize >= 3 && summary.englishLowercaseRatio <= 0.3) {
    guidance.push(`Recent English descriptions usually start uppercase (${percent(1 - summary.englishLowercaseRatio)}% of sampled descriptions).`);
  }

  if (summary.medianSubjectLength >= 20) {
    guidance.push(`Recent subject length has a median near ${summary.medianSubjectLength} characters.`);
  }

  return guidance.slice(0, 4);
}

module.exports = {
  CONVENTIONAL_TYPES,
  SUBJECT_LIMIT_MAX,
  SUBJECT_LENGTH_MAX,
  clampHistoryLimit,
  normalizeSubject,
  parseCommitSubjects,
  summarizeRepositoryStyle,
  buildRepositoryStyleGuidance
};
