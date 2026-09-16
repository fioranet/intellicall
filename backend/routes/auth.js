const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

const {
    getAuthUrl,
    getTokens,
    unavailableReason: googleSheetsUnavailableReason
} = require('../utils/googleSheets');
const {
    getAuthUrl: getCalendarAuthUrl,
    getTokens: getCalendarTokens,
    getUserEmail: getCalendarUserEmail,
    unavailableReason: googleCalendarUnavailableReason
} = require('../utils/googleCalendar');
const {
    getAuthUrl: getHubspotAuthUrl,
    exchangeCode: exchangeHubspotCode,
    getTokenInfo: getHubspotTokenInfo,
    getRedirectUri: getHubspotRedirectUri,
    generatePkcePair: generateHubspotPkcePair,
    isAvailable: isHubspotAvailable
} = require('../utils/hubspot');
const {
    getAuthUrl: getSlackAuthUrl,
    exchangeCode: exchangeSlackCode,
    getRedirectUri: getSlackRedirectUri,
    isAvailable: isSlackProviderAvailable
} = require('../utils/slack');
const Settings = require('../models/Settings');
const { callbackUrl } = require('../utils/public-url');

/** Log line for a Google credential problem, aimed at whoever installed this. */
function describeGoogleCredentialProblem(problem) {
    if (problem === 'invalid_client_id') {
        return 'The configured Google client ID is not a Google OAuth client ID — it must end in '
            + '".apps.googleusercontent.com". Check Admin → Integrations → Google, or GOOGLE_CLIENT_ID '
            + 'in backend/.env. Sending it to Google as-is returns "Error 401: invalid_client".';
    }
    return 'Google OAuth is not configured. Set the client ID and secret in Admin → Integrations → Google, '
        + 'or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in backend/.env.';
}

// Google Auth Route (Login)
router.get('/google', (req, res, next) => {
    console.log('Initiating Google Auth request...');
    next();
}, passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
}));

// Google Auth Callback (Login)
router.get('/google/callback',
    (req, res, next) => {
        console.log('Received Google Auth Callback...');
        next();
    },
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    (req, res) => {
        console.log('Google Auth Successful. User:', req.user.email);

        // Generate JWT Token
        const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, {
            expiresIn: '30d' // or match your existing expiration
        });
        console.log('JWT Token generated successfully.');

        // Redirect to frontend with token
        const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
        const redirectUrl = `${CLIENT_URL}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        }))}`;

        console.log('Redirecting to frontend:', CLIENT_URL);
        res.redirect(redirectUrl);
    }
);

// Google Sheets OAuth Initiation
router.get('/google-sheets', async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).send('userId is required');
    }

    const sheetsProblem = await googleSheetsUnavailableReason();
    if (sheetsProblem) {
        console.error(`[GoogleSheets] ${describeGoogleCredentialProblem(sheetsProblem)}`);
        const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
        return res.redirect(`${CLIENT_URL}/settings?google_sheets=${sheetsProblem}`);
    }

    // Dynamically construct redirect URI based on current request host
    const redirectUri = callbackUrl(req, 'google-sheets');

    const url = await getAuthUrl(userId, redirectUri);
    res.redirect(url);
});

// Google Sheets OAuth Callback
router.get('/google-sheets/callback', async (req, res) => {
    const { code, state: userId } = req.query;
    try {
        const redirectUri = callbackUrl(req, 'google-sheets');

        const tokens = await getTokens(code, redirectUri);

        // Save tokens to user settings
        await Settings.findOneAndUpdate(
            { userId },
            {
                googleSheetsAccessToken: tokens.access_token,
                googleSheetsRefreshToken: tokens.refresh_token,
                googleSheetsConnected: true
            },
            { upsert: true }
        );

        const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
        res.redirect(`${CLIENT_URL}/settings?google_sheets=connected`);
    } catch (err) {
        console.error('Google Sheets OAuth Error:', err);
        const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
        res.redirect(`${CLIENT_URL}/settings?google_sheets=error`);
    }
});

// Google Calendar OAuth Initiation
router.get('/google-calendar', async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).send('userId is required');
    }
    const calendarProblem = await googleCalendarUnavailableReason();
    if (calendarProblem) {
        console.error(`[GoogleCalendar] ${describeGoogleCredentialProblem(calendarProblem)}`);
        const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
        return res.redirect(`${CLIENT_URL}/settings?google_calendar=${calendarProblem}`);
    }

    const redirectUri = callbackUrl(req, 'google-calendar');
    const url = await getCalendarAuthUrl(userId, redirectUri);
    res.redirect(url);
});

