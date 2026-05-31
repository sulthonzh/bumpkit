import {
  parseCommitMessage,
  determineBump,
  bumpVersion,
  categorizeCommits,
  generateChangelog,
  formatText,
  formatJSON,
  Commit,
} from '../src/index';

function makeCommit(overrides: Partial<Commit> & { message: string }): Commit {
  const parsed = parseCommitMessage(overrides.message);
  return {
    hash: overrides.hash || 'abc1234',
    date: overrides.date || '2026-05-31',
    author: overrides.author || 'test',
    ...parsed,
  };
}

describe('parseCommitMessage', () => {
  it('parses feat commits', () => {
    const result = parseCommitMessage('feat: add dark mode');
    expect(result.type).toBe('feat');
    expect(result.description).toBe('add dark mode');
    expect(result.breaking).toBe(false);
  });

  it('parses scoped commits', () => {
    const result = parseCommitMessage('fix(api): handle timeout errors');
    expect(result.type).toBe('fix');
    expect(result.scope).toBe('api');
    expect(result.description).toBe('handle timeout errors');
  });

  it('detects breaking change with !', () => {
    const result = parseCommitMessage('feat!: new API format');
    expect(result.type).toBe('feat');
    expect(result.breaking).toBe(true);
  });

  it('detects breaking change in footer', () => {
    const msg = 'feat: new thing\n\nBREAKING CHANGE: API changed entirely';
    const result = parseCommitMessage(msg);
    expect(result.breaking).toBe(true);
  });

  it('handles non-conventional commits as other', () => {
    const result = parseCommitMessage('random commit message');
    expect(result.type).toBe('other');
    expect(result.description).toBe('random commit message');
  });

  it('handles all known types', () => {
    const types = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
    for (const t of types) {
      const result = parseCommitMessage(`${t}: something`);
      expect(result.type).toBe(t);
    }
  });

  it('treats unknown types as other', () => {
    const result = parseCommitMessage('wibble: something');
    expect(result.type).toBe('other');
  });
});

describe('determineBump', () => {
  it('returns major for breaking changes', () => {
    const commits = [makeCommit({ message: 'feat!: rewrite API' })];
    expect(determineBump(commits)).toBe('major');
  });

  it('returns minor for features', () => {
    const commits = [makeCommit({ message: 'feat: add search' })];
    expect(determineBump(commits)).toBe('minor');
  });

  it('returns patch for fixes', () => {
    const commits = [makeCommit({ message: 'fix: null pointer' })];
    expect(determineBump(commits)).toBe('patch');
  });

  it('returns none for only docs/chore', () => {
    const commits = [
      makeCommit({ message: 'docs: update readme' }),
      makeCommit({ message: 'chore: update deps' }),
    ];
    expect(determineBump(commits)).toBe('none');
  });

  it('prioritizes major over minor', () => {
    const commits = [
      makeCommit({ message: 'feat: add thing' }),
      makeCommit({ message: 'feat!: breaking thing' }),
    ];
    expect(determineBump(commits)).toBe('major');
  });

  it('returns none for empty commits', () => {
    expect(determineBump([])).toBe('none');
  });
});

describe('bumpVersion', () => {
  it('bumps patch', () => {
    expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
  });

  it('bumps minor', () => {
    expect(bumpVersion('1.0.0', 'minor')).toBe('1.1.0');
  });

  it('bumps major', () => {
    expect(bumpVersion('1.0.0', 'major')).toBe('2.0.0');
  });

  it('returns same for none', () => {
    expect(bumpVersion('1.0.0', 'none')).toBe('1.0.0');
  });

  it('handles pre-release versions', () => {
    expect(bumpVersion('1.0.0-alpha.1', 'prerelease')).toBe('1.0.0-alpha.2');
  });
});

describe('categorizeCommits', () => {
  it('categorizes mixed commits', () => {
    const commits = [
      makeCommit({ message: 'feat!: big change' }),
      makeCommit({ message: 'feat: new thing' }),
      makeCommit({ message: 'fix: bug fix' }),
      makeCommit({ message: 'chore: cleanup' }),
    ];

    const cats = categorizeCommits(commits);
    expect(cats.breakingChanges).toHaveLength(1);
    expect(cats.features).toHaveLength(2); // feat! is also a feature
    expect(cats.fixes).toHaveLength(1);
    expect(cats.other).toHaveLength(1);
  });
});

describe('generateChangelog', () => {
  it('generates changelog with sections', () => {
    const result = {
      currentVersion: '1.0.0',
      newVersion: '2.0.0',
      bumpType: 'major' as const,
      commits: [],
      breakingChanges: [makeCommit({ message: 'feat!: rewrite API', hash: 'aaa1111' })],
      features: [makeCommit({ message: 'feat(auth): add OAuth', hash: 'bbb2222' })],
      fixes: [makeCommit({ message: 'fix: crash on null', hash: 'ccc3333' })],
      other: [],
    };

    const md = generateChangelog(result);
    expect(md).toContain('2.0.0');
    expect(md).toContain('BREAKING CHANGES');
    expect(md).toContain('Features');
    expect(md).toContain('Bug Fixes');
    expect(md).toContain('rewrite API');
    expect(md).toContain('add OAuth');
  });

  it('skips empty sections', () => {
    const result = {
      currentVersion: '1.0.0',
      newVersion: '1.0.1',
      bumpType: 'patch' as const,
      commits: [],
      breakingChanges: [],
      features: [],
      fixes: [makeCommit({ message: 'fix: typo', hash: 'ddd4444' })],
      other: [],
    };

    const md = generateChangelog(result);
    expect(md).not.toContain('BREAKING CHANGES');
    expect(md).not.toContain('Features');
    expect(md).toContain('Bug Fixes');
  });
});

describe('formatText', () => {
  it('shows correct emoji for bump types', () => {
    const major = formatText({
      currentVersion: '1.0.0', newVersion: '2.0.0', bumpType: 'major',
      commits: [], breakingChanges: [], features: [], fixes: [], other: [],
    });
    expect(major).toContain('🔴');
    expect(major).toContain('major');
  });
});

describe('formatJSON', () => {
  it('produces valid JSON with expected fields', () => {
    const result = {
      currentVersion: '1.0.0', newVersion: '1.1.0', bumpType: 'minor' as const,
      commits: [makeCommit({ message: 'feat: new thing', hash: 'abc1234' })],
      breakingChanges: [], features: [makeCommit({ message: 'feat: new thing' })],
      fixes: [], other: [],
    };
    const json = formatJSON(result);
    const parsed = JSON.parse(json);
    expect(parsed.currentVersion).toBe('1.0.0');
    expect(parsed.newVersion).toBe('1.1.0');
    expect(parsed.stats.features).toBe(1);
    expect(parsed.commits).toHaveLength(1);
  });
});
