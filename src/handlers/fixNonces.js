/*
file: fixNonce.js
method: fixNonces
needed parameters in url endpoint:

activates fixnonce, which takes the following inputs (which are instatited
at the top of the file):
- ethereumMgr
- fixNonces

Purpose: this activates the handle method in handlers/fixNonce.js, which checks network nonce
against db nonce
*/
const networks = require('../lib/networks')
// const pack = require('../../package')

class FixNoncesHandler {
  constructor (ethereumMgr) {
    this.ethereumMgr = ethereumMgr
  }

  async handle (event, context) {
    // const sp = context.functionName.slice(pack.name.length + 1).split('-')
    // let stage = sp[0]
    // console.log('stage:' + stage)

    let address = this.ethereumMgr.getAddress()
    console.log('checking address:' + address)

    for (const network in networks) {
      let netNonce = await this.ethereumMgr.getTransactionCount(address, network)
      let dbNonce = await this.ethereumMgr.readNonce(address, network)

      if (!dbNonce) {
        console.log('no nonce to re-sync')
      } else {
        console.log(
          '[' + network + '] netNonce: ' + netNonce + ' dbNonce: ' + dbNonce
        )
        if (netNonce === 0) {
          await this.ethereumMgr.setNonce(address, network, parseInt(0))
        } else if (dbNonce >= netNonce) {
          console.log('HEY!!!')
          await this.ethereumMgr.setNonce(
            address,
            network,
            parseInt(netNonce - 1)
          )
          console.log('Fixed with: ' + parseInt(netNonce - 1))
        }
      }
    }
    return null
  }
}
module.exports = FixNoncesHandler
