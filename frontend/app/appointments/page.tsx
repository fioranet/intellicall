"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
    Badge,
    type BadgeProps,
    Button,
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    Chip,
    Chips,
    EmptyState,
    PageHeader,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    toast,
} from "@wixzel/react";
import { Calendar, Clock, User, Phone, CheckCircle, XCircle, CalendarDots, Robot, SquaresFour, List, PencilSimple } from "@phosphor-icons/react";
import axios from "axios";
import { format } from "date-fns";
import { AvailabilityManager } from "@/components/appointments/availability-manager";
import { EditAppointmentDialog } from "@/components/appointments/edit-appointment-dialog";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

/** Appointment statuses as Badge tones. */
const statusTone = (status: string): BadgeProps["tone"] =>
    status === 'scheduled' ? "accent" : status === 'completed' ? "success" : "danger";

export default function AppointmentsPage() {
    const t = useTranslations("appointments");
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("appointments");
    const [viewMode, setViewMode] = useState<"card" | "list">("card");

    const fetchAppointments = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/appointments`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setAppointments(response.data.data.appointments);
            }
        } catch (err) {
            console.error("Failed to fetch appointments:", err);
            toast.error(t("toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAppointments();
    }, []);

    const updateStatus = async (id: string, status: string) => {
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/appointments/${id}`, { status }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.statusUpdated", { status }));
            fetchAppointments();
        } catch (err) {
            toast.error(t("toast.statusFailed"));
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} description={t("subtitle")} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <TabsList>
                        <TabsTrigger value="appointments">
                            <Calendar />
                            {t("tabs.appointments")}
                        </TabsTrigger>
                        <TabsTrigger value="slots">
                            <Clock />
                            {t("tabs.availability")}
                        </TabsTrigger>
                    </TabsList>

                    {activeTab === "appointments" && (
                        <Chips
                            type="single"
                            value={viewMode}
                            onValueChange={(value) => value && setViewMode(value as "card" | "list")}
                        >
                            <Chip value="card" icon={<SquaresFour />} />
                            <Chip value="list" icon={<List />} />
                        </Chips>
                    )}
                </div>

                <TabsContent value="appointments">
                    {loading ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Card key={i}>
                                    <CardHeader className="flex-row items-center justify-between">
                                        <Skeleton className="h-4 w-1/2" />
                                        <Skeleton className="size-4 rounded-full" />
                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-2">
                                        <Skeleton className="h-8 w-full" />
                                        <Skeleton className="h-4 w-2/3" />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : appointments.length > 0 ? (
                        viewMode === "card" ? (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {appointments.map((app) => (
                                    <Card key={app._id} className={app.status === 'canceled' ? 'opacity-60' : ''}>
                                        <CardHeader className="flex-row items-center justify-between gap-2">
                                            <CardTitle>
                                                {format(new Date(app.dateTime), "PPP")}
                                            </CardTitle>
                                            <Badge tone={statusTone(app.status)} dot className="capitalize">
                                                {app.status}
                                            </Badge>
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-2">
                                            <div className="text-heading-lg tabular-nums">{format(new Date(app.dateTime), "p")}</div>
                                            <div className="flex items-center gap-2 text-caption text-fg-muted">
                                                <User className="size-3.5 text-fg-subtle" />
                                                {(app.clientName && app.clientName.trim()) || (app.leadId && [app.leadId.firstName, app.leadId.lastName].filter(Boolean).join(" ").trim()) || app.clientPhone || t("card.client")}
                                            </div>
                                            <div className="flex items-center gap-2 text-caption text-fg-muted">
                                                <Phone className="size-3.5 text-fg-subtle" />
                                                <span className="ltr-data">{app.clientPhone}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-caption text-fg-muted">
                                                <Robot className="size-3.5 text-fg-subtle" />
                                                {t("card.agent", { name: app.agentId?.name || t("card.deletedAgent") })}
                                            </div>
                                        </CardContent>

                                        {app.status === 'scheduled' && (
                                            <CardFooter className="flex-col items-stretch">
                                                <div className="flex gap-2">
                                                    <Button size="sm" className="flex-1" iconStart={<CheckCircle className="text-success-ink" />} onClick={() => updateStatus(app._id, 'completed')}>
                                                        {t("card.complete")}
                                                    </Button>
                                                    <Button size="sm" className="flex-1" iconStart={<XCircle className="text-danger-ink" />} onClick={() => updateStatus(app._id, 'canceled')}>
                                                        {t("card.cancel")}
                                                    </Button>
                                                </div>
                                                <EditAppointmentDialog
                                                    appointment={app}
                                                    onUpdated={fetchAppointments}
                                                    trigger={
                                                        <Button size="sm" block iconStart={<PencilSimple />}>
                                                            {t("card.edit")}
                                                        </Button>
                                                    }
                                                />
                                            </CardFooter>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("table.dateTime")}</TableHead>
                                        <TableHead>{t("table.lead")}</TableHead>
                                        <TableHead>{t("table.phone")}</TableHead>
                                        <TableHead>{t("table.agent")}</TableHead>
                                        <TableHead>{t("table.status")}</TableHead>
                                        <TableHead align="end">{t("table.actions")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {appointments.map((app) => (
                                        <TableRow key={app._id} className={app.status === 'canceled' ? 'opacity-60' : ''}>
                                            <TableCell className="py-2.5">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{format(new Date(app.dateTime), "PPP")}</span>
                                                    <span className="text-caption text-fg-muted">{format(new Date(app.dateTime), "p")}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <User className="size-3.5 text-fg-subtle" />
                                                    {(app.clientName && app.clientName.trim()) || (app.leadId && [app.leadId.firstName, app.leadId.lastName].filter(Boolean).join(" ").trim()) || app.clientPhone || "Client"}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Phone className="size-3.5 text-fg-subtle" />
                                                    <span className="ltr-data">{app.clientPhone}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Robot className="size-3.5 text-fg-subtle" />
                                                    {app.agentId?.name || "Deleted Agent"}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge tone={statusTone(app.status)} dot className="capitalize">
                                                    {app.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell align="end">
                                                {app.status === 'scheduled' && (
                                                    <div className="flex justify-end gap-1">
                                                        <EditAppointmentDialog
                                                            appointment={app}
                                                            onUpdated={fetchAppointments}
                                                            trigger={
                                                                <Button size="icon-sm" variant="ghost" title={t("table.editTitle")} aria-label={t("table.editTitle")}>
                                                                    <PencilSimple />
                                                                </Button>
                                                            }
                                                        />
                                                        <Button size="icon-sm" variant="ghost" onClick={() => updateStatus(app._id, 'completed')} title={t("table.completeTitle")} aria-label={t("table.completeTitle")}>
                                                            <CheckCircle className="text-success-ink" />
                                                        </Button>
                                                        <Button size="icon-sm" variant="ghost" onClick={() => updateStatus(app._id, 'canceled')} title={t("table.cancelTitle")} aria-label={t("table.cancelTitle")}>
                                                            <XCircle className="text-danger-ink" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )
                    ) : (
                        <EmptyState icon={<CalendarDots />} title={t("table.empty")} />
                    )}
                </TabsContent>

                <TabsContent value="slots">
                    <AvailabilityManager />
                </TabsContent>
            </Tabs>
        </div>
    );
}
