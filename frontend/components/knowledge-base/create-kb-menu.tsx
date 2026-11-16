"use client";

import { useState } from "react";
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@wixzel/react";
import { KBDialog } from "@/components/knowledge-base/kb-dialog";
import { KbFromWebsiteDialog, type KbDraftPrefill } from "@/components/knowledge-base/kb-from-website-dialog";
import { CaretDown, Keyboard, Globe, Plus } from "@phosphor-icons/react";

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
                    <Button variant="primary" iconStart={<Plus />}>
                        {t("create.trigger")}
                        <CaretDown className="opacity-70" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => openManual()}>
                        <Keyboard />
                        {t("create.manual")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setWebsiteOpen(true)}>
                        <Globe />
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
