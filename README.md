# Zephyr Frontend for Web and Desktop

> **Unofficial community fork** of
> [ZephyrProtocol/zephyr-wallet](https://github.com/ZephyrProtocol/zephyr-wallet)
> at commit `a63147f`. Not affiliated with or endorsed by Zephyr Protocol.
> Upstream does not include a license; this fork adds none.

Frontend monorepository for the Zephyr desktop and web wallet.
Originally forked from: https://github.com/haven-protocol-org/haven-web-app

**Main Libraries:** React, Redux, Electron, Styled Components

**Languages:** Typescript, Javascript

## Web wallet (Cloudflare Pages)

Build `client/` with Node 22, `NODE_OPTIONS=--openssl-legacy-provider` and
`REACT_APP_NET_TYPE_ID=0`; output directory `client/build`. Wallet RPC is proxied
on the same origin by `client/functions/[[path]].js`; the upstream node is set
with the `ZEPHYR_RPC_URL` variable. Deployment guide:
[`docs/cloudflare-pages.md`](docs/cloudflare-pages.md).

Wallets are stored in IndexedDB and are therefore tied to the origin. After a
domain change, restore from your seed phrase or keys file; funds stay on-chain.

**Privacy:** this deployment proxies wallet RPC through Cloudflare, so Cloudflare
sees the RPC requests and responses and the IP they come from. Your seed, private
keys and password never leave the browser.

The leg from Cloudflare to the node is plaintext, and that is a property of the
node, not of the proxy: the public node only serves RPC over HTTP on port 17767
(port 443 is closed and its TLS listener presents an expired self-signed
certificate), and a page served over HTTPS cannot call it directly. That is the
reason this proxy exists. The desktop app and the CLI skip Cloudflare and talk to
the node themselves, but they are only encrypted when that node is `https://`;
against the same public node their traffic is plaintext too, just without a third
party in between. Use those with your own node if this matters to you.

### Capacity and limits

Only RPC calls go through the Function; static files are free and unlimited
(with `client/public/_routes.json` in place). The figures below assume about one
request per 10 seconds while a wallet is open, and are estimates, not guarantees:

| | Workers Free | Workers Paid ($5/month) |
|---|---|---|
| RPC requests | 100,000 per day | 10 million per month, no daily cap |
| Static assets and egress | free, unlimited | free, unlimited |
| Rough capacity | ~275 wallet-hours/day, ~870 new wallets/day | ~3× the volume, plus burst headroom |

A new wallet needs ~115 requests (~70 MB) because it starts near the chain tip.
A restore **without** a restore height downloads the whole chain (~1,000
requests, ~1.9 GB), so always fill in the restore height when restoring. When the
free daily limit is reached the site keeps loading but RPC stops (Pages "fail
open"). Current limits:
<https://developers.cloudflare.com/workers/platform/limits/>.

## Web

#### Environments

- mainnet
- stagenet
- testnet

#### Build & Develop

1. Navigate to client folder
2. Build the app for given environment
3. Start the app for given environment

```bash
cd client
npm run build:web
npm run start:web
```

## Desktop

#### Build

1. Navigate to client folder
2. Build the app for the environment

```bash
cd client
npm run build:desktop
```

To build the final desktop build

```bash
sh ./sh/make.sh
```

#### Develop

1. Run start script to prepare client
2. Start the build by executing shell script

```bash
npm run start:desktop
cd ../
sh ./sh/develop.sh
```
