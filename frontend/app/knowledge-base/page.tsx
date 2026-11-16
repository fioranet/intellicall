"use client";

import { useEffect, useState, useCallback } from "react";
import { Database, DotsThreeVertical, PencilSimple, Trash, Question, Info, FileText, SquaresFour, List, Calendar } from "@phosphor-icons/react";
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    EmptyState,
    PageHeader,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsList,
    TabsTrigger,
    toast,
    useConfirm,
} from "@wixzel/react";
import axios from "axios";
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
    const c = useTranslations("common");
    const confirm = useConfirm();
    const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"card" | "list">("card");
    const [isMobile, setIsMobile] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);
    // The list view edits from a row menu, so one dialog serves every row.
    const [editingKb, setEditingKb] = useState<KnowledgeBase | null>(null);
    const [editOpen, setEditOpen] = useState(false);

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
        if (!(await confirm({ title: "Are you sure you want to delete this knowledge base? This may affect agents using it.", tone: "danger" }))) return;
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
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                actions={
                    <>
                        <Tabs
                            variant="segment"
                            value={viewMode}
                            onValueChange={(v) => setViewMode(v as "card" | "list")}
                            className="hidden md:flex"
                        >
                            <TabsList>
                                <TabsTrigger value="card">
                                    <SquaresFour />
                                    {t("view.cards")}
                                </TabsTrigger>
                                <TabsTrigger value="list">
                                    <List />
                                    {t("view.list")}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <CreateKbMenu onSuccess={fetchKbs} />
                    </>
                }
            />

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Spinner size="xl" className="text-fg-muted" />
                </div>
            ) : kbs.length > 0 ? (
                (viewMode === "card" || isMobile) ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {kbs.map((kb) => (
                            <Card key={kb._id}>
                                <CardHeader>
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                            <Database className="size-5" />
                                        </span>
                                        <div className="min-w-0">
                                            <CardTitle className="truncate">{kb.name}</CardTitle>
                                            <CardDescription className="line-clamp-1">{kb.description || "No description"}</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex flex-1 flex-col gap-4">
                                    <div className="flex flex-wrap gap-2">
                                        {kb.basicInfo && (
                                            <Badge>
                                                <Info /> {t("badges.basicInfo")}
                                            </Badge>
                                        )}
                                        {kb.faqs && kb.faqs.length > 0 && (
                                            <Badge>
                                                <Question /> {t("badges.faqs", { count: kb.faqs.length })}
                                            </Badge>
                                        )}
                                        {kb.otherInfo && (
                                            <Badge>
                                                <FileText /> {t("badges.otherInfo")}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="line-clamp-3 text-body-sm italic text-fg-muted">
                                        {kb.basicInfo || kb.otherInfo || t("card.fallbackDescription")}
                                    </div>
                                </CardContent>
                                <CardFooter className="justify-between">
                                    <div className="flex items-center gap-1.5 text-caption text-fg-muted">
                                        <Calendar className="size-3.5 text-fg-subtle" />
                                        {t("card.created", { date: new Date(kb.createdAt).toLocaleDateString() })}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <KBDialog
                                            kb={kb}
                                            onSuccess={fetchKbs}
                                            trigger={
                                                <Button size="xs" iconStart={<PencilSimple />}>
                                                    {t("card.edit")}
                                                </Button>
                                            }
                                        />
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            iconStart={<Trash />}
                                            onClick={() => handleDelete(kb._id)}
                                        >
                                            {t("card.delete")}
                                        </Button>
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("table.name")}</TableHead>
                                <TableHead>{t("table.sections")}</TableHead>
                                <TableHead>{t("table.faqs")}</TableHead>
                                <TableHead>{t("table.createdAt")}</TableHead>
                                <TableHead align="end">{t("table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {kbs.map((kb) => (
                                <TableRow key={kb._id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                                <Database className="size-4" />
                                            </span>
                                            {kb.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1.5 text-fg-muted">
                                            {kb.basicInfo && <span title={t("badges.basicInfo")}><Info className="size-4" /></span>}
                                            {kb.faqs && kb.faqs.length > 0 && <span title={t("badges.faqsLabel")}><Question className="size-4" /></span>}
                                            {kb.otherInfo && <span title={t("badges.otherInfo")}><FileText className="size-4" /></span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-fg-muted">
                                        {t("table.items", { count: kb.faqs?.length || 0 })}
                                    </TableCell>
                                    <TableCell className="text-fg-muted">
                                        {new Date(kb.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell align="end">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" aria-label={c("actions.openMenu")}>
                                                    <DotsThreeVertical />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onSelect={() => {
                                                        setEditingKb(kb);
                                                        setEditOpen(true);
                                                    }}
                                                >
                                                    <PencilSimple />
                                                    {t("card.edit")}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem tone="danger" onSelect={() => handleDelete(kb._id)}>
                                                    <Trash />
                                                    {t("card.delete")}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )
            ) : (
                <EmptyState
                    icon={<Database />}
                    title={t("empty.title")}
                    description={t("empty.description")}
                    actions={<CreateKbMenu onSuccess={fetchKbs} />}
                />
            )}

            {editingKb && (
                <KBDialog
                    kb={editingKb}
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    onSuccess={fetchKbs}
                />
            )}
        </div>
    );
}
