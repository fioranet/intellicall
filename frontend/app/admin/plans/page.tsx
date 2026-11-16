"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Plus, Lightning, Gear, ShieldCheck } from "@phosphor-icons/react";
import {
    Spinner,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Button,
    Badge,
    PageHeader,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Field,
    Textarea,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Separator,
    useConfirm,
} from "@wixzel/react";
import axios from "axios";
import { toast } from "@wixzel/react";
import { AdminNav } from "@/components/admin/nav";
import { getCurrencySymbol } from "@/lib/currency-symbols";

// A switch with its label and a line of help, on a quiet inset row.
function SwitchRow({ id, label, hint, checked, onCheckedChange }: {
    id: string;
    label: string;
    hint: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-md bg-bg-subtle px-3.5 py-2.5">
            <div className="flex flex-col gap-0.5">
                <Label htmlFor={id}>{label}</Label>
                <p className="text-caption text-fg-muted">{hint}</p>
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

// The four limits of a plan as a two-column list of dotted items.
function LimitList({ items }: { items: string[] }) {
    return (
        <ul className="grid grid-cols-2 gap-2">
            {items.map((item) => (
                <li key={item} className="flex items-center gap-2 text-body-sm text-fg-muted">
                    <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                    {item}
                </li>
            ))}
        </ul>
    );
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

type FeatureLimits = { tools?: number; mcpServers?: number; whatsappAccounts?: number; whatsappMessagesPerMonth?: number };
type Features = { meetings?: boolean; whatsapp?: boolean } | undefined;

export default function AdminPlansPage() {
    const t = useTranslations("admin");
    const c = useTranslations("common");
    const confirm = useConfirm();

    /** The feature limits of a plan or the trial, as list items. 0 or less means unlimited. */
    const featureItems = (limits: FeatureLimits, features: Features) => {
        const num = (n: number | undefined, key: string, unlimitedKey: string) =>
            typeof n === "number" && n > 0 ? t(`plans.${key}`, { count: n }) : t(`plans.${unlimitedKey}`);
        return [
            num(limits.tools, "tools", "unlimitedTools"),
            num(limits.mcpServers, "mcpServers", "unlimitedMcpServers"),
            features?.whatsapp === false ? t("plans.noWhatsapp") : num(limits.whatsappAccounts, "whatsappAccounts", "unlimitedWhatsappAccounts"),
            features?.whatsapp === false ? null : num(limits.whatsappMessagesPerMonth, "whatsappMessages", "unlimitedWhatsappMessages"),
            features?.meetings === false ? t("plans.noMeetings") : t("plans.meetingsIncluded"),
        ].filter((x): x is string => Boolean(x));
    };
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
            callsPerMonth: 100,
            tools: 10,
            mcpServers: 5,
            whatsappAccounts: 1,
            whatsappMessagesPerMonth: 1000
        },
        features: { meetings: true, whatsapp: true }
    });
    const [currency, setCurrency] = useState("$");
    const [trialLimits, setTrialLimits] = useState({
        agents: 1,
        campaigns: 1,
        leads: 10,
        callsPerMonth: 5,
        tools: 2,
        mcpServers: 1,
        whatsappAccounts: 1,
        whatsappMessagesPerMonth: 50
    });
    const [trialFeatures, setTrialFeatures] = useState({ meetings: true, whatsapp: true });
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
                if (settings.trialFeatures) {
                    setTrialFeatures({ meetings: settings.trialFeatures.meetings !== false, whatsapp: settings.trialFeatures.whatsapp !== false });
                }
                if (settings.trialLimits) {
                    setTrialLimits((prev) => ({ ...prev, ...settings.trialLimits }));
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
                callsPerMonth: 100,
                tools: 10,
                mcpServers: 5,
                whatsappAccounts: 1,
                whatsappMessagesPerMonth: 1000
            },
            features: { meetings: true, whatsapp: true }
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
                        : 100,
                    tools: plan.limits?.tools ?? 10,
                    mcpServers: plan.limits?.mcpServers ?? 5,
                    whatsappAccounts: plan.limits?.whatsappAccounts ?? 1,
                    whatsappMessagesPerMonth: plan.limits?.whatsappMessagesPerMonth ?? 1000
                },
                features: {
                    meetings: plan.features?.meetings !== false,
                    whatsapp: plan.features?.whatsapp !== false
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
                trialLimits,
                trialFeatures
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
        if (!(await confirm({
            title: "Are you sure you want to delete this plan?",
            confirmLabel: t("plans.delete"),
            tone: "danger",
        }))) return;
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
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("plans.title")}
                description={t("plans.subtitle")}
                actions={
                    <Button variant="primary" iconStart={<Plus />} onClick={() => handleOpenModal()}>
                        {t("plans.createNew")}
                    </Button>
                }
            />

            <AdminNav currentPath="/admin/plans" />

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Spinner size="xl" />
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Trial / No Plan Card */}
                    <Card className="bg-accent-subtle">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <span className="grid size-9 place-items-center rounded-md bg-card text-accent-ink [&_svg]:size-5">
                                    <ShieldCheck />
                                </span>
                                <Badge tone="accent">{t("plans.systemDefault")}</Badge>
                            </div>
                            <div className="pt-3">
                                <CardTitle className="text-accent-ink">{t("plans.trialTitle")}</CardTitle>
                                <CardDescription className="line-clamp-2 mt-1">{t("plans.trialDescription")}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex items-baseline gap-1">
                                <span className="text-heading-xl tabular-nums">{currency}0</span>
                                <span className="text-body-sm text-fg-muted">{t("plans.perTrial")}</span>
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="text-overline text-fg-subtle">{t("plans.globalLimits")}</div>
                                <LimitList
                                    items={[
                                        t("plans.agents", { count: trialLimits.agents }),
                                        t("plans.campaigns", { count: trialLimits.campaigns }),
                                        t("plans.leads", { count: trialLimits.leads }),
                                        trialLimits.callsPerMonth > 0 ? t("plans.callsPerMonth", { count: trialLimits.callsPerMonth }) : t("plans.unlimitedCalls"),
                                        ...featureItems(trialLimits, trialFeatures),
                                    ]}
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button
                                onClick={() => setIsTrialModalOpen(true)}
                                variant="ghost"
                                block
                                iconStart={<Gear />}
                            >
                                {t("plans.configureTrial")}
                            </Button>
                        </CardFooter>
                    </Card>

                    {plans.map((plan) => (
                        <Card key={plan._id}>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <span className="grid size-9 place-items-center rounded-md bg-accent-subtle text-accent-ink [&_svg]:size-5">
                                        <Lightning />
                                    </span>
                                    {plan.isActive ? (
                                        <Badge tone="success" dot>{t("plans.active")}</Badge>
                                    ) : (
                                        <Badge>{t("plans.inactive")}</Badge>
                                    )}
                                </div>
                                <div className="pt-3">
                                    <CardTitle>{plan.name}</CardTitle>
                                    <CardDescription className="line-clamp-2 mt-1">{plan.description}</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-heading-xl tabular-nums">{currency}{plan.price}</span>
                                    <span className="text-body-sm text-fg-muted">/{plan.interval}</span>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <div className="text-overline text-fg-subtle">{t("plans.limits")}</div>
                                    <LimitList
                                        items={[
                                            t("plans.agents", { count: plan.limits.agents }),
                                            t("plans.campaigns", { count: plan.limits.campaigns }),
                                            t("plans.leads", { count: plan.limits.leads }),
                                            plan.limits.callsPerMonth === -1 || !(plan.limits.callsPerMonth > 0)
                                                ? t("plans.unlimitedCalls")
                                                : t("plans.callsPerMonth", { count: plan.limits.callsPerMonth }),
                                            ...featureItems(plan.limits, plan.features),
                                        ]}
                                    />
                                </div>
                            </CardContent>
                            <CardFooter className="justify-between">
                                <Button onClick={() => handleOpenModal(plan)} variant="ghost">
                                    {t("plans.editPlan")}
                                </Button>
                                <Button onClick={() => handleDelete(plan._id)} variant="ghost">
                                    {t("plans.delete")}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}

                    <Card interactive asChild>
                        <button
                            type="button"
                            onClick={() => handleOpenModal()}
                            className="items-center justify-center gap-3 p-8 text-fg-muted"
                        >
                            <span className="grid size-11 place-items-center rounded-md bg-surface [&_svg]:size-5">
                                <Plus />
                            </span>
                            <span className="text-body-md font-medium text-fg">{t("plans.createPlan")}</span>
                        </button>
                    </Card>
                </div>
            )}

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingPlan ? t("plans.updatePlan") : t("plans.createPlan")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("plans.dialogDescription")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-4">
                        <SwitchRow
                            id="plan-active"
                            label={t("plans.planStatus")}
                            hint={t("plans.planStatusHint")}
                            checked={formData.isActive}
                            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                        />

                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t("plans.nameLabel")} id="name">
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={t("plans.namePlaceholder")}
                                />
                            </Field>
                            <Field label={t("plans.billingCycle")} id="interval">
                                <Select
                                    value={formData.interval}
                                    onValueChange={(val) => setFormData({ ...formData, interval: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly">{t("plans.monthly")}</SelectItem>
                                        <SelectItem value="yearly">{t("plans.yearly")}</SelectItem>
                                        <SelectItem value="one-time">{t("plans.oneTime")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>

                        <Field label={t("plans.descriptionLabel")} id="description">
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder={t("plans.descriptionPlaceholder")}
                                className="min-h-[80px]"
                            />
                        </Field>

                        <Field label={t("plans.priceLabel")} id="price">
                            <Input
                                type="number"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                            />
                        </Field>

                        <Separator />

                        {/* Limits */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-overline text-fg-muted">{t("plans.resourceLimits")}</h3>

                            <SwitchRow
                                id="plan-unlimited-calls"
                                label={t("plans.unlimitedCallsLabel")}
                                hint={t("plans.unlimitedCallsHint")}
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

                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t("plans.agentsLabel")}>
                                    <Input
                                        type="number"
                                        value={formData.limits.agents}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            limits: { ...formData.limits, agents: parseInt(e.target.value) }
                                        })}
                                    />
                                </Field>
                                <Field label={t("plans.campaignsLabel")}>
                                    <Input
                                        type="number"
                                        value={formData.limits.campaigns}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            limits: { ...formData.limits, campaigns: parseInt(e.target.value) }
                                        })}
                                    />
                                </Field>
                                <Field label={t("plans.leadsLabel")}>
                                    <Input
                                        type="number"
                                        value={formData.limits.leads}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            limits: { ...formData.limits, leads: parseInt(e.target.value) }
                                        })}
                                    />
                                </Field>
                                {formData.limits.callsPerMonth !== -1 && (
                                    <Field label={t("plans.callsLabel")}>
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
                                        />
                                    </Field>
                                )}
                                {(["tools", "mcpServers", "whatsappAccounts", "whatsappMessagesPerMonth"] as const).map((key) => (
                                    <Field key={key} label={t(`plans.limitFields.${key}`)} hint={t("plans.zeroUnlimited")}>
                                        <Input
                                            type="number"
                                            min={0}
                                            value={formData.limits[key]}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                limits: { ...formData.limits, [key]: parseInt(e.target.value, 10) || 0 }
                                            })}
                                        />
                                    </Field>
                                ))}
                            </div>

                            <h3 className="pt-2 text-overline text-fg-muted">{t("plans.featuresTitle")}</h3>
                            <SwitchRow
                                id="plan-feature-meetings"
                                label={t("plans.featureMeetings")}
                                hint={t("plans.featureMeetingsHint")}
                                checked={formData.features.meetings}
                                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, features: { ...prev.features, meetings: checked } }))}
                            />
                            <SwitchRow
                                id="plan-feature-whatsapp"
                                label={t("plans.featureWhatsapp")}
                                hint={t("plans.featureWhatsappHint")}
                                checked={formData.features.whatsapp}
                                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, features: { ...prev.features, whatsapp: checked } }))}
                            />
                        </div>

                        <Separator />

                        {/* Payment IDs */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-overline text-fg-muted">{t("plans.paymentConfiguration")}</h3>
                            <Field label={t("plans.dodoProductId")} id="dodoProductId">
                                <Input
                                    value={formData.dodoProductId}
                                    onChange={(e) => setFormData({ ...formData, dodoProductId: e.target.value })}
                                    placeholder="pdt_..."
                                />
                            </Field>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button variant="primary" onClick={handleSave} loading={isSaving}>
                            {editingPlan ? "Save Changes" : "Create Plan"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Trial Limits Modal */}
            <Dialog open={isTrialModalOpen} onOpenChange={setIsTrialModalOpen}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>
                            {t("plans.trialModalTitle")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("plans.trialModalDescription")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t("plans.maxAgents")} id="trial-agents">
                            <Input
                                type="number"
                                value={trialLimits.agents}
                                onChange={(e) => setTrialLimits({ ...trialLimits, agents: parseInt(e.target.value) })}
                            />
                        </Field>
                        <Field label={t("plans.maxCampaigns")} id="trial-campaigns">
                            <Input
                                type="number"
                                value={trialLimits.campaigns}
                                onChange={(e) => setTrialLimits({ ...trialLimits, campaigns: parseInt(e.target.value) })}
                            />
                        </Field>
                        <Field label={t("plans.maxLeads")} id="trial-leads">
                            <Input
                                type="number"
                                value={trialLimits.leads}
                                onChange={(e) => setTrialLimits({ ...trialLimits, leads: parseInt(e.target.value) })}
                            />
                        </Field>
                        <Field label={t("plans.maxCalls")} id="trial-calls">
                            <Input
                                type="number"
                                value={trialLimits.callsPerMonth}
                                onChange={(e) => setTrialLimits({ ...trialLimits, callsPerMonth: parseInt(e.target.value) })}
                            />
                        </Field>
                        {(["tools", "mcpServers", "whatsappAccounts", "whatsappMessagesPerMonth"] as const).map((key) => (
                            <Field key={key} label={t(`plans.limitFields.${key}`)} id={`trial-${key}`} hint={t("plans.zeroUnlimited")}>
                                <Input
                                    type="number"
                                    min={0}
                                    value={trialLimits[key]}
                                    onChange={(e) => setTrialLimits({ ...trialLimits, [key]: parseInt(e.target.value, 10) || 0 })}
                                />
                            </Field>
                        ))}
                    </div>
                    <div className="flex flex-col gap-3">
                        <SwitchRow
                            id="trial-feature-meetings"
                            label={t("plans.featureMeetings")}
                            hint={t("plans.featureMeetingsHint")}
                            checked={trialFeatures.meetings}
                            onCheckedChange={(checked) => setTrialFeatures((prev) => ({ ...prev, meetings: checked }))}
                        />
                        <SwitchRow
                            id="trial-feature-whatsapp"
                            label={t("plans.featureWhatsapp")}
                            hint={t("plans.featureWhatsappHint")}
                            checked={trialFeatures.whatsapp}
                            onCheckedChange={(checked) => setTrialFeatures((prev) => ({ ...prev, whatsapp: checked }))}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsTrialModalOpen(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button variant="primary" onClick={handleSaveTrial} loading={isSavingTrial}>
                            {t("plans.updateLimits")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
