"use client";

import { useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
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
        if (!confirm(`Are you sure you want to delete ${ids.length} lead(s)?`)) return;

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
        <div className="space-y-4 relative">
            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-12 px-4">
                                <Checkbox
                                    checked={selectedIds.length === leads.length && leads.length > 0}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </TableHead>
                            <TableHead className="font-semibold">{t("table.name")}</TableHead>
                            <TableHead className="font-semibold">{t("table.phone")}</TableHead>
                            {visibleFields.map((fieldName) => (
                                <TableHead key={fieldName} className="capitalize font-semibold">
                                    {fieldName}
                                </TableHead>
                            ))}
                            <TableHead className="font-semibold">{t("table.tags")}</TableHead>
                            <TableHead className="font-semibold">{t("table.addedOn")}</TableHead>
                            <TableHead className="w-12"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {leads.map((lead) => (
                            <TableRow
                                key={lead._id}
                                className={`group transition-colors ${selectedIds.includes(lead._id) ? "bg-muted/50" : "hover:bg-muted/30"}`}
                            >
                                <TableCell className="px-4">
                                    <Checkbox
                                        checked={selectedIds.includes(lead._id)}
                                        onCheckedChange={() => toggleSelect(lead._id)}
                                    />
                                </TableCell>
                                <TableCell className="font-medium">{lead.name}</TableCell>
                                <TableCell className="text-foreground font-medium"><span className="ltr-data">{lead.phone}</span></TableCell>
                                {visibleFields.map((fieldName) => {
                                    const field = lead.fields?.find((f) => f.name === fieldName);
                                    return (
                                        <TableCell key={fieldName} className="text-foreground">
                                            {field ? String(field.value) : "-"}
                                        </TableCell>
                                    );
                                })}
                                <TableCell>
                                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                                        {lead.tags && lead.tags.length > 0 ? (
                                            lead.tags.map((tag) => (
                                                <Badge
                                                    key={tag}
                                                    variant="secondary"
                                                    className="bg-primary/5 text-primary border-primary/10 font-normal px-2 py-0"
                                                >
                                                    {tag}
                                                </Badge>
                                            ))
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-[10px] text-foreground font-semibold hover:bg-primary/5 hover:text-primary border border-dashed border-primary/20"
                                                onClick={() => setEditingLead(lead)}
                                            >
                                                <Plus className="me-1 h-3 w-3" />
                                                {t("table.addTag")}
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-foreground text-xs whitespace-nowrap font-medium">
                                    {new Date(lead.createdAt).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => handleDelete([lead._id])}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>{t("table.actions")}</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => setEditingLead(lead)}>
                                                    <Pencil className="me-2 h-4 w-4" />
                                                    {t("table.editRecord")}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={() => handleDelete([lead._id])}
                                                >
                                                    <Trash2 className="me-2 h-4 w-4" />
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
            </div>

            {selectedIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-background border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6">
                        <span className="text-sm font-medium">
                            {t("selection.count", { count: selectedIds.length })}
                        </span>
                        <div className="h-4 w-px bg-border" />
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedIds([])}
                                className="h-8 rounded-full"
                            >
                                {t("selection.deselectAll")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-full border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors"
                                onClick={() => setBulkTagOpen(true)}
                            >
                                <Tag className="me-2 h-4 w-4" />
                                {t("selection.manageTags")}
                            </Button>
                            {selectedIds.length === 1 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-full border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors"
                                    onClick={() => {
                                        const leadToEdit = leads.find(l => l._id === selectedIds[0]);
                                        if (leadToEdit) setEditingLead(leadToEdit);
                                    }}
                                >
                                    <Pencil className="me-2 h-4 w-4" />
                                    {t("selection.editRecord")}
                                </Button>
                            )}
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(selectedIds)}
                                className="h-8 rounded-full shadow-lg shadow-destructive/20"
                            >
                                <Trash2 className="me-2 h-4 w-4" />
                                {t("selection.deleteSelected")}
                            </Button>
                        </div>
                    </div>
                </div>
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
