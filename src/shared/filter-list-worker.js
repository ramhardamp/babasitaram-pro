// ═══════════════════════════════════════════════════════════
// BABASITARAM PRO v8 — Filter List Worker
// Downloads EasyList + EasyPrivacy, parses to DNR rules
// ═══════════════════════════════════════════════════════════

// Minimal ABP filter parser → DNR rule converter
function parseAbpFilter(line) {
    line = line.trim();
    if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('#')) return null;
    // Only network blocking rules (no cosmetic)
    if (line.includes('##') || line.includes('#@#') || line.includes('#?#')) return null;
    if (line.startsWith('@@')) return null; // whitelist rules skip
    // Extract domain-based rules: ||domain^
    const m = line.match(/^\|\|([a-z0-9.\-_*]+)\^(?:\$.*)?$/i);
    if (!m) return null;
    const domain = m[1].replace(/\*/g, '');
    if (!domain || domain.length < 4 || domain.startsWith('.')) return null;
    return domain;
}

self.onmessage = async (e) => {
    const { action } = e.data;
    if (action !== 'syncLists') return;

    const LISTS = [
        { name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt' },
        { name: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
    ];

    const domains = new Set();
    let totalLines = 0;
    let errors = [];

    for (const list of LISTS) {
        try {
            self.postMessage({ status: 'progress', msg: `Downloading ${list.name}...` });
            const r = await fetch(list.url);
            if (!r.ok) { errors.push(`${list.name}: HTTP ${r.status}`); continue; }
            const text = await r.text();
            const lines = text.split('\n');
            totalLines += lines.length;
            let added = 0;
            for (const line of lines) {
                const d = parseAbpFilter(line);
                if (d && d.includes('.')) { domains.add(d); added++; }
            }
            self.postMessage({ status: 'progress', msg: `${list.name}: ${added} domains parsed` });
        } catch(err) {
            errors.push(`${list.name}: ${err.message}`);
        }
    }

    // Convert to DNR rules starting from ID 200 (our custom rules are 1-100)
    const rules = [];
    let id = 200;
    for (const domain of domains) {
        if (id > 29999) break; // Chrome DNR limit
        rules.push({
            id,
            priority: 1,
            action: { type: 'block' },
            condition: {
                urlFilter: `||${domain}^`,
                resourceTypes: ['script','image','xmlhttprequest','sub_frame','stylesheet','font','media','websocket','other']
            }
        });
        id++;
    }

    self.postMessage({
        status: 'done',
        ruleCount: rules.length,
        domainCount: domains.size,
        totalLines,
        errors,
        rules: rules.slice(0, 100) // Send first 100 as sample; full sync happens via storage
    });

    // Chunk and send all rules
    const CHUNK = 500;
    for (let i = 0; i < rules.length; i += CHUNK) {
        self.postMessage({ status: 'chunk', chunk: rules.slice(i, i+CHUNK), offset: i, total: rules.length });
    }
    self.postMessage({ status: 'complete', total: rules.length });
};
