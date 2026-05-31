#!/usr/bin/env node

import { analyze, generateChangelog, formatText, formatJSON, BumpResult } from './index';
import * as fs from 'fs';
import * as child_process from 'child_process';

const args = process.argv.slice(2);

function showHelp(): void {
  console.log(`
bumpkit — smart semver bumper for conventional commits

Usage:
  bumpkit [command] [options]

Commands:
  analyze     Show what bump is needed (default)
  changelog   Generate changelog markdown
  bump        Actually bump version in package.json
  tag         Bump + create git tag

Options:
  --tag <tag>          Use specific tag as base (default: latest git tag)
  --version <ver>      Override current version
  --json               Output as JSON
  --dry-run            Show what would happen without doing it
  --help               Show this help

Examples:
  bumpkit                    # analyze commits since last tag
  bumpkit analyze --json     # machine-readable analysis
  bumpkit changelog          # generate changelog markdown
  bumpkit bump               # bump package.json version
  bumpkit bump --dry-run     # preview the bump
  bumpkit tag                # bump + git tag + commit
`);
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') opts.json = true;
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--help' || args[i] === '-h') opts.help = true;
    else if (args[i] === '--tag' && args[i + 1]) { opts.tag = args[++i]; }
    else if (args[i] === '--version' && args[i + 1]) { opts.version = args[++i]; }
    else if (!args[i].startsWith('-')) opts.command = args[i];
  }
  return opts;
}

function updatePackageVersion(newVersion: string): void {
  const pkgPath = 'package.json';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function main(): void {
  const opts = parseArgs(args);

  if (opts.help) {
    showHelp();
    return;
  }

  const command = (opts.command as string) || 'analyze';
  const result = analyze(opts.tag as string | undefined, opts.version as string | undefined);

  if (command === 'analyze') {
    if (opts.json) {
      console.log(formatJSON(result));
    } else {
      console.log(formatText(result));
    }
    return;
  }

  if (command === 'changelog') {
    const md = generateChangelog(result);
    console.log(md);
    return;
  }

  if (command === 'bump' || command === 'tag') {
    if (result.bumpType === 'none') {
      console.log('No version bump needed — no relevant commits found.');
      if (opts.json) console.log(formatJSON(result));
      return;
    }

    console.log(`${result.currentVersion} → ${result.newVersion} (${result.bumpType})`);

    if (opts.dryRun) {
      console.log('(dry run — no changes made)');
      return;
    }

    // Update package.json
    updatePackageVersion(result.newVersion);
    console.log(`Updated package.json to ${result.newVersion}`);

    // Generate changelog entry
    const changelog = generateChangelog(result);
    const changelogPath = 'CHANGELOG.md';
    let existing = '';
    if (fs.existsSync(changelogPath)) {
      existing = fs.readFileSync(changelogPath, 'utf-8');
    }
    const header = '# Changelog\n\n';
    if (existing.startsWith(header)) {
      fs.writeFileSync(changelogPath, header + changelog + existing.slice(header.length));
    } else if (existing.startsWith('#')) {
      fs.writeFileSync(changelogPath, header + changelog + '\n' + existing);
    } else {
      fs.writeFileSync(changelogPath, header + changelog + existing);
    }
    console.log('Updated CHANGELOG.md');

    if (command === 'tag') {
      // Git add, commit, tag
      try {
        child_process.execSync('git add package.json CHANGELOG.md', { stdio: 'inherit' });
        child_process.execSync(`git commit -m "chore(release): ${result.newVersion}"`, { stdio: 'inherit' });
        child_process.execSync(`git tag -a v${result.newVersion} -m "v${result.newVersion}"`, { stdio: 'inherit' });
        console.log(`Created git tag v${result.newVersion}`);
      } catch (err) {
        console.error('Git operations failed:', (err as Error).message);
        process.exit(1);
      }
    }

    if (opts.json) {
      console.log('\n' + formatJSON(result));
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  showHelp();
  process.exit(1);
}

main();
