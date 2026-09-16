"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserCog, Loader2, Lock } from "lucide-react";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import axios from "axios";
import { toast } from "sonner";

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

const getRoleBadgeStyles = (role: string) => {
    switch (role) {
        case 'admin':
            return "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors";
        case 'member':
            return "bg-muted/50 text-muted-foreground border-muted-foreground/20 hover:bg-muted/70 transition-colors";
        default:
            return "bg-secondary text-secondary-foreground";
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
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (userRole === 'member') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
                <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                    <Lock className="h-10 w-10 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight">{t("accessDenied.title")}</h2>
                    <p className="text-muted-foreground max-w-[500px]">
                        {t("accessDenied.description")}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{t("title")}</h1>
                    <p className="text-muted-foreground">{t("subtitle")}</p>
                </div>
                <CreateUserDialog onUserCreated={fetchUsers} />
            </div>

            {users.length === 0 ? (
                <Empty className="border border-dashed">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <UserCog />
                        </EmptyMedia>
                        <EmptyTitle>{t("empty.title")}</EmptyTitle>
                        <EmptyDescription>
                            {t("empty.description")}
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <CreateUserDialog onUserCreated={fetchUsers} />
                    </EmptyContent>
                </Empty>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("table.name")}</TableHead>
                                <TableHead>{t("table.email")}</TableHead>
                                <TableHead>{t("table.role")}</TableHead>
                                <TableHead>{t("table.sharedAccess")}</TableHead>
                                <TableHead>{t("table.joined")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user._id}>
                                    <TableCell className="font-medium">{user.name}</TableCell>
                                    <TableCell><span className="ltr-data">{user.email}</span></TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={getRoleBadgeStyles(user.role)}>
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-2 max-w-[300px]">
                                            {user.sharedTags && user.sharedTags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    <span className="text-xs text-muted-foreground w-full">{t("table.tags")}</span>
                                                    {user.sharedTags.map(tag => (
                                                        <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0 h-5">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {user.sharedAgents && user.sharedAgents.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    <span className="text-xs text-muted-foreground w-full">{t("table.agents")}</span>
                                                    {user.sharedAgents.map(agent => {
                                                        const name = typeof agent === 'string' ? t("table.unknown") : agent.name;
                                                        const id = typeof agent === 'string' ? agent : agent._id;
                                                        return (
                                                            <Badge key={id} variant="outline" className="text-[10px] px-1 py-0 h-5 border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                                                                {name}
                                                            </Badge>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {user.sharedCampaigns && user.sharedCampaigns.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    <span className="text-xs text-muted-foreground w-full">{t("table.campaigns")}</span>
                                                    {user.sharedCampaigns.map(campaign => {
                                                        const name = typeof campaign === 'string' ? t("table.unknown") : campaign.name;
                                                        const id = typeof campaign === 'string' ? campaign : campaign._id;
                                                        return (
                                                            <Badge key={id} variant="outline" className="text-[10px] px-1 py-0 h-5 border-purple-200 text-purple-700 dark:text-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20">
                                                                {name}
                                                            </Badge>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {(!user.sharedTags?.length && !user.sharedAgents?.length && !user.sharedCampaigns?.length) && (
                                                <span className="text-xs text-muted-foreground italic">{t("table.none")}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-end">
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
                </div>
            )}
        </div>
    );
}
