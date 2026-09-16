"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KBDialog } from "@/components/knowledge-base/kb-dialog";
import { KbFromWebsiteDialog, type KbDraftPrefill } from "@/components/knowledge-base/kb-from-website-dialog";
import { ChevronDown, Keyboard, Globe, Plus } from "lucide-react";

import { useTranslations } from "next-intl";
interface CreateKbMenuProps {
    onSuccess?: () => void;
}

export function CreateKbMenu({ onSuccess }: CreateKbMenuProps) {
    const t = useTranslations("knowledge");
    const [createOpen, setCreateOpen] = useState(false);
    const [websiteOpen, setWebsiteOpen] = useState(false);
    const [prefill, setPrefill] = useState<KbDraftPrefill | null>(null);
    const [importWarnings, setImportWarnings] = useState<string[]>([]);

    const openManual = () => {
        setPrefill(null);
        setImportWarnings([]);
        setCreateOpen(true);
    };

    const handleCreateOpenChange = (open: boolean) => {
        setCreateOpen(open);
        if (!open) {
            setPrefill(null);
            setImportWarnings([]);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button className="gap-1.5">
                        <Plus className="h-4 w-4" />
                        {t("create.trigger")}
                        <ChevronDown className="h-4 w-4 opacity-70" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="gap-2 cursor-pointer" onSelect={() => openManual()}>
                        <Keyboard className="h-4 w-4 text-muted-foreground" />
                        {t("create.manual")}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onSelect={() => setWebsiteOpen(true)}>
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        {t("create.fromWebsite")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <KbFromWebsiteDialog
                open={websiteOpen}
                onOpenChange={setWebsiteOpen}
                onGenerated={(draft, warnings) => {
                    setPrefill(draft);
                    setImportWarnings(warnings);
                    setCreateOpen(true);
                }}
            />

            <KBDialog
                open={createOpen}
                onOpenChange={handleCreateOpenChange}
                prefill={prefill}
                importWarnings={importWarnings}
                onSuccess={onSuccess}
            />
        </>
    );
}
