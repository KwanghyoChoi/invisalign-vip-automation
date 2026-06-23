#!/usr/bin/env node
const { makeConfig, requireCredentials } = require('./config');
const { parseArgs } = require('./utils');
const { monitorActionRequired } = require('./monitor');
const { formatCandidatePreview, startAdditionalAligners } = require('./aa');

function usage() {
  return `Usage:
  vip-automation monitor [--env .env]
  vip-automation aa:start --search <term> [--name <full name>] [--package <text>] [--confirm] [--show-phi] [--env .env]
  vip-automation help

Safety:
  aa:start is dry-run unless --confirm is supplied.
`;
}

function resolveAaDryRun(args) {
  return args.confirm ? false : true;
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const args = parseArgs(argv.slice(1));
  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return 0;
  }
  const config = makeConfig(args.env || '.env');
  requireCredentials(config);

  if (command === 'monitor') {
    const report = await monitorActionRequired(config);
    if (report) console.log(report);
    return 0;
  }

  if (command === 'aa:start') {
    const result = await startAdditionalAligners(config, {
      search: args.search,
      name: args.name,
      package: args.package,
      dryRun: resolveAaDryRun(args, config),
    });
    if (result.dryRun) {
      console.log(`dry_run=true candidate_count=${result.candidateCount}`);
      for (let i = 0; i < result.candidates.length; i += 1) {
        console.log(`- ${formatCandidatePreview(result.candidates[i], i, Boolean(args['show-phi']))}`);
      }
    } else {
      console.log(`aa_started=true aligner_last=${result.alignerLast} form_created=${result.formCreated}`);
    }
    return 0;
  }

  console.error(`Unknown command: ${command}\n`);
  console.error(usage());
  return 2;
}

if (require.main === module) {
  main().then(code => process.exit(code)).catch(err => {
    console.error(`[ERROR] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  });
}

module.exports = { main, resolveAaDryRun };
