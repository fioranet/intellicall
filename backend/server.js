require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// Trust proxy for correct protocol detection (SSL/ngrok)
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: false }));
app.use('/uploads', express.static('uploads'));
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/users', require('./routes/users'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/knowledge-base', require('./routes/knowledge-base'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/twilio', require('./routes/twilio'));
app.use('/twilio', require('./routes/twilio')); // Alias for easier Twilio webhook configuration
app.use('/api/call-logs', require('./routes/call-logs'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/admin', require('./routes/superadmin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/numbers', require('./routes/numbers'));
app.use('/api/sip-trunks', require('./routes/sip-trunks'));
app.use('/api/support', require('./routes/support'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/mcp-servers', require('./routes/mcp-servers'));
app.use('/api/mcp-oauth', require('./routes/mcp-oauth'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
const passport = require('passport');
require('./config/passport');
app.use(passport.initialize());

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Server is healthy',
        timestamp: new Date().toISOString()
    });
});

// Database — connect before accepting HTTP traffic (avoids Mongoose buffering / misleading 401s)
const MONGODB_URI = process.env.MONGODB_URI;

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Server Start
const PORT = process.env.PORT || 5001;
const server = http.createServer(app);

// WebSocket Setup
//
// Two upgrade paths share this server:
//
//   /api/agent-test  — the in-browser agent test. Authenticated with a short-lived
//                      ticket (utils/voice-test-token.js) verified BEFORE the upgrade
//                      completes, because a browser cannot send an Authorization
//                      header on a WebSocket handshake.
//   everything else  — unchanged: Twilio Media Streams point at the bare origin, and
//                      the dashboard opens a socket there to receive SIP events.
//
// The path lives under /api/ so it reaches the backend through the proxy rules that
// already exist for the REST API, on both the split-subdomain and same-origin
// deployments. A top-level path would be proxied to the frontend on same-origin installs.
const AGENT_TEST_PATH = '/api/agent-test';
//   /api/meetings/stream — a meeting bot's audio socket (meetings/session.js), authenticated
//                      with the per-meeting token in its URL, which survives the bot's reconnects.
const { MEETING_STREAM_PATH } = require('./routes/meetings');
const { readMeetingToken } = require('./meetings/token');
const { acceptMeetingSocket } = require('./meetings/session');

const wss = new WebSocket.Server({ noServer: true });
const { handleVoiceStream } = require('./services/voice-stream');
const { verifyVoiceTestToken } = require('./utils/voice-test-token');

server.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    let query = null;
    try {
        const parsed = new URL(req.url, 'http://placeholder');
        pathname = parsed.pathname;
        query = parsed.searchParams;
    } catch (_) { /* keep defaults; falls through to the legacy handler */ }

    if (pathname === AGENT_TEST_PATH) {
        const ticket = verifyVoiceTestToken(query?.get('ticket'));
        if (!ticket) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            ws.isAgentTest = true; // keep SIP event broadcasts out of an audio socket
            console.log(`🎧 [AgentTest] Browser test session for agent ${ticket.agentId}`);
            handleVoiceStream(ws, req, {
                transport: 'browser',
                userId: ticket.userId,
                agentId: ticket.agentId,
                leadId: ticket.leadId,
            });
        });
        return;
    }

    if (pathname === MEETING_STREAM_PATH) {
        const grant = readMeetingToken(query?.get('token'));
        if (!grant) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            ws.isAgentTest = true; // keep SIP event broadcasts out of an audio socket
            console.log(`🎥 [Meeting] Bot socket for ${grant.callId}`);
            acceptMeetingSocket(ws, grant).catch((err) => {
                console.error(`[Meeting] accept failed for ${grant.callId}:`, err.message);
                try { ws.close(4503, 'unavailable'); } catch (_) { /* gone */ }
            });
        });
        return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
        console.log('🔌 New WebSocket connection');
        handleVoiceStream(ws, req);
    });
});

// Asterisk ARI (SIP Trunk support) — fails gracefully if Asterisk is not running
const ariService = require('./services/sip/ari-service');
ariService.initialize().catch(() => { });

// Wire SIP real-time events to WebSocket clients
const sipManager = require('./services/sip/sip-manager');
sipManager.setWsBroadcast((message) => {
    wss.clients.forEach((client) => {
        // Never into an agent-test socket: it carries audio frames, and a stray
        // JSON event there would be parsed as one.
        if (client.readyState === WebSocket.OPEN && !client.isAgentTest) {
            client.send(message);
        }
    });
});

async function startServer() {
    if (!MONGODB_URI || !String(MONGODB_URI).trim()) {
        console.error('❌ MONGODB_URI is not set. Add it to backend/.env (e.g. mongodb://127.0.0.1:27017/intellicall or your Atlas URI).');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        console.error('   Start MongoDB or point MONGODB_URI at a reachable host.');
        process.exit(1);
    }

    const dbName = mongoose.connection.name;
    console.log(`✅ Connected to MongoDB successfully (database: ${dbName})`);
    // A URI without a database path silently falls back to "test". If the
    // process env and backend/.env ever disagree (dotenv never overrides an
    // existing env var), a restart can land on an empty database.
    if (dbName === 'test') {
        console.warn('⚠️ MONGODB_URI has no database name, so MongoDB is using "test". If your data seems missing, add the database name (e.g. mongodb://127.0.0.1:27017/intellicall-ai) to backend/.env and restart.');
    }

    try {
        const { writeAndReload } = require('./services/sip/asterisk-config');
        const result = await writeAndReload();
        console.log(`[SIP Config Sync] ${result.message}`);
    } catch (err) {
        console.warn('⚠️ Startup SIP sync failed:', err.message);
    }

    const campaignScheduler = require('./services/campaign-scheduler');
    campaignScheduler.start();

    const appointmentReminderService = require('./services/appointment-reminder-service');
    appointmentReminderService.start();

    // Sweep stale/orphaned SIP and Twilio call logs stuck in a non-terminal status so
    // ended calls don't show "In Conversation" forever (and crash-orphaned rows recover).
    const { startCallLogReconcileSchedulers } = require('./services/call-log-reconcile');
    startCallLogReconcileSchedulers();

    // WhatsApp: scheduled sends, idle chats, number health, and webhook events left over from a restart.
    require('./services/whatsapp/scheduler').start();
    require('./services/whatsapp/migrate-legacy').migrateLegacyWhatsApp()
        .catch((err) => console.error('[WhatsApp] legacy import failed:', err.message));

    server.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });
}

startServer();
