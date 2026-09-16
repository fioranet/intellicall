"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
    Users,
    Search,
    MoreHorizontal,
    UserPlus,
    Mail,
    Calendar,
    CreditCard,
    Shield,
    Loader2,
    Coins,
    Sparkles
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import axios from "axios";
import { toast } from "sonner";
import { AdminNav } from "@/components/admin/nav";
import { Label } from "@/components/ui/label";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function AdminUsersPage() {
    const c = useTranslations("common");
    const t = useTranslations("admin");
    const [users, setUsers] = useState<any[]>([]);
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [newPlanId, setNewPlanId] = useState<string>("");
    const [isUpdating, setIsUpdating] = useState(false);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [addUserFormData, setAddUserFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "user",
        planId: "none"
    });
    const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
    const [billingFormData, setBillingFormData] = useState({
        operatingMode: "managed",
        billingType: "prepaid",
        billingCadence: "full_minute",
        postpaidCreditLimit: 0,
        creditAdjustment: 0
    });

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const [usersRes, plansRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/admin/users`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                axios.get(`${API_BASE_URL}/admin/plans`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            if (usersRes.data?.status === "success") {
                setUsers(usersRes.data.data.users);
            }
            if (plansRes.data?.status === "success") {
                setPlans(plansRes.data.data.plans);
            }
        } catch (err: any) {
            toast.error(t("users.toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleUpdateStatus = async (userId: string, currentStatus: boolean) => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.patch(`${API_BASE_URL}/admin/users/${userId}/status`, {
                isActive: !currentStatus
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.status === "success") {
                toast.success(t("users.toast.statusUpdated", { status: !currentStatus ? t("users.toast.activated") : t("users.toast.deactivated") }));
                fetchUsers();
            }
        } catch (err: any) {
            toast.error(t("users.toast.statusFailed"));
        }
    };

    const handleChangePlan = async () => {
        if (!selectedUser || !newPlanId) return;
        try {
            setIsUpdating(true);
            const token = localStorage.getItem("token");
            const response = await axios.patch(`${API_BASE_URL}/admin/users/${selectedUser._id}/plan`, {
                planId: newPlanId
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.status === "success") {
                toast.success(t("users.toast.planUpdated"));
                setIsPlanModalOpen(false);
                fetchUsers();
            }
        } catch (err: any) {
            toast.error(t("users.toast.planFailed"));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleAddUser = async () => {
        try {
            setIsUpdating(true);
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/admin/users`, addUserFormData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.status === "success") {
                toast.success(t("users.toast.created"));
                setIsAddUserModalOpen(false);
                setAddUserFormData({
                    name: "",
                    email: "",
                    password: "",
                    role: "user",
                    planId: "none"
                });
                fetchUsers();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("users.toast.createFailed"));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleOpenBillingModal = (user: any) => {
        setSelectedUser(user);
        setBillingFormData({
            operatingMode: user.operatingMode || "managed",
            billingType: user.billingSettings?.type || "prepaid",
            billingCadence: user.billingSettings?.billingCadence || "full_minute",
            postpaidCreditLimit: user.billingSettings?.postpaidCreditLimit || 0,
            creditAdjustment: 0
        });
        setIsBillingModalOpen(true);
    };

    const handleUpdateBilling = async () => {
        if (!selectedUser) return;
        try {
            setIsUpdating(true);
            const token = localStorage.getItem("token");
            const response = await axios.patch(
                `${API_BASE_URL}/admin/users/${selectedUser._id}/billing`,
                {
                    operatingMode: billingFormData.operatingMode,
                    billingType: billingFormData.billingType,
                    billingCadence: billingFormData.billingCadence,
                    postpaidCreditLimit: Number(billingFormData.postpaidCreditLimit) || 0,
                    creditAdjustment: Number(billingFormData.creditAdjustment) || 0
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (response.data?.status === "success") {
                toast.success("Configuração de faturamento e IA atualizada com sucesso");
                setIsBillingModalOpen(false);
                fetchUsers();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Erro ao atualizar faturamento");
        } finally {
            setIsUpdating(false);
        }
    };

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">{t("users.title")}</h1>
                    <p className="text-muted-foreground">{t("users.subtitle")}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        className="shadow-lg"
                        onClick={() => setIsAddUserModalOpen(true)}
                    >
                        <UserPlus className="me-2 h-4 w-4" />
                        {t("users.addUser")}
                    </Button>
                </div>
            </div>

            <AdminNav currentPath="/admin" />

            <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
                <CardHeader className="bg-card border-b border-border">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={t("users.searchPlaceholder")}
                                className="ps-10 rounded-full border-border"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex h-64 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="font-semibold px-6">{t("users.table.user")}</TableHead>
                                    <TableHead className="font-semibold">{t("users.table.role")}</TableHead>
                                    <TableHead className="font-semibold">{t("users.table.plan")}</TableHead>
                                    <TableHead className="font-semibold">Créditos & Modelo</TableHead>
                                    <TableHead className="font-semibold">{t("users.table.status")}</TableHead>
                                    <TableHead className="font-semibold">{t("users.table.joined")}</TableHead>
                                    <TableHead className="text-end px-6 font-semibold">{t("users.table.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((user) => (
                                    <TableRow key={user._id} className="group hover:bg-muted/50 transition-colors">
                                        <TableCell className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-foreground group-hover:text-primary transition-colors">{user.name}</span>
                                                    <span className="text-xs text-muted-foreground ltr-data">{user.email}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                {user.isSuperAdmin ? (
                                                    <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">
                                                        <Shield className="h-3 w-3 me-1" /> {t("users.table.superAdmin")}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
                                                        {user.role}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-primary border-primary/20">
                                                {user.plan?.name || "Free Trial"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 font-semibold text-xs">
                                                    <Coins className="h-3.5 w-3.5 text-amber-500" />
                                                    <span>{user.credits ?? 0} cr</span>
                                                    <span className="text-[10px] text-muted-foreground">({user.billingSettings?.type === 'postpaid' ? 'Pós-pago' : 'Pré-pago'})</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {user.operatingMode === 'byok' ? (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-purple-300 text-purple-600 bg-purple-50 dark:bg-purple-950/40">
                                                            BYOK
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-0.5">
                                                            <Sparkles className="h-2.5 w-2.5" /> Fixo Gerenciado
                                                        </Badge>
                                                    )}
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {user.billingSettings?.billingCadence === 'thirty_seconds' ? '30s' : '1 min'}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                <div className={`h-2 w-2 rounded-full ${user.isActive !== false ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                                <span className={`text-sm font-medium capitalize ${user.isActive === false ? 'text-red-500' : ''}`}>
                                                    {user.isActive === false ? 'Deactivated' : (user.planStatus || 'active')}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-xs text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(user.createdAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-end px-6">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-xl">
                                                    <DropdownMenuLabel>{t("users.actions.label")}</DropdownMenuLabel>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setNewPlanId(user.plan?._id || "none");
                                                            setIsPlanModalOpen(true);
                                                        }}
                                                    >
                                                        {t("users.actions.changePlan")}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer"
                                                        onClick={() => handleOpenBillingModal(user)}
                                                    >
                                                        <Coins className="me-2 h-4 w-4 text-amber-500" />
                                                        Modelo IA & Faturamento
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className={`cursor-pointer ${user.isActive !== false ? 'text-red-600 focus:text-red-600 focus:bg-red-50' : 'text-green-600 focus:text-green-600 focus:bg-green-50'}`}
                                                        onClick={() => handleUpdateStatus(user._id, user.isActive !== false)}
                                                    >
                                                        {user.isActive !== false ? t("users.actions.deactivate") : t("users.actions.activate")}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{t("users.planDialog.title")}</DialogTitle>
                        <DialogDescription>
                            {t("users.planDialog.description", { name: selectedUser?.name ?? "" })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>{t("users.planDialog.planLabel")}</Label>
                            <Select
                                value={newPlanId}
                                onValueChange={setNewPlanId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t("users.planDialog.selectPlan")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t("users.planDialog.noPlan")}</SelectItem>
                                    {plans.map((plan) => (
                                        <SelectItem key={plan._id} value={plan._id}>
                                            {plan.name} - {plan.price > 0 ? `$${plan.price}` : 'Free'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPlanModalOpen(false)}>{c("actions.cancel")}</Button>
                        <Button onClick={handleChangePlan} disabled={isUpdating}>
                            {isUpdating && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {t("users.planDialog.submit")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddUserModalOpen} onOpenChange={setIsAddUserModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{t("users.createDialog.title")}</DialogTitle>
                        <DialogDescription>
                            {t("users.createDialog.description")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="add-name">{t("users.createDialog.nameLabel")}</Label>
                            <Input
                                id="add-name"
                                placeholder={t("users.createDialog.namePlaceholder")}
                                value={addUserFormData.name}
                                onChange={(e) => setAddUserFormData({ ...addUserFormData, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="add-email">{t("users.createDialog.emailLabel")}</Label>
                            <Input
                                id="add-email"
                                type="email"
                                placeholder="john@example.com"
                                value={addUserFormData.email}
                                onChange={(e) => setAddUserFormData({ ...addUserFormData, email: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="add-password">{t("users.createDialog.passwordLabel")}</Label>
                            <Input
                                id="add-password"
                                type="password"
                                placeholder={t("users.createDialog.passwordPlaceholder")}
                                value={addUserFormData.password}
                                onChange={(e) => setAddUserFormData({ ...addUserFormData, password: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="add-role">{t("users.createDialog.roleLabel")}</Label>
                                <Select
                                    value={addUserFormData.role}
                                    onValueChange={(val) => setAddUserFormData({ ...addUserFormData, role: val })}
                                >
                                    <SelectTrigger id="add-role">
                                        <SelectValue placeholder={t("users.createDialog.selectRole")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="user">{t("users.createDialog.roleUser")}</SelectItem>
                                        <SelectItem value="admin">{t("users.createDialog.roleAdmin")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="add-plan">{t("users.createDialog.planLabel")}</Label>
                                <Select
                                    value={addUserFormData.planId}
                                    onValueChange={(val) => setAddUserFormData({ ...addUserFormData, planId: val })}
                                >
                                    <SelectTrigger id="add-plan">
                                        <SelectValue placeholder={t("users.createDialog.selectPlan")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t("users.createDialog.freeTrial")}</SelectItem>
                                        {plans.map((plan) => (
                                            <SelectItem key={plan._id} value={plan._id}>
                                                {plan.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddUserModalOpen(false)}>{c("actions.cancel")}</Button>
                        <Button onClick={handleAddUser} disabled={isUpdating}>
                            {isUpdating && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {t("users.createDialog.submit")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isBillingModalOpen} onOpenChange={setIsBillingModalOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Coins className="h-5 w-5 text-amber-500" />
                            Modelo de IA & Faturamento
                        </DialogTitle>
                        <DialogDescription>
                            Configure o modelo operacional e as regras de cobrança de créditos para <strong>{selectedUser?.name}</strong> ({selectedUser?.email}).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-3">
                        <div className="rounded-xl border bg-muted/40 p-3 flex items-center justify-between">
                            <div>
                                <span className="text-xs text-muted-foreground">Saldo Atual</span>
                                <div className="text-xl font-bold text-foreground flex items-center gap-1.5">
                                    <Coins className="h-4 w-4 text-amber-500" />
                                    {selectedUser?.credits ?? 0} créditos
                                </div>
                            </div>
                            <div className="text-end">
                                <span className="text-xs text-muted-foreground">Regime Atual</span>
                                <div className="text-sm font-semibold capitalize text-primary">
                                    {selectedUser?.billingSettings?.type === 'postpaid' ? 'Pós-pago' : 'Pré-pago'}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="font-semibold text-xs">Modelo Operacional de IA</Label>
                            <Select
                                value={billingFormData.operatingMode}
                                onValueChange={(val) => setBillingFormData({ ...billingFormData, operatingMode: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="managed">
                                        <div className="flex flex-col text-start">
                                            <span className="font-medium text-emerald-600 dark:text-emerald-400">Modelo 1: Fixo Gerenciado (Recomendado)</span>
                                            <span className="text-[11px] text-muted-foreground">Chaves Nuvv Master • Gemini Multimodal S2S • Zero Config</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="byok">
                                        <div className="flex flex-col text-start">
                                            <span className="font-medium text-purple-600 dark:text-purple-400">Modelo 3: BYOK (Chaves Próprias)</span>
                                            <span className="text-[11px] text-muted-foreground">Chaves do cliente • Gemini Multimodal BLOQUEADO</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label className="font-semibold text-xs">Tipo de Cobrança</Label>
                                <Select
                                    value={billingFormData.billingType}
                                    onValueChange={(val) => setBillingFormData({ ...billingFormData, billingType: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="prepaid">Pré-pago (Carteira)</SelectItem>
                                        <SelectItem value="postpaid">Pós-pago (Fatura)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="font-semibold text-xs">Cadência de Tarifação</Label>
                                <Select
                                    value={billingFormData.billingCadence}
                                    onValueChange={(val) => setBillingFormData({ ...billingFormData, billingCadence: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="full_minute">Minuto Cheio (1 cr/min)</SelectItem>
                                        <SelectItem value="thirty_seconds">30s / 0.5 cr (Fracionado)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {billingFormData.billingType === "postpaid" && (
                            <div className="space-y-2">
                                <Label className="font-semibold text-xs">Limite de Crédito Pós-pago (Franquia)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={billingFormData.postpaidCreditLimit}
                                    onChange={(e) => setBillingFormData({ ...billingFormData, postpaidCreditLimit: Number(e.target.value) })}
                                    placeholder="Ex: 500"
                                />
                                <span className="text-[11px] text-muted-foreground">O cliente poderá operar com saldo negativo até este limite.</span>
                            </div>
                        )}

                        <div className="space-y-2 pt-2 border-t">
                            <Label className="font-semibold text-xs">Ajuste Manual de Saldo (Créditos)</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    value={billingFormData.creditAdjustment}
                                    onChange={(e) => setBillingFormData({ ...billingFormData, creditAdjustment: Number(e.target.value) })}
                                    placeholder="0 (ex: 50 para adicionar, -20 para deduzir)"
                                />
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                                Insira um valor positivo para creditar ou negativo para estornar/deduzir do saldo do cliente.
                            </span>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsBillingModalOpen(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button onClick={handleUpdateBilling} disabled={isUpdating} className="bg-primary text-primary-foreground">
                            {isUpdating && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
