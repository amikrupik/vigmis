import https from 'https';

const BASE_URL = 'https://vigmisapi-production.up.railway.app/onboarding/chat';
const AUTH = 'Bearer test:vigmis-test-2026:7822c548-ecea-4572-929b-bcee1b4b3db2';

const messages = [
  'Hi, I run a B2B SaaS company',
  'Our website is https://techscale.io',
  'We have a $8000 monthly ad budget',
  'I want Vigmis to manage 25% of it',
  'Our goal is lead generation — we want demo signups',
  'We target North America and Western Europe',
  'We exclude all consumer/B2C audiences, no gaming, no crypto',
  'We run on a quarterly sales cycle so we need consistent lead flow year-round'
];

function post(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(BASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AUTH,
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const history = [];
let coveredTopics = [];
const turns = [];

for (let i = 0; i < messages.length; i++) {
  const msg = messages[i];
  const reqBody = { history: [...history], message: msg, coveredTopics: [...coveredTopics] };
  const { status, body } = await post(reqBody);

  if (status !== 200) {
    turns.push({ turn: i+1, user: msg, error: body, status });
    break;
  }

  const aiResponse = body.message || '';
  coveredTopics = body.coveredTopics || [];
  const settings = body.settings || null;

  turns.push({ turn: i+1, user: msg, aiResponse, coveredTopics: [...coveredTopics], settings });

  history.push({ role: 'user', content: msg });
  history.push({ role: 'assistant', content: aiResponse });
}

console.log(JSON.stringify(turns, null, 2));
