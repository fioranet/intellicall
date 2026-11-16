"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Input,
    Field,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@wixzel/react";
import { toast } from "@wixzel/react";
import axios from "axios";
import { Plus } from "@phosphor-icons/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface CreateUserDialogProps {
    onUserCreated?: () => void;
}

export function CreateUserDialog({ onUserCreated }: CreateUserDialogProps) {
    const t = useTranslations("users");
    const c = useTranslations("common");
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/users/signup`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data.status === "success") {
                toast.success(t("toast.created"));
                setOpen(false);
                setFormData({ name: "", email: "", password: "", role: "" });
                if (onUserCreated) {
                    onUserCreated();
                }
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || "Failed to create user";
            toast.error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="primary" iconStart={<Plus />}>{t("create.trigger")}</Button>
            </DialogTrigger>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>{t("create.title")}</DialogTitle>
                    <DialogDescription>
                        {t("create.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-4">
                        <Field label={t("create.nameLabel")} id="user-name">
                            <Input
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("create.namePlaceholder")}
                                required
                                disabled={isLoading}
                            />
                        </Field>
                        <Field label={t("create.emailLabel")} id="user-email">
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) =>
                                    setFormData({ ...formData, email: e.target.value })
                                }
                                placeholder="john@example.com"
                                required
                                disabled={isLoading}
                            />
                        </Field>
                        <Field label={t("create.passwordLabel")} id="user-password">
                            <Input
                                type="password"
                                value={formData.password}
                                onChange={(e) =>
                                    setFormData({ ...formData, password: e.target.value })
                                }
                                placeholder="••••••••"
                                required
                                disabled={isLoading}
                            />
                        </Field>
                        <Field label={t("create.roleLabel")} id="user-role">
                            <Select
                                value={formData.role}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, role: value })
                                }
                                required
                                disabled={isLoading}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t("roles.placeholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                                    <SelectItem value="member">{t("roles.member")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={isLoading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={isLoading}>
                            {isLoading ? "Creating..." : "Create User"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
