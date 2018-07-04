/*

file: relay.js
method: relay
needed parameters in url endpoint:
- metaSignedTx
- blockchain

activates relayhandler, which takes the following inputs (which are instatited
at the top of the file):
- authMgr
- ethereumMgr
- metaTxMgr

this activates the handle method in relay, which verifies the authorization authToken,
parses through the event body, ensures that the metatx parameter is inside the body and
see if its valid, check for blockchain parameter to see if its valid. Then it decodes
the metatransaction, verifies auth.sub and decodedMetaTx.claimedAddress, it signs the
raw transaction, and then it sends the raw, signed transaction
*/
class RelayHandler {
  constructor (ethereumMgr, metaTxMgr) {
    this.ethereumMgr = ethereumMgr
    this.metaTxMgr = metaTxMgr
  }

  async handle (event) {
    let body

    if (event && !event.body) {
    } else if (event && event.body) {
      try {
        body = event.body || JSON.parse(event.body)
      } catch (e) {
        return { code: 400, message: 'no json body' }
      }
    } else {
      return { code: 400, message: 'no json body' }
    }

    if (!body.metaSignedTx) {
      return { code: 400, message: 'metaSignedTx parameter missing' }
    }
    if (!body.blockchain) {
      return { code: 400, message: 'blockchain parameter missing' }
    }

    // support hex strings starting with 0x
    if (body.metaSignedTx.startsWith('0x')) {
      body.metaSignedTx = body.metaSignedTx.slice(2)
    }

    // Check if metaTx signature is valid
    if (!(await this.metaTxMgr.isMetaSignatureValid(body))) {
      return { code: 403, message: 'MetaTx signature invalid' }
    }

    let signedRawTx
    try {
      signedRawTx = await this.ethereumMgr.signTx({
        txHex: body.metaSignedTx,
        blockchain: body.blockchain
      })
    } catch (error) {
      console.log('Error on this.ethereumMgr.signTx')
      console.log(error)
      return { code: 500, message: error.message }
    }

    try {
      const txHash = await this.ethereumMgr.sendRawTransaction(
        signedRawTx,
        body.blockchain
      )
      return (null, txHash)
    } catch (error) {
      console.log('Error on this.ethereumMgr.sendRawTransaction')
      console.log(error)
      return { code: 500, message: error.message }
    }
  }
}
module.exports = RelayHandler
