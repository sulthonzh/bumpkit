import * as child_process from 'child_process';
import * as semver from 'semver';

// --- Types ---

export interface Commit {
  hash: string;
  message: string;
  date: string;
  author: string;
  type: string;
  scope?: string;
  description: string;
  breaking: boolean;
}

export interface BumpResult {
  currentVersion: string;
  newVersion: string;
  bumpType: 'patch' | 'minor' | 'major' | 'none';
  commits: Commit[];
  breakingChanges: Commit[];
  features: Commit[];
  fixes: Commit[];
  other: Commit[];
}

export interface ChangelogOptions {
  version?: string;
  date?: string;
  title?: string;
  commitRange?: string;
}

// --- Commit Parsing ---

const COMMIT_REGEX = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

const KNOWN_TYPES = new Set([
  'feat', 'fix', 'docs', 'style', 'refactor',
  'perf', 'test', 'build', 'ci', 'chore', 'revert',
]);

export function parseCommitMessage(message: string): Omit<Commit, 'hash' | 'date' | 'author'> {
  const firstLine = message.split('\n')[0].trim();
  const match = firstLine.match(COMMIT_REGEX);

  if (!match) {
    return { type: 'other', description: firstLine, breaking: false, message };
  }

  const [, type, scope, bang, description] = match;

  // Check for breaking change in footer
  const hasBreakingFooter = /\n(BREAKING CHANGE|BREAKING-CHANGE):\s*/i.test(message);

  return {
    type: KNOWN_TYPES.has(type) ? type : 'other',
    scope: scope || undefined,
    description,
    breaking: bang === '!' || hasBreakingFooter,
    message,
  };
}

export function categorizeCommits(commits: Commit[]): Pick<BumpResult, 'breakingChanges' | 'features' | 'fixes' | 'other'> {
  const breakingChanges: Commit[] = [];
  const features: Commit[] = [];
  const fixes: Commit[] = [];
  const other: Commit[] = [];

  for (const commit of commits) {
    if (commit.breaking) {
      breakingChanges.push(commit);
    }
    if (commit.type === 'feat') {
      features.push(commit);
    } else if (commit.type === 'fix') {
      fixes.push(commit);
    } else if (!commit.breaking) {
      other.push(commit);
    }
  }

  return { breakingChanges, features, fixes, other };
}

// --- Version Bumping ---

export function determineBump(commits: Commit[]): 'major' | 'minor' | 'patch' | 'none' {
  const { breakingChanges, features } = categorizeCommits(commits);

  if (breakingChanges.length > 0) return 'major';
  if (features.length > 0) return 'minor';

  // Check if there are any fix commits
  const hasFixes = commits.some(c => c.type === 'fix');
  if (hasFixes) return 'patch';

  return 'none';
}

export function bumpVersion(current: string, bumpType: 'major' | 'minor' | 'patch' | 'none' | 'prerelease'): string {
  if (bumpType === 'none') return current;
  return semver.inc(current, bumpType) || current;
}

// --- Git Operations ---

