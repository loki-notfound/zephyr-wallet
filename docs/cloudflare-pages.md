# Deploying the web wallet on Cloudflare Pages

The web client is a static build. A single Pages Function
(`client/functions/[[path]].js`) proxies wallet RPC on the same origin, which
removes the mixed-content and CORS problems of talking to a remote daemon
directly. `client/public/_routes.json` makes sure only RPC paths invoke the
Function, so static files stay on the unlimited free tier.

## One-time setup (Git integration)

1. Cloudflare dashboard -> **Workers & Pages** -> **Create** -> **Pages** ->
   **Connect to Git**, and pick this repository.
2. Production branch: `master`.
3. **Root directory: `client`** (Pages Functions must be at the project root, so
   `client/` is the project root; this needs the V2 build system).
4. Build command: `npm ci && npm run build:web:ci`
5. Build output directory: `build`
6. Environment variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `NODE_OPTIONS` | `--openssl-legacy-provider` |
   | `CI` | `false` |
   | `REACT_APP_NET_TYPE_ID` | `0` (mainnet; required, the build script does not set it) |
   | `ZEPHYR_RPC_URL` | `http://remote-node.zephyrprotocol.com:17767` (optional, this is the default in `wrangler.toml`) |

`npm ci` needs no SSH credentials: the wallet core is pinned over https in
`package.json`.

## Manual deploy (for testing, no Git integration)

```bash
cd client
npm ci
REACT_APP_NET_TYPE_ID=0 NODE_OPTIONS=--openssl-legacy-provider CI=false npm run build:web:ci
npx wrangler pages deploy build --project-name <your-project>
```

Run this from `client/`, so Wrangler finds `functions/` next to the build output.
Uploading through the dashboard (drag and drop) does **not** support Functions;
the Wrangler CLI does.

## Verify a deployment

```bash
curl -s https://<host>/ | head -1                       # HTML shell
curl -s -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"0","method":"get_info"}' \
  https://<host>/json_rpc | grep '"status"'             # '"status": "OK"'
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/get_peer_list  # 200, static (not proxied)
```

## Changing the node

Set `ZEPHYR_RPC_URL` in the project settings and redeploy (or change the default
in `wrangler.toml`). Any `http://` or `https://` URL works, including a
non-standard port: custom ports are allowed since compatibility date
`2024-09-02`, which `wrangler.toml` satisfies (`2024-09-23`). The upstream must be
reachable without authentication; credentials are not forwarded.

## Privacy and trust

- Cloudflare terminates TLS and runs the Function, so it can read every RPC
  request and response, and it sees the client IP.
- Never sent: seed phrase, private view/spend keys and wallet password. They stay
  in the browser (WASM and IndexedDB).
- The upstream leg is plain HTTP. `remote-node.zephyrprotocol.com` serves RPC on
  port 17767 without a usable certificate (port 443 is closed, and the TLS
  listener on 17767 presents an expired self-signed certificate). A page served
  over HTTPS cannot call that directly, which is why this proxy exists. If
  `ZEPHYR_RPC_URL` starts with `https://`, the Function uses TLS for that leg.
- The desktop app talks to the node through the Electron main process (over IPC);
  the CLI is a Node process. Both connect directly, without Cloudflare, and are
  encrypted only when the configured node uses `https://`.
- For end-to-end encryption, run a node with a valid certificate (for example
  behind Cloudflare Tunnel) and point the clients at it.

## Limits

RPC calls count against the Workers quota; static files do not.

| | Workers Free | Workers Paid ($5/month) |
|---|---|---|
| RPC requests | 100,000 per day | 10 million per month, no daily cap |
| Static assets and egress | free, unlimited | free, unlimited |

When the free daily limit is reached, Pages keeps serving the static site but RPC
stops ("fail open"). See
<https://developers.cloudflare.com/workers/platform/limits/> for current numbers.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `502` on RPC, site loads | Upstream node is down or unreachable (`curl <ZEPHYR_RPC_URL>/get_info`) |
| Cloudflare error `1027` | Daily request limit reached; wait for 00:00 UTC or upgrade |
| CORS or mixed-content errors | `REACT_APP_ZEPHYR_DIRECT_HOST` was set at build time; it must be empty so the client uses the same origin |
| Balance shows `-/-` | Placeholder for a hidden balance (while syncing, or when private details are off) |
| No sync percentage | The target height is unknown until the wallet reports it; the bar is omitted and the sync continues |
| Build fails on `md4`/OpenSSL | `NODE_OPTIONS=--openssl-legacy-provider` missing |
| Build fails resolving `zephyr-javascript` | The dependency must be the `git+https://` pin, not `git+ssh://` |

## Rollback

Every deployment is immutable. Use the dashboard (**Deployments** -> pick a
previous one -> **Rollback**), or list them with
`npx wrangler pages deployment list --project-name <your-project>`.
