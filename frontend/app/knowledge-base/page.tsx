"use client";

import { useEffect, useState, useCallback } from "react";
import { Database, Loader2, MoreHorizontal, Pencil, Trash2, HelpCircle, Info, FileText, LayoutGrid, List, Calendar, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KBDialog } from "@/components/knowledge-base/kb-dialog";
import { CreateKbMenu } from "@/components/knowledge-base/create-kb-menu";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface FAQ {
    question: string;
    answer: string;
}

interface KnowledgeBase {
    _id: string;
    name: string;
    description: string;
    basicInfo: string;
    faqs: FAQ[];
    otherInfo: string;
    createdAt: string;
}

export default function KnowledgeBasePage() {
    const t = useTranslations("knowledge");
    const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"card" | "list">("card");
    const [isMobile, setIsMobile] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);

    useEffect(() => {
        const savedView = localStorage.getItem("kb_view_mode");
        if (savedView === "list" || savedView === "card") {
            setViewMode(savedView);
        }

        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        setHasHydrated(true);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (hasHydrated) {
            localStorage.setItem("kb_view_mode", viewMode);
        }
    }, [viewMode, hasHydrated]);

    const fetchKbs = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/knowledge-base`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setKbs(response.data.data.kbs);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this knowledge base? This may affect agents using it.")) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/knowledge-base/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.deleted"));
            fetchKbs();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.deleteFailed"));
        }
    };

    useEffect(() => {
        fetchKbs();
    }, [fetchKbs]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{t("title")}</h1>
                    <p className="text-muted-foreground">{t("subtitle")}</p>
                </div>
                <div className="flex items-center gap-4">
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "card" | "list")} className="hidden md:block">
                        <TabsList className="bg-muted">
                            <TabsTrigger value="card" className="data-[state=active]:bg-background">
                                <LayoutGrid className="h-4 w-4 me-2" />
                                {t("view.cards")}
                            </TabsTrigger>
                            <TabsTrigger value="list" className="data-[state=active]:bg-background">
                                <List className="h-4 w-4 me-2" />
                                {t("view.list")}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <CreateKbMenu onSuccess={fetchKbs} />
                </div>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : kbs.length > 0 ? (
                (viewMode === "card" || isMobile) ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {kbs.map((kb) => (
                            <Card key={kb._id} className="flex flex-col group transition-all duration-300 border-muted/60">
                                <CardHeader className="space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10">
                                                <Database className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg font-bold leading-none mb-1.5">{kb.name}</CardTitle>
                                                <CardDescription className="line-clamp-1">{kb.description || "No description"}</CardDescription>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 space-y-4 pt-2">
                                    <div className="flex flex-wrap gap-2">
                                        {kb.basicInfo && (
                                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] font-bold">
                                                <Info className="me-1 h-3 w-3" /> {t("badges.basicInfo")}
                                            </Badge>
                                        )}
                                        {kb.faqs && kb.faqs.length > 0 && (
                                            <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 border-purple-500/20 text-[10px] font-bold">
                                                <HelpCircle className="me-1 h-3 w-3" /> {t("badges.faqs", { count: kb.faqs.length })}
                                            </Badge>
                                        )}
                                        {kb.otherInfo && (
                                            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold">
                                                <FileText className="me-1 h-3 w-3" /> {t("badges.otherInfo")}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground line-clamp-3 italic">
                                        {kb.basicInfo || kb.otherInfo || t("card.fallbackDescription")}
                                    </div>
                                </CardContent>
                                <div className="px-4 py-3 border-t bg-muted/5 flex items-center justify-between mt-auto">
                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                                        <Calendar className="h-3 w-3 opacity-70" />
                                        {t("card.created", { date: new Date(kb.createdAt).toLocaleDateString() })}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <KBDialog
                                            kb={kb}
                                            onSuccess={fetchKbs}
                                            trigger={
                                                <Button variant="outline" size="sm" className="h-7 text-xs">
                                                    <Pencil className="me-1.5 h-3 w-3" />
                                                    {t("card.edit")}
                                                </Button>
                                            }
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => handleDelete(kb._id)}
                                        >
                                            <Trash2 className="me-1.5 h-3 w-3" />
                                            {t("card.delete")}
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Card className="overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("table.name")}</TableHead>
                                    <TableHead>{t("table.sections")}</TableHead>
                                    <TableHead>{t("table.faqs")}</TableHead>
                                    <TableHead>{t("table.createdAt")}</TableHead>
                                    <TableHead className="text-end">{t("table.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {kbs.map((kb) => (
                                    <TableRow key={kb._id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
                                                    <Database className="h-4 w-4" />
                                                </div>
                                                {kb.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                {kb.basicInfo && <div className="h-2 w-2 rounded-full bg-blue-500" title={t("badges.basicInfo")} />}
                                                {kb.faqs && kb.faqs.length > 0 && <div className="h-2 w-2 rounded-full bg-purple-500" title={t("badges.faqsLabel")} />}
                                                {kb.otherInfo && <div className="h-2 w-2 rounded-full bg-amber-500" title={t("badges.otherInfo")} />}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {t("table.items", { count: kb.faqs?.length || 0 })}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {new Date(kb.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-end">
                                            <div className="flex items-center justify-end gap-2">
                                                <KBDialog
                                                    kb={kb}
                                                    onSuccess={fetchKbs}
                                                    trigger={
                                                        <Button variant="outline" size="sm" className="h-7 text-xs">
                                                            <Pencil className="me-1.5 h-3 w-3" />
                                                            {t("card.edit")}
                                                        </Button>
                                                    }
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    onClick={() => handleDelete(kb._id)}
                                                >
                                                    <Trash2 className="me-1.5 h-3 w-3" />
                                                    {t("card.delete")}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                )
            ) : (
                <Empty className="border border-dashed">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Database />
                        </EmptyMedia>
                        <EmptyTitle>{t("empty.title")}</EmptyTitle>
                        <EmptyDescription>
                            {t("empty.description")}
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <CreateKbMenu onSuccess={fetchKbs} />
                    </EmptyContent>
                </Empty>
            )}
        </div>
    );
}
