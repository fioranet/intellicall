"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MagnifyingGlass, Users, X, GearSix } from "@phosphor-icons/react";
import {
    Button,
    Chip,
    Chips,
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    EmptyState,
    Input,
    PageHeader,
    Spinner,
    toast,
} from "@wixzel/react";
import { useSettings } from "@/components/settings-provider";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { ImportCsvDialog } from "@/components/leads/import-csv-dialog";
import { LeadsTable } from "@/components/leads/leads-table";
import axios from "axios";

import { useTranslations } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface Lead {
    _id: string;
    name: string;
    phone: string;
    fields: Array<{ name: string; value: any }>;
    tags: string[];
    createdAt: string;
}

export default function LeadsPage() {
    const t = useTranslations("leads");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [visibleFields, setVisibleFields] = useState<string[] | null>(null);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoSyncing, setAutoSyncing] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);
    const { googleSheetsConnected, googleSheetsConfig } = useSettings();
    const isFirstRender = useRef(true);
    const hasSyncRef = useRef(false);

    // 1. Initial Load from LocalStorage
    useEffect(() => {
        const savedTags = localStorage.getItem("leads_selected_tags");
        const savedColumns = localStorage.getItem("leads_visible_columns");

        if (savedTags) {
            try {
                setSelectedTags(JSON.parse(savedTags));
            } catch (e) {
                console.error("Failed to parse saved tags", e);
            }
        }

        if (savedColumns) {
            try {
                setVisibleFields(JSON.parse(savedColumns));
            } catch (e) {
                console.error("Failed to parse saved columns", e);
            }
        }

        setHasHydrated(true);
    }, []);

    // 2. Save to LocalStorage ONLY after hydration and when state changes
    useEffect(() => {
        if (!hasHydrated) return;

        localStorage.setItem("leads_selected_tags", JSON.stringify(selectedTags));
    }, [selectedTags, hasHydrated]);

    useEffect(() => {
        if (!hasHydrated) return;

        if (visibleFields !== null) {
            localStorage.setItem("leads_visible_columns", JSON.stringify(visibleFields));
        } else {
            localStorage.removeItem("leads_visible_columns");
        }
    }, [visibleFields, hasHydrated]);

    const fetchLeads = useCallback(async () => {
        console.log("fetchLeads called directly");
        try {
            setLoading(true);
            const token = localStorage.getItem("token");

            const response = await axios({
                method: 'get',
                url: `${API_BASE_URL}/leads`,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log("Direct axios fetch successful:", response.data);
            if (response.data && response.data.data && response.data.data.leads) {
                setLeads(response.data.leads || response.data.data.leads);
            }
        } catch (err: any) {
            console.error("fetchLeads error:", err);
            toast.error(err.response?.data?.message || t("toast.fetchFailed"));
        } finally {
            setLoading(false);
        }
    }, []);

    const allTags = Array.from(new Set(leads.flatMap((lead: any) => lead.tags || []))).sort();
    const allCustomFieldNames = Array.from(
        new Set(leads.flatMap((lead) => lead.fields?.map((f) => f.name) || []))
    ).sort();

    const activeVisibleFields = visibleFields ?? allCustomFieldNames;

    const filteredLeads = leads.filter((lead: any) => {
        const matchesSearch = lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lead.phone.includes(searchQuery);
        const matchesTag = selectedTags.length > 0
            ? selectedTags.every((tag) => lead.tags?.includes(tag))
            : true;
        return matchesSearch && matchesTag;
    });

    // Chosen tags stay listed even when no lead carries them any more, so a saved filter can be cleared.
    const filterTags = Array.from(new Set([...(allTags as string[]), ...selectedTags])).sort();
    const tagCounts = leads.reduce<Record<string, number>>((counts, lead) => {
        (lead.tags || []).forEach((tag) => {
            counts[tag] = (counts[tag] ?? 0) + 1;
        });
        return counts;
    }, {});

    const toggleFieldVisibility = (fieldName: string) => {
        const current = visibleFields ?? allCustomFieldNames;
        if (current.includes(fieldName)) {
            setVisibleFields(current.filter((f) => f !== fieldName));
        } else {
            setVisibleFields([...current, fieldName]);
        }
    };

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    // Auto-sync from Google Sheets on page load
    useEffect(() => {
        const triggerAutoSync = async () => {
            if (hasSyncRef.current) return;
            if (!googleSheetsConnected || !googleSheetsConfig?.spreadsheetId) return;

            hasSyncRef.current = true;
            setAutoSyncing(true);

            try {
                const token = localStorage.getItem("token");
                const res = await axios.get(`${API_BASE_URL}/leads/google-sheets/sync-last`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.data.results > 0) {
                    console.log(`[Auto-Sync] Found ${res.data.results} new leads`);
                    fetchLeads();
                } else {
                    console.log("[Auto-Sync] Already up to date");
                }
            } catch (err) {
                console.error("[Auto-Sync] Failed", err);
            } finally {
                setAutoSyncing(false);
            }
        };

        if (hasHydrated) {
            triggerAutoSync();
        }
    }, [hasHydrated, googleSheetsConnected, googleSheetsConfig, fetchLeads]);

    return (
        <div className="flex flex-col gap-6 pb-20">
            <PageHeader
                title={t("title")}
                description={t("subtitle", { count: leads.length })}
                actions={
                    <>
                        <ImportCsvDialog onSuccess={fetchLeads} />
                        <AddLeadDialog onSuccess={fetchLeads} />
                    </>
                }
            />

            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                        leading={<MagnifyingGlass />}
                        placeholder={t("searchPlaceholder")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1"
                    />
                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="secondary" iconStart={<GearSix />}>
                                    {t("filter.columns")}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>{t("filter.visibleFields")}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <div className="max-h-[300px] overflow-y-auto">
                                    {allCustomFieldNames.map((fieldName) => (
                                        <DropdownMenuCheckboxItem
                                            key={fieldName}
                                            checked={activeVisibleFields.includes(fieldName)}
                                            onCheckedChange={() => toggleFieldVisibility(fieldName)}
                                            className="capitalize"
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            {fieldName}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {(selectedTags.length > 0 || visibleFields !== null) && (
                            <Button
                                variant="ghost"
                                iconStart={<X />}
                                onClick={() => {
                                    setSelectedTags([]);
                                    setVisibleFields(null);
                                }}
                            >
                                {t("filter.clear")}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Tags as filter chips: a lead must carry every chosen tag. */}
                {filterTags.length > 0 && (
                    <Chips
                        type="multiple"
                        value={selectedTags}
                        onValueChange={setSelectedTags}
                        aria-label={t("filter.byTags")}
                    >
                        {filterTags.map((tag) => (
                            <Chip key={tag} value={tag} count={tagCounts[tag] ?? 0}>
                                {tag}
                            </Chip>
                        ))}
                    </Chips>
                )}
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Spinner size="xl" className="text-fg-muted" />
                </div>
            ) : leads.length > 0 ? (
                filteredLeads.length > 0 ? (
                    <LeadsTable
                        leads={filteredLeads}
                        onRefresh={fetchLeads}
                        visibleFields={activeVisibleFields}
                    />
                ) : (
                    <EmptyState
                        icon={<MagnifyingGlass />}
                        title={t("empty.noMatchTitle")}
                        description={t("empty.noMatchDescription")}
                        actions={
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setSearchQuery("");
                                    setSelectedTags([]);
                                }}
                            >
                                {t("empty.clearFilters")}
                            </Button>
                        }
                    />
                )
            ) : (
                <EmptyState
                    icon={<Users />}
                    title={t("empty.noLeadsTitle")}
                    description={t("empty.noLeadsDescription")}
                    actions={
                        <>
                            <ImportCsvDialog onSuccess={fetchLeads} />
                            <AddLeadDialog onSuccess={fetchLeads} />
                        </>
                    }
                />
            )}
        </div>
    );
}
