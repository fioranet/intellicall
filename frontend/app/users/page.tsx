"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Badge,
    Spinner,
    EmptyState,
    PageHeader,
} from "@wixzel/react";
import { UserGear, Lock } from "@phosphor-icons/react";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import axios from "axios";
import { toast } from "@wixzel/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
    sharedTags?: string[];
    sharedAgents?: { _id: string, name: string }[] | string[];
    sharedCampaigns?: { _id: string, name: string }[] | string[];
    createdAt: string;
}

const getRoleBadgeTone = (role: string) => {
    switch (role) {
        case 'admin':
            return "accent" as const;
        default:
            return "neutral" as const;
    }
};

export default function UsersPage() {
    const t = useTranslations("users");
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [userRole, setUserRole] = useState<string | null>(null);

    const fetchUsers = async () => {
        try {
            setIsLoading(true);
            const token = localStorage.getItem("token");
            const userStr = localStorage.getItem("user");
            if (userStr) {
                const user = JSON.parse(userStr);
                setUserRole(user.role);
                if (user.role !== 'admin') {
                    setIsLoading(false);
                    return;
                }
            }

            const response = await axios.get(`${API_BASE_URL}/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data.status === "success") {
                setUsers(response.data.data.users);
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || "Failed to fetch users";
            toast.error(errorMessage, {
                id: "fetch-users-error"
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    if (isLoading) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <Spinner size="xl" />
            </div>
        );
    }

    if (userRole === 'member') {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <EmptyState
                    icon={<Lock />}
                    title={t("accessDenied.title")}
                    description={t("accessDenied.description")}
                    className="w-full max-w-xl"
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                actions={<CreateUserDialog onUserCreated={fetchUsers} />}
            />

            {users.length === 0 ? (
                <EmptyState
                    icon={<UserGear />}
                    title={t("empty.title")}
                    description={t("empty.description")}
                    actions={<CreateUserDialog onUserCreated={fetchUsers} />}
                />
            ) : (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("table.name")}</TableHead>
                                <TableHead>{t("table.email")}</TableHead>
                                <TableHead>{t("table.role")}</TableHead>
                                <TableHead>{t("table.sharedAccess")}</TableHead>
                                <TableHead>{t("table.joined")}</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user._id}>
                                    <TableCell className="py-2.5 font-medium">{user.name}</TableCell>
                                    <TableCell><span className="ltr-data">{user.email}</span></TableCell>
                                    <TableCell>
                                        <Badge tone={getRoleBadgeTone(user.role)}>
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-2 max-w-[300px]">
                                            {user.sharedTags && user.sharedTags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    <span className="text-caption text-fg-muted w-full">{t("table.tags")}</span>
                                                    {user.sharedTags.map(tag => (
                                                        <Badge key={tag} size="sm">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {user.sharedAgents && user.sharedAgents.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    <span className="text-caption text-fg-muted w-full">{t("table.agents")}</span>
                                                    {user.sharedAgents.map(agent => {
                                                        const name = typeof agent === 'string' ? t("table.unknown") : agent.name;
                                                        const id = typeof agent === 'string' ? agent : agent._id;
                                                        return (
                                                            <Badge key={id} size="sm" tone="info">
                                                                {name}
                                                            </Badge>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {user.sharedCampaigns && user.sharedCampaigns.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    <span className="text-caption text-fg-muted w-full">{t("table.campaigns")}</span>
                                                    {user.sharedCampaigns.map(campaign => {
                                                        const name = typeof campaign === 'string' ? t("table.unknown") : campaign.name;
                                                        const id = typeof campaign === 'string' ? campaign : campaign._id;
                                                        return (
                                                            <Badge key={id} size="sm" tone="accent">
                                                                {name}
                                                            </Badge>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {(!user.sharedTags?.length && !user.sharedAgents?.length && !user.sharedCampaigns?.length) && (
                                                <span className="text-caption text-fg-muted italic">{t("table.none")}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-fg-muted">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell align="end">
                                        <EditUserDialog
                                            user={{
                                                ...user,
                                                sharedAgents: user.sharedAgents?.map(a => typeof a === 'string' ? a : a._id),
                                                sharedCampaigns: user.sharedCampaigns?.map(c => typeof c === 'string' ? c : c._id)
                                            }}
                                            onUserUpdated={fetchUsers}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </>
            )}
        </div>
    );
}
