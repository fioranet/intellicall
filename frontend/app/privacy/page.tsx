"use client";

import Link from "next/link";
import { ChevronLeft, ShieldCheck, Lock, Eye, FileText, CheckCircle2, Clock, Mail, Building2, UserCheck, PhoneIncoming } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Footer } from "@/components/layout/footer";
import { useSettings } from "@/components/settings-provider";

export default function PrivacyPage() {
    const { branding, publicSite } = useSettings();
    const privacyEmail = publicSite.privacyEmail?.trim() || "contato@nuvv.com.br";

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sora">
            <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/">
                        <Logo width={180} height={45} variant="auto" />
                    </Link>
                    <div className="flex items-center gap-4">
                        <ModeToggle />
                        <Button asChild variant="ghost" className="rounded-full">
                            <Link href="/">
                                <ChevronLeft className="mr-2 h-4 w-4" /> Voltar ao Início
                            </Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="pt-32 pb-20 px-6">
                <div className="max-w-4xl mx-auto space-y-12">
                    <div className="text-center space-y-4">
                        <div className="inline-flex p-3 rounded-2xl mb-2 shadow-sm" style={{ backgroundColor: `${branding.primaryColor}15`, color: branding.primaryColor }}>
                            <ShieldCheck className="h-8 w-8" />
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Política de Privacidade</h1>
                        <p className="text-sm md:text-base text-muted-foreground font-medium">
                            Nuvv Tecnologia LTDA • CNPJ/MF nº 47.698.135/0001-36
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Em conformidade com a LGPD (Lei nº 13.709/18) e o Marco Civil da Internet (Lei nº 12.965/14) • Atualizado em Setembro de 2026
                        </p>
                    </div>

                    {/* Protocol and SLA Highlight Box */}
                    <div className="p-6 rounded-2xl bg-muted/40 border border-border/80 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm">
                        <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
                            <Clock className="h-6 w-6" />
                        </div>
                        <div className="space-y-1 flex-1 text-start">
                            <h4 className="text-sm font-semibold text-foreground">Compromisso com o Titular de Dados e Protocolo de Atendimento</h4>
                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed m-0">
                                Para efeitos de acompanhamento transparente, o prazo médio de retorno às solicitações dos titulares de dados é de <strong>até 7 (sete) dias úteis</strong>, sendo emitido número de protocolo para rastreamento. Caso alguma solicitação pontual não possa ser atendida de imediato, o usuário receberá a devida justificativa legal fundamentada.
                            </p>
                        </div>
                    </div>

                    {/* 3 Pillar Cards */}
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="p-6 rounded-2xl bg-muted/30 border border-border space-y-3 shadow-sm hover:border-primary/40 transition-colors">
                            <Lock className="h-5 w-5" style={{ color: branding.primaryColor }} />
                            <h4 className="font-bold text-base">Segurança & Criptografia</h4>
                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                Aplicamos rigorosas medidas técnicas e organizacionais para proteger os dados contra acessos não autorizados, perdas ou alterações.
                            </p>
                        </div>
                        <div className="p-6 rounded-2xl bg-muted/30 border border-border space-y-3 shadow-sm hover:border-primary/40 transition-colors">
                            <Eye className="h-5 w-5" style={{ color: branding.primaryColor }} />
                            <h4 className="font-bold text-base">Transparência Total</h4>
                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                Informamos com clareza como as interações de áudio, transcrições e registros de chamadas são tratados e processados pela plataforma.
                            </p>
                        </div>
                        <div className="p-6 rounded-2xl bg-muted/30 border border-border space-y-3 shadow-sm hover:border-primary/40 transition-colors">
                            <CheckCircle2 className="h-5 w-5" style={{ color: branding.primaryColor }} />
                            <h4 className="font-bold text-base">Conformidade LGPD</h4>
                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                Respeito integral aos direitos previstos no Art. 18 da Lei 13.709/18, assegurando acesso, retificação e exclusão aos titulares.
                            </p>
                        </div>
                    </div>

                    {/* Legal Sections */}
                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-10 text-muted-foreground leading-relaxed">
                        {/* 1. Como os Dados são Recolhidos */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <FileText className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">1. Como os Dados Pessoais são Coletados</h2>
                            </div>
                            <p>
                                Os dados pessoais são coletados pela plataforma <strong>{branding.appName}</strong> das seguintes formas:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
                                <li>
                                    <strong>Durante o Acesso e Navegação:</strong> Informações sobre dispositivo, endereço IP, registros de data e hora de acesso, tipo de navegador e preferências de interface, coletadas para garantir a estabilidade técnica e a segurança operacional da sessão.
                                </li>
                                <li>
                                    <strong>Cadastro e Contratação:</strong> Ao se cadastrar ou assinar planos, coletamos informações fornecidas pelo CLIENTE (nome, razão social, CNPJ/CPF, e-mail corporativo, telefone e dados essenciais de faturamento).
                                </li>
                                <li>
                                    <strong>Operação dos Agentes de IA e Telefonia:</strong> Dados inseridos pelo CLIENTE na configuração de seus agentes (prompts, bases de conhecimento, números de saída) e listas de contatos/leads carregadas para a execução de fluxos de chamada.
                                </li>
                            </ul>
                        </section>

                        {/* 2. Dados Pessoais Tratados */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <UserCheck className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">2. Categorias de Dados Tratados</h2>
                            </div>
                            <p>
                                A PLATAFORMA trata as seguintes categorias de dados pessoais:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
                                <li><strong>Dados Cadastrais do Usuário:</strong> Nome, e-mail, telefone, empresa e senha criptografada de acesso à conta;</li>
                                <li><strong>Dados de Comunicação e Telefonia:</strong> Registros detalhados de chamadas (data, duração, status de conexão, número de origem e número de destino);</li>
                                <li><strong>Gravações de Voz e Transcrições:</strong> Quando a funcionalidade de gravação estiver habilitada pelo CLIENTE, os arquivos de áudio e as respectivas transcrições textuais das conversas são armazenados de forma segregada e segura para consulta exclusiva no painel do usuário;</li>
                                <li><strong>Dados de Suporte:</strong> Comunicações e mensagens trocadas com o suporte técnico para resolução de chamados.</li>
                            </ul>
                        </section>

                        {/* 3. Finalidades do Tratamento */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <PhoneIncoming className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">3. Finalidades do Tratamento dos Dados</h2>
                            </div>
                            <p>
                                O tratamento de dados pessoais pela PLATAFORMA fundamenta-se estritamente nas hipóteses legais da LGPD (Art. 7º, incisos I, II, V e IX), com as seguintes finalidades:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
                                <li><strong>Execução de Contrato:</strong> Viabilizar o funcionamento dos agentes de voz, conexão das chamadas SIP/VoIP, processamento de fala em tempo real e controle de créditos e tarifação;</li>
                                <li><strong>Aprimoramento Contínuo e Suporte:</strong> Permitir que o CLIENTE analise o desempenho de seus agentes, revise transcrições e receba auxílio técnico qualificado;</li>
                                <li><strong>Segurança e Prevenção a Fraudes:</strong> Cumprir a obrigação legal de guarda de registros de acesso a aplicações de internet (Marco Civil da Internet, Art. 15) e prevenir abusos de tráfego;</li>
                                <li><strong>Comunicações Institucionais:</strong> Notificações operacionais sobre consumo de créditos, faturas, novidades de recursos e manutenções programadas.</li>
                            </ul>
                        </section>

                        {/* 4. Prazo de Conservação e Armazenamento */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <Clock className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">4. Prazo de Conservação e Armazenamento dos Dados</h2>
                            </div>
                            <p>
                                Os dados pessoais são mantidos pelo período estritamente necessário para cumprir as finalidades contratadas ou até que o usuário solicite sua exclusão, conforme o Art. 15, I da Lei 13.709/18.
                            </p>
                            <p>
                                Findo o prazo da relação ou solicitada a exclusão, os dados poderão ser conservados exclusivamente para:
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-sm sm:text-base">
                                <li>I – Cumprimento de obrigação legal ou regulatória pelo controlador;</li>
                                <li>II – Exercício regular de direitos em processos judiciais, administrativos ou arbitrais;</li>
                                <li>III – Uso exclusivo do controlador, de forma anonimizada, sem acesso por terceiros.</li>
                            </ul>
                        </section>

                        {/* 5. Segurança e Confidencialidade */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <Lock className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">5. Segurança e Confidencialidade dos Dados</h2>
                            </div>
                            <p>
                                A Nuvv emprega padrões internacionais de segurança da informação, incluindo criptografia em trânsito (HTTPS/TLS) e em repouso, políticas de controle de acesso baseado em funções (RBAC), monitoramento contra invasões e backups sistemáticos.
                            </p>
                            <p>
                                Em caso de qualquer incidente de segurança que possa acarretar risco ou dano relevante aos titulares, a Nuvv comunicará prontamente os usuários afetados e a Autoridade Nacional de Proteção de Dados (ANPD), nos termos da legislação vigente.
                            </p>
                        </section>

                        {/* 6. Compartilhamento com Terceiros */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-foreground">6. Compartilhamento com Terceiros Homologados</h2>
                            <p>
                                Para viabilizar a entrega dos serviços de comunicação de alta tecnologia, a PLATAFORMA compartilha dados estritamente necessários com provedores homologados:
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-sm sm:text-base">
                                <li>Operadoras de telecomunicações e troncos SIP para interconexão e roteamento de áudio;</li>
                                <li>Provedores de infraestrutura em nuvem e servidores de alta segurança;</li>
                                <li>Modelos de inteligência artificial de fala e linguagem (como Google Gemini Live) estritamente para o processamento em tempo real do áudio durante a sessão da chamada.</li>
                            </ul>
                            <p>
                                <strong>A Nuvv não comercializa, não cede e não compartilha dados pessoais de seus clientes ou leads para fins publicitários de terceiros.</strong>
                            </p>
                        </section>

                        {/* 7. Direitos do Titular de Dados */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <CheckCircle2 className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">7. Direitos do Titular de Dados (LGPD)</h2>
                            </div>
                            <p>
                                O usuário, na condição de titular de dados pessoais, tem o direito de obter a qualquer momento e mediante requisição:
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-sm sm:text-base">
                                <li>Confirmação da existência de tratamento;</li>
                                <li>Acesso aos seus dados pessoais armazenados;</li>
                                <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                                <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei;</li>
                                <li>Portabilidade dos dados para outro fornecedor de serviço, mediante requisição expressa;</li>
                                <li>Revogação do consentimento, nos termos do Art. 8º, § 5º da LGPD.</li>
                            </ul>
                        </section>

                        {/* 8. Canal do Encarregado (DPO) e Foro */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <Mail className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">8. Canal de Contato com o Encarregado de Dados (DPO)</h2>
                            </div>
                            <p>
                                Para exercer qualquer um dos seus direitos, tirar dúvidas a respeito do tratamento de dados ou registrar solicitações, você pode contatar nosso <strong>Encarregado de Proteção de Dados (DPO)</strong>:
                            </p>
                            <div className="p-5 rounded-xl border bg-muted/20 space-y-2 text-sm not-prose">
                                <p className="font-semibold text-foreground">Encarregado de Proteção de Dados (DPO):</p>
                                <p>
                                    E-mail:{" "}
                                    <a href={`mailto:${privacyEmail}`} className="font-medium underline-offset-2 hover:underline" style={{ color: branding.primaryColor }}>
                                        {privacyEmail}
                                    </a>
                                </p>
                                <p>Endereço para correspondência: Rua Portugal Freixo, 242 – Sala 151 – Centro, Suzano – SP, CEP: 08674-170.</p>
                                <p className="text-xs text-muted-foreground">Prazo médio de resposta: até 7 (sete) dias úteis com emissão de protocolo.</p>
                            </div>
                        </section>

                        {/* 9. Legislação e Foro */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-foreground">9. Legislação Aplicável e Foro</h2>
                            <p>
                                Esta Política de Privacidade será interpretada segundo a legislação da República Federativa do Brasil, especialmente a Lei nº 13.709/2018 (LGPD), sendo competente o foro da sede da empresa para dirimir quaisquer litígios oriundos deste instrumento.
                            </p>
                        </section>
                    </div>

                    <div className="pt-8 border-t border-border space-y-3 text-center">
                        <p className="text-sm font-semibold text-foreground">
                            Nuvv Tecnologia LTDA • CNPJ/MF nº 47.698.135/0001-36
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Sede: Rua Portugal Freixo, 242 – Sala 151 – Centro, Suzano – SP, CEP: 08674-170
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Contato DPO / Privacidade:{" "}
                            <a href={`mailto:${privacyEmail}`} className="font-medium underline-offset-2 hover:underline" style={{ color: branding.primaryColor }}>
                                {privacyEmail}
                            </a>
                        </p>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
