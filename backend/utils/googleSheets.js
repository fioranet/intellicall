const { google } = require('googleapis');
const { getCreds, credentialProblem } = require('./google-creds');

const defaultRedirectUri = () =>
    process.env.GOOGLE_SHEETS_CALLBACK_URL
    || `${process.env.BASE_URL || 'http://localhost:5001'}/api/auth/google-sheets/callback`;

const getOAuthClient = async (redirectUri) => {
    const { clientId, clientSecret } = await getCreds();
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri || defaultRedirectUri());
};

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
];

/** See utils/googleCalendar.js — same credentials, same failure mode. */
const unavailableReason = async () => credentialProblem(await getCreds());

const isAvailable = async () => !(await unavailableReason());

const getAuthUrl = async (userId, redirectUri) => {
    const client = await getOAuthClient(redirectUri);
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: userId,
        prompt: 'consent' // Force refresh token
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

const getSheetsClient = async (accessToken, refreshToken) => {
    return google.sheets({ version: 'v4', auth: await authorizedClient(accessToken, refreshToken) });
};

const getDriveClient = async (accessToken, refreshToken) => {
    return google.drive({ version: 'v3', auth: await authorizedClient(accessToken, refreshToken) });
};

module.exports = {
    isAvailable,
    unavailableReason,
    getAuthUrl,
    getTokens,
    getSheetsClient,
    getDriveClient
};
