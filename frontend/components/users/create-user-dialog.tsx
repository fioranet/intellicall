"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axios from "axios";
import { Plus } from "lucide-react";

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
                <Button><Plus className="h-4 w-4" />{t("create.trigger")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t("create.title")}</DialogTitle>
                    <DialogDescription>
                        {t("create.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="user-name">{t("create.nameLabel")}</Label>
                            <Input
                                id="user-name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("create.namePlaceholder")}
                                required
                                disabled={isLoading}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="user-email">{t("create.emailLabel")}</Label>
                            <Input
                                id="user-email"
                                type="email"
                                value={formData.email}
                                onChange={(e) =>
                                    setFormData({ ...formData, email: e.target.value })
                                }
                                placeholder="john@example.com"
                                required
                                disabled={isLoading}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="user-password">{t("create.passwordLabel")}</Label>
                            <Input
                                id="user-password"
                                type="password"
                                value={formData.password}
                                onChange={(e) =>
                                    setFormData({ ...formData, password: e.target.value })
                                }
                                placeholder="••••••••"
                                required
                                disabled={isLoading}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="user-role">{t("create.roleLabel")}</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, role: value })
                                }
                                required
                                disabled={isLoading}
                            >
                                <SelectTrigger id="user-role">
                                    <SelectValue placeholder={t("roles.placeholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                                    <SelectItem value="member">{t("roles.member")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? "Creating..." : "Create User"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
