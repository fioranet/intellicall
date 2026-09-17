"use client";

import { useTranslations, useLocale } from "next-intl";
import { LOCALES } from "@/i18n/config";
import { setLocaleCookie, applyDocumentDir } from "@/lib/locale-client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axios from "axios";
import { Loader2, Clock, Globe, Phone, Lock, Server, Activity, Settings, ShoppingBag, Key, Webhook, ChevronDown, Mail, Plug, Languages, Coins, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";

import { useSettings } from "@/components/settings-provider";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { getCurrencySymbol } from "@/lib/currency-symbols";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
    Zap,
    Check,
    CreditCard,
    Plus,
    BarChart3,
    ChevronDown as ChevronDownIcon
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

// Common IANA timezones for appointment and display (user can set any valid IANA string via API)
const COMMON_TIMEZONES = [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Belem",
    "America/Fortaleza",
    "America/Recife",
    "America/Cuiaba",
    "America/Rio_Branco",
    "America/Noronha",
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
    const [user, setUser] = useState<any>(() => {
        if (typeof window !== "undefined") {
            try {
                const stored = localStorage.getItem("user");
                return stored ? JSON.parse(stored) : null;
            } catch {
                return null;
            }
        }
        return null;
    });
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
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
            <div>
                <h1 className="text-3xl font-bold">{t("page.title")}</h1>
                <p className="text-muted-foreground">{t("page.subtitle")}</p>
            </div>

            <Tabs defaultValue="system" className="w-full">
                <TabsList variant="line" className="flex items-center border-b mb-6 bg-card/50 overflow-x-auto scrollbar-hide flex-nowrap w-full justify-start h-auto p-0 rounded-none border-border shadow-none">
                    <TabsTrigger
                        value="system"
                        className="flex-none flex items-center gap-2 px-6 py-2 rounded-none transition-all duration-200 shrink-0 data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:bg-primary/5 border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground hover:text-foreground hover:bg-muted shadow-none bg-transparent !border-x-0 !border-t-0 !shadow-none after:hidden"
                    >
                        <Settings className="h-4 w-4" />
                        <span className="text-sm">{t("page.tabs.preferences")}</span>
                    </TabsTrigger>
                    {user?.operatingMode === "byok" && (
                        <TabsTrigger
                            value="api-keys"
                            className="flex-none flex items-center gap-2 px-6 py-2 rounded-none transition-all duration-200 shrink-0 data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:bg-primary/5 border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground hover:text-foreground hover:bg-muted shadow-none bg-transparent !border-x-0 !border-t-0 !shadow-none after:hidden"
                        >
                            <Key className="h-4 w-4" />
                            <span className="text-sm">{t("page.tabs.apiKeys")}</span>
                        </TabsTrigger>
                    )}
                    <TabsTrigger
                        value="webhooks"
                        className="flex-none flex items-center gap-2 px-6 py-2 rounded-none transition-all duration-200 shrink-0 data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:bg-primary/5 border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground hover:text-foreground hover:bg-muted shadow-none bg-transparent !border-x-0 !border-t-0 !shadow-none after:hidden"
                    >
                        <Webhook className="h-4 w-4" />
                        <span className="text-sm">{t("page.tabs.webhooks")}</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="email"
                        className="flex-none flex items-center gap-2 px-6 py-2 rounded-none transition-all duration-200 shrink-0 data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:bg-primary/5 border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground hover:text-foreground hover:bg-muted shadow-none bg-transparent !border-x-0 !border-t-0 !shadow-none after:hidden"
                    >
                        <Mail className="h-4 w-4" />
                        <span className="text-sm">{t("page.tabs.email")}</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="integrations"
                        className="flex-none flex items-center gap-2 px-6 py-2 rounded-none transition-all duration-200 shrink-0 data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:bg-primary/5 border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground hover:text-foreground hover:bg-muted shadow-none bg-transparent !border-x-0 !border-t-0 !shadow-none after:hidden"
                    >
                        <Plug className="h-4 w-4" />
                        <span className="text-sm">{t("page.tabs.integrations")}</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="billing"
                        className="flex-none flex items-center gap-2 px-6 py-2 rounded-none transition-all duration-200 shrink-0 data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:bg-primary/5 border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground hover:text-foreground hover:bg-muted shadow-none bg-transparent !border-x-0 !border-t-0 !shadow-none after:hidden"
                    >
                        <CreditCard className="h-4 w-4" />
                        <span className="text-sm">{t("page.tabs.billing")}</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="transactions"
                        className="flex-none flex items-center gap-2 px-6 py-2 rounded-none transition-all duration-200 shrink-0 data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:bg-primary/5 border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground hover:text-foreground hover:bg-muted shadow-none bg-transparent !border-x-0 !border-t-0 !shadow-none after:hidden"
                    >
                        <ShoppingBag className="h-4 w-4" />
                        <span className="text-sm">{t("page.tabs.transactions")}</span>
                    </TabsTrigger>
                </TabsList>

                {user?.operatingMode === "byok" && (
                <TabsContent value="api-keys">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("credentials.title")}</CardTitle>
                            <CardDescription>
                                {t("credentials.description")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {/* Operating Mode Banner */}
                            {user?.operatingMode === "byok" ? (
                                <div className="mb-6 p-4 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                            <Key className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-foreground">Modelo 3: BYOK Habilitado</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Sua conta está autorizada a utilizar chaves próprias de API (OpenRouter, ElevenLabs, Deepgram, Sarvam).
                                                O motor multimodal Gemini Live permanece exclusivo do Modelo Gerenciado.
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-purple-600 border-purple-300 shrink-0">
                                        Chaves Próprias
                                    </Badge>
                                </div>
                            ) : (
                                <div className="mb-6 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                            <Sparkles className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-bold text-foreground">Modelo 1: IA Fixa Gerenciada (Ativo)</h4>
                                                <Badge className="bg-emerald-600 text-white text-[10px] h-4">Oficial Nuvv</Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                                                Você não precisa fornecer chaves de IA (Gemini, OpenRouter ou ElevenLabs). A plataforma injeta chaves master de alta performance com síntese de voz multimodal em tempo real. O uso é cobrado automaticamente em créditos na sua carteira.
                                            </p>
                                        </div>
                                    </div>
                                    <Link href="/credits">
                                        <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 shrink-0">
                                            <Coins className="h-3.5 w-3.5 me-1.5 text-amber-500" />
                                            Ver Carteira de Créditos
                                        </Button>
                                    </Link>
                                </div>
                            )}

                            <form onSubmit={handleSaveSettings} className="space-y-6">
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="twilio-sid" className="text-xs font-bold uppercase text-muted-foreground">{t("credentials.twilioSid")}</Label>
                                        <Input
                                            id="twilio-sid"
                                            value={apiKeys.twilioSid}
                                            onChange={(e) =>
                                                setApiKeys({ ...apiKeys, twilioSid: e.target.value })
                                            }
                                            placeholder={t("credentials.twilioSidPlaceholder")}
                                            className="font-mono text-sm"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="twilio-token" className="text-xs font-bold uppercase text-muted-foreground">{t("credentials.twilioToken")}</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="twilio-token"
                                                type="password"
                                                value={apiKeys.twilioToken}
                                                onChange={(e) =>
                                                    setApiKeys({ ...apiKeys, twilioToken: e.target.value })
                                                }
                                                placeholder="••••••••••••••••••••••••••••••••"
                                                className="font-mono text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="openrouter-key" className="text-xs font-bold uppercase text-muted-foreground">{t("credentials.openRouter")}</Label>
                                        <Input
                                            id="openrouter-key"
                                            type="password"
                                            value={apiKeys.openRouterKey}
                                            onChange={(e) =>
                                                setApiKeys({ ...apiKeys, openRouterKey: e.target.value })
                                            }
                                            placeholder="sk-or-••••••••••••••••••••••••••••"
                                            className="font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="elevenlabs-key" className="text-xs font-bold uppercase text-muted-foreground">{t("credentials.elevenLabs")}</Label>
                                            {verifyingElevenLabs && (
                                                <div className="flex items-center gap-1 text-[10px] text-primary animate-pulse font-bold">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    {t("credentials.verifying")}
                                                </div>
                                            )}
                                        </div>
                                        <Input
                                            id="elevenlabs-key"
                                            type="password"
                                            value={apiKeys.elevenLabsKey}
                                            onChange={(e) =>
                                                setApiKeys({ ...apiKeys, elevenLabsKey: e.target.value })
                                            }
                                            placeholder="••••••••••••••••••••••••••••••••"
                                            className={`font-mono text-sm ${elevenLabsKeyError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                                        />
                                        {elevenLabsKeyError && (
                                            <p className="text-[10px] text-destructive font-bold animate-in fade-in slide-in-from-top-1">
                                                {elevenLabsKeyError}. {t("credentials.keyErrorSuffix")}
                                            </p>
                                        )}
                                        {!elevenLabsKeyError && !verifyingElevenLabs && apiKeys.elevenLabsKey && (
                                            <p className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                                                <Check className="h-3 w-3" /> {t("credentials.validKey")}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="deepgram-key" className="text-xs font-bold uppercase text-muted-foreground">{t("credentials.deepgram")}</Label>
                                        <Input
                                            id="deepgram-key"
                                            type="password"
                                            value={apiKeys.deepgramKey}
                                            onChange={(e) =>
                                                setApiKeys({ ...apiKeys, deepgramKey: e.target.value })
                                            }
                                            placeholder="••••••••••••••••••••••••••••••••"
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            {t("credentials.deepgramHint")}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="sarvam-key" className="text-xs font-bold uppercase text-muted-foreground">{t("credentials.sarvam")}</Label>
                                        <Input
                                            id="sarvam-key"
                                            type="password"
                                            value={apiKeys.sarvamKey}
                                            onChange={(e) =>
                                                setApiKeys({ ...apiKeys, sarvamKey: e.target.value })
                                            }
                                            placeholder="••••••••••••••••••••••••••••••••"
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            {t("credentials.sarvamHint")}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="gemini-key" className="text-xs font-bold uppercase text-muted-foreground">{t("credentials.gemini")}</Label>
                                        <Input
                                            id="gemini-key"
                                            type="password"
                                            value={apiKeys.geminiKey}
                                            onChange={(e) =>
                                                setApiKeys({ ...apiKeys, geminiKey: e.target.value })
                                            }
                                            placeholder="••••••••••••••••••••••••••••••••"
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            {t("credentials.geminiHint")}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-2">
                                    <Button type="submit" disabled={saving}>
                                        {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                        {c("actions.saveChanges")}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
                )}
                <TabsContent value="webhooks">
                    <Card className="max-w-3xl">
                        <CardHeader>
                            <CardTitle>{t("webhooks.title")}</CardTitle>
                            <CardDescription>
                                {t("webhooks.description")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20 max-w-2xl">
                                <div className="space-y-1">
                                    <Label className="text-sm font-bold uppercase tracking-wider">{t("webhooks.enable")}</Label>
                                    <p className="text-xs text-muted-foreground">{t("webhooks.enableHint")}</p>
                                </div>
                                <Switch
                                    checked={webhookSettings.enabled}
                                    onCheckedChange={(checked) => setWebhookSettings({ ...webhookSettings, enabled: checked })}
                                />
                            </div>

                            <div className="grid gap-6 md:grid-cols-1 max-w-2xl mt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="webhook-url" className="text-xs font-bold uppercase text-muted-foreground/80">{t("webhooks.payloadUrl")}</Label>
                                    <Input
                                        id="webhook-url"
                                        placeholder="https://your-app.com/webhooks"
                                        value={webhookSettings.url}
                                        onChange={(e) => setWebhookSettings({ ...webhookSettings, url: e.target.value })}
                                        className="font-mono text-sm h-11"
                                    />
                                    <p className="text-[11px] text-muted-foreground">{t("webhooks.payloadUrlHint")}</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="webhook-secret" className="text-xs font-bold uppercase text-muted-foreground/80">{t("webhooks.signingSecret")}</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="webhook-secret"
                                            readOnly
                                            value={webhookSettings.secret}
                                            className="font-mono text-sm bg-muted/30"
                                        />
                                        <Button variant="outline" size="sm" onClick={handleRegenerateSecret}>
                                            {t("webhooks.regenerate")}
                                        </Button>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">{t("webhooks.signingSecretHint")}</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t max-w-2xl">
                                <Label className="text-sm font-bold uppercase tracking-wider mb-4 block">{t("webhooks.triggerEvents")}</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                                    {WEBHOOK_EVENT_IDS.map((id) => (
                                        <div key={id} className="flex items-start space-x-3 p-3 rounded-lg border bg-card/50 hover:bg-muted/10 transition-colors">
                                            <Switch
                                                id={`event-${id}`}
                                                className="mt-1"
                                                checked={(webhookSettings.events as any)[id]}
                                                onCheckedChange={(checked) => {
                                                    setWebhookSettings({
                                                        ...webhookSettings,
                                                        events: { ...webhookSettings.events, [id]: checked }
                                                    });
                                                }}
                                            />
                                            <div className="grid gap-0.5 pointer-events-none">
                                                <Label htmlFor={`event-${id}`} className="text-sm font-semibold">{t(`events.${id}.label`)}</Label>
                                                <span className="text-[10px] text-muted-foreground leading-tight">{t(`events.${id}.desc`)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6 flex gap-3">
                                <Button onClick={() => handleSaveSettings()} disabled={saving}>
                                    {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                    {t("webhooks.save")}
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline">
                                            {t("webhooks.sendTest")}
                                            <ChevronDown className="ms-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-[200px] rounded-xl">
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEvent('inboundCall', t(`events.inboundCall.short`))}>
                                            {t(`events.inboundCall.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEvent('outboundCall', t(`events.outboundCall.short`))}>
                                            {t(`events.outboundCall.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEvent('callCompleted', t(`events.callCompleted.short`))}>
                                            {t(`events.callCompleted.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEvent('leadCreated', t(`events.leadCreated.short`))}>
                                            {t(`events.leadCreated.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEvent('leadQualified', t(`events.leadQualified.short`))}>
                                            {t(`events.leadQualified.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEvent('campaignCompleted', t(`events.campaignCompleted.short`))}>
                                            {t(`events.campaignCompleted.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEvent('appointmentBooked', t(`events.appointmentBooked.short`))}>
                                            {t(`events.appointmentBooked.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEvent('appointmentCanceled', t(`events.appointmentCanceled.short`))}>
                                            {t(`events.appointmentCanceled.label`)}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="email">
                    <Card className="max-w-3xl">
                        <CardHeader>
                            <CardTitle>{t("emailNotifications.title")}</CardTitle>
                            <CardDescription>
                                {t("emailNotifications.description")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20 max-w-2xl">
                                <div className="space-y-1">
                                    <Label className="text-sm font-bold uppercase tracking-wider">{t("emailNotifications.enable")}</Label>
                                    <p className="text-xs text-muted-foreground">{t("emailNotifications.enableHint")}</p>
                                </div>
                                <Switch
                                    checked={emailSettings.enabled}
                                    onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, enabled: checked })}
                                />
                            </div>

                            <div className="grid gap-6 md:grid-cols-2 max-w-2xl mt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="brevo-key" className="text-xs font-bold uppercase text-muted-foreground/80">{t("emailNotifications.brevoKey")}</Label>
                                    <Input
                                        id="brevo-key"
                                        type="password"
                                        placeholder={t("emailNotifications.brevoKeyPlaceholder")}
                                        value={emailSettings.brevoKey}
                                        onChange={(e) => setEmailSettings({ ...emailSettings, brevoKey: e.target.value })}
                                        className="font-mono text-sm h-11"
                                    />
                                    <p className="text-[11px] text-muted-foreground">{t("emailNotifications.brevoKeyHint")}</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="recipient-email" className="text-xs font-bold uppercase text-muted-foreground/80">{t("emailNotifications.recipientEmail")}</Label>
                                    <Input
                                        id="recipient-email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={emailSettings.recipientEmail}
                                        onChange={(e) => setEmailSettings({ ...emailSettings, recipientEmail: e.target.value })}
                                        className="text-sm h-11"
                                    />
                                    <p className="text-[11px] text-muted-foreground">{t("emailNotifications.recipientEmailHint")}</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="sender-name" className="text-xs font-bold uppercase text-muted-foreground/80">{t("emailNotifications.senderName")}</Label>
                                    <Input
                                        id="sender-name"
                                        placeholder={branding.appName}
                                        value={emailSettings.senderName}
                                        onChange={(e) => setEmailSettings({ ...emailSettings, senderName: e.target.value })}
                                        className="text-sm h-11"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="sender-email" className="text-xs font-bold uppercase text-muted-foreground/80">{t("emailNotifications.senderEmail")}</Label>
                                    <Input
                                        id="sender-email"
                                        placeholder="notifications@yourdomain.com"
                                        value={emailSettings.senderEmail}
                                        onChange={(e) => setEmailSettings({ ...emailSettings, senderEmail: e.target.value })}
                                        className="text-sm h-11"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t max-w-2xl">
                                <Label className="text-sm font-bold uppercase tracking-wider mb-4 block">{t("emailNotifications.notificationEvents")}</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                                    {EMAIL_EVENT_IDS.map((id) => (
                                        <div key={id} className="flex items-start space-x-3 p-3 rounded-lg border bg-card/50 hover:bg-muted/10 transition-colors">
                                            <Switch
                                                id={`email-event-${id}`}
                                                className="mt-1"
                                                checked={(emailSettings.events as any)[id]}
                                                onCheckedChange={(checked) => {
                                                    setEmailSettings({
                                                        ...emailSettings,
                                                        events: { ...emailSettings.events, [id]: checked }
                                                    });
                                                }}
                                            />
                                            <div className="grid gap-0.5 pointer-events-none">
                                                <Label htmlFor={`email-event-${id}`} className="text-sm font-semibold">{t(`events.${id}.label`)}</Label>
                                                <p className="text-[11px] text-muted-foreground leading-tight">{t(`events.${id}.desc`)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6 flex gap-3">
                                <Button onClick={() => handleSaveSettings()} disabled={saving}>
                                    {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                    {t("emailNotifications.save")}
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline">
                                            {t("emailNotifications.sendTest")}
                                            <ChevronDown className="ms-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-[200px] rounded-xl">
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEmail('appointmentBooked', t(`events.appointmentBooked.short`))}>
                                            {t(`events.appointmentBooked.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEmail('appointmentCanceled', t(`events.appointmentCanceled.short`))}>
                                            {t(`events.appointmentCanceled.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEmail('leadCreated', t(`events.leadCreated.short`))}>
                                            {t(`events.leadCreated.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEmail('leadQualified', t(`events.leadQualified.short`))}>
                                            {t(`events.leadQualified.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEmail('inboundCall', t(`events.inboundCall.short`))}>
                                            {t(`events.inboundCall.label`)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendTestEmail('callCompleted', t(`events.callCompleted.short`))}>
                                            {t(`events.callCompleted.label`)}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="integrations">
                    <IntegrationsPanel />
                </TabsContent>

                <TabsContent value="billing">
                    <div className="grid gap-6">
                        <Card className="rounded-2xl border-slate-100 shadow-sm">
                            <CardHeader>
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <CardTitle className="text-xl font-bold">{t("billing.currentPlanTitle")}</CardTitle>
                                        <CardDescription>{t("billing.currentPlanDescription")}</CardDescription>
                                        <div className="flex flex-wrap items-center gap-4 pt-2 text-sm">
                                            {user?.planStatus != null && (
                                                <span className="text-slate-600 dark:text-slate-400">
                                                    <span className="font-medium text-slate-500 dark:text-slate-500">{t("billing.status")}</span>{" "}
                                                    <span className="capitalize font-medium">{user.planStatus}</span>
                                                </span>
                                            )}
                                            {user?.planExpiry && (() => {
                                                const expiryDate = new Date(user.planExpiry);
                                                const isExpired = expiryDate < new Date();
                                                return (
                                                    <span className="text-slate-600 dark:text-slate-400">
                                                        <span className="font-medium text-slate-500 dark:text-slate-500">
                                                            {isExpired ? t("billing.expiredOn") : t("billing.expires")}
                                                        </span>{" "}
                                                        {expiryDate.toLocaleDateString(undefined, { dateStyle: "medium" })}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <Badge className={`px-4 py-1 text-sm bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 ${usage?.isTrial ? 'animate-pulse bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/10' : ''}`}>
                                        {user?.plan?.name || t("billing.trialPlan")}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className={`grid gap-4 ${usage?.isTrial ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                                    <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-muted/30 space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold uppercase text-slate-400 dark:text-slate-500">
                                            <span>{t("billing.agents")}</span>
                                            <span className="text-slate-900 dark:text-slate-100">{usage?.usage?.agents ?? 0} / {usage?.limits?.agents ?? 0}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary"
                                                style={{ width: `${Math.min(100, ((usage?.usage?.agents ?? 0) / Math.max(1, usage?.limits?.agents ?? 1)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-muted/30 space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold uppercase text-slate-400 dark:text-slate-500">
                                            <span>{t("billing.campaigns")}</span>
                                            <span className="text-slate-900 dark:text-slate-100">{usage?.usage?.campaigns ?? 0} / {usage?.limits?.campaigns ?? 0}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary"
                                                style={{ width: `${Math.min(100, ((usage?.usage?.campaigns ?? 0) / Math.max(1, usage?.limits?.campaigns ?? 1)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-muted/30 space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold uppercase text-slate-400 dark:text-slate-500">
                                            <span>{t("billing.leads")}</span>
                                            <span className="text-slate-900 dark:text-slate-100">{usage?.usage?.leads ?? 0} / {usage?.limits?.leads ?? 0}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary"
                                                style={{ width: `${Math.min(100, ((usage?.usage?.leads ?? 0) / Math.max(1, usage?.limits?.leads ?? 1)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    {usage?.isTrial && (
                                        <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-muted/30 space-y-2">
                                            <div className="flex justify-between items-center text-xs font-bold uppercase text-slate-400 dark:text-slate-500">
                                                <span>{t("billing.calls")}</span>
                                                <span className="text-slate-900 dark:text-slate-100">
                                                    {usage?.usage?.calls ?? 0}
                                                    {" / "}
                                                    {usage?.limits?.callsPerMonth === -1
                                                        ? t("billing.unlimited")
                                                        : usage?.limits?.callsPerMonth ?? 0}
                                                </span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-amber-500"
                                                    style={{
                                                        width: usage?.limits?.callsPerMonth && usage.limits.callsPerMonth > 0
                                                            ? `${Math.min(100, ((usage?.usage?.calls ?? 0) / Math.max(1, usage.limits.callsPerMonth)) * 100)}%`
                                                            : "0%"
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <div className="space-y-4">
                            <h2 className="text-xl font-bold px-1">{t("billing.availablePlans")}</h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                {plans.map((plan) => (
                                    <Card key={plan._id} className={`rounded-2xl border-slate-100 shadow-sm flex flex-col ${user?.plan?._id === plan._id ? 'border-primary ring-1 ring-primary/20' : ''}`}>
                                        <CardHeader>
                                            <div className="flex justify-between items-start">
                                                <div className="p-2 bg-primary/5 rounded-lg mb-2">
                                                    <Zap className="h-5 w-5 text-primary" />
                                                </div>
                                                {user?.plan?._id === plan._id && (
                                                    <Badge className="bg-primary text-white">{t("billing.currentPlan")}</Badge>
                                                )}
                                            </div>
                                            <CardTitle className="text-xl font-bold pt-2">{plan.name}</CardTitle>
                                            <CardDescription>{plan.description}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex-1 space-y-4">
                                            <div className="flex items-baseline gap-1 py-2">
                                                <span className="text-3xl font-bold">{currency}{plan.price}</span>
                                                <span className="text-slate-500 dark:text-slate-400 text-sm">/{plan.interval}</span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                                                    {t("billing.planAgents", { count: plan.limits.agents === -1 ? t("billing.unlimited") : plan.limits.agents })}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                                                    {t("billing.planCampaigns", { count: plan.limits.campaigns === -1 ? t("billing.unlimited") : plan.limits.campaigns })}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                                                    {t("billing.planLeads", { count: plan.limits.leads === -1 ? t("billing.unlimited") : plan.limits.leads })}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                                                    {plan.limits.callsPerMonth === -1
                                                        ? t("billing.planCallsUnlimited")
                                                        : t("billing.planCalls", { count: plan.limits.callsPerMonth })}
                                                </div>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="pt-6">
                                            <Button
                                                className="w-full rounded-full"
                                                variant={user?.plan?._id === plan._id ? "outline" : "default"}
                                                disabled={user?.plan?._id === plan._id}
                                                onClick={() => handleUpgrade(plan)}
                                            >
                                                {user?.plan?._id === plan._id ? t("billing.currentPlan") : t("billing.upgradePlan")}
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="transactions">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("transactions.title")}</CardTitle>
                            <CardDescription>
                                {t("transactions.description")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-xl border border-slate-100 dark:border-border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/50 dark:bg-muted/40 border-b border-slate-100 dark:border-border">
                                        <tr>
                                            <th className="px-4 py-3 text-start font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">{t("transactions.date")}</th>
                                            <th className="px-4 py-3 text-start font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">{t("transactions.plan")}</th>
                                            <th className="px-4 py-3 text-start font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">{t("transactions.amount")}</th>
                                            <th className="px-4 py-3 text-start font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">{t("transactions.method")}</th>
                                            <th className="px-4 py-3 text-end font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">{t("transactions.status")}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-border">
                                        {loadingTransactions ? (
                                            Array(3).fill(0).map((_, i) => (
                                                <tr key={i}>
                                                    <td colSpan={5} className="px-4 py-4">
                                                        <Skeleton className="h-4 w-full" />
                                                    </td>
                                                </tr>
                                            ))
                                        ) : transactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                                                    {t("transactions.empty")}
                                                </td>
                                            </tr>
                                        ) : (
                                            transactions.map((tx) => (
                                                <tr key={tx._id} className="hover:bg-slate-50/30 dark:hover:bg-muted/30 transition-colors">
                                                    <td className="px-4 py-4 font-medium">
                                                        {new Date(tx.createdAt).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-4 py-4 font-bold text-slate-900 dark:text-slate-100">
                                                        {tx.plan?.name || t("transactions.premiumPlan")}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        {currency}{tx.amount}
                                                    </td>
                                                    <td className="px-4 py-4 capitalize text-slate-500 dark:text-slate-400">
                                                        {tx.paymentGateway}
                                                    </td>
                                                    <td className="px-4 py-4 text-end">
                                                        <Badge
                                                            variant="outline"
                                                            className={`
                                                                ${tx.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20' :
                                                                    tx.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20' :
                                                                        'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'}
                                                            `}
                                                        >
                                                            {tx.status}
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="system">
                    <Card className="max-w-3xl">
                        <CardHeader>
                            <CardTitle>{t("preferences.title")}</CardTitle>
                            <CardDescription>
                                {t("preferences.description")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                {/* Applies on change rather than on Save — a language
                                    selector that needs a separate save is a papercut. */}
                                <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20 max-w-2xl">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="ui-language" className="text-sm font-bold uppercase">{t("preferences.language")}</Label>
                                        <p className="text-xs text-muted-foreground">
                                            {t("preferences.languageHint")}
                                        </p>
                                    </div>
                                    <Select value={locale} onValueChange={handleLocaleChange}>
                                        <SelectTrigger id="ui-language" className="w-[180px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {LOCALES.map((option) => (
                                                <SelectItem key={option.code} value={option.code}>
                                                    <div className="flex items-center gap-2">
                                                        <Languages className="h-4 w-4 text-muted-foreground" />
                                                        <span>{option.label}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20 max-w-2xl">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="time-format" className="text-sm font-bold uppercase">{t("preferences.timeFormat")}</Label>
                                        <p className="text-xs text-muted-foreground">
                                            {t("preferences.timeFormatHint")}
                                        </p>
                                    </div>
                                    <Select
                                        value={systemSettings.timeFormat}
                                        onValueChange={(val) => {
                                            setSystemSettings({ ...systemSettings, timeFormat: val });
                                        }}
                                    >
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue placeholder={t("preferences.selectFormat")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="12">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                                    <span>{t("preferences.hour12")}</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="24">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                                    <span>{t("preferences.hour24")}</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20 max-w-2xl">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="time-zone" className="text-sm font-bold uppercase">{t("preferences.timeZone")}</Label>
                                        <p className="text-xs text-muted-foreground">
                                            {t("preferences.timeZoneHint")}
                                        </p>
                                    </div>
                                    <Select
                                        value={systemSettings.timeZone || "UTC"}
                                        onValueChange={(val) => {
                                            setSystemSettings({ ...systemSettings, timeZone: val });
                                        }}
                                    >
                                        <SelectTrigger className="w-[280px]">
                                            <SelectValue placeholder={t("preferences.selectTimeZone")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(() => {
                                                const current = systemSettings.timeZone || "America/Sao_Paulo";
                                                const list = COMMON_TIMEZONES.includes(current) ? COMMON_TIMEZONES : [current, ...COMMON_TIMEZONES];
                                                const formatTzName = (tz: string) => {
                                                    if (tz === "America/Sao_Paulo") return "America/Sao Paulo (Brasília, UTC-3)";
                                                    if (tz === "America/Manaus") return "America/Manaus (Amazonas, UTC-4)";
                                                    if (tz === "America/Belem") return "America/Belém (Norte, UTC-3)";
                                                    if (tz === "America/Fortaleza") return "America/Fortaleza (Nordeste, UTC-3)";
                                                    if (tz === "America/Recife") return "America/Recife (Nordeste, UTC-3)";
                                                    if (tz === "America/Cuiaba") return "America/Cuiabá (Mato Grosso, UTC-4)";
                                                    if (tz === "America/Rio_Branco") return "America/Rio Branco (Acre, UTC-5)";
                                                    if (tz === "America/Noronha") return "America/Noronha (Fernando de Noronha, UTC-2)";
                                                    return tz.replace(/_/g, " ");
                                                };
                                                return list.map((tz) => (
                                                    <SelectItem key={tz} value={tz}>
                                                        <div className="flex items-center gap-2">
                                                            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                                                            <span>{formatTzName(tz)}</span>
                                                        </div>
                                                    </SelectItem>
                                                ));
                                            })()}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4 text-primary" />
                                        <h3 className="text-sm font-bold uppercase tracking-wider">{t("preferences.callSettings")}</h3>
                                    </div>
                                    <div className="grid gap-4">
                                        <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20 max-w-2xl">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="recording-enabled" className="text-sm font-bold uppercase">{t("preferences.callRecording")}</Label>
                                                <p className="text-xs text-muted-foreground">
                                                    {t("preferences.callRecordingHint")}
                                                </p>
                                            </div>
                                            <Switch
                                                id="recording-enabled"
                                                checked={systemSettings.recordingEnabled}
                                                onCheckedChange={(checked) => {
                                                    setSystemSettings({ ...systemSettings, recordingEnabled: checked });
                                                }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20 max-w-2xl">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="auto-analysis" className="text-sm font-bold uppercase">{t("preferences.autoAnalysis")}</Label>
                                                <p className="text-xs text-muted-foreground">
                                                    {t("preferences.autoAnalysisHint")}
                                                </p>
                                            </div>
                                            <Switch
                                                id="auto-analysis"
                                                checked={systemSettings.autoAnalysisEnabled}
                                                onCheckedChange={(checked) => {
                                                    setSystemSettings({ ...systemSettings, autoAnalysisEnabled: checked });
                                                }}
                                            />
                                        </div>

                                        <div className="flex flex-col space-y-4 rounded-xl border p-4 bg-muted/20 max-w-2xl">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <Label htmlFor="auto-hangup" className="text-sm font-bold uppercase">{t("preferences.autoHangup")}</Label>
                                                        {systemSettings.autoHangupEnabled && (systemSettings.incomingHangupLimit === 0 || systemSettings.outgoingHangupLimit === 0) && (
                                                            <Badge variant="destructive" className="text-[10px] h-4 px-1.5 uppercase">{t("preferences.immediateHangup")}</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("preferences.autoHangupHint")}
                                                    </p>
                                                </div>
                                                <Switch
                                                    id="auto-hangup"
                                                    checked={systemSettings.autoHangupEnabled}
                                                    onCheckedChange={(checked) => {
                                                        setSystemSettings({ ...systemSettings, autoHangupEnabled: checked });
                                                    }}
                                                />
                                            </div>

                                            {systemSettings.autoHangupEnabled && (
                                                <div className="flex flex-col gap-4 pt-2 border-t border-border/50 animate-in fade-in slide-in-from-top-1">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <Label htmlFor="incoming-limit" className="text-[10px] font-bold uppercase text-muted-foreground">{t("preferences.incomingTimeout")}</Label>
                                                                {systemSettings.incomingHangupLimit === 0 && (
                                                                    <Badge variant="destructive" className="text-[8px] h-3 px-1.5 uppercase">{t("preferences.immediate")}</Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    id="incoming-limit"
                                                                    type="number"
                                                                    min="0"
                                                                    className="w-24 h-9"
                                                                    value={systemSettings.incomingHangupLimit}
                                                                    onChange={(e) => setSystemSettings({ ...systemSettings, incomingHangupLimit: parseInt(e.target.value) || 0 })}
                                                                />
                                                                <span className="text-sm text-muted-foreground">{t("preferences.minutesAbbrev")}</span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <Label htmlFor="outgoing-limit" className="text-[10px] font-bold uppercase text-muted-foreground">{t("preferences.outgoingTimeout")}</Label>
                                                                {systemSettings.outgoingHangupLimit === 0 && (
                                                                    <Badge variant="destructive" className="text-[8px] h-3 px-1.5 uppercase">{t("preferences.immediate")}</Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    id="outgoing-limit"
                                                                    type="number"
                                                                    min="0"
                                                                    className="w-24 h-9"
                                                                    value={systemSettings.outgoingHangupLimit}
                                                                    onChange={(e) => setSystemSettings({ ...systemSettings, outgoingHangupLimit: parseInt(e.target.value) || 0 })}
                                                                />
                                                                <span className="text-sm text-muted-foreground">{t("preferences.minutesAbbrev")}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground italic">
                                                        {t("preferences.hangupHint")}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <Button onClick={() => handleSaveSettings()} disabled={saving}>
                                        {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                        {t("preferences.apply")}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Asterisk / SIP Status Card */}
                    <Card className="mt-6 max-w-3xl">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Server className="h-5 w-5 text-primary" />
                                <CardTitle>{t("asterisk.title")}</CardTitle>
                            </div>
                            <CardDescription>
                                {t("asterisk.description")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-6 p-4 rounded-xl border bg-muted/20 max-w-2xl">
                                <div className="flex items-center gap-2">
                                    {asteriskStatus?.asteriskConnected ? (
                                        <>
                                            <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-sm font-semibold text-green-700">{t("asterisk.connected")}</span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="h-3 w-3 rounded-full bg-red-400" />
                                            <span className="text-sm font-semibold text-red-600">{t("asterisk.offline")}</span>
                                        </>
                                    )}
                                </div>
                                <div className="h-5 w-px bg-border" />
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Activity className="h-4 w-4" />
                                    <span>{t("asterisk.activeCalls", { count: asteriskStatus?.activeSipCalls ?? 0 })}</span>
                                </div>
                                <div className="ms-auto">
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href="/sip-trunks">
                                            <Server className="me-2 h-3.5 w-3.5" />
                                            {t("asterisk.manageTrunks")}
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                </TabsContent>
            </Tabs>

            <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-center">{t("payment.selectGateway")}</DialogTitle>
                        <DialogDescription className="text-center pt-2">
                            {t("payment.choosePrompt")} <span className="font-bold text-slate-900">{selectedPlan?.name}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 py-6">
                        {loadingGateways ? (
                            <>
                                <Skeleton className="h-20 w-full rounded-xl" />
                                <Skeleton className="h-20 w-full rounded-xl" />
                            </>
                        ) : (
                            <>
                                {enabledGateways.stripe && (
                                    <Button
                                        variant="outline"
                                        className="h-20 justify-start gap-6 px-6 rounded-xl hover:bg-muted/50 transition-all"
                                        onClick={() => handleGatewaySelect("Stripe")}
                                    >
                                        <div className="relative h-10 w-32 flex items-center justify-center shrink-0">
                                            <Image src="/images/gateways/stripe.png" alt="Stripe" fill className="object-contain dark:hidden" />
                                            <Image src="/images/gateways/stripe_dark.png" alt="Stripe" fill className="object-contain hidden dark:block" />
                                        </div>
                                        <div className="text-start flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-base">Stripe</p>
                                                {enabledGateways.stripeTestMode && (
                                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 uppercase bg-yellow-100 text-yellow-700 border-yellow-200">{t("payment.testMode")}</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500">{t("payment.stripeHint")}</p>
                                        </div>
                                    </Button>
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
                                    <Button
                                        variant="outline"
                                        className="h-20 justify-start gap-6 px-6 rounded-xl hover:bg-muted/50 transition-all"
                                        onClick={() => handleGatewaySelect("Dodo Payments")}
                                    >
                                        <div className="relative h-10 w-32 flex items-center justify-center shrink-0">
                                            <Image src="/images/gateways/dodopayments.png" alt="Dodo" fill className="object-contain dark:hidden" />
                                            <Image src="/images/gateways/dodopayments_dark.png" alt="Dodo" fill className="object-contain hidden dark:block" />
                                        </div>
                                        <div className="text-start flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-base">Dodo Payments</p>
                                                {enabledGateways.dodopaymentsTestMode && (
                                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 uppercase bg-yellow-100 text-yellow-700 border-yellow-200">{t("payment.testMode")}</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500">{t("payment.dodoHint")}</p>
                                        </div>
                                    </Button>
                                )}
                                {enabledGateways.razorpay && (
                                    <Button
                                        variant="outline"
                                        className="h-20 justify-start gap-6 px-6 rounded-xl hover:bg-muted/50 transition-all"
                                        onClick={() => handleGatewaySelect("Razorpay")}
                                    >
                                        <div className="relative h-10 w-32 flex items-center justify-center shrink-0">
                                            <Image src="/images/gateways/razorpay.png" alt="Razorpay" fill className="object-contain dark:hidden" />
                                            <Image src="/images/gateways/razorpay_dark.png" alt="Razorpay" fill className="object-contain hidden dark:block" />
                                        </div>
                                        <div className="text-start flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-base">Razorpay</p>
                                                {enabledGateways.razorpayTestMode && (
                                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 uppercase bg-yellow-100 text-yellow-700 border-yellow-200">{t("payment.testMode")}</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500">{t("payment.razorpayHint")}</p>
                                        </div>
                                    </Button>
                                )}
                                {!enabledGateways.stripe && !enabledGateways.paypal && !enabledGateways.dodopayments && !enabledGateways.razorpay && (
                                    <p className="text-center text-sm text-muted-foreground py-4">
                                        {t("payment.noMethods")}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <p className="text-[10px] text-center w-full text-slate-400">
                            {t("payment.legal")}
                        </p>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
