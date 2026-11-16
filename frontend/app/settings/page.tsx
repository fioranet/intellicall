"use client";

import { useTranslations, useLocale } from "next-intl";
import { LOCALES } from "@/i18n/config";
import { setLocaleCookie, applyDocumentDir } from "@/lib/locale-client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import dynamic from 'next/dynamic';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    CheckboxCard,
    CheckboxCards,
    CopyField,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Field,
    Input,
    PageHeader,
    Progress,
    Section,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Skeleton,
    Spinner,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    toast,
} from "@wixzel/react";
import axios from "axios";
import { Clock, Globe, Phone, Lock, HardDrives, Pulse, Gear, ShoppingBag, Key, WebhooksLogo, CaretDown, Envelope, Translate, Lightning, Check, CreditCard, ChartBar, ArrowsClockwise } from "@phosphor-icons/react";
import Link from "next/link";
import Image from "next/image";

import { useSettings } from "@/components/settings-provider";
import { SettingRow, SettingRows } from "@/components/settings/setting-row";
import { getCurrencySymbol } from "@/lib/currency-symbols";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

// Event ids only — labels and descriptions come from messages/<locale>/settings.json
// under `events`, shared by the webhook grid, the email grid, and both test menus.
const WEBHOOK_EVENT_IDS = [
    "inboundCall", "outboundCall", "callCompleted", "leadCreated",
    "leadQualified", "campaignCompleted", "appointmentBooked", "appointmentCanceled",
    "callTransferred", "transferFailed",
] as const;

const EMAIL_EVENT_IDS = [
    "appointmentBooked", "appointmentCanceled", "leadCreated",
    "leadQualified", "inboundCall", "callCompleted",
] as const;

// The events each "Send test" menu offers, in menu order.
const WEBHOOK_TEST_EVENT_IDS = [
    "inboundCall", "outboundCall", "callCompleted", "leadCreated",
    "leadQualified", "campaignCompleted", "appointmentBooked", "appointmentCanceled",
] as const;

const EMAIL_TEST_EVENT_IDS = EMAIL_EVENT_IDS;

// Common IANA timezones for appointment and display (user can set any valid IANA string via API)
const COMMON_TIMEZONES = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "America/Vancouver",
    "America/Phoenix",
    "America/Anchorage",
    "America/Halifax",
    "America/St_Johns",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Amsterdam",
    "Europe/Brussels",
    "Europe/Madrid",
    "Europe/Rome",
    "Europe/Moscow",
    "Europe/Istanbul",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Karachi",
    "Asia/Dhaka",
    "Asia/Singapore",
    "Asia/Hong_Kong",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Australia/Perth",
    "Pacific/Auckland",
    "Pacific/Fiji",
    "Africa/Johannesburg",
    "Africa/Cairo",
    "Africa/Lagos",
];

