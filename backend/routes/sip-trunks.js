const express = require('express');
const SipTrunk = require('../models/SipTrunk');
const PhoneNumber = require('../models/PhoneNumber');
const { auth } = require('../middleware/auth');
const joi = require('joi');
const { writeAndReload } = require('../services/sip/asterisk-config');

const router = express.Router();

/**
 * GET /api/sip-trunks
 * List all SIP trunks for the authenticated user
 */
router.get('/', auth, async (req, res) => {
    try {
        const trunks = await SipTrunk.find({ createdBy: req.user._id })
            .sort({ createdAt: -1 });

        res.status(200).json({
            status: 'success',
            results: trunks.length,
            data: { trunks }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * GET /api/sip-trunks/:id
 * Get a single SIP trunk by ID
 */
router.get('/:id', auth, async (req, res) => {
    try {
        const trunk = await SipTrunk.findOne({
            _id: req.params.id,
            createdBy: req.user._id
        });

        if (!trunk) {
            return res.status(404).json({ status: 'error', message: 'SIP trunk not found' });
        }

        res.status(200).json({
            status: 'success',
            data: { trunk }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * POST /api/sip-trunks
 * Create a new SIP trunk
 */
router.post('/', auth, async (req, res) => {
    const schema = joi.object({
        name: joi.string().required().max(100),
        host: joi.string().required().max(255),
        port: joi.number().integer().min(1).max(65535).default(5060),
        transport: joi.string().valid('udp', 'tcp', 'tls').default('udp'),
        username: joi.string().allow('').max(255),
        password: joi.string().allow('').max(255),
        authRealm: joi.string().allow('').max(255),
        defaultCallerId: joi.string().allow('').max(50),
        dialPrefix: joi.string().allow('').max(20),
        codecs: joi.string().default('PCMU,PCMA'),
        providerName: joi.string().allow('').max(100),
        region: joi.string().allow('').max(100)
    });

    try {
        const value = await schema.validateAsync(req.body);

        const trunk = new SipTrunk({
            name: value.name,
            host: value.host,
            port: value.port,
            transport: value.transport,
            username: value.username || '',
            authRealm: value.authRealm || '',
            defaultCallerId: value.defaultCallerId || '',
            dialPrefix: value.dialPrefix || '',
            codecs: value.codecs,
            providerName: value.providerName || '',
            region: value.region || '',
            createdBy: req.user._id
        });

        // Use the virtual setter (auto-encrypts)
        if (value.password) {
            trunk.password = value.password;
        }

        await trunk.save();

        // Auto-Regenerate and Reload Asterisk
        writeAndReload().catch(err => console.error('[SIP] Auto-reload failed:', err.message));

        res.status(201).json({
            status: 'success',
            data: { trunk }
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

/**
 * PATCH /api/sip-trunks/:id
 * Update an existing SIP trunk
 */
router.patch('/:id', auth, async (req, res) => {
    const schema = joi.object({
        name: joi.string().max(100),
        host: joi.string().max(255),
        port: joi.number().integer().min(1).max(65535),
        transport: joi.string().valid('udp', 'tcp', 'tls'),
        username: joi.string().allow('').max(255),
        password: joi.string().allow('').max(255),
        authRealm: joi.string().allow('').max(255),
        defaultCallerId: joi.string().allow('').max(50),
        dialPrefix: joi.string().allow('').max(20),
        codecs: joi.string(),
        providerName: joi.string().allow('').max(100),
        region: joi.string().allow('').max(100),
        status: joi.string().valid('active', 'inactive')
    });

    try {
        const value = await schema.validateAsync(req.body);

        const trunk = await SipTrunk.findOne({
            _id: req.params.id,
            createdBy: req.user._id
        });

        if (!trunk) {
            return res.status(404).json({ status: 'error', message: 'SIP trunk not found' });
        }

        // Handle password separately (virtual setter)
        // If password is explicitly set (even empty string), update it
        if ('password' in value) {
            trunk.password = value.password || ''; // Empty string clears the password
            delete value.password;
        }

        // Handle username - clear if empty
        if ('username' in value) {
            trunk.username = value.username || '';
        }

        // Apply remaining fields
        Object.assign(trunk, value);
        await trunk.save();

        // Auto-Regenerate and Reload Asterisk
        writeAndReload().catch(err => console.error('[SIP] Auto-reload failed:', err.message));

        res.status(200).json({
            status: 'success',
            data: { trunk }
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

/**
 * DELETE /api/sip-trunks/:id
 * Delete a SIP trunk (only if no phone numbers are using it)
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const trunk = await SipTrunk.findOne({
            _id: req.params.id,
            createdBy: req.user._id
        });

        if (!trunk) {
            return res.status(404).json({ status: 'error', message: 'SIP trunk not found' });
        }

        // Check if any phone numbers are linked to this trunk
        const linkedNumbers = await PhoneNumber.countDocuments({
            sipTrunkId: trunk._id,
            createdBy: req.user._id
        });

        if (linkedNumbers > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Cannot delete: ${linkedNumbers} phone number(s) are still using this SIP trunk. Remove them first.`
            });
        }

        await SipTrunk.findByIdAndDelete(trunk._id);

        // Auto-Regenerate and Reload Asterisk
        writeAndReload().catch(err => console.error('[SIP] Auto-reload failed:', err.message));

        res.status(200).json({
            status: 'success',
            message: 'SIP trunk deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * POST /api/sip-trunks/:id/test
 * Test connectivity to a SIP trunk (basic TCP/UDP reachability)
 */
router.post('/:id/test', auth, async (req, res) => {
    try {
        const trunk = await SipTrunk.findOne({
            _id: req.params.id,
            createdBy: req.user._id
        });

        if (!trunk) {
            return res.status(404).json({ status: 'error', message: 'SIP trunk not found' });
        }

        const net = require('net');
        const dgram = require('dgram');

        const testResult = await new Promise((resolve) => {
            const timeout = 5000;

            if (trunk.transport === 'tcp' || trunk.transport === 'tls') {
                // TCP/TLS connectivity test
                const socket = new net.Socket();
                socket.setTimeout(timeout);

                socket.connect(trunk.port, trunk.host, () => {
                    socket.destroy();
                    resolve({ success: true, message: `TCP connection to ${trunk.host}:${trunk.port} successful` });
                });

                socket.on('error', (err) => {
                    socket.destroy();
                    resolve({ success: false, message: `TCP connection failed: ${err.message}` });
                });

                socket.on('timeout', () => {
                    socket.destroy();
                    resolve({ success: false, message: `TCP connection timed out after ${timeout}ms` });
                });
            } else {
                // UDP: Send a SIP OPTIONS ping.
                // The Via header must name OUR address (plus ;rport) — responses are
                // routed to the Via address, so putting the provider's host there
                // means the reply never comes back and the test always times out.
                const client = dgram.createSocket('udp4');
                let timer = null;
                const finish = (result) => {
                    if (timer) clearTimeout(timer);
                    try { client.close(); } catch (_) { }
                    resolve(result);
                };

                client.on('error', (err) => finish({ success: false, message: `UDP socket error: ${err.message}` }));

                client.on('message', () => {
                    finish({ success: true, message: `SIP OPTIONS response received from ${trunk.host}:${trunk.port}` });
                });

                // connect() pins the socket to the provider and lets us discover
                // the local IP/port the OS picked, for use in Via/Contact
                client.connect(trunk.port, trunk.host, () => {
                    let local;
                    try {
                        local = client.address();
                    } catch (_) {
                        local = { address: '0.0.0.0', port: 5060 };
                    }
                    const branch = `z9hG4bK-${Date.now()}${Math.floor(Math.random() * 1e6)}`;
                    const optionsMessage = Buffer.from(
                        `OPTIONS sip:${trunk.host}:${trunk.port} SIP/2.0\r\n` +
                        `Via: SIP/2.0/UDP ${local.address}:${local.port};branch=${branch};rport\r\n` +
                        `From: <sip:connectivity-test@${local.address}>;tag=${Date.now()}\r\n` +
                        `To: <sip:${trunk.host}:${trunk.port}>\r\n` +
                        `Call-ID: test-${Date.now()}@${local.address}\r\n` +
                        `CSeq: 1 OPTIONS\r\n` +
                        `Contact: <sip:connectivity-test@${local.address}:${local.port}>\r\n` +
                        `Max-Forwards: 70\r\n` +
                        `User-Agent: IntelliCall-Connectivity-Test\r\n` +
                        `Content-Length: 0\r\n\r\n`
                    );

                    timer = setTimeout(() => {
                        finish({ success: false, message: `No SIP OPTIONS reply after ${timeout}ms. The trunk may still work — some providers ignore unauthenticated pings. Check "Provider reachable" in the Debug panel for Asterisk's own qualify result.` });
                    }, timeout);

                    client.send(optionsMessage, (err) => {
                        if (err) finish({ success: false, message: `UDP send failed: ${err.message}` });
                    });
                });
            }
        });

        // Update test result
        trunk.lastTestedAt = new Date();
        trunk.lastTestResult = testResult.success ? 'success' : 'failed';
        await trunk.save();

        res.status(200).json({
            status: testResult.success ? 'success' : 'error',
            data: {
                reachable: testResult.success,
                message: testResult.message,
                testedAt: trunk.lastTestedAt
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * POST /api/sip-trunks/reload-config
 * Regenerate Asterisk configs from all SIP trunks and reload Asterisk
 */
router.post('/reload-config', auth, async (req, res) => {
    try {
        const { writeAndReload } = require('../services/sip/asterisk-config');
        const result = await writeAndReload();

        res.status(200).json({
            status: result.reloaded ? 'success' : 'warning',
            message: result.message,
            data: result
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * GET /api/sip-trunks/asterisk/status
 * Check Asterisk ARI connection status
 */
router.get('/asterisk/status', auth, async (req, res) => {
    const ariService = require('../services/sip/ari-service');
    const sipManager = require('../services/sip/sip-manager');

    res.status(200).json({
        status: 'success',
        data: {
            asteriskConnected: ariService.isConnected(),
            activeSipCalls: sipManager.getActiveCallCount()
        }
    });
});

/**
 * GET /api/sip-trunks/debug/logs
 * Recent SIP engine log entries (in-memory ring buffer).
 * Users see system-level events and their own call events; superadmins see all.
 * Query: sinceId (only entries newer than this id, for incremental polling)
 */
router.get('/debug/logs', auth, async (req, res) => {
    const { getLogs } = require('../services/sip/sip-log');
    const sinceId = parseInt(req.query.sinceId, 10) || 0;
    const logs = getLogs({
        userId: req.user._id,
        isSuperAdmin: !!req.user.isSuperAdmin,
        sinceId,
        limit: 200
    });
    res.status(200).json({ status: 'success', data: { logs } });
});

/**
 * GET /api/sip-trunks/debug/health
 * Structured SIP health checks scoped to the user's trunks.
 * Runs the same diagnostics users would otherwise need SSH access for,
 * but returns pass/fail results with hints instead of raw config dumps.
 */
router.get('/debug/health', auth, async (req, res) => {
    try {
        const { exec } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const ariService = require('../services/sip/ari-service');
        const sipManager = require('../services/sip/sip-manager');

        const ASTERISK_DIR = process.env.ASTERISK_CONFIG_DIR || '/etc/asterisk';
        const IC_DIR = path.join(ASTERISK_DIR, 'intellicall');

        // Run an asterisk CLI command (sudo fallback), never rejects
        const runCmd = (cmd) => new Promise((resolve) => {
            exec(cmd, { timeout: 10000 }, (err, stdout) => {
                if (!err) return resolve({ ok: true, out: stdout.trim() });
                exec(`sudo -n ${cmd}`, { timeout: 10000 }, (err2, stdout2) => {
                    if (!err2) return resolve({ ok: true, out: stdout2.trim() });
                    resolve({ ok: false, out: (err2.message || err.message || '').trim() });
                });
            });
        });

        const checks = [];
        const addCheck = (id, label, pass, detail, hint) => {
            checks.push({ id, label, status: pass === null ? 'unknown' : pass ? 'pass' : 'fail', detail, ...(pass === false && hint ? { hint } : {}) });
        };

        // 1. ARI connection
        const ariConnected = ariService.isConnected();
        addCheck(
            'ari', 'Asterisk ARI connection', ariConnected,
            ariConnected ? 'Voice engine is connected to Asterisk' : 'Backend cannot reach Asterisk ARI',
            'Ensure Asterisk is running and ARI is enabled (check ASTERISK_ARI_URL, then restart the backend).'
        );

        // 2. Config file written
        let configDetail = 'Config file not found';
        let configOk = false;
        try {
            const stat = fs.statSync(path.join(IC_DIR, 'pjsip_intellicall.conf'));
            configOk = true;
            configDetail = `pjsip_intellicall.conf written (last updated ${stat.mtime.toISOString()})`;
        } catch (_) { /* stays false */ }
        addCheck(
            'config', 'PJSIP config file', configOk, configDetail,
            'Click "Reload Asterisk" to generate the config. If it still fails, the backend lacks write permission to ' + IC_DIR + '.'
        );

        // 3. Include present in main pjsip.conf
        let includeOk = null;
        let includeDetail = 'Could not read ' + path.join(ASTERISK_DIR, 'pjsip.conf');
        try {
            const mainPjsip = fs.readFileSync(path.join(ASTERISK_DIR, 'pjsip.conf'), 'utf8');
            includeOk = mainPjsip.includes('intellicall/pjsip_intellicall.conf');
            includeDetail = includeOk
                ? 'pjsip.conf includes the generated trunk config'
                : 'pjsip.conf does not include intellicall/pjsip_intellicall.conf';
        } catch (_) { /* stays unknown */ }
        addCheck(
            'include', 'Config linked into pjsip.conf', includeOk, includeDetail,
            'Click "Reload Asterisk". If permission is denied, add this line to the top of pjsip.conf manually: #include intellicall/pjsip_intellicall.conf'
        );

        // 4. Asterisk CLI reachable (needed for the endpoint checks below)
        const cliProbe = await runCmd('asterisk -rx "core show version"');
        addCheck(
            'cli', 'Asterisk CLI access', cliProbe.ok,
            cliProbe.ok ? cliProbe.out.split('\n')[0] : 'Cannot run "asterisk -rx" from the backend',
            'The backend user needs permission to run asterisk CLI commands (run the backend as root or grant sudo without password for asterisk).'
        );

        // 5. Per-trunk: endpoint loaded + contact reachability + registration status
        const trunks = await SipTrunk.find({ createdBy: req.user._id });
        const registrations = cliProbe.ok ? await runCmd('asterisk -rx "pjsip show registrations"') : { ok: false, out: '' };
        // Contact qualify status per AOR. When a trunk's contact is "Unavail",
        // chan_pjsip refuses to place calls through it and ARI reports "Allocation failed".
        const contacts = cliProbe.ok ? await runCmd('asterisk -rx "pjsip show contacts"') : { ok: false, out: '' };
        const trunkChecks = [];
        for (const trunk of trunks) {
            const id = trunk._id.toString();
            const endpointName = `trunk-${id}`;
            let endpointLoaded = null;
            if (cliProbe.ok) {
                const ep = await runCmd(`asterisk -rx "pjsip show endpoint ${endpointName}"`);
                endpointLoaded = ep.ok && !/Unable to find object/i.test(ep.out) && ep.out.length > 0;
            }

            // Contact status: Avail (qualify OK), Unavail (qualify failing → calls
            // will fail with "Allocation failed"), NonQual (not qualified, dialable)
            let contactStatus = 'unknown';
            if (contacts.ok) {
                const line = contacts.out.split('\n').find(l => l.includes(`${endpointName}-aor/`));
                if (!line) contactStatus = 'missing';
                else if (/\bUnavail/i.test(line)) contactStatus = 'unavailable';
                else if (/\bAvail/i.test(line)) contactStatus = 'available';
                else if (/\bNonQual/i.test(line)) contactStatus = 'not_qualified';
            }

            // Registration only applies to trunks with credentials
            let registration = 'not_applicable';
            if (trunk.username) {
                if (registrations.ok) {
                    const line = registrations.out.split('\n').find(l => l.includes(`${endpointName}-reg`));
                    if (!line) registration = 'missing';
                    else if (/Registered/i.test(line)) registration = 'registered';
                    else if (/Rejected|Failed/i.test(line)) registration = 'failed';
                    else registration = 'pending';
                } else {
                    registration = 'unknown';
                }
            }

            trunkChecks.push({
                trunkId: id,
                name: trunk.name,
                host: trunk.host,
                transport: trunk.transport || 'udp',
                endpointName,
                endpointLoaded,
                contactStatus,
                registration
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                checks,
                trunks: trunkChecks,
                activeSipCalls: sipManager.getActiveCallCount(),
                checkedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * GET /api/sip-trunks/asterisk/diagnostics
 * Full SIP engine diagnostic — checks configs, includes, endpoints, and Asterisk state
 */
router.get('/asterisk/diagnostics', auth, async (req, res) => {
    if (!req.user.isSuperAdmin) {
        return res.status(403).json({ status: 'error', message: 'Only superadmins can view diagnostics' });
    }
    const { exec } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const ariService = require('../services/sip/ari-service');

    const ASTERISK_DIR = process.env.ASTERISK_CONFIG_DIR || '/etc/asterisk';
    const IC_DIR = path.join(ASTERISK_DIR, 'intellicall');
    const diag = {};

    // 1. ARI Connection
    diag.ariConnected = ariService.isConnected();

    // 2. Config files exist?
    const configFiles = ['pjsip_intellicall.conf', 'extensions_intellicall.conf', 'ari_intellicall.conf', 'http_intellicall.conf'];
    diag.configFiles = {};
    for (const f of configFiles) {
        const fp = path.join(IC_DIR, f);
        try {
            const stat = fs.statSync(fp);
            diag.configFiles[f] = { exists: true, size: stat.size, modified: stat.mtime };
        } catch (_) {
            diag.configFiles[f] = { exists: false };
        }
    }

    // 3. Peek at pjsip config content (first 500 chars)
    try {
        const pjsipContent = fs.readFileSync(path.join(IC_DIR, 'pjsip_intellicall.conf'), 'utf8');
        diag.pjsipConfigPreview = pjsipContent.substring(0, 500);
    } catch (_) {
        diag.pjsipConfigPreview = 'Could not read file';
    }

    // 4. #include in main pjsip.conf?
    try {
        const mainPjsip = fs.readFileSync(path.join(ASTERISK_DIR, 'pjsip.conf'), 'utf8');
        diag.pjsipIncluded = mainPjsip.includes('intellicall/pjsip_intellicall.conf');
        diag.mainPjsipPreview = mainPjsip.substring(0, 300);
    } catch (e) {
        diag.pjsipIncluded = false;
        diag.mainPjsipError = e.message;
    }

    // 5. Asterisk CLI commands
    const runCmd = (cmd) => new Promise((resolve) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                exec(`sudo ${cmd}`, (err2, stdout2) => {
                    resolve(err2 ? `ERROR: ${err2.message}` : stdout2.trim());
                });
            } else {
                resolve(stdout.trim());
            }
        });
    });

    diag.asteriskEndpoints = await runCmd('asterisk -rx "pjsip show endpoints"');
    diag.asteriskTransports = await runCmd('asterisk -rx "pjsip show transports"');
    diag.asteriskRegistrations = await runCmd('asterisk -rx "pjsip show registrations"');
    diag.asteriskAors = await runCmd('asterisk -rx "pjsip show aors"');
    diag.asteriskAuths = await runCmd('asterisk -rx "pjsip show auths"');
    diag.asteriskIdentifies = await runCmd('asterisk -rx "pjsip show identifies"');

    // Try to show specific endpoint details - this will reveal loading errors
    const trunks = await SipTrunk.find({ status: 'active' });
    if (trunks.length > 0) {
        const trunkId = trunks[0]._id.toString();
        diag.specificEndpoint = await runCmd(`asterisk -rx "pjsip show endpoint trunk-${trunkId}"`);
    }

    diag.asteriskModules = await runCmd('asterisk -rx "module show like pjsip"');

    // 6. DB trunk count
    diag.dbTrunkCount = await SipTrunk.countDocuments({ status: 'active' });

    // 7. Full PJSIP config file content (for debugging)
    try {
        diag.fullPjsipConfig = fs.readFileSync(path.join(IC_DIR, 'pjsip_intellicall.conf'), 'utf8');
    } catch (_) {
        diag.fullPjsipConfig = 'Could not read file';
    }

    res.status(200).json({ status: 'success', data: diag });
});

module.exports = router;
