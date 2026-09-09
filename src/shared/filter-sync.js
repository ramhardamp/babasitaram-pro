// ═══════════════════════════════════════════════════════════════
// BABASITARAM PRO v9.1 — Filter List Auto-Sync
// Downloads EasyList + EasyPrivacy, parses to DNR rules
// ═══════════════════════════════════════════════════════════════

// SSRF fix: only these exact URLs are allowed — no user input accepted
const ALLOWED_FILTER_HOSTS = ['easylist.to', 'raw.githubusercontent.com'];

function isAllowedFilterUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && ALLOWED_FILTER_HOSTS.includes(parsed.hostname);
    } catch(e) { return false; }
}

const FILTER_SOURCES = [
    { name: 'EasyList',    url: 'https://easylist.to/easylist/easylist.txt',        priority: 1 },
    { name: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt',     priority: 2 },
    { name: 'uBO Annoyances', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt', priority: 3 },
];

// Max dynamic rules Chrome allows = 5000 (MV3 limit)
const MAX_DYNAMIC_RULES = 4800;
// Chrome DNR caps how many rules can be added/removed in a single call —
// batch in chunks of 500 so large syncs don't hit the per-call limit.
const RULES_PER_BATCH = 500;
let ruleIdCounter = 1000; // Start after our static rules.json (1-999)

// fetch() wrapper with a hard timeout, using AbortSignal.timeout when
// available and falling back to a manual AbortController for older
// runtimes / test environments where AbortSignal.timeout is missing.
function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Parse ABP/uBO filter line to DNR rule
function parseFilterLine(line, priority) {
    line = line.trim();
    // Skip comments, whitespace, options we can't support
    if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('@@')) return null;
    if (line.includes('##') || line.includes('#@#') || line.includes('#?#')) return null; // cosmetic

    let domain = null;
    let resourceTypes = undefined;

    // Domain rule: ||example.com^
    const domainMatch = line.match(/^\|\|([a-zA-Z0-9._\-*]+)\^(\$.*)?$/);
    if (domainMatch) {
        domain = domainMatch[1].replace(/\*\./g, '').toLowerCase();
        if (!domain || domain.length < 4 || domain.includes('*')) return null;
        if (domainMatch[2]) {
            const opts = domainMatch[2].slice(1);
            if (opts.includes('~')) return null; // negation options — skip
            if (opts.includes('script')) resourceTypes = ['script'];
            else if (opts.includes('image')) resourceTypes = ['image'];
            else if (opts.includes('xhr') || opts.includes('xmlhttprequest')) resourceTypes = ['xmlhttprequest'];
            else if (opts.includes('subdocument')) resourceTypes = ['sub_frame'];
        }
        const rule = {
            id: ++ruleIdCounter,
            priority: priority || 1,
            action: { type: 'block' },
            condition: { urlFilter: `||${domain}^` }
        };
        if (resourceTypes) rule.condition.resourceTypes = resourceTypes;
        return rule;
    }

    // Simple domain block: |http://example.com
    const simpleMatch = line.match(/^\|(https?:\/\/)?([a-zA-Z0-9._\-]+)\^?$/);
    if (simpleMatch && simpleMatch[2]) {
        domain = simpleMatch[2].toLowerCase();
        if (domain.length < 4) return null;
        return { id: ++ruleIdCounter, priority: priority||1, action:{type:'block'}, condition:{urlFilter:`||${domain}^`} };
    }

    return null;
}

async function fetchFilterList(source) {
    // SSRF guard: reject any URL not in the explicit allowlist
    if (!isAllowedFilterUrl(source.url)) {
        console.warn(`[FilterSync] Blocked non-allowlisted URL: ${source.url}`);
        return { name: source.name, rules: [], count: 0, error: 'URL not in allowlist' };
    }
    try {
        const r = await fetchWithTimeout(source.url, { cache: 'no-cache', credentials: 'omit' }, 30000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        // Reject non-text responses (SSRF protection)
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('text')) throw new Error('Invalid content-type: ' + ct.substring(0,50));
        // Size limit: reject responses > 5MB
        const cl = parseInt(r.headers.get('content-length') || '0');
        if (cl > 5 * 1024 * 1024) throw new Error('Response too large: ' + cl);
        const text = await r.text();
        const lines = text.split('\n');
        const rules = [];
        for (const line of lines) {
            const rule = parseFilterLine(line, source.priority);
            if (rule) rules.push(rule);
            if (rules.length >= Math.floor(MAX_DYNAMIC_RULES / FILTER_SOURCES.length)) break;
        }
        return { name: source.name, rules, count: rules.length };
    } catch(e) {
        return { name: source.name, rules: [], count: 0, error: e.message };
    }
}

// Add rules to Chrome's Dynamic Rule store in batches of RULES_PER_BATCH,
// since Chrome DNR limits how many rules can be added in one updateDynamicRules() call.
async function addRulesInBatches(rules) {
    for (let i = 0; i < rules.length; i += RULES_PER_BATCH) {
        const batch = rules.slice(i, i + RULES_PER_BATCH);
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: batch });
    }
}

