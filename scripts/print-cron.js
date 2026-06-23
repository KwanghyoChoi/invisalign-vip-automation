#!/usr/bin/env node
const path = require('path');
const { makeConfig } = require('../src/config');
const { shellQuote } = require('../src/utils');

const config = makeConfig(process.argv[2] || '.env');
const node = process.execPath || '/usr/bin/env node';
const cwd = process.cwd();
console.log(`${config.actionRequiredCron} cd ${shellQuote(cwd)} && ${shellQuote(node)} src/cli.js monitor`);
