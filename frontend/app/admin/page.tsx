"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { MagnifyingGlass, DotsThree, UserPlus, Calendar, Shield } from "@phosphor-icons/react";
import {
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Button,
    Input,
    Badge,
    Avatar,
    Field,
    PageHeader,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@wixzel/react";
import axios from "axios";
import { toast } from "@wixzel/react";
import { AdminNav } from "@/components/admin/nav";

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

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("users.title")}
                description={t("users.subtitle")}
                actions={
                    <Button variant="primary" iconStart={<UserPlus />} onClick={() => setIsAddUserModalOpen(true)}>
                        {t("users.addUser")}
                    </Button>
                }
            />

            <AdminNav currentPath="/admin" />

            <div className="flex flex-col gap-3">
                <Input
                    leading={<MagnifyingGlass />}
                    placeholder={t("users.searchPlaceholder")}
                    className="max-w-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {loading ? (
                    <div className="flex h-64 items-center justify-center rounded-lg bg-card">
                        <Spinner size="xl" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("users.table.user")}</TableHead>
                                <TableHead>{t("users.table.role")}</TableHead>
                                <TableHead>{t("users.table.plan")}</TableHead>
                                <TableHead>{t("users.table.status")}</TableHead>
                                <TableHead>{t("users.table.joined")}</TableHead>
                                <TableHead align="end">{t("users.table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.map((user) => (
                                <TableRow key={user._id}>
                                    <TableCell className="py-2.5">
                                        <div className="flex items-center gap-3">
                                            <Avatar name={user.name} />
                                            <div className="flex min-w-0 flex-col">
                                                <span className="font-medium text-fg">{user.name}</span>
                                                <span className="text-caption text-fg-muted ltr-data">{user.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {user.isSuperAdmin ? (
                                            <Badge tone="warning">
                                                <Shield /> {t("users.table.superAdmin")}
                                            </Badge>
                                        ) : (
                                            <Badge>{user.role}</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone="accent" appearance="outline">
                                            {user.plan?.name || "Free Trial"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={user.isActive === false ? "danger" : "success"} dot className="capitalize">
                                            {user.isActive === false ? 'Deactivated' : (user.planStatus || 'active')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-caption text-fg-muted">
                                            <Calendar className="size-3" />
                                            {new Date(user.createdAt).toLocaleDateString()}
                                        </div>
                                    </TableCell>
                                    <TableCell align="end">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" aria-label={t("users.actions.label")}>
                                                    <DotsThree />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>{t("users.actions.label")}</DropdownMenuLabel>
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        setSelectedUser(user);
                                                        setNewPlanId(user.plan?._id || "none");
                                                        setIsPlanModalOpen(true);
                                                    }}
                                                >
                                                    {t("users.actions.changePlan")}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    tone={user.isActive !== false ? "danger" : "default"}
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
            </div>

            <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle>{t("users.planDialog.title")}</DialogTitle>
                        <DialogDescription>
                            {t("users.planDialog.description", { name: selectedUser?.name ?? "" })}
                        </DialogDescription>
                    </DialogHeader>
                    <Field label={t("users.planDialog.planLabel")}>
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
                    </Field>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsPlanModalOpen(false)}>{c("actions.cancel")}</Button>
                        <Button variant="primary" onClick={handleChangePlan} loading={isUpdating}>
                            {t("users.planDialog.submit")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddUserModalOpen} onOpenChange={setIsAddUserModalOpen}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle>{t("users.createDialog.title")}</DialogTitle>
                        <DialogDescription>
                            {t("users.createDialog.description")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <Field label={t("users.createDialog.nameLabel")} id="add-name">
                            <Input
                                placeholder={t("users.createDialog.namePlaceholder")}
                                value={addUserFormData.name}
                                onChange={(e) => setAddUserFormData({ ...addUserFormData, name: e.target.value })}
                            />
                        </Field>
                        <Field label={t("users.createDialog.emailLabel")} id="add-email">
                            <Input
                                type="email"
                                placeholder="john@example.com"
                                value={addUserFormData.email}
                                onChange={(e) => setAddUserFormData({ ...addUserFormData, email: e.target.value })}
                            />
                        </Field>
                        <Field label={t("users.createDialog.passwordLabel")} id="add-password">
                            <Input
                                type="password"
                                placeholder={t("users.createDialog.passwordPlaceholder")}
                                value={addUserFormData.password}
                                onChange={(e) => setAddUserFormData({ ...addUserFormData, password: e.target.value })}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t("users.createDialog.roleLabel")} id="add-role">
                                <Select
                                    value={addUserFormData.role}
                                    onValueChange={(val) => setAddUserFormData({ ...addUserFormData, role: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("users.createDialog.selectRole")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="user">{t("users.createDialog.roleUser")}</SelectItem>
                                        <SelectItem value="admin">{t("users.createDialog.roleAdmin")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label={t("users.createDialog.planLabel")} id="add-plan">
                                <Select
                                    value={addUserFormData.planId}
                                    onValueChange={(val) => setAddUserFormData({ ...addUserFormData, planId: val })}
                                >
                                    <SelectTrigger>
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
                            </Field>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsAddUserModalOpen(false)}>{c("actions.cancel")}</Button>
                        <Button variant="primary" onClick={handleAddUser} loading={isUpdating}>
                            {t("users.createDialog.submit")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