// Google Calendar OAuth Callback
router.get('/google-calendar/callback', async (req, res) => {
    const { code, state: userId } = req.query;
    const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
    try {
        const redirectUri = callbackUrl(req, 'google-calendar');

        const tokens = await getCalendarTokens(code, redirectUri);
        let email = '';
        try {
            email = await getCalendarUserEmail(tokens.access_token, tokens.refresh_token);
        } catch (e) {
            console.warn('[GoogleCalendar] userinfo fetch failed:', e.message);
        }

        const update = {
            googleCalendarAccessToken: tokens.access_token,
            googleCalendarConnected: true,
            googleCalendarEmail: email,
            googleCalendarId: 'primary'
        };
        if (tokens.refresh_token) {
            update.googleCalendarRefreshToken = tokens.refresh_token;
        }

        await Settings.findOneAndUpdate(
            { userId },
            update,
            { upsert: true }
        );

        res.redirect(`${CLIENT_URL}/settings?google_calendar=connected`);
    } catch (err) {
        console.error('Google Calendar OAuth Error:', err);
        res.redirect(`${CLIENT_URL}/settings?google_calendar=error`);
    }
});

// HubSpot OAuth Initiation
router.get('/hubspot', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).send('userId is required');
    if (!(await isHubspotAvailable())) {
        return res.status(500).send('HubSpot integration not configured on this server.');
    }
    const redirectUri = await getHubspotRedirectUri(req);
    // Logged so an admin hitting "redirect URL doesn't match" can see the exact
    // string that must be registered on the HubSpot app's Auth tab.
    console.log('[HubSpot] Using redirect_uri:', redirectUri);

    // HubSpot enforces PKCE on some apps (newer public apps default to it) and
    // rejects the request with "code challenge parameter is missing" without
    // this. code_verifier has to survive the redirect round-trip, so it's
    // stashed on the user's Settings row and read back in the callback below.
    const { codeVerifier, codeChallenge } = generateHubspotPkcePair();
    await Settings.findOneAndUpdate(
        { userId },
        { hubspotPkceVerifier: codeVerifier },
        { upsert: true }
    );

    res.redirect(await getHubspotAuthUrl(userId, redirectUri, codeChallenge));
});

// HubSpot OAuth Callback
router.get('/hubspot/callback', async (req, res) => {
    const { code, state: userId } = req.query;
    const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
    try {
        const redirectUri = await getHubspotRedirectUri(req);
        const pending = await Settings.findOne({ userId }).select('hubspotPkceVerifier').lean();
        const tokens = await exchangeHubspotCode(code, redirectUri, pending?.hubspotPkceVerifier);

        let hubInfo = {};
        try {
            const info = await getHubspotTokenInfo(tokens.access_token);
            hubInfo = { hubId: info.hub_id, hubDomain: info.hub_domain };
        } catch (e) {
            console.warn('[HubSpot] token-info fetch failed:', e.message);
        }

        await Settings.findOneAndUpdate(
            { userId },
            {
                hubspotAccessToken: tokens.access_token,
                hubspotRefreshToken: tokens.refresh_token,
                hubspotExpiresAt: new Date(Date.now() + (tokens.expires_in || 0) * 1000),
                hubspotHubId: hubInfo.hubId || null,
                hubspotHubDomain: hubInfo.hubDomain || '',
                hubspotConnected: true,
                hubspotPkceVerifier: ''
            },
            { upsert: true }
        );

        res.redirect(`${CLIENT_URL}/settings?hubspot=connected`);
    } catch (err) {
        console.error('HubSpot OAuth Error:', err.response?.data || err.message);
        res.redirect(`${CLIENT_URL}/settings?hubspot=error`);
    }
});

// Slack OAuth Initiation
router.get('/slack', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).send('userId is required');
    if (!(await isSlackProviderAvailable())) {
        return res.status(500).send('Slack integration not configured on this server.');
    }
    const redirectUri = await getSlackRedirectUri(req);
    res.redirect(await getSlackAuthUrl(userId, redirectUri));
});

// Slack OAuth Callback
router.get('/slack/callback', async (req, res) => {
    const { code, state: userId } = req.query;
    const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
    try {
        const redirectUri = await getSlackRedirectUri(req);
        const data = await exchangeSlackCode(code, redirectUri);

        // Slack returns the incoming_webhook block when scope=incoming-webhook
        const webhook = data.incoming_webhook || {};
        const team = data.team || {};
        // Slack sometimes returns channel names already prefixed with '#'.
        // Normalize on save so UI/logs can prepend '#' without doubling up.
        const rawChannel = webhook.channel || '';
        const channelName = rawChannel.replace(/^#+/, '');

        await Settings.findOneAndUpdate(
            { userId },
            {
                slackAccessToken: data.access_token || '',
                slackTeamId: team.id || '',
                slackTeamName: team.name || '',
                slackChannelId: webhook.channel_id || '',
                slackChannelName: channelName,
                slackWebhookUrl: webhook.url || '',
                slackConnected: !!webhook.url
            },
            { upsert: true }
        );

        res.redirect(`${CLIENT_URL}/settings?slack=connected`);
    } catch (err) {
        console.error('Slack OAuth Error:', err.slack || err.response?.data || err.message);
        res.redirect(`${CLIENT_URL}/settings?slack=error`);
    }
});

module.exports = router;
