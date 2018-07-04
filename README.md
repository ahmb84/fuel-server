# fuel-server

### What is the major difference with the [lambda-sensui](https://github.com/consensys/lambda-sensui)

There two difference the first one is this a server, when lambda-sensui is serverless and use the aws lambda api, fuel-server is a node server, it's mean to start it you have to do:

1.  Install dependencies

```
npm install
```

2.  Start the server

```
npm start
```

The other difference is the in the relay endpoint. The jsonRpcReponse field enable the compatibility with the fuel-web3-provider, but you could continue to get the server response as the lambda-sensui way by set it to false.

## API Description

## Relay

`POST /relay`

#### Body

```
{
  metaSignedTx: <metaSignedTx>,
  metaNonce: <metaNonce>,
  jsonRpcReponse: <boolean>
  blockchain: <blockchain name>
}
```

#### Response

| Status | Message        |                                  |
| :----: | -------------- | -------------------------------- |
|  200   | Ok.            | address funded                   |
|  400   | Bad request    | No JSON or paramter missing      |
|  401   | Forbidden      | Fuel token not granted by nisaba |
|  403   | Forbidden      | Invalid metaTx signature         |
|  500   | Internal Error | Internal error                   |

#### Response data

```
{
  txHash: <tx hash>
}
```
