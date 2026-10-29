/**
 * Same-origin RPC proxy for the Zephyr web wallet (Cloudflare Pages Function).
 *
 * Why this exists: the browser wallet is built with a single daemon endpoint.
 * Pointing it at a remote daemon directly fails in a browser because
 *   - an HTTPS page cannot talk to an HTTP daemon (mixed content), and
 *   - the daemon sends no CORS headers, so the response cannot be read.
 * Serving the RPC through this Function on the page's own origin removes both
 * problems and keeps the upstream wallet bundle untouched.
 *
 * Configuration: set the `ZEPHYR_RPC_URL` variable for the Pages project
 * (Project settings -> Environment variables). Defaults to the public
 * mainnet node below.
 *
 * Only POST requests for a fixed allow-list of wallet RPC paths are forwarded.
 * Everything else is left to Pages' static asset handling, and `_routes.json`
 * keeps static assets from invoking this Function at all.
 */

const DEFAULT_UPSTREAM = "http://remote-node.zephyrprotocol.com:17767";

/** Request body cap. Wallet RPC requests are tiny; this only guards the upstream. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * RPC paths the wallet uses. Taken from the daemon's URI map
 * (src/rpc/core_rpc_server.h in ZephyrProtocol/zephyr) and from the calls made
 * by wallet2 and zephyr-javascript. Deliberately no admin/mining endpoints.
 */
const ALLOWED_PATHS = new Set([
  "/json_rpc",
  "/get_info",
  "/getinfo",
  "/get_height",
  "/getheight",
  "/get_blocks.bin",
  "/getblocks.bin",
  "/get_blocks_by_height.bin",
  "/getblocks_by_height.bin",
  "/get_hashes.bin",
  "/gethashes.bin",
  "/get_o_indexes.bin",
  "/get_outs.bin",
  "/get_outs",
  "/get_output_distribution.bin",
  "/get_transactions",
  "/gettransactions",
  "/get_alt_blocks_hashes",
  "/get_transaction_pool",
  "/get_transaction_pool_hashes.bin",
  "/get_transaction_pool_hashes",
  "/get_transaction_pool_stats",
  "/is_key_image_spent",
  "/send_raw_transaction",
  "/sendrawtransaction",
]);

/** Headers copied from the browser request. Nothing else is forwarded. */
const FORWARDED_REQUEST_HEADERS = ["content-type"];

function upstreamBase(env) {
  const raw = (env && env.ZEPHYR_RPC_URL ? String(env.ZEPHYR_RPC_URL) : DEFAULT_UPSTREAM).trim();
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    throw new Error("ZEPHYR_RPC_URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("ZEPHYR_RPC_URL must be http(s)");
  }
  return raw.replace(/\/+$/, "");
}

export async function onRequest(context) {
  const { request, env, params } = context;

  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const rpcPath = "/" + segments.join("/");

  // Not an RPC path: hand the request back to Pages so static assets are served
  // normally. `_routes.json` already keeps these requests out of the Function;
  // this is only a safety net if that file is missing.
  if (!ALLOWED_PATHS.has(rpcPath)) return context.next();

  if (request.method === "OPTIONS") {
    // Same-origin requests never preflight; answer anyway for curiosity/tools.
    return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST, OPTIONS" } });
  }

  let base;
  try {
    base = upstreamBase(env);
  } catch (e) {
    // Misconfiguration: do not leak details to the browser.
    return new Response("RPC proxy is not configured", { status: 500, headers: { "cache-control": "no-store" } });
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let body;
  try {
    body = await request.arrayBuffer();
  } catch (e) {
    return new Response("Could not read request body", { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    return new Response("Request body too large", { status: 413, headers: { "cache-control": "no-store" } });
  }

  let upstream;
  try {
    upstream = await fetch(base + rpcPath, { method: "POST", headers, body });
  } catch (e) {
    return new Response("Upstream node unreachable", { status: 502, headers: { "cache-control": "no-store" } });
  }

  const responseHeaders = new Headers();
  // Pass the body through untouched, including binary (.bin) responses.
  responseHeaders.set("content-type", upstream.headers.get("content-type") || "application/octet-stream");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
