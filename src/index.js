const pino = require('pino')
const express = require('express')
const bodyParser = require('body-parser')
const config = require('../config')

// a partir de la on est en test
const EthereumMgr = require('./lib/ethereumMgr')
const TxMgr = require('./lib/txMgr')
const MetaTxMgr = require('./lib/metaTxMgr')

const FundHandler = require('./handlers/fund')
const RelayHandler = require('./handlers/relay')
const CheckPendingHandler = require('./handlers/checkPending')

//
const FixNoncesHandler = require('./handlers/fixNonces')
//

const ethereumMgr = new EthereumMgr()
ethereumMgr.setSecrets({ PG_URL: config.db.uri, SEED: config.seed })
const txMgr = new TxMgr(ethereumMgr)
const metaTxMgr = new MetaTxMgr(ethereumMgr)

const fundHandler = new FundHandler(txMgr, ethereumMgr)
const relayHandler = new RelayHandler(ethereumMgr, metaTxMgr)
const checkPendingHandler = new CheckPendingHandler(ethereumMgr)

const fixNonces = new FixNoncesHandler(ethereumMgr)

const app = express()

const initDbTable = async () => {
  const fs = require('fs')
  const { Client } = require('pg')
  const client = new Client()

  const nonces = fs
    .readFileSync('../sensui-new/sql/create_nonces.sql')
    .toString()
  const tx = fs.readFileSync('../sensui-new/sql/create_tx.sql').toString()

  try {
    await client.connect()
    const noncesExist = await client.query(
      "SELECT to_regclass('public.nonces')"
    )
    if (!noncesExist.rows[0].to_regclass) await client.query(nonces)
    const txExist = await client.query("SELECT to_regclass('public.tx')")
    if (!txExist.rows[0].to_regclass) await client.query(tx)
    return
  } catch (e) {
    throw new Error(e)
  } finally {
    client.end()
  }
}

app.use(bodyParser.json())

app.post('/fund', async (req, res) => {
  try {
    const result = await fundHandler.handle(req)
    res.status(200).json({ status: 'success', data: result })
  } catch (error) {
    console.log(error)
    let code = 500
    if (error.code >= 100 && error.code < 600) code = error.code
    let message = error
    if (error.message) message = error.message
    res.status(code).json({ status: 'error', message })
  }
})

app.post('/relay', async (req, res) => {
  console.log('Call relay service')
  try {
    const txHash = await relayHandler.handle(req)
    console.log('This the transactionHash', txHash)
    if (req.body.jsonRpcReponse === true) {
      res.status(200).json({
        id: req.body.id,
        jsonrpc: '2.0',
        result: txHash
      })
    } else {
      res.status(200).json({ status: 'success', data: txHash })
    }
  } catch (error) {
    let code = 500
    if (error.code) code = error.code
    let message = error
    if (error.message) message = error.message
    if (req.body.jsonRpcReponse === true) {
      res
        .satus(code)
        .json({
          id: req.body.id,
          jsonrpc: '2.0',
          error: { code: -32600, message }
        })
    } else {
      res.satus(code).json({ status: 'error', message })
    }
  }
})

app.post('/checkPending', (req, res) => {
  try {
    const result = checkPendingHandler.handle(req)
    res.status(200).json({ status: 'success', data: result })
  } catch (error) {
    let code = 500
    if (error.code) code = error.code
    let message = error
    if (error.message) message = error.message
    res.satus(code).json({ status: 'error', message })
  }
})

app.listen(config.port, () => {
  pino().info(
    '%s v%s ready to accept connections on port %s in %s environment.',
    config.name,
    config.version,
    config.port,
    config.env
  )
})
