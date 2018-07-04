/*
file: fund.js - to fund the fund address (which funds signed metatx)
method: fund
needed parameters in url endpoint:
- tx
- blockchain

activates fundhandler, which takes the following inputs (which are instatited
at the top of the file):
- authMgr
- ethereumMgr
- metaTxMgr

Purpose: this activates the handle method in handlers/fund.js, which verifies the tx with
txMgr, decodes the transaction, verifies who the transaction is from, check if it
is abusing the gas price by not funding any transaction with a set gas price of ethereum's
trending gas price * 50 (i.e. blockchainGasPrice * 50), gets the balance of the Address
to check if it's real/instatiated and check if funds are needed in the funder address, and then
sends funds to the funding address (if more funds is needed)
*/
class FundHandler {
  constructor (txMgr, ethereumMgr) {
    this.txMgr = txMgr
    this.ethereumMgr = ethereumMgr
  }

  async handle (event) {
    let body

    if (event && !event.body) {
      body = event
    } else if (event && event.body) {
      try {
        body = event.body || JSON.parse(event.body)
      } catch (e) {
        return ({ code: 400, message: 'no json body' })
      }
    } else {
      return ({ code: 400, message: 'no json body' })
    }

    if (!body.tx) {
      return { code: 400, message: 'tx parameter missing' }
    }
    if (!body.blockchain) {
      return { code: 400, message: 'blockchain parameter missing' }
    }

    // support hex strings starting with 0x
    if (body.tx.startsWith('0x')) {
      body.tx = body.tx.slice(2)
    }

    // Verify Tx
    let txObj
    try {
      txObj = await this.txMgr.verify(body.tx)
    } catch (error) {
      console.log('Error on this.txMgr.verify')
      console.log(error)
      return { code: 400, message: error.message }
    }

    let decodedTx
    try {
      decodedTx = await this.txMgr.decode(txObj)
    } catch (error) {
      console.log('Error on this.txMgr.decode')
      console.log(error)
      return { code: 400, message: error.message }
    }

    // Check if it is abusing GasPrice
    let blockchainGasPrice
    try {
      blockchainGasPrice = await this.ethereumMgr.getGasPrice(body.blockchain)
    } catch (error) {
      console.log('Error on this.ethereumMgr.getGasPrice')
      console.error(error)
      return { code: 500, message: error.message }
    }

    if (decodedTx.gasPrice > blockchainGasPrice * 50) {
      console.log('abusing gasPrice')
      return { code: 429, message: 'tx.gasPrice too high. Not funding.' }
    }

    // Get balance of address tx.from
    let fromBalance
    try {
      fromBalance = await this.ethereumMgr.getBalance(
        decodedTx.from,
        body.blockchain
      )
    } catch (error) {
      console.log('Error on this.ethereumMgr.getBalance')
      console.log(error)
      return { code: 500, message: error.message }
    }

    let txNeeded = decodedTx.gasPrice * decodedTx.gasLimit
    let txNeededTolerance = txNeeded * 1.05 // TODO: Change 1.05 to ENV_VAR. No magic numbers!

    // Check if funds are needed
    if (parseInt(fromBalance) > txNeededTolerance) {
      console.log('enough balance. Not sending funds')
      return { code: 429, message: 'enough balance. Not sending funds' }
    }

    // Send fundingTx
    let topUpTo = txNeeded * 1.5
    let amountToFund = topUpTo - fromBalance

    let fundingTx = {
      to: decodedTx.from,
      value: amountToFund
    }
    let txHash
    try {
      txHash = await this.ethereumMgr.sendTransaction(
        fundingTx,
        body.blockchain
      )
    } catch (error) {
      console.log('Error on this.ethereumMgr.sendTransaction')
      console.log(error)
      return { code: 500, message: error.message }
    }
    console.log(txHash)
    return (null, txHash)
  }
}
module.exports = FundHandler
