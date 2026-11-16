"use client";

import { useState } from "react";
import {
    ActionBar,
    Badge,
    Button,
    Checkbox,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    toast,
    useConfirm,
} from "@wixzel/react";
import { DotsThree, PencilSimple, Plus, Tag, Trash } from "@phosphor-icons/react";
import axios from "axios";
import { EditLeadDialog } from "@/components/leads/edit-lead-dialog";
import { BulkTagDialog } from "@/components/leads/bulk-tag-dialog";

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

interface LeadsTableProps {
    leads: Lead[];
    onRefresh: () => void;
    visibleFields: string[];
}

export function LeadsTable({ leads, onRefresh, visibleFields }: LeadsTableProps) {
    const t = useTranslations("leads");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [editingLead, setEditingLead] = useState<Lead | null>(null);
    const [bulkTagOpen, setBulkTagOpen] = useState(false);
    const confirm = useConfirm();

    const toggleSelectAll = () => {
        if (selectedIds.length === leads.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(leads.map((lead) => lead._id));
        }
    };

    const toggleSelect = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter((item) => item !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleDelete = async (ids: string[]) => {
        if (!(await confirm({ title: `Are you sure you want to delete ${ids.length} lead(s)?`, tone: "danger" }))) return;

        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/leads/bulk`, {
                data: { ids },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            toast.success(t("toast.deleted"));
            setSelectedIds([]);
            onRefresh();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.deleteFailed"));
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12">
                            <Checkbox
                                checked={selectedIds.length === leads.length && leads.length > 0}
                                onCheckedChange={toggleSelectAll}
                            />
                        </TableHead>
                        <TableHead>{t("table.name")}</TableHead>
                        <TableHead>{t("table.phone")}</TableHead>
                        {visibleFields.map((fieldName) => (
                            <TableHead key={fieldName} className="capitalize">
                                {fieldName}
                            </TableHead>
                        ))}
                        <TableHead>{t("table.tags")}</TableHead>
                        <TableHead>{t("table.addedOn")}</TableHead>
                        <TableHead className="w-12"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {leads.map((lead) => (
                        <TableRow
                            key={lead._id}
                            data-state={selectedIds.includes(lead._id) ? "selected" : undefined}
                            className="group"
                        >
                            <TableCell>
                                <Checkbox
                                    checked={selectedIds.includes(lead._id)}
                                    onCheckedChange={() => toggleSelect(lead._id)}
                                />
                            </TableCell>
                            <TableCell className="font-medium">{lead.name}</TableCell>
                            <TableCell><span className="ltr-data">{lead.phone}</span></TableCell>
                            {visibleFields.map((fieldName) => {
                                const field = lead.fields?.find((f) => f.name === fieldName);
                                return (
                                    <TableCell key={fieldName}>
                                        {field ? String(field.value) : "-"}
                                    </TableCell>
                                );
                            })}
                            <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {lead.tags && lead.tags.length > 0 ? (
                                        lead.tags.map((tag) => (
                                            <Badge key={tag} tone="accent">
                                                {tag}
                                            </Badge>
                                        ))
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            iconStart={<Plus />}
                                            onClick={() => setEditingLead(lead)}
                                        >
                                            {t("table.addTag")}
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-caption text-fg-muted">
                                {new Date(lead.createdAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                })}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={t("table.removeLead")}
                                        onClick={() => handleDelete([lead._id])}
                                    >
                                        <Trash />
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon-sm" aria-label={t("table.actions")}>
                                                <DotsThree />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>{t("table.actions")}</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => setEditingLead(lead)}>
                                                <PencilSimple />
                                                {t("table.editRecord")}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                tone="danger"
                                                onClick={() => handleDelete([lead._id])}
                                            >
                                                <Trash />
                                                {t("table.removeLead")}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* The selection's actions stick to the bottom of the page while rows are chosen. */}
            {selectedIds.length > 0 && (
                <ActionBar>
                    <div className="flex items-center gap-2">
                        <span className="ps-1 text-body-sm font-medium tabular-nums">
                            {t("selection.count", { count: selectedIds.length })}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                            {t("selection.deselectAll")}
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            iconStart={<Tag />}
                            onClick={() => setBulkTagOpen(true)}
                        >
                            {t("selection.manageTags")}
                        </Button>
                        {selectedIds.length === 1 && (
                            <Button
                                variant="secondary"
                                size="sm"
                                iconStart={<PencilSimple />}
                                onClick={() => {
                                    const leadToEdit = leads.find(l => l._id === selectedIds[0]);
                                    if (leadToEdit) setEditingLead(leadToEdit);
                                }}
                            >
                                {t("selection.editRecord")}
                            </Button>
                        )}
                        <Button
                            variant="danger"
                            size="sm"
                            iconStart={<Trash />}
                            onClick={() => handleDelete(selectedIds)}
                        >
                            {t("selection.deleteSelected")}
                        </Button>
                    </div>
                </ActionBar>
            )}

            {editingLead && (
                <EditLeadDialog
                    lead={editingLead}
                    open={!!editingLead}
                    onOpenChange={(open: boolean) => !open && setEditingLead(null)}
                    onSuccess={() => {
                        setEditingLead(null);
                        onRefresh();
                    }}
                />
            )}

            <BulkTagDialog
                selectedIds={selectedIds}
                open={bulkTagOpen}
                onOpenChange={setBulkTagOpen}
                onSuccess={() => {
                    setSelectedIds([]);
                    onRefresh();
                }}
            />
        </div>
    );
}
