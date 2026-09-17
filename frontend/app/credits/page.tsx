"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Coins,
    Sparkles,
    CreditCard,
    ArrowRight,
    History,
    ShieldCheck,
    AlertCircle,
    CheckCircle2,
    Clock,
    Loader2,
    Zap,
    TrendingUp
} from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import axios from "axios";
import { toast } from "sonner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

function CreditsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        credits: number;
        operatingMode: string;
        billingSettings: {
            type: string;
            billingCadence: string;
            postpaidCreditLimit: number;
        };
        plan: {
            name: string;
            creditPriceBrl: number;
            minRechargeCredits: number;
        };
        recentPurchases: any[];
    } | null>(null);

    const [customCredits, setCustomCredits] = useState<number | "">("");
    const [purchasing, setPurchasing] = useState(false);
    const [verifyingSession, setVerifyingSession] = useState(false);

    const fetchSummary = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const res = await axios.get(`${API_BASE_URL}/payments/credits-summary`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data?.status === "success") {
                setData(res.data.data);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Erro ao carregar carteira de créditos");
        } finally {
            setLoading(false);
        }
    }, []);

    // Check if returning from Stripe checkout
    useEffect(() => {
        const sessionId = searchParams.get("session_id");
        if (sessionId) {
            const verifyStripe = async () => {
                try {
                    setVerifyingSession(true);
                    const token = localStorage.getItem("token");
                    const res = await axios.post(
                        `${API_BASE_URL}/payments/stripe/verify-session`,
                        { sessionId },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (res.data?.status === "success") {
                        toast.success("Recarga de créditos confirmada com sucesso!");
                        router.replace("/credits");
                    }
                } catch (err: any) {
                    toast.error(err.response?.data?.message || "Erro ao confirmar pagamento");
                } finally {
                    setVerifyingSession(false);
                    fetchSummary();
                }
            };
            verifyStripe();
        } else {
            fetchSummary();
        }
    }, [searchParams, router, fetchSummary]);

    const handleBuyCredits = async (amount: number) => {
        if (!data) return;
        const minRecharge = data.plan?.minRechargeCredits || 50;
        if (amount < minRecharge) {
            toast.error(`A recarga mínima configurada para o seu plano é de ${minRecharge} créditos.`);
            return;
        }

        try {
            setPurchasing(true);
            const token = localStorage.getItem("token");
            const res = await axios.post(
                `${API_BASE_URL}/payments/stripe/credits-checkout`,
                { creditsAmount: amount },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (res.data?.status === "success" && res.data?.data?.url) {
                window.location.href = res.data.data.url;
            } else {
                toast.error("Não foi possível iniciar o checkout da Stripe");
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Erro ao iniciar compra de créditos");
        } finally {
            setPurchasing(false);
        }
    };

    if (loading || verifyingSession) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                    {verifyingSession ? "Confirmando pagamento da Stripe..." : "Carregando informações da carteira..."}
                </p>
            </div>
        );
    }

    const pricePerCredit = data?.plan?.creditPriceBrl || 0.50;
    const minCredits = data?.plan?.minRechargeCredits || 50;
    const packages = [
        { credits: 50, label: "Básico", tag: null },
        { credits: 100, label: "Profissional", tag: null },
        { credits: 250, label: "Crescimento", tag: "Mais Popular" },
        { credits: 500, label: "Escala", tag: "Melhor Valor" }
    ];

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora flex items-center gap-3">
                    <Coins className="h-8 w-8 text-amber-500" />
                    Créditos & Carteira
                </h1>
                <p className="text-muted-foreground text-sm">
                    Gerencie seu saldo de chamadas com IA em tempo real e adquira recargas de créditos.
                </p>
            </div>

            {/* Overview Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Balance Card */}
                <Card className="rounded-2xl border-amber-200/50 dark:border-amber-900/30 bg-gradient-to-br from-amber-500/10 via-background to-background">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <Coins className="h-4 w-4" /> Saldo Disponível
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-foreground">
                            {data?.credits ?? 0}{" "}
                            <span className="text-lg font-normal text-muted-foreground">créditos</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            Aproximadamente <strong>{data?.credits ?? 0} minutos</strong> de voz com IA
                        </p>
                        <div className="mt-3 flex items-center gap-1.5">
                            <Badge variant="outline" className="bg-background text-[11px]">
                                Regime: {data?.billingSettings?.type === "postpaid" ? "Pós-pago" : "Pré-pago"}
                            </Badge>
                            {data?.billingSettings?.type === "postpaid" && (
                                <Badge variant="secondary" className="text-[11px]">
                                    Limite: {data?.billingSettings?.postpaidCreditLimit || 0} cr
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* AI Model Architecture Card */}
                <Card className="rounded-2xl border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-primary" /> Serviço de Voz & Telefonia
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            {data?.operatingMode === "byok" ? (
                                <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-300">
                                    Modelo BYOK Ativo
                                </Badge>
                            ) : (
                                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-300 flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" /> Serviço de Voz Ativo
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            {data?.operatingMode === "byok"
                                ? "Sua conta está configurada para utilizar chaves próprias de provedores autorizados."
                                : "Inteligência artificial nativa de voz com processamento em tempo real de ultra baixa latência operando na infraestrutura da plataforma."}
                        </p>
                    </CardContent>
                </Card>

                {/* Cadence & Plan Tariff Card */}
                <Card className="rounded-2xl border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <TrendingUp className="h-4 w-4 text-primary" /> Tarifa & Cadência
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold text-foreground">
                            R$ {pricePerCredit.toFixed(2).replace(".", ",")}
                            <span className="text-xs font-normal text-muted-foreground"> / crédito (minuto)</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Cadência de tarifação:{" "}
                            <strong>
                                {data?.billingSettings?.billingCadence === "thirty_seconds"
                                    ? "30 em 30 segundos (0.5 crédito)"
                                    : "Minuto cheio (1 crédito / min)"}
                            </strong>
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Plano vinculado: <strong>{data?.plan?.name || "Free Trial"}</strong>
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Recharge Options Section */}
            <div className="space-y-4">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground font-sora">
                        Adquirir Recarga de Créditos
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Selecione um pacote pré-definido ou defina a quantidade desejada. Pagamento seguro via Stripe.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {packages.map((pkg) => {
                        const totalBrl = pkg.credits * pricePerCredit;
                        const isUnderMin = pkg.credits < minCredits;

                        return (
                            <Card
                                key={pkg.credits}
                                className={`rounded-2xl border transition-all hover:shadow-md relative overflow-hidden flex flex-col justify-between ${
                                    pkg.tag ? "border-primary/50 shadow-sm" : "border-border"
                                }`}
                            >
                                {pkg.tag && (
                                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                                        {pkg.tag}
                                    </div>
                                )}
                                <CardHeader className="pb-3">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                                        {pkg.label}
                                    </span>
                                    <div className="text-3xl font-extrabold text-foreground flex items-baseline gap-1">
                                        {pkg.credits}{" "}
                                        <span className="text-xs font-normal text-muted-foreground">créditos</span>
                                    </div>
                                    <CardDescription className="text-xs">
                                        ≈ {pkg.credits} minutos de IA
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0 space-y-3">
                                    <div className="pt-2 border-t flex items-baseline justify-between">
                                        <span className="text-xs text-muted-foreground">Valor total:</span>
                                        <span className="text-lg font-bold text-foreground">
                                            R$ {totalBrl.toFixed(2).replace(".", ",")}
                                        </span>
                                    </div>
                                    <Button
                                        className="w-full shadow-sm"
                                        disabled={purchasing || isUnderMin}
                                        onClick={() => handleBuyCredits(pkg.credits)}
                                    >
                                        {purchasing ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <>
                                                <CreditCard className="me-2 h-4 w-4" />
                                                Comprar
                                            </>
                                        )}
                                    </Button>
                                    {isUnderMin && (
                                        <p className="text-[10px] text-amber-500 text-center">
                                            Mínimo do plano: {minCredits} cr
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Custom Amount Box */}
                <Card className="rounded-2xl border-border">
                    <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className="font-semibold text-foreground text-sm">Recarga Personalizada</h3>
                                <p className="text-xs text-muted-foreground">
                                    Digite a quantidade exata de créditos que deseja adicionar (mínimo de {minCredits} créditos).
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                <div className="relative w-full sm:w-44">
                                    <Input
                                        type="number"
                                        min={minCredits}
                                        placeholder={`Mín. ${minCredits}`}
                                        value={customCredits}
                                        onChange={(e) => setCustomCredits(e.target.value === "" ? "" : Number(e.target.value))}
                                        className="pe-12"
                                    />
                                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                        cr
                                    </span>
                                </div>
                                <div className="text-sm font-semibold text-foreground whitespace-nowrap min-w-[100px] text-end">
                                    {customCredits && Number(customCredits) > 0
                                        ? `R$ ${(Number(customCredits) * pricePerCredit).toFixed(2).replace(".", ",")}`
                                        : "R$ 0,00"}
                                </div>
                                <Button
                                    disabled={purchasing || !customCredits || Number(customCredits) < minCredits}
                                    onClick={() => handleBuyCredits(Number(customCredits))}
                                    className="w-full sm:w-auto"
                                >
                                    {purchasing ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <CreditCard className="me-2 h-4 w-4" />
                                            Recarregar
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Purchase History */}
            <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
                <CardHeader className="bg-card border-b border-border">
                    <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-base font-semibold">Histórico de Compras de Créditos</CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                        Extrato das últimas aquisições de créditos realizadas na sua conta.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {!data?.recentPurchases || data.recentPurchases.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                            Nenhuma recarga de créditos registrada até o momento.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="font-semibold px-6">Data</TableHead>
                                    <TableHead className="font-semibold">Créditos Adquiridos</TableHead>
                                    <TableHead className="font-semibold">Valor Pago</TableHead>
                                    <TableHead className="font-semibold">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.recentPurchases.map((purchase: any) => (
                                    <TableRow key={purchase._id}>
                                        <TableCell className="px-6 text-xs text-muted-foreground">
                                            {new Date(purchase.createdAt).toLocaleString("pt-BR")}
                                        </TableCell>
                                        <TableCell className="font-semibold text-xs">
                                            <span className="flex items-center gap-1.5 text-foreground">
                                                <Coins className="h-3.5 w-3.5 text-amber-500" />
                                                {purchase.creditsAmount || (purchase.metadata?.credits ? Number(purchase.metadata.credits) : "-")} cr
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs font-medium">
                                            R$ {purchase.amount?.toFixed(2).replace(".", ",")}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={`text-[11px] ${
                                                    purchase.status === "completed"
                                                        ? "text-green-600 border-green-300 bg-green-50 dark:bg-green-950/40"
                                                        : "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40"
                                                }`}
                                            >
                                                {purchase.status === "completed" ? "Aprovado" : purchase.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function CreditsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <CreditsContent />
        </Suspense>
    );
}
