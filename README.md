# Agent API Service

> AI-powered security scanning and research API with **x402 micropayments** on Base.

Pay per use. No subscriptions. No API keys. Just USDC on Base mainnet.

## Live API

Deploy to Railway to get your URL.

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /` | Free | Service info & pricing |
| `GET /health` | Free | Health check |
| `GET /api/phishing-scan?url=<url>` | $0.05 | Deep phishing URL scan |
| `GET /api/domain-check?domain=<domain>` | $0.02 | Quick domain risk check |
| `GET /api/summarize?url=<url>` | $0.01 | Summarize any public URL |
| `GET /api/research?topic=<topic>` | $0.05 | Research topic with live results |

## Payment

Uses [x402 protocol](https://x402.org). Payments go to `0x15ff6791Dbdd25aA9A9A4714d195fC2E4A8d9255` on Base mainnet.

```bash
npm install x402-fetch
```

```javascript
import { wrapFetchWithPayment } from 'x402-fetch';
const fetch = wrapFetchWithPayment(globalThis.fetch, wallet);
const result = await fetch('https://your-deployment.railway.app/api/domain-check?domain=paypal-secure-verify.xyz');
console.log(await result.json());
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `WALLET_ADDRESS` | `0x15ff6791Dbdd25aA9A9A4714d195fC2E4A8d9255` | Base wallet for receiving payments |
| `FACILITATOR_URL` | `https://facilitator.x402.org` | x402 facilitator |
