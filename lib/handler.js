// Native
const vm = require('vm')

// Utilities
const log = require('./log')

const checkAsyncAwait = () => {
  try {
    // eslint-disable-next-line no-new
    new vm.Script('(async () => ({}))()')
    return true
  } catch (err) {
    return false
  }
}

module.exports = file => {
  let mod

  try {
    // eslint-disable-next-line import/no-dynamic-require
    mod = require(file)

    if (mod && typeof mod === 'object') {
      mod = mod.default
    }
  } catch (err) {
    if (!checkAsyncAwait()) {
      log(
        'In order for `async` & `await` to work, you need to use at least Node.js 8!',
        'old-node-version'
      )
      process.exit(1)
    }

    console.log(`Error when importing ${file}: ${err.stack}`)
    process.exit(1)
  }

  if (typeof mod !== 'function') {
    log(`The file "${file}" does not export a function.`, 'no-export')
    process.exit(1)
  }

  return mod
}