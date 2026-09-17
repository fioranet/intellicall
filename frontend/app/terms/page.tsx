"use client";

import Link from "next/link";
import { ChevronLeft, Gavel, Scale, Handshake, AlertTriangle, ShieldCheck, FileText, Building2, UserCheck, PhoneCall, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Footer } from "@/components/layout/footer";
import { useSettings } from "@/components/settings-provider";

export default function TermsPage() {
    const { branding, publicSite } = useSettings();
    const legalEmail = publicSite.legalEmail?.trim() || "contato@nuvv.com.br";

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
                            <Scale className="h-8 w-8" />
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Termos de Uso</h1>
                        <p className="text-sm md:text-base text-muted-foreground font-medium">
                            Nuvv Tecnologia LTDA • CNPJ/MF nº 47.698.135/0001-36
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Última atualização: Setembro de 2026 • Versão aplicável à plataforma {branding.appName}
                        </p>
                    </div>

                    <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-4 shadow-sm">
                        <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Aviso Importante sobre Automação e Telefonia</h4>
                            <p className="text-xs sm:text-sm text-amber-700/90 dark:text-amber-300/90 leading-relaxed m-0">
                                O CLIENTE é o único e exclusivo responsável pelo cumprimento de todas as normas e regulamentações aplicáveis a chamadas telefônicas ativas e receptivas, incluindo a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/18), o Código de Defesa do Consumidor e as resoluções da ANATEL e órgãos reguladores pertinentes. É estritamente vedada a realização de telemarketing abusivo, ligações sem consentimento prévio ou práticas vedadas por lei.
                            </p>
                        </div>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-10 text-muted-foreground leading-relaxed">
                        {/* 1. Definições */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <Building2 className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">1. Definições</h2>
                            </div>
                            <p>
                                Para os fins destes Termos de Uso, aplicam-se os seguintes conceitos:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
                                <li>
                                    <strong>Nuvv Tecnologia LTDA:</strong> Sociedade empresarial de responsabilidade limitada, inscrita no CNPJ/MF sob o nº 47.698.135/0001-36, com sede na Rua Portugal Freixo, 242 – Sala 151 – Centro, Suzano – SP, CEP: 08674-170, proprietária e operadora da plataforma.
                                </li>
                                <li>
                                    <strong>PLATAFORMA:</strong> Sistema Web e infraestrutura tecnológica de propriedade e fornecida pela Nuvv ({branding.appName}), acessível mediante credenciais individuais (usuário e senha) para configuração, gestão e operação de agentes inteligentes de comunicação por voz.
                                </li>
                                <li>
                                    <strong>CLIENTE:</strong> Pessoa física ou jurídica cadastrada na PLATAFORMA, que acesse ou utilize os serviços e recursos oferecidos pela Nuvv.
                                </li>
                                <li>
                                    <strong>DESTINATÁRIO FINAL:</strong> Pessoa física ou jurídica que recebe ou origina chamadas telefônicas geridas pelo CLIENTE através dos agentes virtuais da PLATAFORMA.
                                </li>
                                <li>
                                    <strong>PARTES:</strong> Denominação conjunta de CLIENTE e Nuvv.
                                </li>
                            </ul>
                        </section>

                        {/* 2. Aceitação */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <Handshake className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">2. Aceitação dos Termos</h2>
                            </div>
                            <p>
                                Bem-vindo a <strong>{branding.appName}</strong>. Ao acessar, navegar, criar uma conta ou utilizar quaisquer funcionalidades da PLATAFORMA, você declara ter lido, compreendido e aceitado expressa e integralmente as condições descritas no presente documento e em nossa <strong>Política de Privacidade</strong>.
                            </p>
                            <p>
                                Estes Termos aplicam-se a todos os visitantes, usuários e contratantes da PLATAFORMA. Caso não concorde com qualquer uma das disposições aqui estipuladas, você deverá cessar imediatamente o uso e acesso aos nossos serviços.
                            </p>
                        </section>

                        {/* 3. O que Fazemos e Objeto */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <PhoneCall className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">3. O que Fazemos e Objeto</h2>
                            </div>
                            <p>
                                A Nuvv proporciona, por meio de software como serviço (SaaS), ferramentas digitais avançadas de comunicação e automação de atendimento, agentes virtuais orientados por Inteligência Artificial (IA), processamento de voz em tempo real, gestão de telefonia e facilidades que impulsionam a produtividade, a conectividade e a experiência de relacionamento de empresas de diversos setores.
                            </p>
                            <p>
                                O objeto do presente documento consiste no licenciamento de uso não exclusivo e revogável da PLATAFORMA pelo CLIENTE, de acordo com o plano contratado ou saldo de créditos ativado.
                            </p>
                        </section>

                        {/* 4. Ressalva de Informações e Modelos de IA */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <Bot className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">4. Conteúdo Gerado por Inteligência Artificial e Ressalvas</h2>
                            </div>
                            <p>
                                A PLATAFORMA utiliza modelos generativos de Inteligência Artificial para síntese de voz, transcrição e diálogo em tempo real. As respostas geradas por IA dependem das instruções de sistema (prompts), bases de conhecimento e parâmetros configurados diretamente pelo CLIENTE.
                            </p>
                            <p>
                                Em virtude da natureza estocástica dos modelos de linguagem e inteligência artificial generativa, a Nuvv não pode garantir a exatidão, atualidade, adequação comercial ou ausência absoluta de imprecisões nas respostas emitidas pelos agentes virtuais em tempo real. O CLIENTE é o responsável por supervisionar, testar, aprovar as bases de conhecimento e orientar adequadamente o comportamento dos seus agentes.
                            </p>
                        </section>

                        {/* 5. Elegibilidade */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <UserCheck className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">5. Elegibilidade: Declaração de Maioridade</h2>
                            </div>
                            <p>
                                Como condição indispensável para a contratação e uso da PLATAFORMA, você declara ter no mínimo 18 (dezoito) anos de idade completos, possuir plena capacidade civil de acordo com a legislação brasileira ou, caso represente uma pessoa jurídica, ter os devidos poderes estatutários/societários para vinculá-la legalmente aos presentes Termos.
                            </p>
                        </section>

                        {/* 6. Utilização da Plataforma e Responsabilidade por Dados */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <ShieldCheck className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">6. Utilização da Plataforma e Responsabilidade por Dados</h2>
                            </div>
                            <p>
                                Ao utilizar a PLATAFORMA, o CLIENTE assume a responsabilidade integral e exclusiva pela exatidão e licitude dos dados cadastrais inseridos, bem como pelo sigilo e proteção de suas credenciais de acesso (usuário e senha), eximindo a Nuvv de qualquer dano resultante do uso indevido por terceiros.
                            </p>
                            <p>
                                O CLIENTE compromete-se a:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
                                <li>Obter previamente todas as autorizações, consentimentos e bases legais necessárias perante os DESTINATÁRIOS FINAIS para a realização de chamadas telefônicas, mensagens e gravações de áudio;</li>
                                <li>Não utilizar a PLATAFORMA para práticas ilícitas, fraudulentas, trotes, cobranças vexatórias, assédio, disseminação de ameaças ou spam;</li>
                                <li>Respeitar as listas oficiais de não perturbe (como o sistema "Não Me Perturbe" da ANATEL e Procons estaduais) e os horários regulamentados de contato telefônico;</li>
                                <li>Não tentar contornar limites de taxa, realizar engenharia reversa, violar mecanismos de segurança ou sobrecarregar a infraestrutura de rede da Nuvv.</li>
                            </ul>
                        </section>

                        {/* 7. Propriedade Intelectual */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <FileText className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">7. Propriedade Intelectual</h2>
                            </div>
                            <p>
                                Todos os direitos autorais, marcas, logotipos, interfaces, códigos-fonte, arquitetura de software, design e know-how relacionados à PLATAFORMA e ao website pertencem exclusivamente à Nuvv Tecnologia LTDA ou a seus licenciadores.
                            </p>
                            <p>
                                O CLIENTE adquire exclusivamente uma licença temporária, pessoal e intransferível de uso do software, não sendo permitida a cópia, sublicenciamento, revenda da marca sem autorização, modificação ou engenharia reversa de qualquer parte da PLATAFORMA.
                            </p>
                        </section>

                        {/* 8. Serviços de Terceiros e Conectividade */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-foreground">8. Serviços e Conexões com Terceiros</h2>
                            <p>
                                A PLATAFORMA opera de forma integrada com redes públicas de telecomunicações, operadoras de telefonia credenciadas (STFC/SIP Trunking), provedores de infraestrutura em nuvem, modelos de inteligência artificial e serviços de terceiros mediante autorização expressa do CLIENTE.
                            </p>
                            <p>
                                <strong>8.1. Integração com Serviços e APIs do Google:</strong> Ao vincular sua Conta Google (como o Google Calendar) ao {branding.appName}, o CLIENTE autoriza a PLATAFORMA a consultar disponibilidade de horários e registrar agendamentos solicitados nas chamadas telefônicas. O tratamento desses dados observa rigorosamente a Política de Dados do Usuário dos Serviços de API do Google, os requisitos de Uso Limitado (<em>Limited Use Requirements</em>) e a vedação ao uso de dados do Google para treinamento de modelos de IA/ML, conforme detalhado em nossa <strong>Política de Privacidade</strong>.
                            </p>
                        </section>

                        {/* 9. Limitação de Responsabilidade */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-3 text-foreground">
                                <Gavel className="h-5 w-5" style={{ color: branding.primaryColor }} />
                                <h2 className="text-xl sm:text-2xl font-bold m-0">9. Limitação de Responsabilidade</h2>
                            </div>
                            <p>
                                A Nuvv emprega seus melhores esforços para garantir a alta disponibilidade, estabilidade e segurança da PLATAFORMA. Não obstante, os serviços são disponibilizados no estado em que se encontram (&quot;as is&quot;), não havendo garantia de funcionamento ininterrupto ou isento de falhas pontuais decorrentes de causas fortuitas, força maior, falhas gerais de conectividade ou indisponibilidade de operadoras terceiras.
                            </p>
                            <p>
                                Em nenhuma circunstância a responsabilidade total da Nuvv perante o CLIENTE por eventuais perdas ou danos comprovados decorrentes da utilização dos serviços excederá o montante efetivamente pago pelo CLIENTE à Nuvv nos últimos 3 (três) meses anteriores ao fato gerador da reclamação, exceto nas hipóteses expressamente vedadas pela legislação aplicável.
                            </p>
                        </section>

                        {/* 10. Planos, Créditos e Cancelamento */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-foreground">10. Planos, Cobrança e Tarifação de Créditos</h2>
                            <p>
                                Os serviços são disponibilizados conforme o modelo comercial acordado (pré-pago mediante aquisição de créditos ou pós-pago vinculado a franquia). Cada minuto ou fração de chamada executada debita do saldo de créditos da conta de acordo com a tarifa do plano vigente.
                            </p>
                            <p>
                                A Nuvv reserva-se o direito de suspender imediatamente contas que apresentem saldo negativo, suspeita de fraude cadastral ou desrespeito flagrante aos padrões éticos e legais de comunicação por telefone.
                            </p>
                        </section>

                        {/* 11. Duração e Rescisão */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-foreground">11. Duração e Rescisão</h2>
                            <p>
                                A relação contratual entre as PARTES vigora por prazo indeterminado. O CLIENTE pode solicitar o encerramento de sua conta a qualquer momento por meio do painel ou dos canais oficiais de atendimento. A Nuvv poderá descontinuar ou atualizar funcionalidades da PLATAFORMA mediante prévio comunicado razoável.
                            </p>
                        </section>

                        {/* 12. Legislação e Foro */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-foreground">12. Legislação Aplicável e Foro de Eleição</h2>
                            <p>
                                Os presentes Termos de Uso são regidos e interpretados estritamente pelas leis da República Federativa do Brasil. Para dirimir qualquer controvérsia ou litígio oriundo deste documento, as PARTES elegem expressamente o Foro da Comarca de Suzano – SP ou da Capital do Estado de São Paulo – SP, com renúncia a qualquer outro, por mais privilegiado que seja ou venha a ser.
                            </p>
                        </section>

                        {/* 13. Disposições Finais */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-foreground">13. Disposições Finais</h2>
                            <p>
                                A Nuvv poderá revisar e atualizar estes Termos periodicamente. As alterações entrarão em vigor a partir de sua publicação nesta página. A continuidade do uso da PLATAFORMA após a publicação das alterações constitui aceitação plena das novas diretrizes.
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
                            Dúvidas ou solicitações jurídicas:{" "}
                            <a href={`mailto:${legalEmail}`} className="font-medium underline-offset-2 hover:underline" style={{ color: branding.primaryColor }}>
                                {legalEmail}
                            </a>
                        </p>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
