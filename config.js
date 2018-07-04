module.exports = {
  name: 'fuel-server',
  version: '1.0.0',
  node_uri: process.env.NODE_URI || 'wss://rinkeby.infura.io/ws',
  seed: process.env.SEED || 'brand insane federal bargain nice pilot recall zero disagree action arrive hint',
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 6000,
  acceptable: ['application/json'],
  strictRouting: true,
  db: {
    uri: process.env.DB_URI || 'postgresql://localhost:5432',
    name: process.env.DB_NAME || 'fuel-server'
  }
}
