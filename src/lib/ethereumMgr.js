/*
file - ethereumMgr.js - manages interactions with ethereum across the board

resources:
- networks - the various ethereum networks using infura (where key is appended)

- web3 - web3.js is a collection of libraries which allow you to interact with a local
or remote ethereum node, using a HTTP or IPC connection
https://github.com/ethereum/web3.js/

- bluebird - third party promise library
http://bluebirdjs.com/docs/getting-started.html

- eth-signer - A minimal ethereum javascript signer used to sign and send meta tx
https://github.com/ConsenSys/eth-signer

- ethers - This library (which was made for and used by ethers.io) is designed to
make it easier to write client-side JavaScript based wallets, keeping the private
key on the owner’s machine at all times
https://docs.ethers.io/ethers.js/html/api-wallet.html

- pg - node-postgres is a collection of node.js modules for interfacing with your PostgreSQL
database. It has support for callbacks, promises, async/await, connection pooling,
prepared statements, cursors, streaming results, C/C++ bindings, rich type parsing,
and more! Just like PostgreSQL itself there are a lot of features:
this documentation aims to get you up and running quickly and in the right direction.
It also tries to provide guides for more advanced & edge-case topics allowing you to
tap into the full power of PostgreSQL from node.js.
https://node-postgres.com/
*/
const networks = require('./networks')
const Web3 = require('web3')
const Promise = require('bluebird')
const { generators, signers } = require('eth-signer')
const Transaction = require('ethereumjs-tx')
const { Wallet } = require('ethers')
const { Client } = require('pg')

/*
from ethsigner library, https://github.com/ConsenSys/eth-signer/blob/master/lib/hd_signer.js
takes in private key, creates simple signer
*/
const HDSigner = signers.HDSigner

const DEFAULT_GAS_PRICE = 20000000000 // 20 Gwei

class EthereumMgr {
  constructor () {
    this.pgUrl = null
    this.seed = null

    this.web3s = {}

    this.gasPrices = {}

    for (const network in networks) {
      let provider = new Web3.providers.HttpProvider(networks[network].rpcUrl)
      let web3 = new Web3(provider)
      web3.eth = Promise.promisifyAll(web3.eth)
      this.web3s[network] = web3

      this.gasPrices[network] = DEFAULT_GAS_PRICE
    }
  }

  isSecretsSet () {
    return this.pgUrl !== null || this.seed !== null
  }

  setSecrets (secrets) {
    this.pgUrl = secrets.PG_URL
    this.seed = secrets.SEED

    const hdPrivKey = generators.Phrase.toHDPrivateKey(this.seed)
    this.signer = new HDSigner(hdPrivKey)
  }

  getProvider (networkName) {
    if (!this.web3s[networkName]) return null
    return this.web3s[networkName].currentProvider
  }

  getAddress () {
    return this.signer.getAddress()
  }

  async getBalance (address, networkName) {
    if (!address) throw new Error('no address')
    if (!networkName) throw new Error('no networkName')
    if (!this.web3s[networkName]) throw new Error('no web3 for networkName')
    return this.web3s[networkName].eth.getBalanceAsync(address)
  }

  async getGasPrice (networkName) {
    if (!networkName) throw new Error('no networkName')
    try {
      this.gasPrices[networkName] = (await this.web3s[networkName]
        .eth.getGasPriceAsync()).toNumber()
    } catch (e) {
      console.error(e)
    }
    return this.gasPrices[networkName]
  }

  async estimateGas (tx, from, networkName) {
    if (!tx) throw new Error('no tx object')
    if (!networkName) throw new Error('no networkName')

    // let tx = new Transaction(Buffer.from(txHex, 'hex'))
    let txCopy = {
      nonce: '0x' + (tx.nonce.toString('hex') || 0),
      gasPrice: '0x' + tx.gasPrice.toString('hex'),
      to: '0x' + tx.to.toString('hex'),
      value: '0x' + (tx.value.toString('hex') || 0),
      data: '0x' + tx.data.toString('hex'),
      from
    }
    let price = 3000000
    try {
      price = await this.web3s[networkName].eth.estimateGasAsync(txCopy)
    } catch (error) {}
    return price
  }

  async getNonce (address, networkName) {
    if (!address) throw new Error('no address')
    if (!networkName) throw new Error('no networkName')
    if (!this.pgUrl) throw new Error('no pgUrl set')
    const client = new Client({
      connectionString: this.pgUrl
    })

    try {
      await client.connect()
      const res = await client.query(
        'INSERT INTO nonces(address,network,nonce) \n' +
            'VALUES ($1,$2,0) \n' +
        'ON CONFLICT (address,network) DO UPDATE \n' +
              'SET nonce = nonces.nonce + 1 \n' +
            'WHERE nonces.address=$1 \n' +
              'AND nonces.network=$2 \n' +
        'RETURNING nonce;',
        [address, networkName]
      )
      return res.rows[0].nonce
    } catch (e) {
      throw e
    } finally {
      await client.end()
    }
  }

  async signTx ({ txHex, blockchain }) {
    if (!txHex) throw new Error('no txHex')
    if (!blockchain) throw new Error('no blockchain')
    let tx = new Transaction(Buffer.from(txHex, 'hex'))
    tx.gasPrice = await this.getGasPrice(blockchain)
    tx.nonce = await this.getTransactionCount(this.signer.getAddress(), blockchain)
    const estimatedGas = await this.estimateGas(
      tx,
      this.signer.getAddress(),
      blockchain
    )
    // add some buffer to the limit
    tx.gasLimit = estimatedGas + 1000

    const rawTx = tx.serialize().toString('hex')
    return new Promise((resolve, reject) => {
      this.signer.signRawTx(rawTx, (error, signedRawTx) => {
        if (error) {
          reject(error)
        }
        resolve(signedRawTx)
      })
    })
  }