function SettingsPageContent() {
    const t = useTranslations("settings");
    const locale = useLocale();
    const c = useTranslations("common");

    /** Flip the UI language: cookie + direction first, then refresh, then persist. */
    const handleLocaleChange = (next: string) => {
        if (next === locale) return;
        setLocaleCookie(next);
        applyDocumentDir(next);
        router.refresh();
        const token = localStorage.getItem("token");
        if (token) {
            axios.patch(`${API_BASE_URL}/settings/ui-language`, { uiLanguage: next }, {
                headers: { Authorization: `Bearer ${token}` }
            }).catch(() => { });
        }
    };
    const router = useRouter();
    const searchParams = useSearchParams();
    const { refreshSettings, branding } = useSettings();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [hasPassword, setHasPassword] = useState(true);
    const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
    const [savingPassword, setSavingPassword] = useState(false);
    const [plans, setPlans] = useState<any[]>([]);
    const [currency, setCurrency] = useState("$");
    const [currencyCode, setCurrencyCode] = useState("USD");
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [enabledGateways, setEnabledGateways] = useState<any>({
        stripe: false,
        stripeTestMode: true,
        paypal: false,
        paypalTestMode: true,
        paypalClientId: "",
        dodopayments: false,
        dodopaymentsTestMode: true,
        razorpay: false,
        razorpayTestMode: true,
        razorpayKeyId: ""
    });
    const [loadingGateways, setLoadingGateways] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [usage, setUsage] = useState<any>(null);
    const [loadingUsage, setLoadingUsage] = useState(false);
    const [asteriskStatus, setAsteriskStatus] = useState<{
        asteriskConnected: boolean;
        activeSipCalls: number;
    } | null>(null);

    const [apiKeys, setApiKeys] = useState({
        twilioSid: "",
        twilioToken: "",
        openRouterKey: "",
        elevenLabsKey: "",
        deepgramKey: "",
        sarvamKey: "",
        geminiKey: "",
    });

    const [systemSettings, setSystemSettings] = useState({
        recordingEnabled: true,
        autoAnalysisEnabled: false,
        timeFormat: "12",
        timeZone: "UTC",
        autoHangupEnabled: false,
        incomingHangupLimit: 10,
        outgoingHangupLimit: 10,
    });

    const [verifyingElevenLabs, setVerifyingElevenLabs] = useState(false);
    const [elevenLabsKeyError, setElevenLabsKeyError] = useState<string | null>(null);

    const verifyElevenLabsKey = async (key: string) => {
        if (!key) {
            setElevenLabsKeyError(null);
            return;
        }
        try {
            setVerifyingElevenLabs(true);
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/settings/elevenlabs/verify`, {
                elevenLabsKey: key
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setElevenLabsKeyError(null);
        } catch (err: any) {
            setElevenLabsKeyError(err.response?.data?.message || "Incorrect API Key");
        } finally {
            setVerifyingElevenLabs(false);
        }
    };

    useEffect(() => {
        if (!apiKeys.elevenLabsKey) {
            setElevenLabsKeyError(null);
            return;
        }
        const timeoutId = setTimeout(() => {
            verifyElevenLabsKey(apiKeys.elevenLabsKey);
        }, 800);
        return () => clearTimeout(timeoutId);
    }, [apiKeys.elevenLabsKey]);

    const [webhookSettings, setWebhookSettings] = useState({
        url: "",
        secret: "whsec_ae12...8f9c",
        enabled: false,
        events: {
            inboundCall: true,
            outboundCall: true,
            callCompleted: true,
            leadCreated: true,
            leadQualified: true,
            campaignCompleted: true,
            appointmentBooked: true,
            appointmentCanceled: true,
            callTransferred: true,
            transferFailed: true
        }
    });

    const [emailSettings, setEmailSettings] = useState({
        enabled: false,
        brevoKey: "",
        senderEmail: "",
        senderName: "",
        recipientEmail: "",
        events: {
            inboundCall: true,
            outboundCall: true,
            callCompleted: true,
            leadCreated: true,
            leadQualified: true,
            campaignCompleted: true,
            appointmentBooked: true,
            appointmentCanceled: true
        }
    });

    const fetchData = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const [settingsRes, userRes, plansRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/settings`, { headers: { 'Authorization': `Bearer ${token}` } }),
                axios.get(`${API_BASE_URL}/users/me`, { headers: { 'Authorization': `Bearer ${token}` } }),
                axios.get(`${API_BASE_URL}/plans`)
            ]);

            if (settingsRes.data?.status === "success") {
                const settings = settingsRes.data.data.settings;
                if (settings) {
                    setApiKeys({
                        twilioSid: settings.twilioSid || "",
                        twilioToken: settings.twilioToken || "",
                        openRouterKey: settings.openRouterKey || "",
                        elevenLabsKey: settings.elevenLabsKey || "",
                        deepgramKey: settings.deepgramKey || "",
                        sarvamKey: settings.sarvamKey || "",
                        geminiKey: settings.geminiKey || "",
                    });
                    setSystemSettings({
                        recordingEnabled: settings.recordingEnabled ?? true,
                        autoAnalysisEnabled: settings.autoAnalysisEnabled ?? false,
                        timeFormat: settings.timeFormat || "12",
                        timeZone: settings.timeZone || "UTC",
                        autoHangupEnabled: settings.autoHangupEnabled ?? false,
                        incomingHangupLimit: settings.incomingHangupLimit ?? 10,
                        outgoingHangupLimit: settings.outgoingHangupLimit ?? 10,
                    });
                    if (settings.webhooks) {
                        setWebhookSettings({
                            url: settings.webhooks.url || "",
                            secret: settings.webhooks.secret || "",
                            enabled: settings.webhooks.enabled || false,
                            events: {
                                inboundCall: settings.webhooks.events?.inboundCall ?? true,
                                outboundCall: settings.webhooks.events?.outboundCall ?? true,
                                callCompleted: settings.webhooks.events?.callCompleted ?? true,
                                leadCreated: settings.webhooks.events?.leadCreated ?? true,
                                leadQualified: settings.webhooks.events?.leadQualified ?? true,
                                campaignCompleted: settings.webhooks.events?.campaignCompleted ?? true,
                                appointmentBooked: settings.webhooks.events?.appointmentBooked ?? true,
                                appointmentCanceled: settings.webhooks.events?.appointmentCanceled ?? true,
                                callTransferred: settings.webhooks.events?.callTransferred ?? true,
                                transferFailed: settings.webhooks.events?.transferFailed ?? true,
                            }
                        });
                    }
                    if (settings.emailNotifications) {
                        setEmailSettings({
                            enabled: settings.emailNotifications.enabled || false,
                            brevoKey: settings.emailNotifications.brevoKey || "",
                            senderEmail: settings.emailNotifications.senderEmail || "",
                            senderName: settings.emailNotifications.senderName || "",
                            recipientEmail: settings.emailNotifications.recipientEmail || "",
                            events: {
                                inboundCall: settings.emailNotifications.events?.inboundCall ?? true,
                                outboundCall: settings.emailNotifications.events?.outboundCall ?? true,
                                callCompleted: settings.emailNotifications.events?.callCompleted ?? true,
                                leadCreated: settings.emailNotifications.events?.leadCreated ?? true,
                                leadQualified: settings.emailNotifications.events?.leadQualified ?? true,
                                campaignCompleted: settings.emailNotifications.events?.campaignCompleted ?? true,
                                appointmentBooked: settings.emailNotifications.events?.appointmentBooked ?? true,
                                appointmentCanceled: settings.emailNotifications.events?.appointmentCanceled ?? true,
                            }
                        });
                    }
                }
            }

            if (userRes.data?.status === "success") {
                setUser(userRes.data.data.user);
                setHasPassword(userRes.data.data.hasPassword !== false);
            }

            if (plansRes.data?.status === "success") {
                setPlans(plansRes.data.data.plans);
            }

            // Fetch public settings for gateway info
            setLoadingGateways(true);
            const publicSettingsRes = await axios.get(`${API_BASE_URL}/settings/public`);
            if (publicSettingsRes.data?.status === "success") {
                const { currency: cur, gateways: g } = publicSettingsRes.data.data;
                setCurrency(getCurrencySymbol(cur));
                setCurrencyCode(cur || "USD");
                setEnabledGateways(g);
            }

            // Fetch transactions
            setLoadingTransactions(true);
            const transactionsRes = await axios.get(`${API_BASE_URL}/payments/transactions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (transactionsRes.data?.status === "success") {
                setTransactions(transactionsRes.data.data.transactions);
            }

            // Fetch usage
            setLoadingUsage(true);
            const usageRes = await axios.get(`${API_BASE_URL}/users/usage`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (usageRes.data?.status === "success") {
                setUsage(usageRes.data.data);
            }

            // Fetch Asterisk status
            try {
                const astRes = await axios.get(`${API_BASE_URL}/sip-trunks/asterisk/status`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (astRes.data?.status === "success") {
                    setAsteriskStatus(astRes.data.data);
                }
            } catch {
                // Asterisk endpoint might not exist — that's fine
            }

        } catch (err: any) {
            console.error("Data load error:", err);
            if (err.response?.status === 401) {
                localStorage.removeItem("token");
                router.push("/login");
                return;
            }
            toast.error(t("toast.loadFailed"));
        } finally {
            setLoading(false);
            setLoadingGateways(false);
            setLoadingTransactions(false);
            setLoadingUsage(false);
        }
    }, [refreshSettings]);

    const handleSavePassword = async () => {
        if (passwordForm.next.length < 8) {
            toast.error(t("password.tooShort"));
            return;
        }
        if (passwordForm.next !== passwordForm.confirm) {
            toast.error(t("password.mismatch"));
            return;
        }
        setSavingPassword(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/users/password`, {
                currentPassword: hasPassword ? passwordForm.current : undefined,
                newPassword: passwordForm.next
            }, { headers: { 'Authorization': `Bearer ${token}` } });
            toast.success(hasPassword ? t("password.updated") : t("password.set"));
            setHasPassword(true);
            setPasswordForm({ current: "", next: "", confirm: "" });
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("password.failed"));
        } finally {
            setSavingPassword(false);
        }
    };

    const verifyStripeSession = useCallback(async (sessionId: string) => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/payments/stripe/verify-session?sessionId=${sessionId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                toast.success(t("toast.upgraded", { plan: response.data.data.planName }));
                fetchData(); // Refresh user data
                // Clean up URL
                router.replace('/settings');
            }
        } catch (err: any) {
            console.error("Verification error:", err);
            toast.error(t("toast.verifyFailed"));
            router.replace('/settings');
        }
    }, [fetchData, router]);

    const verifyDodoSession = useCallback(async (planId: string) => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/payments/dodopayments/verify-session?planId=${planId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                toast.success(t("toast.upgraded", { plan: response.data.data.planName }));
                fetchData(); // Refresh user data
                router.replace('/settings');
            }
        } catch (err: any) {
            console.error("Dodo Verification error:", err);
            toast.error(t("toast.verifyFailed"));
            router.replace('/settings');
        }
    }, [fetchData, router]);



    // The native integrations moved to /integrations. OAuth callbacks and old
    // bookmarks still land here with ?slack=connected and the like: hand them on
    // with the same query so the right card opens there.
    useEffect(() => {
        const providers = ["slack", "hubspot", "google_calendar", "google_sheets", "whatsapp", "n8n"];
        if (providers.some((p) => searchParams.has(p))) {
            router.replace(`/integrations?${searchParams.toString()}`);
        }
    }, [searchParams, router]);

    useEffect(() => {
        fetchData();

        const sessionId = searchParams.get('session_id');
        if (sessionId) {
            verifyStripeSession(sessionId);
        }

        const status = searchParams.get('status');
        const gateway = searchParams.get('gateway');
        const pId = searchParams.get('planId');
        if (status === 'success' && gateway === 'dodopayments' && pId) {
            verifyDodoSession(pId);
        }
    }, [fetchData, searchParams, verifyStripeSession, verifyDodoSession]);

    const handleSaveSettings = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        try {
            setSaving(true);
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/settings`, {
                ...apiKeys,
                ...systemSettings,
                webhooks: webhookSettings,
                emailNotifications: emailSettings
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.status === "success") {
                toast.success(t("toast.saved"));
                await refreshSettings();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.saveFailed"));
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        const testNumber = window.prompt("Enter phone number for basic credential test (+1234567890):");
        if (!testNumber) return;

        try {
            toast.loading(t("toast.testStarting"), { id: "test-call" });
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/calls/test`, { to: testNumber }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.testCallStarted"), { id: "test-call" });
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.testFailed"), { id: "test-call" });
        }
    };

    const handleUpgrade = (plan: any) => {
        setSelectedPlan(plan);
        setIsPaymentModalOpen(true);
    };

    const handleGatewaySelect = async (gateway: string) => {
        if (gateway === "Stripe") {
            try {
                toast.loading(t("toast.preparingCheckout"), { id: "stripe-checkout" });
                const token = localStorage.getItem("token");
                const response = await axios.post(`${API_BASE_URL}/payments/stripe/create-checkout`, {
                    planId: selectedPlan?._id
                }, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.data?.status === "success" && response.data.data.url) {
                    toast.success(t("toast.redirecting"), { id: "stripe-checkout" });
                    window.location.href = response.data.data.url;
                }
            } catch (err: any) {
                toast.error(err.response?.data?.message || t("toast.paymentFailed"), { id: "stripe-checkout" });
            }
            return;
        }

        if (gateway === "Razorpay") {
            try {
                toast.loading(t("toast.preparingRazorpay"), { id: "razorpay-checkout" });
                const token = localStorage.getItem("token");
                const response = await axios.post(`${API_BASE_URL}/payments/razorpay/create-order`, {
                    planId: selectedPlan?._id
                }, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.data?.status === "success" && response.data.data.order) {
                    const order = response.data.data.order;
                    const options = {
                        key: enabledGateways.razorpayKeyId,
                        amount: order.amount,
                        currency: order.currency,
                        name: branding.appName,
                        description: `Upgrade to ${selectedPlan.name}`,
                        order_id: order.id,
                        handler: async (response: any) => {
                            try {
                                toast.loading(t("toast.verifyingPayment"), { id: "razorpay-verify" });
                                const verifyRes = await axios.post(`${API_BASE_URL}/payments/razorpay/verify`, {
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_signature: response.razorpay_signature,
                                    planId: selectedPlan._id
                                }, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });

                                if (verifyRes.data?.status === "success") {
                                    toast.success(t("toast.planUpgraded", { plan: verifyRes.data.data.planName }), { id: "razorpay-verify" });
                                    setIsPaymentModalOpen(false);
                                    fetchData();
                                }
                            } catch (err: any) {
                                toast.error(err.response?.data?.message || t("toast.verificationFailed"), { id: "razorpay-verify" });
                            }
                        },
                        prefill: {
                            name: user?.name,
                            email: user?.email
                        },
                        theme: {
                            color: "#000000"
                        }
                    };

                    const rzp = new (window as any).Razorpay(options);
                    rzp.open();
                    toast.dismiss("razorpay-checkout");
                }
            } catch (err: any) {
                toast.error(err.response?.data?.message || t("toast.razorpayFailed"), { id: "razorpay-checkout" });
            }
            return;
        }

        if (gateway === "Dodo Payments") {
            try {
                toast.loading(t("toast.preparingCheckout"), { id: "dodo-checkout" });
                const token = localStorage.getItem("token");
                const response = await axios.post(`${API_BASE_URL}/payments/dodopayments/create-checkout`, {
                    planId: selectedPlan?._id
                }, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.data?.status === "success" && response.data.data.url) {
                    toast.success(t("toast.redirecting"), { id: "dodo-checkout" });
                    window.location.href = response.data.data.url;
                }
            } catch (err: any) {
                toast.error(err.response?.data?.message || t("toast.paymentFailed"), { id: "dodo-checkout" });
            }
            return;
        }

        toast.info(t("toast.gatewayDemo", { gateway, plan: selectedPlan?.name ?? "" }));
        // Demo: just close modal
        setIsPaymentModalOpen(false);
    };

    const handleSendTestEvent = async (eventName: string, label: string) => {
        try {
            toast.loading(t("toast.sendingTestEvent", { label }), { id: "test-webhook" });
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/settings/webhooks/test`, {
                event: eventName
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.status === "success") {
                toast.success(t("toast.eventDelivered", { label }), { id: "test-webhook" });
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || `Failed to deliver ${label} event.`, { id: "test-webhook" });
        }
    };

    const handleSendTestEmail = async (eventName: string, label: string) => {
        try {
            toast.loading(t("toast.sendingTestEmail", { label }), { id: "test-email" });
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/settings/email/test`, {
                event: eventName
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.status === "success") {
                toast.success(t("toast.emailDispatched", { label }), { id: "test-email" });
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || `Failed to dispatch ${label} email.`, { id: "test-email" });
        }
    };

    const handleRegenerateSecret = async () => {
        try {
            toast.loading(t("toast.regeneratingSecret"), { id: "regen-secret" });
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/settings/webhooks/regenerate-secret`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.status === "success") {
                setWebhookSettings(prev => ({ ...prev, secret: response.data.data.secret }));
                toast.success(t("toast.secretRegenerated"), { id: "regen-secret" });
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.regenerateFailed"), { id: "regen-secret" });
        }
    };

    if (loading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Spinner size="xl" className="text-fg-muted" />
            </div>
        );
    }

    // A usage meter on the current plan: "used / limit" over a thin bar.
    const usageMeter = (label: string, used: number, limit: number) => (
        <div className="flex flex-col gap-2 rounded-md bg-surface p-4">
            <div className="flex items-center justify-between gap-2 text-caption font-medium">
                <span className="text-fg-muted">{label}</span>
                <span className="tabular-nums text-fg">{used} / {limit}</span>
            </div>
            <Progress value={used} max={Math.max(1, limit)} />
        </div>
    );

    return (
        <div className="flex flex-col gap-6">
            <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
            <PageHeader title={t("page.title")} description={t("page.subtitle")} />

            <Tabs defaultValue="system" variant="line" className="w-full gap-6">
                <TabsList className="max-w-full justify-start overflow-x-auto scrollbar-hide">
                    <TabsTrigger value="system">
                        <Gear />
                        {t("page.tabs.preferences")}
                    </TabsTrigger>
                    <TabsTrigger value="api-keys">
                        <Key />
                        {t("page.tabs.apiKeys")}
                    </TabsTrigger>
                    <TabsTrigger value="webhooks">
                        <WebhooksLogo />
                        {t("page.tabs.webhooks")}
                    </TabsTrigger>
                    <TabsTrigger value="email">
                        <Envelope />
                        {t("page.tabs.email")}
                    </TabsTrigger>
                    <TabsTrigger value="billing">
                        <CreditCard />
                        {t("page.tabs.billing")}
                    </TabsTrigger>
                    <TabsTrigger value="transactions">
                        <ShoppingBag />
                        {t("page.tabs.transactions")}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="api-keys">
                    <Section icon={<Key />} title={t("credentials.title")} description={t("credentials.description")}>
                        <form onSubmit={handleSaveSettings} className="flex flex-col gap-6">
                            <div className="grid gap-5 md:grid-cols-2">
                                <Field label={t("credentials.twilioSid")} id="twilio-sid">
                                    <Input
                                        value={apiKeys.twilioSid}
                                        onChange={(e) =>
                                            setApiKeys({ ...apiKeys, twilioSid: e.target.value })
                                        }
                                        placeholder={t("credentials.twilioSidPlaceholder")}
                                        className="font-mono"
                                    />
                                </Field>

                                <Field label={t("credentials.twilioToken")} id="twilio-token">
                                    <Input
                                        type="password"
                                        value={apiKeys.twilioToken}
                                        onChange={(e) =>
                                            setApiKeys({ ...apiKeys, twilioToken: e.target.value })
                                        }
                                        placeholder="••••••••••••••••••••••••••••••••"
                                        className="font-mono"
                                    />
                                </Field>

                                <Field label={t("credentials.openRouter")} id="openrouter-key">
                                    <Input
                                        type="password"
                                        value={apiKeys.openRouterKey}
                                        onChange={(e) =>
                                            setApiKeys({ ...apiKeys, openRouterKey: e.target.value })
                                        }
                                        placeholder="sk-or-••••••••••••••••••••••••••••"
                                        className="font-mono"
                                    />
                                </Field>
                                <Field
                                    label={t("credentials.elevenLabs")}
                                    id="elevenlabs-key"
                                    error={elevenLabsKeyError ? `${elevenLabsKeyError}. ${t("credentials.keyErrorSuffix")}` : undefined}
                                    labelAside={
                                        verifyingElevenLabs ? (
                                            <span className="flex items-center gap-1 text-accent-ink">
                                                <Spinner size="sm" />
                                                {t("credentials.verifying")}
                                            </span>
                                        ) : !elevenLabsKeyError && apiKeys.elevenLabsKey ? (
                                            <span className="flex items-center gap-1 font-medium text-success-ink">
                                                <Check className="size-3" /> {t("credentials.validKey")}
                                            </span>
                                        ) : undefined
                                    }
                                >
                                    <Input
                                        type="password"
                                        value={apiKeys.elevenLabsKey}
                                        onChange={(e) =>
                                            setApiKeys({ ...apiKeys, elevenLabsKey: e.target.value })
                                        }
                                        placeholder="••••••••••••••••••••••••••••••••"
                                        className="font-mono"
                                    />
                                </Field>
                                <Field label={t("credentials.deepgram")} hint={t("credentials.deepgramHint")} id="deepgram-key">
                                    <Input
                                        type="password"
                                        value={apiKeys.deepgramKey}
                                        onChange={(e) =>
                                            setApiKeys({ ...apiKeys, deepgramKey: e.target.value })
                                        }
                                        placeholder="••••••••••••••••••••••••••••••••"
                                        className="font-mono"
                                    />
                                </Field>
                                <Field label={t("credentials.sarvam")} hint={t("credentials.sarvamHint")} id="sarvam-key">
                                    <Input
                                        type="password"
                                        value={apiKeys.sarvamKey}
                                        onChange={(e) =>
                                            setApiKeys({ ...apiKeys, sarvamKey: e.target.value })
                                        }
                                        placeholder="••••••••••••••••••••••••••••••••"
                                        className="font-mono"
                                    />
                                </Field>
                                <Field label={t("credentials.gemini")} hint={t("credentials.geminiHint")} id="gemini-key">
                                    <Input
                                        type="password"
                                        value={apiKeys.geminiKey}
                                        onChange={(e) =>
                                            setApiKeys({ ...apiKeys, geminiKey: e.target.value })
                                        }
                                        placeholder="••••••••••••••••••••••••••••••••"
                                        className="font-mono"
                                    />
                                </Field>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button type="submit" variant="primary" loading={saving}>
                                    {c("actions.saveChanges")}
                                </Button>
                            </div>
                        </form>
                    </Section>
                </TabsContent>
                <TabsContent value="webhooks">
                    <Section
                        className="max-w-3xl"
                        icon={<WebhooksLogo />}
                        title={t("webhooks.title")}
                        description={t("webhooks.description")}
                    >
                        <SettingRows inset>
                            <SettingRow
                                htmlFor="webhooks-enabled"
                                label={t("webhooks.enable")}
                                description={t("webhooks.enableHint")}
                                control={
                                    <Switch
                                        id="webhooks-enabled"
                                        checked={webhookSettings.enabled}
                                        onCheckedChange={(checked) => setWebhookSettings({ ...webhookSettings, enabled: checked })}
                                    />
                                }
                            />
                        </SettingRows>

                        <Field label={t("webhooks.payloadUrl")} hint={t("webhooks.payloadUrlHint")} id="webhook-url">
                            <Input
                                placeholder="https://your-app.com/webhooks"
                                value={webhookSettings.url}
                                onChange={(e) => setWebhookSettings({ ...webhookSettings, url: e.target.value })}
                                className="font-mono"
                            />
                        </Field>

                        <div className="flex flex-col gap-1.5">
                            <span className="text-body-sm font-medium text-fg">{t("webhooks.signingSecret")}</span>
                            <div className="flex gap-2">
                                <CopyField value={webhookSettings.secret} secret className="flex-1" />
                                <Button variant="secondary" onClick={handleRegenerateSecret} iconStart={<ArrowsClockwise />}>
                                    {t("webhooks.regenerate")}
                                </Button>
                            </div>
                            <p className="text-caption text-fg-muted">{t("webhooks.signingSecretHint")}</p>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-border pt-4">
                            <h3 className="text-body-sm font-semibold">{t("webhooks.triggerEvents")}</h3>
                            <CheckboxCards
                                columns={2}
                                value={WEBHOOK_EVENT_IDS.filter((id) => (webhookSettings.events as any)[id])}
                                onValueChange={(ids) => {
                                    setWebhookSettings({
                                        ...webhookSettings,
                                        events: {
                                            ...webhookSettings.events,
                                            ...Object.fromEntries(WEBHOOK_EVENT_IDS.map((id) => [id, ids.includes(id)])),
                                        }
                                    });
                                }}
                            >
                                {WEBHOOK_EVENT_IDS.map((id) => (
                                    <CheckboxCard
                                        key={id}
                                        value={id}
                                        id={`event-${id}`}
                                        title={t(`events.${id}.label`)}
                                        description={t(`events.${id}.desc`)}
                                    />
                                ))}
                            </CheckboxCards>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                            <Button variant="primary" onClick={() => handleSaveSettings()} loading={saving}>
                                {t("webhooks.save")}
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="secondary" iconEnd={<CaretDown />}>
                                        {t("webhooks.sendTest")}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-52">
                                    {WEBHOOK_TEST_EVENT_IDS.map((id) => (
                                        <DropdownMenuItem key={id} onClick={() => handleSendTestEvent(id, t(`events.${id}.short`))}>
                                            {t(`events.${id}.label`)}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </Section>
                </TabsContent>

                <TabsContent value="email">
                    <Section
                        className="max-w-3xl"
                        icon={<Envelope />}
                        title={t("emailNotifications.title")}
                        description={t("emailNotifications.description")}
                    >
                        <SettingRows inset>
                            <SettingRow
                                htmlFor="email-enabled"
                                label={t("emailNotifications.enable")}
                                description={t("emailNotifications.enableHint")}
                                control={
                                    <Switch
                                        id="email-enabled"
                                        checked={emailSettings.enabled}
                                        onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, enabled: checked })}
                                    />
                                }
                            />
                        </SettingRows>

                        <div className="grid gap-5 md:grid-cols-2">
                            <Field label={t("emailNotifications.brevoKey")} hint={t("emailNotifications.brevoKeyHint")} id="brevo-key">
                                <Input
                                    type="password"
                                    placeholder={t("emailNotifications.brevoKeyPlaceholder")}
                                    value={emailSettings.brevoKey}
                                    onChange={(e) => setEmailSettings({ ...emailSettings, brevoKey: e.target.value })}
                                    className="font-mono"
                                />
                            </Field>

                            <Field label={t("emailNotifications.recipientEmail")} hint={t("emailNotifications.recipientEmailHint")} id="recipient-email">
                                <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    value={emailSettings.recipientEmail}
                                    onChange={(e) => setEmailSettings({ ...emailSettings, recipientEmail: e.target.value })}
                                />
                            </Field>

                            <Field label={t("emailNotifications.senderName")} id="sender-name">
                                <Input
                                    placeholder={branding.appName}
                                    value={emailSettings.senderName}
                                    onChange={(e) => setEmailSettings({ ...emailSettings, senderName: e.target.value })}
                                />
                            </Field>

                            <Field label={t("emailNotifications.senderEmail")} id="sender-email">
                                <Input
                                    placeholder="notifications@yourdomain.com"
                                    value={emailSettings.senderEmail}
                                    onChange={(e) => setEmailSettings({ ...emailSettings, senderEmail: e.target.value })}
                                />
                            </Field>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-border pt-4">
                            <h3 className="text-body-sm font-semibold">{t("emailNotifications.notificationEvents")}</h3>
                            <CheckboxCards
                                columns={2}
                                value={EMAIL_EVENT_IDS.filter((id) => (emailSettings.events as any)[id])}
                                onValueChange={(ids) => {
                                    setEmailSettings({
                                        ...emailSettings,
                                        events: {
                                            ...emailSettings.events,
                                            ...Object.fromEntries(EMAIL_EVENT_IDS.map((id) => [id, ids.includes(id)])),
                                        }
                                    });
                                }}
                            >
                                {EMAIL_EVENT_IDS.map((id) => (
                                    <CheckboxCard
                                        key={id}
                                        value={id}
                                        id={`email-event-${id}`}
                                        title={t(`events.${id}.label`)}
                                        description={t(`events.${id}.desc`)}
                                    />
                                ))}
                            </CheckboxCards>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                            <Button variant="primary" onClick={() => handleSaveSettings()} loading={saving}>
                                {t("emailNotifications.save")}
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="secondary" iconEnd={<CaretDown />}>
                                        {t("emailNotifications.sendTest")}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-52">
                                    {EMAIL_TEST_EVENT_IDS.map((id) => (
                                        <DropdownMenuItem key={id} onClick={() => handleSendTestEmail(id, t(`events.${id}.short`))}>
                                            {t(`events.${id}.label`)}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </Section>
                </TabsContent>

                <TabsContent value="billing">
                    <div className="flex flex-col gap-6">
                        <Section
                            icon={<ChartBar />}
                            title={t("billing.currentPlanTitle")}
                            description={t("billing.currentPlanDescription")}
                            actions={
                                <Badge tone={usage?.isTrial ? "warning" : "accent"}>
                                    {user?.plan?.name || t("billing.trialPlan")}
                                </Badge>
                            }
                        >
                            {(user?.planStatus != null || user?.planExpiry) && (
                                <div className="flex flex-wrap items-center gap-4 text-body-sm">
                                    {user?.planStatus != null && (
                                        <span className="text-fg-muted">
                                            <span className="font-medium text-fg-subtle">{t("billing.status")}</span>{" "}
                                            <span className="font-medium capitalize text-fg">{user.planStatus}</span>
                                        </span>
                                    )}
                                    {user?.planExpiry && (() => {
                                        const expiryDate = new Date(user.planExpiry);
                                        const isExpired = expiryDate < new Date();
                                        return (
                                            <span className="text-fg-muted">
                                                <span className="font-medium text-fg-subtle">
                                                    {isExpired ? t("billing.expiredOn") : t("billing.expires")}
                                                </span>{" "}
                                                {expiryDate.toLocaleDateString(undefined, { dateStyle: "medium" })}
                                            </span>
                                        );
                                    })()}
                                </div>
                            )}
                            <div className={`grid gap-3 ${usage?.isTrial ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                                {usageMeter(t("billing.agents"), usage?.usage?.agents ?? 0, usage?.limits?.agents ?? 0)}
                                {usageMeter(t("billing.campaigns"), usage?.usage?.campaigns ?? 0, usage?.limits?.campaigns ?? 0)}
                                {usageMeter(t("billing.leads"), usage?.usage?.leads ?? 0, usage?.limits?.leads ?? 0)}
                                {usage?.isTrial && (
                                    <div className="flex flex-col gap-2 rounded-md bg-surface p-4">
                                        <div className="flex items-center justify-between gap-2 text-caption font-medium">
                                            <span className="text-fg-muted">{t("billing.calls")}</span>
                                            <span className="tabular-nums text-fg">
                                                {usage?.usage?.calls ?? 0}
                                                {" / "}
                                                {usage?.limits?.callsPerMonth === -1
                                                    ? t("billing.unlimited")
                                                    : usage?.limits?.callsPerMonth ?? 0}
                                            </span>
                                        </div>
                                        <Progress
                                            tone="warning"
                                            value={usage?.limits?.callsPerMonth && usage.limits.callsPerMonth > 0 ? (usage?.usage?.calls ?? 0) : 0}
                                            max={usage?.limits?.callsPerMonth && usage.limits.callsPerMonth > 0 ? usage.limits.callsPerMonth : 1}
                                        />
                                    </div>
                                )}
                            </div>
                        </Section>

                        <div className="flex flex-col gap-4">
                            <h2 className="text-heading-md">{t("billing.availablePlans")}</h2>
                            <div className="grid gap-4 md:grid-cols-3">
                                {plans.map((plan) => {
                                    const isCurrent = user?.plan?._id === plan._id;
                                    return (
                                        <Card key={plan._id} selected={isCurrent}>
                                            <CardHeader>
                                                <span className="mb-2 grid size-9 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                                    <Lightning className="size-5" />
                                                </span>
                                                <CardTitle className="flex flex-wrap items-center gap-2">
                                                    {plan.name}
                                                    {isCurrent && (
                                                        <Badge tone="accent" appearance="solid">{t("billing.currentPlan")}</Badge>
                                                    )}
                                                </CardTitle>
                                                <CardDescription>{plan.description}</CardDescription>
                                            </CardHeader>
                                            <CardContent className="flex flex-1 flex-col gap-4">
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-heading-xl tabular-nums">{currency}{plan.price}</span>
                                                    <span className="text-body-sm text-fg-subtle">/{plan.interval}</span>
                                                </div>
                                                <ul className="flex flex-col gap-2 text-body-sm text-fg-muted">
                                                    <li className="flex items-center gap-2">
                                                        <Check className="size-4 shrink-0 text-accent-ink" />
                                                        {t("billing.planAgents", { count: plan.limits.agents === -1 ? t("billing.unlimited") : plan.limits.agents })}
                                                    </li>
                                                    <li className="flex items-center gap-2">
                                                        <Check className="size-4 shrink-0 text-accent-ink" />
                                                        {t("billing.planCampaigns", { count: plan.limits.campaigns === -1 ? t("billing.unlimited") : plan.limits.campaigns })}
                                                    </li>
                                                    <li className="flex items-center gap-2">
                                                        <Check className="size-4 shrink-0 text-accent-ink" />
                                                        {t("billing.planLeads", { count: plan.limits.leads === -1 ? t("billing.unlimited") : plan.limits.leads })}
                                                    </li>
                                                    <li className="flex items-center gap-2">
                                                        <Check className="size-4 shrink-0 text-accent-ink" />
                                                        {plan.limits.callsPerMonth === -1
                                                            ? t("billing.planCallsUnlimited")
                                                            : t("billing.planCalls", { count: plan.limits.callsPerMonth })}
                                                    </li>
                                                </ul>
                                            </CardContent>
                                            <CardFooter>
                                                <Button
                                                    block
                                                    variant={isCurrent ? "secondary" : "primary"}
                                                    disabled={isCurrent}
                                                    onClick={() => handleUpgrade(plan)}
                                                >
                                                    {isCurrent ? t("billing.currentPlan") : t("billing.upgradePlan")}
                                                </Button>
                                            </CardFooter>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="transactions">
                    <Section icon={<ShoppingBag />} title={t("transactions.title")} description={t("transactions.description")}>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("transactions.date")}</TableHead>
                                    <TableHead>{t("transactions.plan")}</TableHead>
                                    <TableHead>{t("transactions.amount")}</TableHead>
                                    <TableHead>{t("transactions.method")}</TableHead>
                                    <TableHead align="end">{t("transactions.status")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingTransactions ? (
                                    Array(3).fill(0).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={5}>
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" className="py-12 text-fg-muted">
                                            {t("transactions.empty")}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transactions.map((tx) => (
                                        <TableRow key={tx._id}>
                                            <TableCell className="font-medium">
                                                {new Date(tx.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                {tx.plan?.name || t("transactions.premiumPlan")}
                                            </TableCell>
                                            <TableCell>
                                                {currency}{tx.amount}
                                            </TableCell>
                                            <TableCell className="capitalize text-fg-subtle">
                                                {tx.paymentGateway}
                                            </TableCell>
                                            <TableCell align="end">
                                                <Badge
                                                    dot
                                                    tone={tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'warning' : 'danger'}
                                                >
                                                    {tx.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </Section>
                </TabsContent>

                <TabsContent value="system">
                    <div className="flex max-w-3xl flex-col gap-6">
                        <Section icon={<Gear />} title={t("preferences.title")} description={t("preferences.description")}>
                            <SettingRows inset>
                                {/* Applies on change rather than on Save — a language
                                    selector that needs a separate save is a papercut. */}
                                <SettingRow
                                    htmlFor="ui-language"
                                    label={t("preferences.language")}
                                    description={t("preferences.languageHint")}
                                    control={
                                        <Select value={locale} onValueChange={handleLocaleChange}>
                                            <SelectTrigger id="ui-language" className="w-[180px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {LOCALES.map((option) => (
                                                    <SelectItem key={option.code} value={option.code}>
                                                        <span className="flex items-center gap-2">
                                                            <Translate className="size-4 text-fg-muted" />
                                                            <span>{option.label}</span>
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    }
                                />
                                <SettingRow
                                    htmlFor="time-format"
                                    label={t("preferences.timeFormat")}
                                    description={t("preferences.timeFormatHint")}
                                    control={
                                        <Select
                                            value={systemSettings.timeFormat}
                                            onValueChange={(val) => {
                                                setSystemSettings({ ...systemSettings, timeFormat: val });
                                            }}
                                        >
                                            <SelectTrigger id="time-format" className="w-[140px]">
                                                <SelectValue placeholder={t("preferences.selectFormat")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="12">
                                                    <span className="flex items-center gap-2">
                                                        <Clock className="size-4 text-fg-muted" />
                                                        <span>{t("preferences.hour12")}</span>
                                                    </span>
                                                </SelectItem>
                                                <SelectItem value="24">
                                                    <span className="flex items-center gap-2">
                                                        <Clock className="size-4 text-fg-muted" />
                                                        <span>{t("preferences.hour24")}</span>
                                                    </span>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    }
                                />
                                <SettingRow
                                    htmlFor="time-zone"
                                    label={t("preferences.timeZone")}
                                    description={t("preferences.timeZoneHint")}
                                    control={
                                        <Select
                                            value={systemSettings.timeZone || "UTC"}
                                            onValueChange={(val) => {
                                                setSystemSettings({ ...systemSettings, timeZone: val });
                                            }}
                                        >
                                            <SelectTrigger id="time-zone" className="w-[220px]">
                                                <SelectValue placeholder={t("preferences.selectTimeZone")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(() => {
                                                    const current = systemSettings.timeZone || "UTC";
                                                    const list = COMMON_TIMEZONES.includes(current) ? COMMON_TIMEZONES : [current, ...COMMON_TIMEZONES];
                                                    return list.map((tz) => (
                                                        <SelectItem key={tz} value={tz}>
                                                            <span className="flex items-center gap-2">
                                                                <Globe className="size-4 shrink-0 text-fg-muted" />
                                                                <span>{tz.replace(/_/g, " ")}</span>
                                                            </span>
                                                        </SelectItem>
                                                    ));
                                                })()}
                                            </SelectContent>
                                        </Select>
                                    }
                                />
                            </SettingRows>

                            <div className="flex flex-col gap-3">
                                <h3 className="flex items-center gap-2 text-body-sm font-semibold">
                                    <Phone className="size-4 text-fg-muted" />
                                    {t("preferences.callSettings")}
                                </h3>
                                <SettingRows inset>
                                    <SettingRow
                                        htmlFor="recording-enabled"
                                        label={t("preferences.callRecording")}
                                        description={t("preferences.callRecordingHint")}
                                        control={
                                            <Switch
                                                id="recording-enabled"
                                                checked={systemSettings.recordingEnabled}
                                                onCheckedChange={(checked) => {
                                                    setSystemSettings({ ...systemSettings, recordingEnabled: checked });
                                                }}
                                            />
                                        }
                                    />
                                    <SettingRow
                                        htmlFor="auto-analysis"
                                        label={t("preferences.autoAnalysis")}
                                        description={t("preferences.autoAnalysisHint")}
                                        control={
                                            <Switch
                                                id="auto-analysis"
                                                checked={systemSettings.autoAnalysisEnabled}
                                                onCheckedChange={(checked) => {
                                                    setSystemSettings({ ...systemSettings, autoAnalysisEnabled: checked });
                                                }}
                                            />
                                        }
                                    />
                                    <SettingRow
                                        htmlFor="auto-hangup"
                                        label={
                                            <span className="flex flex-wrap items-center gap-2">
                                                {t("preferences.autoHangup")}
                                                {systemSettings.autoHangupEnabled && (systemSettings.incomingHangupLimit === 0 || systemSettings.outgoingHangupLimit === 0) && (
                                                    <Badge tone="danger" size="sm">{t("preferences.immediateHangup")}</Badge>
                                                )}
                                            </span>
                                        }
                                        description={t("preferences.autoHangupHint")}
                                        control={
                                            <Switch
                                                id="auto-hangup"
                                                checked={systemSettings.autoHangupEnabled}
                                                onCheckedChange={(checked) => {
                                                    setSystemSettings({ ...systemSettings, autoHangupEnabled: checked });
                                                }}
                                            />
                                        }
                                    >
                                        {systemSettings.autoHangupEnabled && (
                                            <div className="flex animate-wx-fade-in flex-col gap-4 border-t border-border pt-3">
                                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                    <Field
                                                        label={t("preferences.incomingTimeout")}
                                                        id="incoming-limit"
                                                        labelAside={systemSettings.incomingHangupLimit === 0 && (
                                                            <Badge tone="danger" size="sm">{t("preferences.immediate")}</Badge>
                                                        )}
                                                    >
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            className="w-36"
                                                            trailing={t("preferences.minutesAbbrev")}
                                                            value={systemSettings.incomingHangupLimit}
                                                            onChange={(e) => setSystemSettings({ ...systemSettings, incomingHangupLimit: parseInt(e.target.value) || 0 })}
                                                        />
                                                    </Field>
                                                    <Field
                                                        label={t("preferences.outgoingTimeout")}
                                                        id="outgoing-limit"
                                                        labelAside={systemSettings.outgoingHangupLimit === 0 && (
                                                            <Badge tone="danger" size="sm">{t("preferences.immediate")}</Badge>
                                                        )}
                                                    >
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            className="w-36"
                                                            trailing={t("preferences.minutesAbbrev")}
                                                            value={systemSettings.outgoingHangupLimit}
                                                            onChange={(e) => setSystemSettings({ ...systemSettings, outgoingHangupLimit: parseInt(e.target.value) || 0 })}
                                                        />
                                                    </Field>
                                                </div>
                                                <p className="text-caption text-fg-muted">
                                                    {t("preferences.hangupHint")}
                                                </p>
                                            </div>
                                        )}
                                    </SettingRow>
                                </SettingRows>
                            </div>

                            <div>
                                <Button variant="primary" onClick={() => handleSaveSettings()} loading={saving}>
                                    {t("preferences.apply")}
                                </Button>
                            </div>
                        </Section>

                        {/* Password — Google-only accounts can set one here */}
                        <Section
                            icon={<Lock />}
                            title={hasPassword ? t("password.changeTitle") : t("password.setTitle")}
                            description={hasPassword ? t("password.changeDescription") : t("password.setDescription")}
                        >
                            <div className="flex max-w-md flex-col gap-4">
                                {hasPassword && (
                                    <Field label={t("password.current")} id="current-password">
                                        <Input
                                            type="password"
                                            autoComplete="current-password"
                                            value={passwordForm.current}
                                            onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                        />
                                    </Field>
                                )}
                                <Field label={t("password.new")} id="new-password">
                                    <Input
                                        type="password"
                                        autoComplete="new-password"
                                        value={passwordForm.next}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
                                    />
                                </Field>
                                <Field label={t("password.confirm")} id="confirm-password">
                                    <Input
                                        type="password"
                                        autoComplete="new-password"
                                        value={passwordForm.confirm}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                    />
                                </Field>
                                <div>
                                    <Button variant="primary" onClick={handleSavePassword} disabled={!passwordForm.next} loading={savingPassword}>
                                        {hasPassword ? t("password.changeButton") : t("password.setButton")}
                                    </Button>
                                </div>
                            </div>
                        </Section>

                        {/* Asterisk / SIP Status Card */}
                        <Section
                            icon={<HardDrives />}
                            title={t("asterisk.title")}
                            description={t("asterisk.description")}
                            actions={
                                <Button variant="secondary" size="sm" asChild iconStart={<HardDrives />}>
                                    <Link href="/sip-trunks">
                                        {t("asterisk.manageTrunks")}
                                    </Link>
                                </Button>
                            }
                        >
                            <div className="flex flex-wrap items-center gap-4 rounded-md bg-surface p-4">
                                {asteriskStatus?.asteriskConnected ? (
                                    <Badge tone="success" dot>{t("asterisk.connected")}</Badge>
                                ) : (
                                    <Badge tone="danger" dot>{t("asterisk.offline")}</Badge>
                                )}
                                <Separator orientation="vertical" className="h-5" />
                                <div className="flex items-center gap-1.5 text-body-sm text-fg-muted">
                                    <Pulse className="size-4" />
                                    <span className="tabular-nums">{t("asterisk.activeCalls", { count: asteriskStatus?.activeSipCalls ?? 0 })}</span>
                                </div>
                            </div>
                        </Section>
                    </div>
                </TabsContent>
            </Tabs>

            <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle>{t("payment.selectGateway")}</DialogTitle>
                        <DialogDescription>
                            {t("payment.choosePrompt")} <span className="font-semibold text-fg">{selectedPlan?.name}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 py-4">
                        {loadingGateways ? (
                            <>
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </>
                        ) : (
                            <>
                                {enabledGateways.stripe && (
                                    <Card interactive asChild>
                                        <button
                                            type="button"
                                            className="flex-row items-center gap-5 p-4 text-start wx-focus"
                                            onClick={() => handleGatewaySelect("Stripe")}
                                        >
                                            <div className="relative flex h-10 w-28 shrink-0 items-center justify-center">
                                                <Image src="/images/gateways/stripe.png" alt="Stripe" fill className="object-contain dark:hidden" />
                                                <Image src="/images/gateways/stripe_dark.png" alt="Stripe" fill className="hidden object-contain dark:block" />
                                            </div>
                                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-body-md font-semibold">Stripe</p>
                                                    {enabledGateways.stripeTestMode && (
                                                        <Badge tone="warning" size="sm">{t("payment.testMode")}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-caption text-fg-subtle">{t("payment.stripeHint")}</p>
                                            </div>
                                        </button>
                                    </Card>
                                )}
                                {enabledGateways.paypal && (
                                    <div className="mt-2">
                                        <PayPalButtons
                                            style={{ layout: "vertical", shape: "pill", label: "pay" }}
                                            createOrder={async () => {
                                                try {
                                                    const token = localStorage.getItem("token");
                                                    const response = await axios.post(`${API_BASE_URL}/payments/paypal/create-order`, {
                                                        planId: selectedPlan?._id
                                                    }, {
                                                        headers: { 'Authorization': `Bearer ${token}` }
                                                    });
                                                    return response.data.data.id;
                                                } catch (err) {
                                                    console.error("PayPal Create Order Error:", err);
                                                    toast.error(t("toast.paypalFailed"));
                                                    return "";
                                                }
                                            }}
                                            onApprove={async (data) => {
                                                try {
                                                    toast.loading(t("toast.capturingPayment"), { id: "paypal-capture" });
                                                    const token = localStorage.getItem("token");
                                                    const response = await axios.post(`${API_BASE_URL}/payments/paypal/capture-order`, {
                                                        orderId: data.orderID,
                                                        planId: selectedPlan?._id
                                                    }, {
                                                        headers: { 'Authorization': `Bearer ${token}` }
                                                    });

                                                    if (response.data?.status === "success") {
                                                        toast.success(t("toast.upgraded", { plan: response.data.data.planName }), { id: "paypal-capture" });
                                                        setIsPaymentModalOpen(false);
                                                        fetchData();
                                                    }
                                                } catch (err) {
                                                    console.error("PayPal Capture Error:", err);
                                                    toast.error(t("toast.paypalCompleteFailed"), { id: "paypal-capture" });
                                                }
                                            }}
                                        />
                                    </div>
                                )}
                                {enabledGateways.dodopayments && (
                                    <Card interactive asChild>
                                        <button
                                            type="button"
                                            className="flex-row items-center gap-5 p-4 text-start wx-focus"
                                            onClick={() => handleGatewaySelect("Dodo Payments")}
                                        >
                                            <div className="relative flex h-10 w-28 shrink-0 items-center justify-center">
                                                <Image src="/images/gateways/dodopayments.png" alt="Dodo" fill className="object-contain dark:hidden" />
                                                <Image src="/images/gateways/dodopayments_dark.png" alt="Dodo" fill className="hidden object-contain dark:block" />
                                            </div>
                                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-body-md font-semibold">Dodo Payments</p>
                                                    {enabledGateways.dodopaymentsTestMode && (
                                                        <Badge tone="warning" size="sm">{t("payment.testMode")}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-caption text-fg-subtle">{t("payment.dodoHint")}</p>
                                            </div>
                                        </button>
                                    </Card>
                                )}
                                {enabledGateways.razorpay && (
                                    <Card interactive asChild>
                                        <button
                                            type="button"
                                            className="flex-row items-center gap-5 p-4 text-start wx-focus"
                                            onClick={() => handleGatewaySelect("Razorpay")}
                                        >
                                            <div className="relative flex h-10 w-28 shrink-0 items-center justify-center">
                                                <Image src="/images/gateways/razorpay.png" alt="Razorpay" fill className="object-contain dark:hidden" />
                                                <Image src="/images/gateways/razorpay_dark.png" alt="Razorpay" fill className="hidden object-contain dark:block" />
                                            </div>
                                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-body-md font-semibold">Razorpay</p>
                                                    {enabledGateways.razorpayTestMode && (
                                                        <Badge tone="warning" size="sm">{t("payment.testMode")}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-caption text-fg-subtle">{t("payment.razorpayHint")}</p>
                                            </div>
                                        </button>
                                    </Card>
                                )}
                                {!enabledGateways.stripe && !enabledGateways.paypal && !enabledGateways.dodopayments && !enabledGateways.razorpay && (
                                    <p className="py-4 text-center text-body-sm text-fg-muted">
                                        {t("payment.noMethods")}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <p className="w-full text-center text-caption text-fg-subtle">
                            {t("payment.legal")}
                        </p>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div className="flex h-[400px] items-center justify-center">
                <Spinner size="xl" className="text-fg-muted" />
            </div>
        }>
            <PayPalWrapper />
        </Suspense>
    );
}

function PayPalWrapper() {
    const [clientId, setClientId] = useState<string | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/settings/public`);
                if (response.data?.status === "success") {
                    setClientId(response.data.data.gateways.paypalClientId || "");
                }
            } catch (err) {
                console.error("Failed to fetch PayPal config", err);
                setClientId("");
            } finally {
                setLoadingConfig(false);
            }
        };
        fetchConfig();
    }, []);

    if (loadingConfig) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Spinner size="xl" className="text-fg-muted" />
            </div>
        );
    }

    if (!clientId) {
        return <SettingsPageContent />;
    }

    return (
        <PayPalScriptProvider options={{ clientId }}>
            <SettingsPageContent />
        </PayPalScriptProvider>
    );
}
