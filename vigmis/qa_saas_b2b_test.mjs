import https from 'https';

const BASE_URL = 'https://vigmisapi-production.up.railway.app/onboarding/chat';
const AUTH = 'Bearer test:vigmis-test-2026:7822c548-ecea-4572-929b-bcee1b4b3db2';

const messages = [
  'We have a SaaS product - ProjectFlow - a project management tool for software teams.',
  'Our website is https://projectflow.io',
  'Budget $2000/month',
  'We manage 100% of it',
  'We want demo sign-ups from CTOs and engineering managers',
  'Targeting USA and Western Europe',
  'Gross margin is 88%',
  'No restrictions'
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
