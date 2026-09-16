"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
    Layers,
    Plus,
    MoreHorizontal,
    Check,
    X,
    Loader2,
    DollarSign,
    Zap,
    Info,
    Settings,
    ShieldCheck,
    CreditCard,
    Target,
    Users,
    PhoneCall
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import axios from "axios";
import { toast } from "sonner";
import { AdminNav } from "@/components/admin/nav";
import { getCurrencySymbol } from "@/lib/currency-symbols";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function AdminPlansPage() {
    const t = useTranslations("admin");
    const c = useTranslations("common");
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingPlan, setEditingPlan] = useState<any>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        price: 0,
        interval: "monthly",
        isActive: true,
        dodoProductId: "",
        limits: {
            agents: 1,
            campaigns: 1,
            leads: 100,
            callsPerMonth: 100
        }
    });
    const [currency, setCurrency] = useState("$");
    const [trialLimits, setTrialLimits] = useState({
        agents: 1,
        campaigns: 1,
        leads: 10,
        callsPerMonth: 5
    });
    const [isTrialModalOpen, setIsTrialModalOpen] = useState(false);
    const [isSavingTrial, setIsSavingTrial] = useState(false);

    const fetchPlans = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const [plansRes, settingsRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/admin/plans`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                axios.get(`${API_BASE_URL}/admin/settings`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            if (plansRes.data?.status === "success") {
                setPlans(plansRes.data.data.plans);
            }

            if (settingsRes.data?.status === "success" && settingsRes.data.data.settings) {
                const settings = settingsRes.data.data.settings;
                setCurrency(getCurrencySymbol(settings.currency));
                if (settings.trialLimits) {
                    setTrialLimits(settings.trialLimits);
                }
            }
        } catch (err: any) {
            toast.error(t("plans.toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlans();
    }, []);

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            price: 0,
            interval: "monthly",
            isActive: true,
            dodoProductId: "",
            limits: {
                agents: 1,
                campaigns: 1,
                leads: 100,
                callsPerMonth: 100
            }
        });
        setEditingPlan(null);
    };

    const handleOpenModal = (plan?: any) => {
        if (plan) {
            setEditingPlan(plan);
            setFormData({
                name: plan.name,
                description: plan.description,
                price: plan.price,
                interval: plan.interval,
                isActive: plan.isActive,
                dodoProductId: plan.dodoProductId || "",
                limits: {
                    agents: plan.limits?.agents ?? 1,
                    campaigns: plan.limits?.campaigns ?? 1,
                    leads: plan.limits?.leads ?? 100,
                    callsPerMonth: typeof plan.limits?.callsPerMonth === "number"
                        ? plan.limits.callsPerMonth
                        : 100
                }
            });
        } else {
            resetForm();
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            const token = localStorage.getItem("token");
            let response;
            if (editingPlan) {
                response = await axios.patch(`${API_BASE_URL}/admin/plans/${editingPlan._id}`, formData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } else {
                response = await axios.post(`${API_BASE_URL}/admin/plans`, formData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }

            if (response.data?.status === "success") {
                toast.success(editingPlan ? "Plan updated" : "Plan created");
                setIsModalOpen(false);
                fetchPlans();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("plans.toast.saveFailed"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveTrial = async () => {
        try {
            setIsSavingTrial(true);
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/admin/settings`, {
                trialLimits
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.status === "success") {
                toast.success(t("plans.toast.trialUpdated"));
                setIsTrialModalOpen(false);
                fetchPlans();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("plans.toast.trialFailed"));
        } finally {
            setIsSavingTrial(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this plan?")) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/admin/plans/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("plans.toast.deleted"));
            fetchPlans();
        } catch (err: any) {
            toast.error(t("plans.toast.deleteFailed"));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">{t("plans.title")}</h1>
                    <p className="text-muted-foreground">{t("plans.subtitle")}</p>
                </div>
                <Button
                    onClick={() => handleOpenModal()}
                    className="shadow-lg"
                >
                    <Plus className="me-2 h-4 w-4" />
                    {t("plans.createNew")}
                </Button>
            </div>

            <AdminNav currentPath="/admin/plans" />

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Trial / No Plan Card */}
                    <Card className="rounded-2xl border-primary/20 bg-primary/5 shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="p-2 bg-primary/10 rounded-xl">
                                    <ShieldCheck className="h-5 w-5 text-primary" />
                                </div>
                                <Badge className="bg-primary/20 text-primary border-primary/20">{t("plans.systemDefault")}</Badge>
                            </div>
                            <div className="pt-4">
                                <CardTitle className="text-xl font-bold text-primary">{t("plans.trialTitle")}</CardTitle>
                                <CardDescription className="line-clamp-2 mt-1">{t("plans.trialDescription")}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-bold">{currency}0</span>
                                <span className="text-muted-foreground text-sm">{t("plans.perTrial")}</span>
                            </div>

                            <div className="space-y-2 pt-2">
                                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">{t("plans.globalLimits")}</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                        {t("plans.agents", { count: trialLimits.agents })}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                        {t("plans.campaigns", { count: trialLimits.campaigns })}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                        {t("plans.leads", { count: trialLimits.leads })}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                        {trialLimits.callsPerMonth > 0 ? t("plans.callsPerMonth", { count: trialLimits.callsPerMonth }) : t("plans.unlimitedCalls")}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="border-t border-primary/10 pt-6">
                            <Button
                                onClick={() => setIsTrialModalOpen(true)}
                                variant="ghost"
                                className="w-full text-primary hover:text-primary hover:bg-primary/10 font-bold"
                            >
                                <Settings className="me-2 h-4 w-4" /> {t("plans.configureTrial")}
                            </Button>
                        </CardFooter>
                    </Card>

                    {plans.map((plan) => (
                        <Card key={plan._id} className="rounded-2xl border-border shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-primary/5 rounded-xl">
                                        <Zap className="h-5 w-5 text-primary" />
                                    </div>
                                    {plan.isActive ? (
                                        <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">{t("plans.active")}</Badge>
                                    ) : (
                                        <Badge variant="secondary" className="bg-muted text-muted-foreground">{t("plans.inactive")}</Badge>
                                    )}
                                </div>
                                <div className="pt-4">
                                    <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                                    <CardDescription className="line-clamp-2 mt-1">{plan.description}</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-bold">{currency}{plan.price}</span>
                                    <span className="text-muted-foreground text-sm">/{plan.interval}</span>
                                </div>

                                <div className="space-y-2 pt-2">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">{t("plans.limits")}</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            {t("plans.agents", { count: plan.limits.agents })}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            {t("plans.campaigns", { count: plan.limits.campaigns })}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            {t("plans.leads", { count: plan.limits.leads })}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            {plan.limits.callsPerMonth === -1
                                                ? "Unlimited Calls"
                                                : `${plan.limits.callsPerMonth} Calls/mo`}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t border-border pt-6">
                                <div className="flex items-center justify-between w-full">
                                    <Button
                                        onClick={() => handleOpenModal(plan)}
                                        variant="ghost"
                                        className="text-primary hover:text-primary hover:bg-primary/5 font-bold"
                                    >
                                        {t("plans.editPlan")}
                                    </Button>
                                    <Button
                                        onClick={() => handleDelete(plan._id)}
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10 font-medium"
                                    >
                                        {t("plans.delete")}
                                    </Button>
                                </div>
                            </CardFooter>
                        </Card>
                    ))}

                    <button
                        onClick={() => handleOpenModal()}
                        className="flex flex-col items-center justify-center gap-4 p-8 border-2 border-dashed border-border rounded-2xl hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary group bg-card"
                    >
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <Plus className="h-6 w-6" />
                        </div>
                        <span className="font-bold">{t("plans.createPlan")}</span>
                    </button>
                </div>
            )}

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 border-none shadow-2xl">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-2xl font-bold font-sora">
                            {editingPlan ? t("plans.updatePlan") : t("plans.createPlan")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("plans.dialogDescription")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-4 h-11 bg-slate-50/50 rounded-xl border">
                            <div className="space-y-0.5">
                                <Label htmlFor="plan-active" className="text-sm font-semibold">{t("plans.planStatus")}</Label>
                                <p className="text-[10px] text-muted-foreground">{t("plans.planStatusHint")}</p>
                            </div>
                            <Switch
                                id="plan-active"
                                checked={formData.isActive}
                                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                            />
                        </div>

                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="name">{t("plans.nameLabel")}</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={t("plans.namePlaceholder")}
                                    className="rounded-xl h-11"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="interval">{t("plans.billingCycle")}</Label>
                                <Select
                                    value={formData.interval}
                                    onValueChange={(val) => setFormData({ ...formData, interval: val })}
                                >
                                    <SelectTrigger className="rounded-xl h-11">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly">{t("plans.monthly")}</SelectItem>
                                        <SelectItem value="yearly">{t("plans.yearly")}</SelectItem>
                                        <SelectItem value="one-time">{t("plans.oneTime")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">{t("plans.descriptionLabel")}</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder={t("plans.descriptionPlaceholder")}
                                className="rounded-xl min-h-[80px]"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="price">{t("plans.priceLabel")}</Label>
                            <Input
                                id="price"
                                type="number"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                                className="rounded-xl h-11"
                            />
                        </div>

                        {/* Limits */}
                        <div className="pt-3 border-t space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("plans.resourceLimits")}</h3>

                            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50/70 dark:bg-muted/40 border">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-semibold">{t("plans.unlimitedCallsLabel")}</Label>
                                    <p className="text-[10px] text-muted-foreground">
                                        {t("plans.unlimitedCallsHint")}
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.limits.callsPerMonth === -1}
                                    onCheckedChange={(checked) => {
                                        setFormData((prev) => ({
                                            ...prev,
                                            limits: {
                                                ...prev.limits,
                                                callsPerMonth: checked
                                                    ? -1
                                                    : (prev.limits.callsPerMonth === -1 ? 100 : prev.limits.callsPerMonth || 100)
                                            }
                                        }));
                                    }}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">{t("plans.agentsLabel")}</Label>
                                    <Input
                                        type="number"
                                        value={formData.limits.agents}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            limits: { ...formData.limits, agents: parseInt(e.target.value) }
                                        })}
                                        className="rounded-xl h-10"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">{t("plans.campaignsLabel")}</Label>
                                    <Input
                                        type="number"
                                        value={formData.limits.campaigns}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            limits: { ...formData.limits, campaigns: parseInt(e.target.value) }
                                        })}
                                        className="rounded-xl h-10"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">{t("plans.leadsLabel")}</Label>
                                    <Input
                                        type="number"
                                        value={formData.limits.leads}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            limits: { ...formData.limits, leads: parseInt(e.target.value) }
                                        })}
                                        className="rounded-xl h-10"
                                    />
                                </div>
                                {formData.limits.callsPerMonth !== -1 && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">{t("plans.callsLabel")}</Label>
                                        <Input
                                            type="number"
                                            value={formData.limits.callsPerMonth}
                                            placeholder="e.g. 500"
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                limits: {
                                                    ...formData.limits,
                                                    callsPerMonth: parseInt(e.target.value, 10) || 0
                                                }
                                            })}
                                            className="rounded-xl h-10"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Payment IDs */}
                        <div className="pt-3 border-t space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("plans.paymentConfiguration")}</h3>
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="dodoProductId" className="text-xs">{t("plans.dodoProductId")}</Label>
                                    <Input
                                        id="dodoProductId"
                                        value={formData.dodoProductId}
                                        onChange={(e) => setFormData({ ...formData, dodoProductId: e.target.value })}
                                        placeholder="pdt_..."
                                        className="rounded-xl h-10"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-6 pt-4 border-t">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-xl px-6">
                            {c("actions.cancel")}
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="rounded-xl px-8 shadow-lg shadow-primary/20"
                        >
                            {isSaving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {editingPlan ? "Save Changes" : "Create Plan"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Trial Limits Modal */}
            <Dialog open={isTrialModalOpen} onOpenChange={setIsTrialModalOpen}>
                <DialogContent className="max-w-md rounded-3xl p-6 border-none shadow-2xl">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-2xl font-bold font-sora">
                            {t("plans.trialModalTitle")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("plans.trialModalDescription")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 gap-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="trial-agents">{t("plans.maxAgents")}</Label>
                                <Input
                                    id="trial-agents"
                                    type="number"
                                    value={trialLimits.agents}
                                    onChange={(e) => setTrialLimits({ ...trialLimits, agents: parseInt(e.target.value) })}
                                    className="rounded-xl h-11"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="trial-campaigns">{t("plans.maxCampaigns")}</Label>
                                <Input
                                    id="trial-campaigns"
                                    type="number"
                                    value={trialLimits.campaigns}
                                    onChange={(e) => setTrialLimits({ ...trialLimits, campaigns: parseInt(e.target.value) })}
                                    className="rounded-xl h-11"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="trial-leads">{t("plans.maxLeads")}</Label>
                                <Input
                                    id="trial-leads"
                                    type="number"
                                    value={trialLimits.leads}
                                    onChange={(e) => setTrialLimits({ ...trialLimits, leads: parseInt(e.target.value) })}
                                    className="rounded-xl h-11"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="trial-calls">{t("plans.maxCalls")}</Label>
                                <Input
                                    id="trial-calls"
                                    type="number"
                                    value={trialLimits.callsPerMonth}
                                    onChange={(e) => setTrialLimits({ ...trialLimits, callsPerMonth: parseInt(e.target.value) })}
                                    className="rounded-xl h-11"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-6 pt-4 border-t">
                        <Button variant="ghost" onClick={() => setIsTrialModalOpen(false)} className="rounded-xl px-6">
                            {c("actions.cancel")}
                        </Button>
                        <Button
                            onClick={handleSaveTrial}
                            disabled={isSavingTrial}
                            className="rounded-xl px-8 shadow-lg shadow-primary/20"
                        >
                            {isSavingTrial && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {t("plans.updateLimits")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
