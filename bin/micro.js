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
const logError = require('../lib/error')

// Check if the user defined any options
const flags = parseArgs(process.argv.slice(2), {
  alias: {
    p: 'port',
    H: 'host',
    s: 'unix-socket',
    h: 'help',
    v: 'version'
  },
  unknown(flag) {
    console.log(`The option "${flag}" is unknown. Use one of these:`)
    console.log(generateHelp())
    process.exit(1)
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
  process.exit()
}

if (flags.port && flags['unix-socket']) {
  logError(
    `Both port and socket provided. You can only use one.`,
    'invalid-port-socket'
  )
  process.exit(1)
}

let listenTo = 3000

if (flags.port) {
  const { isNaN } = Number
  const port = Number(flags.port)
  if (isNaN(port) || (!isNaN(port) && (port < 1 || port >= Math.pow(2, 16)))) {
    logError(
      `Port option must be a number. Supplied: ${flags.port}`,
      'invalid-server-port'
    )
    process.exit(1)
  }

  listenTo = flags.port
}

if (flags['unix-socket']) {
  if (typeof flags['unix-socket'] === 'boolean') {
    logError(
      `Socket must be a string. A boolean was provided.`,
      'invalid-socket'
    )
  }
  listenTo = flags['unix-socket']
}

let file = flags._[0]

if (!file) {
  try {
    // eslint-disable-next-line import/no-dynamic-require
    const packageJson = require(path.resolve(process.cwd(), 'package.json'))
    file = packageJson.main || 'index.js'
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      logError(
        `Could not read \`package.json\`: ${err.message}`,
        'invalid-package-json'
      )
      process.exit(1)
    }
  }
}

if (!file) {
  logError('Please supply a file!', 'path-missing')
  process.exit(1)
}

if (file[0] !== '/') {
  file = path.resolve(process.cwd(), file)
}

if (!existsSync(file)) {
  logError(
    `The file or directory "${path.basename(file)}" doesn't exist!`,
    'path-not-existent'
  )
  process.exit(1)
}

async function start() {
  const loadedModule = await handle(file)
  const server = serve(loadedModule)

  server.on('error', err => {
    console.error('micro:', err.stack)
    process.exit(1)
  })

  const listenArgs = [listenTo]
  if (flags.host) {
    listenArgs.push(flags.host)
  }

  server.listen(...listenArgs, () => {
    const details = server.address()

    process.on('SIGTERM', () => {
      console.log('\nmicro: Gracefully shutting down. Please wait...')
      server.close(process.exit)
    })

    // `micro` is designed to run only in production, so
    // this message is perfectly for prod
    if (typeof details === 'string') {
      console.log(`micro: Accepting connections on ${details}`)
      return
    }

    if (typeof details === 'object' && details.port) {
      console.log(`micro: Accepting connections on port ${details.port}`)
      return
    }

    console.log('micro: Accepting connections')
  })

  const shutdown = () => {
    console.log('Gracefully shutting down')
    server.close()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start()
