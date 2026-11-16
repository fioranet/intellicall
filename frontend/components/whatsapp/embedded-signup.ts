/**
 * Meta's Embedded Signup: the popup where a business picks or creates its
 * WhatsApp Business Account and number, and grants the platform's Meta app
 * access.
 *
 * Two things come back, separately: the session info (the WABA and number
 * ids) as a `message` event from facebook.com, and an exchangeable code in
 * FB.login's callback. Both are needed, and the code lives 30 seconds, so the
 * promise resolves as soon as it has both and the caller sends them straight
 * to POST /whatsapp/embedded-signup.
 */

declare global {
    interface Window {
        FB?: {
            init: (opts: Record<string, unknown>) => void;
            login: (cb: (res: { authResponse?: { code?: string } | null; status?: string }) => void, opts: Record<string, unknown>) => void;
        };
        fbAsyncInit?: () => void;
    }
}

export interface SignupResult {
    code: string;
    wabaId: string;
    phoneNumberId: string;
    coexistence: boolean;
}

/** Keys under `signup.*` in messages/<locale>/whatsapp.json. */
export type SignupKey = "cancelledAt" | "cancelled" | "sdkFailed" | "noAnswer" | "noNumber" | "onlyWaba" | "metaError" | "metaErrorUnknown" | "noSession";

/**
 * A sign-up that went wrong, as a message key so the page can say it in the
 * reader's language: t(`signup.${err.key}`, err.values).
 */
export class SignupError extends Error {
    constructor(readonly key: SignupKey, readonly values?: Record<string, string>) {
        super(`whatsapp signup: ${key}`);
    }
}

export class SignupCancelled extends SignupError {
    constructor(readonly step: string | null) {
        super(step ? "cancelledAt" : "cancelled", step ? { step: step.toLowerCase().replace(/_/g, " ") } : undefined);
    }
}

let sdk: Promise<void> | null = null;

/** Load Facebook's JavaScript SDK once and initialise it with the platform's app. */
function loadSdk(appId: string, version: string): Promise<void> {
    if (sdk) return sdk;
    sdk = new Promise<void>((resolve, reject) => {
        if (window.FB) {
            window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
            return resolve();
        }
        window.fbAsyncInit = () => {
            window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
            resolve();
        };
        const s = document.createElement("script");
        s.src = "https://connect.facebook.net/en_US/sdk.js";
        s.async = true;
        s.defer = true;
        s.crossOrigin = "anonymous";
        s.onerror = () => { sdk = null; reject(new SignupError("sdkFailed")); };
        document.body.appendChild(s);
    });
    return sdk;
}

/**
 * Load the SDK ahead of the click. FB.login opens a popup, and a browser only
 * allows one opened straight from a click: if the SDK were still downloading
 * when the button was pressed, the popup would be blocked without a word.
 */
export function preloadEmbeddedSignup(cfg: { appId: string; graphVersion: string }): void {
    loadSdk(cfg.appId, cfg.graphVersion).catch(() => undefined);
}

/** How long to wait for any answer from the popup before giving up. */
const NO_ANSWER_MS = 10 * 60_000;

/**
 * Open the popup and wait for the business to finish.
 *
 * `coexistence` onboards a number that stays on the WhatsApp Business app.
 * Must be called from a click: browsers block popups opened any other way,
 * so the SDK should already be loaded with preloadEmbeddedSignup.
 */
export async function runEmbeddedSignup(cfg: { appId: string; configId: string; graphVersion: string }, coexistence = false): Promise<SignupResult> {
    if (!window.FB) await loadSdk(cfg.appId, cfg.graphVersion);
    return new Promise<SignupResult>((resolve, reject) => {
        let session: { wabaId: string; phoneNumberId: string; coexistence: boolean } | null = null;
        let code: string | null = null;
        let done = false;

        // A blocked or abandoned popup never calls back; stop waiting eventually.
        const giveUp = setTimeout(() => fail(new SignupError("noAnswer")), NO_ANSWER_MS);
        const finish = () => {
            if (done || !session || !code) return;
            done = true;
            clearTimeout(giveUp);
            window.removeEventListener("message", onMessage);
            resolve({ code, ...session });
        };
        const fail = (err: Error) => {
            if (done) return;
            done = true;
            clearTimeout(giveUp);
            window.removeEventListener("message", onMessage);
            reject(err);
        };

        function onMessage(event: MessageEvent) {
            if (!event.origin.endsWith("facebook.com")) return;
            let data: { type?: string; event?: string; data?: Record<string, string> };
            try {
                data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
            } catch {
                return;
            }
            if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
            const ev = String(data.event ?? "");
            if (ev === "FINISH" || ev === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
                const d = data.data ?? {};
                if (!d.waba_id || !d.phone_number_id) return fail(new SignupError("noNumber"));
                session = { wabaId: d.waba_id, phoneNumberId: d.phone_number_id, coexistence: ev === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" };
                finish();
            } else if (ev === "FINISH_ONLY_WABA") {
                fail(new SignupError("onlyWaba"));
            } else if (ev === "CANCEL") {
                const d = data.data ?? {};
                fail(d.error_message ? new SignupError("metaError", { message: d.error_message }) : new SignupCancelled(d.current_step ?? null));
            } else if (ev === "ERROR") {
                fail(data.data?.error_message ? new SignupError("metaError", { message: data.data.error_message }) : new SignupError("metaErrorUnknown"));
            }
        }
        window.addEventListener("message", onMessage);

        window.FB!.login((res) => {
            if (res.authResponse?.code) {
                code = res.authResponse.code;
                finish();
                // The session info normally arrives first; give it a moment if not.
                setTimeout(() => { if (!done && !session) fail(new SignupError("noSession")); }, 8000);
            } else {
                fail(new SignupCancelled(null));
            }
        }, {
            config_id: cfg.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: {
                setup: {},
                ...(coexistence ? { featureType: "whatsapp_business_app_onboarding" } : {}),
            },
        });
    });
}
