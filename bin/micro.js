#!/usr/bin/env node

// Native
const path = require('path')
const { existsSync } = require('fs')

// Packages
const parseArgs = require('mri')

// Utilities
const serve = require('../lib')
const handle = require('../lib/handler')
const generateHelp = require('../lib/help')
const { version } = require('../package')
const log = require('../lib/log')

// Check if the user defined any options
const flags = parseArgs(process.argv.slice(2), {
  string: ['host', 'port'],
  boolean: ['help'],
  alias: {
    p: 'port',
    H: 'host',
    h: 'help'
  },
  unknown(flag) {
    console.log(`The option "${flag}" is unknown. Use one of these:`)
    console.log(generateHelp())
    process.exit()
  }
})

// When `-h` or `--help` are used, print out
// the usage information
if (flags.help) {
  console.log(generateHelp())
  process.exit()
}

// Print out the package's version when
// `--version` or `-v` are used
if (flags.version) {
  console.log(version)
  process.exit(1)
}

let file = flags._[0]

if (!file) {
  try {
    // eslint-disable-next-line import/no-dynamic-require
    const packageJson = require(path.resolve(process.cwd(), 'package.json'))
    file = packageJson.main || 'index.js'
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      log(`Could not read \`package.json\`: ${err.message}`, 20)
      process.exit(1)
    }
  }
}

if (!file) {
  log('Please supply a file!', 10)
  process.exit(1)
}

if (file[0] !== '/') {
  file = path.resolve(process.cwd(), file)
}

if (!existsSync(file)) {
  log(`The file or directory "${path.basename(file)}" doesn't exist!`, 30)
  process.exit(1)
}

const loadedModule = handle(file)
const server = serve(loadedModule)

server.on('error', err => {
  console.error('micro:', err.stack)
  process.exit(1)
})

server.listen(flags.port || 3000, flags.host, () => {
  const details = server.address()
  const nodeVersion = process.version.split('v')[1].split('.')[0]

  process.on('SIGINT', () => {
    // On earlier versions of Node.js (e.g. 6), `server.close` doesn't
    // have a callback, so we need to use it synchronously
    if (nodeVersion >= 8) {
      server.close(() => process.exit(0))
    } else {
      server.close()
      process.exit(0)
    }
  })

  // `micro` is designed to run only in production, so
  // this message is perfectly for prod
  log(`Accepting connections on port ${details.port}`)
})