export function getCommitsSinceTag(tag?: string): Commit[] {
  const range = tag ? `${tag}..HEAD` : 'HEAD~50..HEAD';
  const format = '%H%n%s%n%ai%n%an%n---COMMIT_END---';

  let output: string;
  try {
    output = child_process.execSync(`git log --format="${format}" ${range}`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return [];
  }

  const commits: Commit[] = [];
  const entries = output.split('---COMMIT_END---').filter(e => e.trim());

  for (const entry of entries) {
    const lines = entry.trim().split('\n');
    if (lines.length < 4) continue;

    const [hash, message, date, author] = lines;
    const parsed = parseCommitMessage(message.trim());

    commits.push({
      hash: hash.trim(),
      date: date.trim(),
      author: author.trim(),
      ...parsed,
    });
  }

  return commits;
}

export function getLatestTag(): string | null {
  try {
    return child_process.execSync('git describe --tags --abbrev=0', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

export function getCurrentVersionFromPackage(dir?: string): string | null {
  try {
    const path = dir ? `${dir}/package.json` : 'package.json';
    const pkg = JSON.parse(
      require('fs').readFileSync(path, 'utf-8')
    );
    return pkg.version || null;
  } catch {
    return null;
  }
}

// --- Analysis ---

export function analyze(tag?: string, currentVersion?: string): BumpResult {
  const latestTag = tag || getLatestTag();
  const commits = getCommitsSinceTag(latestTag || undefined);
  const version = currentVersion || getCurrentVersionFromPackage() || '0.0.0';

  const bumpType = determineBump(commits);
  const newVersion = bumpVersion(version, bumpType);
  const categories = categorizeCommits(commits);

  return {
    currentVersion: version,
    newVersion,
    bumpType,
    commits,
    ...categories,
  };
}

// --- Changelog Generation ---

export function generateChangelog(result: BumpResult, options: ChangelogOptions = {}): string {
  const version = options.version || result.newVersion;
  const date = options.date || new Date().toISOString().split('T')[0];
  const lines: string[] = [];

  lines.push(`## ${version} (${date})`);
  lines.push('');

  if (result.breakingChanges.length > 0) {
    lines.push('### ⚠ BREAKING CHANGES');
    lines.push('');
    for (const c of result.breakingChanges) {
      const scope = c.scope ? `**${c.scope}**: ` : '';
      lines.push(`- ${scope}${c.description} (${c.hash.slice(0, 7)})`);
    }
    lines.push('');
  }

  if (result.features.length > 0) {
    lines.push('### Features');
    lines.push('');
    for (const c of result.features) {
      const scope = c.scope ? `**${c.scope}**: ` : '';
      lines.push(`- ${scope}${c.description} (${c.hash.slice(0, 7)})`);
    }
    lines.push('');
  }

  if (result.fixes.length > 0) {
    lines.push('### Bug Fixes');
    lines.push('');
    for (const c of result.fixes) {
      const scope = c.scope ? `**${c.scope}**: ` : '';
      lines.push(`- ${scope}${c.description} (${c.hash.slice(0, 7)})`);
    }
    lines.push('');
  }

  if (result.other.length > 0) {
    lines.push('### Other');
    lines.push('');
    for (const c of result.other.slice(0, 20)) {
      lines.push(`- ${c.description} (${c.hash.slice(0, 7)})`);
    }
    if (result.other.length > 20) {
      lines.push(`- ... and ${result.other.length - 20} more`);
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push('');
  lines.push(`**Stats**: ${result.commits.length} commits → ${result.bumpType} bump (${result.currentVersion} → ${result.newVersion})`);
  lines.push('');

  return lines.join('\n');
}

// --- Output Formatting ---

export function formatText(result: BumpResult): string {
  const lines: string[] = [];

  const bumpEmoji = result.bumpType === 'major' ? '🔴' : result.bumpType === 'minor' ? '🟡' : result.bumpType === 'patch' ? '🟢' : '⚪';

  lines.push(`${bumpEmoji} ${result.currentVersion} → ${result.newVersion} (${result.bumpType})`);
  lines.push('');

  if (result.breakingChanges.length > 0) {
    lines.push(`⚠  Breaking: ${result.breakingChanges.length}`);
  }
  if (result.features.length > 0) {
    lines.push(`✨ Features: ${result.features.length}`);
  }
  if (result.fixes.length > 0) {
    lines.push(`🐛 Fixes:    ${result.fixes.length}`);
  }
  if (result.other.length > 0) {
    lines.push(`📝 Other:    ${result.other.length}`);
  }

  lines.push('');
  lines.push(`Total: ${result.commits.length} commits since last tag`);

  return lines.join('\n');
}

export function formatJSON(result: BumpResult): string {
  return JSON.stringify({
    currentVersion: result.currentVersion,
    newVersion: result.newVersion,
    bumpType: result.bumpType,
    stats: {
      breaking: result.breakingChanges.length,
      features: result.features.length,
      fixes: result.fixes.length,
      other: result.other.length,
      total: result.commits.length,
    },
    commits: result.commits.map(c => ({
      hash: c.hash,
      type: c.type,
      scope: c.scope,
      description: c.description,
      breaking: c.breaking,
      author: c.author,
    })),
  }, null, 2);
}
