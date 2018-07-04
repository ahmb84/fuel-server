/*
file: checkPending.js
method: checkPending
needed parameters in url endpoint:
- blockchain
- age

activates checkPendinghandler, which takes the following inputs (which are instatited
at the top of the file):
- authMgr
- ethereumMgr
- metaTxMgr

Purpose: this activates the handle method in handlers/checkPending.js, which checks the
pending transactions on chain and returns the tx receipts
*/
class CheckPendingHandler {
  constructor (ethereumMgr) {
    this.ethereumMgr = ethereumMgr
  }

  async handle (event) {
    let body

    if (event && !event.body) {
      body = event
    } else if (event && event.body) {
      try {
        body = JSON.parse(event.body)
      } catch (e) {
        return { code: 400, message: 'no json body' }
      }
    } else {
      return { code: 400, message: 'no json body' }
    }

    if (!body.blockchain) {
      return { code: 400, message: 'blockchain parameter missing' }
    }

    let age = 365 * 24 * 60 * 60
    if (body.age) {
      age = body.age
    }

    let txHashes
    try {
      console.log('calling ethereumMgr.getPendingTx')
      const dbRes = await this.ethereumMgr.getPendingTx(body.blockchain, age)
      txHashes = dbRes.rows
    } catch (error) {
      console.log('Error on this.ethereumMgr.getPendingTx')
      console.log(error)
      return { code: 500, message: error }
    }

    let promises = []
    txHashes.forEach(row => {
      promises.push(
        this.ethereumMgr.getTransactionReceipt(row.tx_hash, body.blockchain)
      )
    })

    return (null, 'OK')
  }
}
module.exports = CheckPendingHandler
