/*
file: checkBalances.js
method: checkBalances
needed parameters in url endpoint:
- context in body

activates fundhandler, which takes the following inputs (which are instatited
at the top of the file):
- ethereumMgr

Purpose: this activates the handle method in handlers/checkBalances.js, which checks
body context for address, stage, and blockchain entwork and sends back balance of address
*/
const networks = require('../lib/networks')
const thresholds = require('../lib/thresholds')
const pack = require('../../package')

class CheckBalancesHandler {
  constructor (ethereumMgr) {
    this.ethereumMgr = ethereumMgr
  }

  async handle (event, context, cb) {
    const sp = context.functionName.slice(pack.name.length + 1).split('-')
    let stage = sp[0]
    console.log('stage:' + stage)

    let addr = this.ethereumMgr.getAddress()
    console.log('checking addr:' + addr)

    for (const network in networks) {
      let balanceWei = await this.ethereumMgr.getBalance(addr, network)
      let threshold = thresholds[network][stage]

      console.log(
        '[' + network + '] balance: ' + balanceWei + ' threshold: ' + threshold
      )
    }

    cb(null)
  }
}
module.exports = CheckBalancesHandler
