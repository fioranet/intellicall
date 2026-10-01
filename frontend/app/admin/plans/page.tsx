"use client";

import { useTranslations, useLocale } from "next-intl";
import { useEffect, useState } from "react";
import {
    Layers,
    Plus,
    Check,
    Loader2,
    Zap,
    PhoneCall,
    Building2,
    ShieldCheck
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
import { cn } from "@/lib/utils";

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
import { Switch } from "@/components/ui/switch";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function AdminPlansPage() {
    const t = useTranslations("admin");
    const c = useTranslations("common");
    const locale = useLocale();

    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal state for Creating / Editing Plan
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        description: "",
        telephonyType: "nuvv_managed",
        isActive: true,
    });

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/admin/plans`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setPlans(response.data.data.plans || []);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Erro ao carregar planos");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (plan: any = null) => {
        if (plan) {
            setEditingPlan(plan);
            setFormData({
                name: plan.name || "",
                description: plan.description || "",
                telephonyType: plan.telephonyType || "nuvv_managed",
                isActive: plan.isActive !== undefined ? plan.isActive : true,
            });
        } else {
            setEditingPlan(null);
            setFormData({
                name: "",
                description: "",
                telephonyType: "nuvv_managed",
                isActive: true,
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            toast.error("Informe o nome do plano.");
            return;
        }
        if (!formData.description.trim()) {
            toast.error("Informe o descritivo de funcionamento do plano.");
            return;
        }

        setIsSaving(true);
        try {
            const token = localStorage.getItem("token");
            const payload = {
                name: formData.name.trim(),
                description: formData.description.trim(),
                telephonyType: formData.telephonyType,
                isActive: formData.isActive,
                price: 0,
                interval: "monthly",
                limits: { agents: -1, campaigns: -1, leads: -1, callsPerMonth: -1 }
            };

            let response;
            if (editingPlan) {
                response = await axios.patch(`${API_BASE_URL}/admin/plans/${editingPlan._id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                response = await axios.post(`${API_BASE_URL}/admin/plans`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }

            if (response.data?.status === "success") {
                toast.success(editingPlan ? "Plano atualizado com sucesso!" : "Plano criado com sucesso!");
                setIsModalOpen(false);
                fetchPlans();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Erro ao salvar plano");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Tem certeza que deseja remover este plano corporativo?")) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/admin/plans/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Plano excluído com sucesso!");
            fetchPlans();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Erro ao excluir plano");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">
                        {locale === "pt" ? "Planos Corporativos" : "Corporate Plans"}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {locale === "pt" 
                            ? "Configure os planos e o descritivo de funcionamento apresentados aos clientes."
                            : "Configure plan names and operational descriptions presented to clients."}
                    </p>
                </div>
                <Button
                    onClick={() => handleOpenModal()}
                    className="shadow-lg font-medium rounded-xl gap-2"
                >
                    <Plus className="h-4 w-4" />
                    {locale === "pt" ? "Novo Plano" : "New Plan"}
                </Button>
            </div>

            <AdminNav currentPath="/admin/plans" />

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-6">
                    {plans.map((plan) => (
                        <Card key={plan._id} className="rounded-2xl border-border shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                            <CardHeader className="space-y-3 pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                                            {plan.telephonyType === "byot_sip" ? (
                                                <Layers className="h-5 w-5" />
                                            ) : (
                                                <PhoneCall className="h-5 w-5" />
                                            )}
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-xs px-2.5 py-0.5 font-medium",
                                                plan.telephonyType === "byot_sip"
                                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                            )}
                                        >
                                            {plan.telephonyType === "byot_sip"
                                                ? (locale === "pt" ? "Tronco Próprio / BYOT" : "Bring Your Own Trunk")
                                                : (locale === "pt" ? "Telefonia Nuvv (PSTN + IA)" : "Nuvv Telephony (PSTN + AI)")}
                                        </Badge>
                                    </div>

                                    {plan.isActive ? (
                                        <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                                            {locale === "pt" ? "Ativo" : "Active"}
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                            {locale === "pt" ? "Inativo" : "Inactive"}
                                        </Badge>
                                    )}
                                </div>

                                <CardTitle className="text-xl font-bold font-sora pt-1">{plan.name}</CardTitle>
                            </CardHeader>

                            <CardContent className="space-y-3 flex-1 pb-4">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                    {locale === "pt" ? "Descritivo do Funcionamento" : "How it Works"}
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                    {plan.description}
                                </div>
                            </CardContent>

                            <CardFooter className="border-t border-border pt-4 flex items-center justify-between">
                                <Button
                                    onClick={() => handleOpenModal(plan)}
                                    variant="ghost"
                                    className="text-primary hover:text-primary hover:bg-primary/5 font-semibold text-sm"
                                >
                                    {locale === "pt" ? "Editar Plano" : "Edit Plan"}
                                </Button>
                                <Button
                                    onClick={() => handleDelete(plan._id)}
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 font-medium text-sm"
                                >
                                    {locale === "pt" ? "Excluir" : "Delete"}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}

                    <button
                        type="button"
                        onClick={() => handleOpenModal()}
                        className="flex flex-col items-center justify-center gap-4 p-8 border-2 border-dashed border-border rounded-2xl hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary group bg-card/50 min-h-[260px]"
                    >
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <Plus className="h-6 w-6" />
                        </div>
                        <div className="text-center">
                            <span className="font-bold text-base block">{locale === "pt" ? "Criar Novo Plano" : "Create New Plan"}</span>
                            <span className="text-xs text-muted-foreground mt-1 block">
                                {locale === "pt" ? "Adicione um nome e descritivo de funcionamento" : "Add plan name and operational description"}
                            </span>
                        </div>
                    </button>
                </div>
            )}

            {/* Simplified Create / Edit Plan Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 border-none shadow-2xl">
                    <DialogHeader className="mb-2">
                        <DialogTitle className="text-2xl font-bold font-sora">
                            {editingPlan 
                                ? (locale === "pt" ? "Editar Plano Corporativo" : "Edit Corporate Plan") 
                                : (locale === "pt" ? "Criar Plano Corporativo" : "Create Corporate Plan")}
                        </DialogTitle>
                        <DialogDescription className="text-sm">
                            {locale === "pt"
                                ? "Defina o nome da modalidade e o descritivo de funcionamento para os clientes."
                                : "Define the plan name and operational description for clients."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 pt-2">
                        {/* Status Switch */}
                        <div className="flex items-center justify-between px-4 h-12 bg-muted/30 rounded-xl border">
                            <div className="space-y-0.5">
                                <Label htmlFor="plan-active" className="text-sm font-semibold">
                                    {locale === "pt" ? "Status do Plano" : "Plan Status"}
                                </Label>
                                <p className="text-[11px] text-muted-foreground">
                                    {locale === "pt" ? "Planos ativos ficam visíveis nas configurações dos clientes." : "Active plans are visible in client settings."}
                                </p>
                            </div>
                            <Switch
                                id="plan-active"
                                checked={formData.isActive}
                                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                            />
                        </div>

                        {/* Plan Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-sm font-semibold">
                                {locale === "pt" ? "Nome do Plano" : "Plan Name"}
                            </Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder={locale === "pt" ? "Ex: Telefonia Nuvv (PSTN + IA)" : "e.g. Nuvv Telephony (PSTN + AI)"}
                                className="rounded-xl h-11"
                            />
                        </div>

                        {/* Telephony Modality */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">
                                {locale === "pt" ? "Modalidade de Telefonia" : "Telephony Modality"}
                            </Label>
                            <div className="grid grid-cols-2 gap-3">
                                <div
                                    onClick={() => setFormData({ ...formData, telephonyType: "nuvv_managed" })}
                                    className={cn(
                                        "cursor-pointer rounded-xl border p-3.5 transition-all text-start",
                                        formData.telephonyType === "nuvv_managed"
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                            : "border-border hover:border-muted-foreground/30"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-sm">Telefonia Nuvv</span>
                                        <div className={cn("h-4 w-4 rounded-full border flex items-center justify-center", formData.telephonyType === "nuvv_managed" ? "border-primary bg-primary text-white" : "border-muted-foreground")}>
                                            {formData.telephonyType === "nuvv_managed" && <Check className="h-3 w-3" />}
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                                        Números DID e terminação PSTN fornecidos diretamente pela infraestrutura Nuvv.
                                    </p>
                                </div>

                                <div
                                    onClick={() => setFormData({ ...formData, telephonyType: "byot_sip" })}
                                    className={cn(
                                        "cursor-pointer rounded-xl border p-3.5 transition-all text-start",
                                        formData.telephonyType === "byot_sip"
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                            : "border-border hover:border-muted-foreground/30"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-sm">Tronco Próprio / BYOT</span>
                                        <div className={cn("h-4 w-4 rounded-full border flex items-center justify-center", formData.telephonyType === "byot_sip" ? "border-primary bg-primary text-white" : "border-muted-foreground")}>
                                            {formData.telephonyType === "byot_sip" && <Check className="h-3 w-3" />}
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                                        O cliente conecta sua operadora SIP ou PABX IP existente via TechPrefix dedicado.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Operational Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-sm font-semibold">
                                {locale === "pt" ? "Descritivo do Funcionamento" : "Operational Description"}
                            </Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder={locale === "pt" 
                                    ? "Descreva de forma clara e detalhada como este plano funciona para o cliente (regras de roteamento, bilhetagem de minutos, recursos de IA, transbordo)..."
                                    : "Describe clearly and in detail how this plan works for the client..."}
                                className="rounded-xl min-h-[140px] text-sm leading-relaxed"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                {locale === "pt" 
                                    ? "Este texto será exibido na tela de configurações dos clientes para que eles saibam exatamente do que se trata o plano."
                                    : "This description will be displayed on the client settings screen."}
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="mt-6 pt-4 border-t gap-2">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-xl px-6">
                            {c("actions.cancel")}
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="rounded-xl px-8 shadow-lg shadow-primary/20 font-semibold"
                        >
                            {isSaving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {editingPlan
                                ? (locale === "pt" ? "Salvar Alterações" : "Save Changes")
                                : (locale === "pt" ? "Criar Plano" : "Create Plan")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
