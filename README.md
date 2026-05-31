# bumpkit

Smart semver bumper that reads your conventional commits and figures out what to do.

No config files. No presets. Just git log + semver.

## Why

Every release tool either wants you to adopt their entire workflow or configure 15 plugins. `bumpkit` does one thing: look at your commits since the last tag, figure out the right semver bump, update your package.json, and optionally tag it.

## Install

```bash
npm install -g bumpkit
```

## Usage

```bash
# Analyze what bump is needed (no side effects)
bumpkit
bumpkit analyze

# Machine-readable output
bumpkit analyze --json

# Generate changelog markdown
bumpkit changelog

# Actually bump version in package.json
bumpkit bump

# Preview without changes
bumpkit bump --dry-run

# Bump + git tag + commit
bumpkit tag
```

## How It Works

1. Finds the latest git tag (or uses `--tag`)
2. Reads all commits since that tag
3. Parses conventional commit format: `type(scope)!: description`
4. Determines bump level:
   - `feat!:` or `BREAKING CHANGE:` → **major**
   - `feat:` → **minor**
   - `fix:` → **patch**
   - everything else → **no bump**
5. Updates `package.json` and `CHANGELOG.md`

## Conventional Commit Support

```
feat: add dark mode              → minor
feat(ui): add sidebar toggle     → minor (scoped)
feat!: new API format            → major (breaking)
fix: handle null response        → patch
fix(api): timeout retry logic    → patch (scoped)
docs: update readme              → no bump
chore: update deps               → no bump
```

Breaking changes detected via `!` after type or `BREAKING CHANGE:` in footer.

## CLI Reference

| Command | What it does |
|---------|-------------|
| `analyze` | Show bump recommendation (default) |
| `changelog` | Generate changelog markdown |
| `bump` | Update package.json version |
| `tag` | Bump + git commit + tag |

| Flag | Description |
|------|-------------|
| `--tag <tag>` | Use specific tag as base |
| `--version <ver>` | Override current version |
| `--json` | JSON output |
| `--dry-run` | Preview without changes |

## Changelog Format

```markdown
## 2.0.0 (2026-05-31)

### ⚠ BREAKING CHANGES

- **api**: new response format (a1b2c3d)

### Features

- **ui**: add dark mode (e4f5g6h)

### Bug Fixes

- handle empty query params (i7j8k9l)

---

**Stats**: 12 commits → major bump (1.5.0 → 2.0.0)
```

## As a Library

```typescript
import { analyze, generateChangelog, formatJSON } from 'bumpkit';

const result = analyze(); // auto-detects tag and version
console.log(result.bumpType);    // 'major' | 'minor' | 'patch' | 'none'
console.log(result.newVersion);  // calculated version
console.log(result.features);    // feat commits
console.log(result.breakingChanges); // breaking commits

const md = generateChangelog(result);
const json = formatJSON(result);
```

## License

MIT
