const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const args = process.argv.slice(2);
let targetUrl = '';
let wordlistPath = '';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '-u') targetUrl = args[i + 1];
    if (args[i] === '-w') wordlistPath = args[i + 1];
}

if (!targetUrl) {
    process.exit(1);
}

if (!targetUrl.startsWith('http')) {
    targetUrl = 'http://' + targetUrl;
}

const urlObj = new URL(targetUrl);
const protocol = urlObj.protocol === 'https:' ? https : http;

async function checkPath(baseUrl, path) {
    return new Promise((resolve) => {
        const fullUrl = baseUrl.endsWith('/') ? baseUrl + path : baseUrl + '/' + path;
        process.stdout.write(`[CHECK] ${fullUrl}\n`);

        const options = {
            method: 'GET',
            timeout: 3000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        };

        const req = protocol.request(fullUrl, options, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
                process.stdout.write(`[FOUND] ${res.statusCode} - ${fullUrl}\n`);
            }
            res.on('data', () => { }); // Consume data
            resolve();
        });

        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.end();
    });
}

async function run() {
    let paths = [];
    if (wordlistPath && fs.existsSync(wordlistPath)) {
        const content = fs.readFileSync(wordlistPath, 'utf8');
        paths = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    } else {
        paths = ['admin', 'login', 'api', 'setup', '.env', 'backup', 'config'];
    }

    process.stdout.write(`Starting scan on ${targetUrl}...\n`);

    // High concurrency might cause issues, using 3
    const CONCURRENCY = 3;
    for (let i = 0; i < paths.length; i += CONCURRENCY) {
        const chunk = paths.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(p => checkPath(targetUrl, p)));
    }
}

run();