async function syncFilterLists(addLogFn) {
    // Fallback so a missing/undefined logger never crashes the sync
    if (typeof addLogFn !== 'function') addLogFn = () => {};

    try {
        addLogFn('🔄 Filter Sync: Starting...');
        ruleIdCounter = 1000;

        // Remove old dynamic rules
        const existing = await chrome.declarativeNetRequest.getDynamicRules();
        const toRemove = existing.map(r => r.id);
        if (toRemove.length) {
            // Batch removals too, for consistency and to stay under DNR limits
            for (let i = 0; i < toRemove.length; i += RULES_PER_BATCH) {
                await chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: toRemove.slice(i, i + RULES_PER_BATCH)
                });
            }
        }

        let allRules = [];
        let summary = [];

        for (const source of FILTER_SOURCES) {
            let result;
            try {
                result = await fetchFilterList(source);
            } catch (e) {
                result = { name: source.name, rules: [], count: 0, error: e.message };
            }
            if (result.error) {
                addLogFn(`⚠️ ${result.name}: Error — ${result.error}`);
            } else {
                allRules = allRules.concat(result.rules);
                summary.push(`${result.name}: ${result.count}`);
                addLogFn(`✅ ${result.name}: ${result.count} rules parsed`);
            }
            // Small delay between fetches
            await new Promise(r => setTimeout(r, 300));
        }

        // Deduplicate by urlFilter
        const seen = new Set();
        const deduped = [];
        let newId = 1001;
        for (const rule of allRules) {
            const key = rule.condition.urlFilter;
            if (!seen.has(key)) {
                seen.add(key);
                rule.id = newId++;
                deduped.push(rule);
            }
            if (deduped.length >= MAX_DYNAMIC_RULES) break;
        }

        // Add to Chrome DNR, 500 rules per batch
        try {
            await addRulesInBatches(deduped);
            const totalMsg = `🛡️ Filter Sync DONE: ${deduped.length} rules active (${summary.join(' | ')})`;
            addLogFn(totalMsg);

            // Save sync metadata — both the legacy combined object and the
            // discrete keys some UI code reads directly.
            await chrome.storage.local.set({
                filterSyncMeta: {
                    lastSync: Date.now(),
                    totalRules: deduped.length,
                    summary,
                    status: 'success'
                },
                filterSyncStatus: 'success',
                filterSyncTime: Date.now(),
                filterSyncCount: deduped.length
            });
            return { ok: true, total: deduped.length, summary };
        } catch(e) {
            addLogFn(`❌ Filter Sync failed: ${e.message}`);
            await chrome.storage.local.set({
                filterSyncMeta: { lastSync: Date.now(), status: 'error', error: e.message },
                filterSyncStatus: 'error',
                filterSyncTime: Date.now(),
                filterSyncCount: 0
            });
            return { ok: false, error: e.message };
        }
    } catch (e) {
        // Top-level safety net — never let a sync attempt throw uncaught
        addLogFn(`❌ Filter Sync failed: ${e.message}`);
        try {
            await chrome.storage.local.set({
                filterSyncMeta: { lastSync: Date.now(), status: 'error', error: e.message },
                filterSyncStatus: 'error',
                filterSyncTime: Date.now(),
                filterSyncCount: 0
            });
        } catch(_) { /* storage itself unavailable — nothing more we can do */ }
        return { ok: false, error: e.message };
    }
}

// Export for background.js
if (typeof module !== 'undefined') module.exports = { syncFilterLists };
