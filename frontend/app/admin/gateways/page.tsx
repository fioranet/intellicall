"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import {
    CreditCard,
    ShieldCheck,
    Settings2,
    Loader2,
    Save
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AdminNav } from "@/components/admin/nav";
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function AdminGatewaysPage() {
    const t = useTranslations("admin");
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string>('idle');

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/admin/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                const data = response.data.data.settings;
                // Ensure gateways object exists with defaults
                const defaultGateways = {
                    stripe: { enabled: false, testMode: true, publishableKey: '', secretKey: '' },
                    paypal: { enabled: false, testMode: true, clientId: '', secretKey: '' },
                    dodopayments: { enabled: false, testMode: true, apiKey: '', webhookSecret: '' },
                    razorpay: { enabled: false, testMode: true, keyId: '', keySecret: '' }
                };
                setSettings({
                    ...data,
                    gateways: {
                        ...defaultGateways,
                        ...(data.gateways || {})
                    }
                });
            }
        } catch (err: any) {
            toast.error(t("gateways.toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSaveAll = async (updatedSettings?: any) => {
        const payload = updatedSettings || settings;
        try {
            setSaving(updatedSettings ? 'auto' : 'saving');
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/admin/settings`, payload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                toast.success(updatedSettings ? "Status updated" : "All configurations saved");
                if (!updatedSettings) {
                    setSaving('saved');
                    setTimeout(() => setSaving('idle'), 2000);
                } else {
                    setSaving('idle');
                }
            }
        } catch (err: any) {
            toast.error(t("gateways.toast.saveFailed"));
            setSaving('idle');
        }
    };

    const handleUpdateGateway = (gateway: string, field: string, value: any) => {
        const newSettings = {
            ...settings,
            gateways: {
                ...settings.gateways,
                [gateway]: {
                    ...settings.gateways[gateway],
                    [field]: value
                }
            }
        };
        setSettings(newSettings);

        // Auto-save only when toggling the enabled or testMode switch
        if (field === 'enabled' || field === 'testMode') {
            handleSaveAll(newSettings);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const { gateways } = settings;

    const GATEWAY_CONFIG = [
        {
            id: 'stripe',
            name: 'Stripe',
            logo: '/images/gateways/stripe.png',
            logoDark: '/images/gateways/stripe_dark.png',
            fields: [
                { key: 'publishableKey', label: 'Publishable Key', type: 'text', placeholder: 'pk_test_...' },
                { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'sk_test_...' }
            ],
            testModeLabel: 'Sandbox'
        },
        {
            id: 'paypal',
            name: 'PayPal',
            logo: '/images/gateways/paypal.png',
            logoDark: '/images/gateways/paypal_dark.png',
            fields: [
                { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Enter Client ID' },
                { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'Enter Secret Key' }
            ],
            testModeLabel: 'Sandbox'
        },
        {
            id: 'dodopayments',
            name: 'Dodo Payments',
            logo: '/images/gateways/dodopayments.png',
            logoDark: '/images/gateways/dodopayments_dark.png',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'dp_...' }
            ],
            testModeLabel: 'Test Mode'
        },
        {
            id: 'razorpay',
            name: 'Razorpay',
            logo: '/images/gateways/razorpay.png',
            logoDark: '/images/gateways/razorpay_dark.png',
            fields: [
                { key: 'keyId', label: 'Key ID', type: 'text', placeholder: 'rzp_test_...' },
                { key: 'keySecret', label: 'Key Secret', type: 'password', placeholder: 'Enter Key Secret' }
            ],
            testModeLabel: 'Test Mode'
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">{t("gateways.title")}</h1>
                    <p className="text-muted-foreground">{t("gateways.subtitle")}</p>
                </div>
                <Button
                    onClick={() => handleSaveAll()}
                    disabled={saving !== 'idle'}
                    className="shadow-lg min-w-[160px]"
                >
                    {saving === 'saving' ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : (saving === 'saved' ? <ShieldCheck className="me-2 h-4 w-4" /> : <Save className="me-2 h-4 w-4" />)}
                    {saving === 'saved' ? 'Saved' : (saving === 'saving' ? 'Saving...' : 'Save All Changes')}
                </Button>
            </div>

            <AdminNav currentPath="/admin/gateways" />

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {GATEWAY_CONFIG.map((gateway) => (
                    <Card key={gateway.id} className="rounded-xl border-border shadow-sm overflow-hidden">
                        <CardHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between space-y-0 bg-muted/20 h-14">
                            <div className="flex items-center">
                                <div className="relative h-10 w-32 overflow-hidden flex items-center">
                                    <Image src={gateway.logo} alt={gateway.name} fill className="object-contain object-left dark:hidden" />
                                    <Image src={gateway.logoDark} alt={gateway.name} fill className="object-contain object-left hidden dark:block" />
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor={`${gateway.id}-test`} className="text-[10px] font-medium uppercase text-muted-foreground">{t("gateways.testMode")}</Label>
                                    <Switch
                                        id={`${gateway.id}-test`}
                                        checked={(gateways as any)[gateway.id].testMode}
                                        onCheckedChange={(checked) => handleUpdateGateway(gateway.id, 'testMode', checked)}
                                        disabled={saving === 'auto'}
                                        className="scale-75 origin-right"
                                    />
                                </div>
                                <div className="h-4 w-[1px] bg-border" />
                                <div className="flex items-center gap-2">
                                    <Label htmlFor={`${gateway.id}-enabled`} className="text-[10px] font-medium uppercase text-muted-foreground">{t("gateways.enabled")}</Label>
                                    <Switch
                                        id={`${gateway.id}-enabled`}
                                        checked={(gateways as any)[gateway.id].enabled}
                                        onCheckedChange={(checked) => handleUpdateGateway(gateway.id, 'enabled', checked)}
                                        disabled={saving === 'auto'}
                                        className="scale-90 origin-right"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3 bg-card/50">
                            {gateway.fields.map((field) => (
                                <div key={field.key} className="grid gap-1.5">
                                    <div className="flex justify-between items-baseline">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{field.label}</Label>
                                    </div>
                                    <Input
                                        placeholder={field.placeholder}
                                        type={field.type}
                                        value={(gateways as any)[gateway.id][field.key]}
                                        onChange={(e) => handleUpdateGateway(gateway.id, field.key, e.target.value)}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