  async sendRawTransaction (signedRawTx, networkName) {
    if (!signedRawTx) throw new Error('no signedRawTx')
    if (!networkName) throw new Error('no networkName')

    if (!signedRawTx.startsWith('0x')) {
      signedRawTx = '0x' + signedRawTx
    }
    const txHash = await this.web3s[networkName].eth.sendRawTransactionAsync(
      signedRawTx
    )

    let txObj = Wallet.parseTransaction(signedRawTx)
    txObj.gasLimit = txObj.gasLimit.toString(16)
    txObj.gasPrice = txObj.gasPrice.toString()
    txObj.value = txObj.value.toString(16)

    await this.storeTx(txHash, networkName, txObj)

    return txHash
  }

  async sendTransaction (txObj, networkName) {
    if (!txObj) throw new Error('no txObj')
    if (!networkName) throw new Error('no networkName')

    let tx = new Transaction(txObj)
    const rawTx = tx.serialize().toString('hex')
    let signedRawTx = await this.signTx({
      txHex: rawTx,
      blockchain: networkName
    })
    return this.sendRawTransaction(signedRawTx, networkName)
  }

  async readNonce (address, networkName) {
    if (!address) throw new Error('no address')
    if (!networkName) throw new Error('no networkName')
    if (!this.pgUrl) throw new Error('no pgUrl set')

    const client = new Client({
      connectionString: this.pgUrl
    })

    try {
      await client.connect()
      const res = await client.query(
        'SELECT nonce \n' +
               'FROM nonces \n' +
              'WHERE nonces.address=$1 \n' +
                'AND nonces.network=$2',
        [address, networkName]
      )
      if (res.rows[0]) {
        return res.rows[0].nonce
      }
    } catch (e) {
      throw e
    } finally {
      await client.end()
    }
  }

  async setNonce (address, networkName, nonce) {
    if (!address) throw new Error('no address')
    if (!networkName) throw new Error('no networkName')
    if (!this.pgUrl) throw new Error('no pgUrl set')

    const client = new Client({
      connectionString: this.pgUrl
    })

    try {
      await client.connect()
      const res = await client.query(
        'UPDATE nonces \n' +
                'SET nonce=$3 \n' +
              'WHERE nonces.address=$1 \n' +
                'AND nonces.network=$2',
        [address, networkName, nonce]
      )
      return res
    } catch (e) {
      throw e
    } finally {
      await client.end()
    }
  }

  async getTransactionCount (address, networkName) {
    if (!address) throw new Error('no address')
    if (!networkName) throw new Error('no networkName')
    if (!this.web3s[networkName]) throw new Error('no web3 for networkName')
    return this.web3s[networkName].eth.getTransactionCountAsync(address)
  }

  async storeTx (txHash, networkName, txObj) {
    if (!txHash) throw new Error('no txHash')
    if (!networkName) throw new Error('no networkName')
    if (!txObj) throw new Error('no txObj')
    if (!this.pgUrl) throw new Error('no pgUrl set')

    const client = new Client({
      connectionString: this.pgUrl
    })

    try {
      await client.connect()
      const res = await client.query(
        'INSERT INTO tx(tx_hash, network,tx_options) \n' +
             'VALUES ($1,$2,$3)',
        [txHash, networkName, txObj]
      )
      return res
    } catch (e) {
      throw e
    } finally {
      await client.end()
    }
  }

  async getTransactionReceipt (txHash, networkName) {
    if (!txHash) throw new Error('no txHash')
    if (!networkName) throw new Error('no networkName')
    if (!this.web3s[networkName]) throw new Error('no web3 for networkName')
    const txReceipt = await this.web3s[networkName].eth.getTransactionReceiptAsync(txHash)

    await this.updateTx(txHash, networkName, txReceipt)

    return txReceipt
  }

  async updateTx (txHash, networkName, txReceipt) {
    if (!txHash) throw new Error('no txHash')
    if (!networkName) throw new Error('no networkName')
    if (!txReceipt) throw new Error('no txReceipt')
    if (!this.pgUrl) throw new Error('no pgUrl set')

    const client = new Client({
      connectionString: this.pgUrl
    })

    try {
      await client.connect()
      const res = await client.query(
        'UPDATE tx \n' +
                'SET tx_receipt = $2, \n' +
                    'updated = now() \n' +
              'WHERE tx_hash = $1',
        [txHash, txReceipt]
      )
      return res
    } catch (e) {
      throw e
    } finally {
      await client.end()
    }
  }

  async getPendingTx (networkName, age) {
    if (!networkName) throw new Error('no networkName')
    if (!age) throw new Error('no age')
    if (!this.pgUrl) throw new Error('no pgUrl set')

    const client = new Client({
      connectionString: this.pgUrl
    })

    try {
      await client.connect()
      const res = await client.query(
        'SELECT tx_hash \n' +
           'FROM tx \n' +
          'WHERE tx_receipt is NULL \n' +
            'AND network = $1 \n' +
            'AND created > now() - CAST ($2 AS INTERVAL)',
        [networkName, age + ' seconds']
      )
      return res
    } catch (e) {
      throw e
    } finally {
      await client.end()
    }
  }
}

module.exports = EthereumMgr
