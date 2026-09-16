const { google } = require('googleapis');
const { getCreds, credentialProblem } = require('./google-creds');

const defaultRedirectUri = () =>
    process.env.GOOGLE_CALENDAR_CALLBACK_URL
    || `${process.env.BASE_URL || 'http://localhost:5001'}/api/auth/google-calendar/callback`;

const getOAuthClient = async (redirectUri) => {
    const { clientId, clientSecret } = await getCreds();
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri || defaultRedirectUri());
};

const SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email'
];

/**
 * '' when the server can start a Google OAuth flow, otherwise the reason.
 * Without this check we would redirect the user to Google with an empty,
 * placeholder or malformed client_id, and Google answers on its own domain
 * with a bare "Error 401: invalid_client".
 */
const unavailableReason = async () => credentialProblem(await getCreds());

const isAvailable = async () => !(await unavailableReason());

const getAuthUrl = async (userId, redirectUri) => {
    const client = await getOAuthClient(redirectUri);
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: userId,
        prompt: 'consent'
    });
};

const getTokens = async (code, redirectUri) => {
    const client = await getOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    return tokens;
};

const authorizedClient = async (accessToken, refreshToken) => {
    const { clientId, clientSecret } = await getCreds();
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    return auth;
};

const getCalendarClient = async (accessToken, refreshToken) => {
    return google.calendar({ version: 'v3', auth: await authorizedClient(accessToken, refreshToken) });
};

const getUserEmail = async (accessToken, refreshToken) => {
    const oauth2 = google.oauth2({ version: 'v2', auth: await authorizedClient(accessToken, refreshToken) });
    const { data } = await oauth2.userinfo.get();
    return data.email || '';
};

module.exports = {
    isAvailable,
    unavailableReason,
    getAuthUrl,
    getTokens,
    getCalendarClient,
    getUserEmail
};
