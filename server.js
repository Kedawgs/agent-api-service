import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const WALLET = process.env.WALLET_ADDRESS || '0x15ff6791Dbdd25aA9A9A4714d195fC2E4A8d9255';
const PORT = process.env.PORT || 3000;
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://facilitator.x402.org';

const SUSPICIOUS_KEYWORDS = [
  'login', 'signin', 'secure', 'verify', 'account', 'update', 'confirm',
  'wallet', 'metamask', 'coinbase', 'binance', 'paypal', 'amazon', 'apple',
  'microsoft', 'google', 'facebook', 'instagram', 'netflix', 'bank',
  'support', 'help', 'recovery', 'restore', 'unlock', 'suspend'
];

const SUSPICIOUS_TLDS = ['.xyz', '.top', '.click', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc', '.work', '.site', '.online', '.tech'];

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register('eip155:8453', new ExactEvmScheme());

app.use(
  paymentMiddleware(
    {
      'GET /api/phishing-scan': {
        accepts: [{
          scheme: 'exact',
          price: '$0.05',
          network: 'eip155:8453',
          payTo: WALLET,
        }],
        description: 'Scan a URL or domain for phishing indicators. Pass ?url=<url>',
        mimeType: 'application/json',
      },
      'GET /api/domain-check': {
        accepts: [{
          scheme: 'exact',
          price: '$0.02',
          network: 'eip155:8453',
          payTo: WALLET,
        }],
        description: 'Quick domain risk check. Pass ?domain=<domain>',
        mimeType: 'application/json',
      },
      'GET /api/summarize': {
        accepts: [{
          scheme: 'exact',
          price: '$0.01',
          network: 'eip155:8453',
          payTo: WALLET,
        }],
        description: 'Summarize any public URL. Pass ?url=<url>',
        mimeType: 'application/json',
      },
      'GET /api/research': {
        accepts: [{
          scheme: 'exact',
          price: '$0.05',
          network: 'eip155:8453',
          payTo: WALLET,
        }],
        description: 'Deep research on a topic. Pass ?topic=<topic>',
        mimeType: 'application/json',
      },
    },
    resourceServer
  )
);

function scoreDomain(domain) {
  const d = domain.toLowerCase();
  let score = 0;
  const flags = [];

  for (const tld of SUSPICIOUS_TLDS) {
    if (d.endsWith(tld)) {
      score += 20;
      flags.push(`suspicious_tld:${tld}`);
      break;
    }
  }

  for (const kw of SUSPICIOUS_KEYWORDS) {
    if (d.includes(kw)) {
      score += 15;
      flags.push(`keyword:${kw}`);
    }
  }

  const brands = ['paypal', 'amazon', 'apple', 'google', 'facebook', 'microsoft', 'coinbase', 'metamask', 'binance'];
  for (const brand of brands) {
    if (d.includes(brand) && !d.startsWith(brand + '.') && !d.endsWith('.' + brand + '.com')) {
      score += 40;
      flags.push(`brand_impersonation:${brand}`);
    }
  }

  const hyphens = (d.match(/-/g) || []).length;
  if (hyphens >= 3) {
    score += 10 * hyphens;
    flags.push(`excessive_hyphens:${hyphens}`);
  }

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(d)) {
    score += 50;
    flags.push('ip_based_domain');
  }

  if (d.length > 40) {
    score += 15;
    flags.push(`long_domain:${d.length}chars`);
  }

  return { score: Math.min(score, 100), flags };
}

app.get('/', (req, res) => {
  res.json({
    name: 'Agent API Service',
    description: 'AI-powered security scanning and research API. Pay per use via x402 on Base.',
    wallet: WALLET,
    network: 'Base mainnet (eip155:8453)',
    pricing: {
      '/api/phishing-scan': '$0.05 - Deep phishing URL scan',
      '/api/domain-check': '$0.02 - Quick domain risk check',
      '/api/summarize': '$0.01 - Summarize any public URL',
      '/api/research': '$0.05 - Research topic summary',
    },
    howToUse: 'Include x402 payment header with each request. See x402.org for client SDKs.',
    github: 'https://github.com/Kedawgs/agent-api-service',
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), wallet: WALLET });
});

app.get('/api/phishing-scan', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Pass ?url=<url> to scan' });

  try {
    let parsedUrl;
    try {
      parsedUrl = new URL(url.startsWith('http') ? url : 'https://' + url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const domain = parsedUrl.hostname;
    const { score, flags } = scoreDomain(domain);

    let pageAnalysis = { title: null, hasLoginForm: false, externalScripts: 0 };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SecurityBot/1.0)' }
      });
      clearTimeout(timeout);
      const html = await response.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) pageAnalysis.title = titleMatch[1].trim();

      pageAnalysis.hasLoginForm = /type=["']?password["']?/i.test(html);
      const scriptMatches = html.match(/<script[^>]+src=["'][^"']+["']/gi) || [];
      pageAnalysis.externalScripts = scriptMatches.filter(s => !s.includes(domain)).length;

      if (pageAnalysis.hasLoginForm) flags.push('has_login_form');
    } catch {
      pageAnalysis.fetchError = 'Could not fetch page content';
    }

    const finalScore = Math.min(score + (pageAnalysis.hasLoginForm ? 10 : 0), 100);
    const riskLevel = finalScore >= 70 ? 'HIGH' : finalScore >= 40 ? 'MEDIUM' : finalScore >= 20 ? 'LOW' : 'MINIMAL';

    res.json({
      url,
      domain,
      riskScore: finalScore,
      riskLevel,
      flags,
      pageAnalysis,
      eligibleForBounty: finalScore >= 60 && flags.length >= 2,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get('/api/domain-check', async (req, res) => {
  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: 'Pass ?domain=<domain>' });

  try {
    const d = domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    const { score, flags } = scoreDomain(d);
    const riskLevel = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : score >= 20 ? 'LOW' : 'MINIMAL';

    res.json({
      domain: d,
      riskScore: score,
      riskLevel,
      flags,
      recommendation: score >= 60 ? 'BLOCK' : score >= 40 ? 'MONITOR' : 'ALLOW',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get('/api/summarize', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Pass ?url=<url>' });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(timeout);
    const html = await r.text();
    const text = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Unknown';
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const summary = sentences.slice(0, 5).join(' ').trim() || text.slice(0, 500);

    res.json({ url, title, summary, wordCount: text.split(' ').length, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/research', async (req, res) => {
  const { topic } = req.query;
  if (!topic) return res.status(400).json({ error: 'Pass ?topic=<topic>' });

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(topic)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(timeout);
    const html = await r.text();

    const snippetMatches = html.match(/class="result__snippet"[^>]*>([^<]{20,300})</g) || [];
    const snippets = snippetMatches
      .map(s => s.replace(/class="[^"]+"[^>]*>/, '').replace(/<[^>]+>/g, '').trim())
      .filter(s => s.length > 20)
      .slice(0, 5);

    const titleMatches = html.match(/class="result__a"[^>]*>([^<]+)</g) || [];
    const titles = titleMatches
      .map(t => t.replace(/class="[^"]+"[^>]*>/, '').trim())
      .slice(0, 5);

    res.json({
      topic,
      results: titles.map((title, i) => ({ title, snippet: snippets[i] || '' })),
      summary: snippets.join(' ').slice(0, 1000) || `Research results for: ${topic}`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.listen(PORT, () => {
  console.log(`Agent API Service running on port ${PORT}`);
  console.log(`Wallet: ${WALLET}`);
  console.log(`Network: Base mainnet (eip155:8453)`);
});
