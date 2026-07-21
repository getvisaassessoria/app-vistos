// ============================================================
//  SERVER.JS - GETVISA ASSESSORIA
//  VERSÃO REFATORADA E CORRIGIDA - COMPLETA
// ============================================================

const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ============================================================
//  CONFIGURAÇÕES GERAIS
// ============================================================
const app = express();
const resend = new Resend(process.env.RESEND_API_KEY || 're_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL');
const PORT = process.env.PORT || 10000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'minha-chave-secreta-123';

// ============================================================
//  MIDDLEWARES
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// ============================================================
//  SUPABASE
// ============================================================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============================================================
//  ESTADO DA CONVERSA
// ============================================================
const userState = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of userState.entries()) {
        if (data.lastActivity && (now - data.lastActivity) > 30 * 60 * 1000) {
            userState.delete(phone);
        }
    }
}, 60 * 1000);

// ============================================================
//  FEATURE FLAGS
// ============================================================
const FEATURES = {
    SISTEMA_ETAPAS: {
        ativo: true,
        notificar_cliente: true,
        auto_avancar: true
    }
};

// ============================================================
//  FUNÇÃO PARA LIMPAR TELEFONE
// ============================================================
function limparTelefone(telefone) {
    if (!telefone) return null;
    const limpo = telefone.toString().replace(/\D/g, '');
    if (limpo.startsWith('55')) {
        return limpo.substring(2);
    }
    return limpo;
}

// ============================================================
//  FUNÇÃO PARA FORMATAR TELEFONE
// ============================================================
function formatarTelefone(telefone) {
    if (!telefone) return null;
    const numeros = telefone.toString().replace(/\D/g, '');
    if (numeros.length === 11) {
        return '(' + numeros.substring(0, 2) + ') ' +
            numeros.substring(2, 7) + '-' +
            numeros.substring(7, 11);
    }
    if (numeros.length === 10) {
        return '(' + numeros.substring(0, 2) + ') ' +
            numeros.substring(2, 6) + '-' +
            numeros.substring(6, 10);
    }
    return telefone;
}

// ============================================================
//  FUNÇÃO AUXILIAR PARA COMPATIBILIDADE
// ============================================================
function getFormData(data, campoNovo, campoAntigo, padrao) {
    return data[campoNovo] || data[campoAntigo] || padrao;
}

// ============================================================
//  CONSTANTES E MAPEAMENTOS
// ============================================================
const SPAM_DOMAINS = ['tempmail', 'mailinator', '10minutemail', 'guerrillamail', 'throwaway', 'fake', 'spam'];

const DATE_FIELDS = [
    'text-5', 'text-21', 'text-35', 'text-66', 'text-67', 'text-69',
    'text-61', 'text-62', 'spouse-dob', 'data_casamento_div',
    'data_divorcio', 'data_falecimento', 'text-50', 'text-44',
    'text-45', 'military_date_from', 'military_date_to', 'antecedentes_data'
];

const RADIO_MAPPING = {
    'one': 'Sim',
    'two': 'Não',
    'radio-28': { 'one': 'Turismo/negócio (B1/B2)', 'two': 'Estudos', 'Outros': 'Outros' },
    'radio-3': { 'one': 'Masculino', 'two': 'Feminino' },
    'select-4': { 'one': 'Casado(a)', 'two': 'Solteiro(a)', 'União-estável': 'União estável', 'Viúvo(a)': 'Viúvo(a)', 'Divorciado(a)': 'Divorciado(a)' },
    'radio-6': { 'one': 'Eu mesmo', 'two': 'Outra pessoa' },
    'radio-7': { 'one': 'Sim', 'two': 'Não' },
    'radio-8': { 'one': 'Sim', 'two': 'Não' },
    'radio-23': { 'one': 'Sim', 'two': 'Não' },
    'radio-29': { 'one': 'Sim', 'two': 'Não' },
    'radio-30': { 'one': 'Sim', 'two': 'Não' },
    'radio-33': { 'one': 'Sim', 'two': 'Não' },
    'radio-27': { 'Profissional': 'Profissional', 'Estudante': 'Estudante', 'Aposentado': 'Aposentado', 'Outra': 'Outra' },
    'radio-17': { 'one': 'Sim', 'two': 'Não' },
    'radio-18': { 'one': 'Sim', 'two': 'Não' },
    'radio-19': { 'one': 'Sim', 'two': 'Não' },
    'radio-20': { 'one': 'Sim', 'two': 'Não' },
    'radio-14': { 'one': 'Sim', 'two': 'Não' },
    'radio-15': { 'one': 'Sim', 'two': 'Não' },
    'radio-16': { 'one': 'Sim', 'two': 'Não' },
    'radio-26': { 'one': 'Sim', 'two': 'Não' },
    'radio-planos': { 'one': 'Sim', 'two': 'Não' },
    'radio-9': { 'one': 'Sim', 'two': 'Não, é diferente' },
    'radio-10': { 'one': 'Sim', 'two': 'Não' },
    'radio-11': { 'one': 'Sim', 'two': 'Não' },
    'radio-12': { 'one': 'Sim', 'two': 'Não' },
    'radio-outra-nac': { 'one': 'Sim', 'two': 'Não' },
    'radio-residente': { 'one': 'Sim', 'two': 'Não' },
    'spouse-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'ex-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'falecido-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'radio-visto-negado': { 'one': 'Sim', 'two': 'Não' },
    'radio-entrada-negada': { 'one': 'Sim', 'two': 'Não' },
    'radio-deportado': { 'one': 'Sim', 'two': 'Não' }
};

// ============================================================
//  CONFIGURAÇÃO DAS ETAPAS DO PROCESSO
// ============================================================
const ETAPAS = {
    'formulario_enviado': { id: 'formulario_enviado', label: '📝 Formulário Enviado', next: 'analise_correcoes', color: '#3498db' },
    'analise_correcoes': { id: 'analise_correcoes', label: '🔍 Análise e Correções', next: 'boleto_emitido', color: '#f39c12' },
    'boleto_emitido': { id: 'boleto_emitido', label: '💰 Boleto Emitido', next: 'boleto_pago', color: '#e67e22' },
    'boleto_pago': { id: 'boleto_pago', label: '✅ Boleto Pago', next: 'agendamento_realizado', color: '#27ae60' },
    'agendamento_realizado': { id: 'agendamento_realizado', label: '📅 Agendamento Realizado', next: 'treinamento_realizado', color: '#2980b9' },
    'treinamento_realizado': { id: 'treinamento_realizado', label: '🎯 Treinamento Concluído', next: 'entrevista_realizada', color: '#8e44ad' },
    'entrevista_realizada': { id: 'entrevista_realizada', label: '🎤 Entrevista Realizada', next: 'passaporte_retornado', color: '#2c3e50' },
    'passaporte_retornado': { id: 'passaporte_retornado', label: '📫 Passaporte Retornado', next: null, color: '#2ecc71' }
};

const ETAPAS_ORDEM = [
    'formulario_enviado', 'analise_correcoes', 'boleto_emitido', 'boleto_pago',
    'agendamento_realizado', 'treinamento_realizado', 'entrevista_realizada', 'passaporte_retornado'
];

// ============================================================
//  SISTEMA DE RECONHECIMENTO DE INTENÇÕES
// ============================================================
const INTENT_KEYWORDS = {
    'visto_americano': ['visto americano', 'eua', 'estados unidos', 'us visa', 'b1', 'b2', 'entrevista eua', 'visto eua'],
    'visto_canadense': ['visto canadense', 'canadá', 'canada', 'visto canada', 'eta canadá', 'eta canadense'],
    'visto_australiano': ['visto australiano', 'austrália', 'australia', 'visto australia'],
    'eta_uk': ['eta uk', 'reino unido', 'inglaterra', 'uk visa', 'eletronic travel authorization'],
    'passaporte': ['passaporte', 'pf', 'polícia federal', 'renovar passaporte', 'passaporte novo'],
    'preco': ['preço', 'valor', 'quanto custa', 'taxa', 'investimento', 'custo', 'valores', 'preço'],
    'prazo': ['prazo', 'tempo', 'dias', 'semanas', 'demora', 'quanto tempo', 'agendamento', 'processamento'],
    'documentos': ['documentos', 'documentação', 'requisitos', 'necessário', 'obrigatório', 'papéis'],
    'visto_negado': ['negado', 'negativa', 'recusado', 'visto recusado', 'deportado', 'visto negado'],
    'iniciar_processo': ['quero fazer o visto', 'quero visto', 'iniciar processo', 'começar', 'quero começar', 'vou fazer']
};
// ============================================================
//  UTILITÁRIOS - FORMATAÇÃO
// ============================================================
function formatDateToBrazilian(dateString) {
    if (!dateString || dateString === '') return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${date.getFullYear()}`;
    }
    return dateString;
}

function formatValue(fieldName, value) {
    if (value === undefined || value === null || value === '') return null;
    if (DATE_FIELDS.includes(fieldName)) {
        const formatted = formatDateToBrazilian(value);
        if (formatted) return formatted;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return null;
        const mapped = value.map(v => {
            if (RADIO_MAPPING[fieldName]?.[v]) return RADIO_MAPPING[fieldName][v];
            if (RADIO_MAPPING[v]) return RADIO_MAPPING[v];
            return v;
        });
        return mapped.join(', ');
    }
    if (RADIO_MAPPING[fieldName]?.[value]) return RADIO_MAPPING[fieldName][value];
    if (RADIO_MAPPING[value]) return RADIO_MAPPING[value];
    return value;
}

function groupParallelArrays(data, nameField, relField) {
    const names = data[nameField] || [];
    const rels = data[relField] || [];
    const maxLen = Math.max(names.length, rels.length);
    const result = [];
    for (let i = 0; i < maxLen; i++) {
        let nome = names[i] || '';
        let rel = rels[i] || '';
        if (nome || rel) result.push(`${nome}${nome && rel ? ' - ' : ''}${rel}`);
    }
    return result;
}

function groupTravels(data) {
    const datas = data['viagem_data[]'] || [];
    const duracao = data['viagem_duracao[]'] || [];
    const maxLen = Math.max(datas.length, duracao.length);
    const result = [];
    for (let i = 0; i < maxLen; i++) {
        let d = datas[i] || '';
        let dur = duracao[i] || '';
        if (d) d = formatDateToBrazilian(d);
        if (d || dur) result.push(`${d}${d && dur ? ' - ' : ''}${dur} dias`);
    }
    return result;
}

function drawSectionTitle(doc, title) {
    doc.moveDown(1);
    doc.fillColor('#003366').fontSize(14).font('Helvetica-Bold').text(title.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    doc.moveDown(0.3);
    doc.strokeColor('#003366').lineWidth(1.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.lineWidth(0.5);
    doc.moveDown(0.5);
    doc.fillColor('#000000').fontSize(10).font('Helvetica');
}

function getServiceName(service) {
    const names = {
        'visto_americano': 'Visto Americano',
        'visto_canadense': 'Visto Canadense',
        'visto_australiano': 'Visto Australiano',
        'eta_uk': 'eTA UK',
        'eta_canadense': 'eTA Canadense',
        'passaporte': 'Passaporte'
    };
    return names[service] || 'Serviço';
}

function detectIntent(message) {
    const cleanMessage = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
        for (const keyword of keywords) {
            const cleanKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (cleanMessage.includes(cleanKeyword)) return intent;
        }
    }
    return null;
}

function isSpamData(dados) {
    const nome = dados.nome || dados.nome_cliente || dados.full_name || '';
    const telefone = dados.telefone || dados.whatsapp || dados.telefone_whatsapp || '';
    const email = dados.email || '';
    if (/^[a-z]{10,}$/i.test(nome)) return true;
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(nome)) return true;
    if (nome.length > 0 && nome.length < 3) return true;
    if (telefone && /[a-zA-Z]/.test(telefone)) return true;
    const telefoneLimpo = telefone?.toString().replace(/\D/g, '') || '';
    if (telefoneLimpo.length > 0 && telefoneLimpo.length < 10) return true;
    if (telefoneLimpo && /^(\d)\1+$/.test(telefoneLimpo)) return true;
    for (const dominio of SPAM_DOMAINS) {
        if (email.toLowerCase().includes(dominio)) return true;
    }
    if (email && (!email.includes('@') || email.split('@').length !== 2)) return true;
    return false;
}
// ============================================================
//  ENVIO WHATSAPP (CORRIGIDO)
// ============================================================
async function enviarWhatsApp(telefone, mensagem) {
    try {
        const instance = process.env.ZAPI_INSTANCE;
        const token = process.env.ZAPI_TOKEN;
        const securityToken = process.env.ZAPI_SECURITY_TOKEN;
        if (!instance || !token) {
            console.log('⚠️ Z-API não configurada');
            return false;
        }
        const cleanPhone = telefone.toString().replace(/\D/g, '');
        const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Client-Token': securityToken || ''
            },
            body: JSON.stringify({ phone: cleanPhone, message: mensagem })
        });
        const result = await response.text();
        console.log(`📱 WhatsApp enviado para ${cleanPhone}: ${response.status} - ${result.substring(0, 100)}`);
        return response.status === 200 || response.status === 201;
    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error.message);
        return false;
    }
}

async function sendReply(phone, message) {
    return enviarWhatsApp(phone, message);
}

// ============================================================
//  FUNÇÕES DE CLIENTES (CORRIGIDAS COM UPSERT)
// ============================================================
async function buscarCliente(telefone) {
    console.log(`🔍 Buscando cliente ${telefone}...`);
    const { data: ativo, error: err1 } = await supabase
        .from('clientes_ativos').select('*').eq('telefone', telefone).maybeSingle();
    if (ativo) {
        console.log(`🟢 Cliente ATIVO encontrado: ${telefone}`);
        return { dados: ativo, tipo: 'ativo', tabela: 'clientes_ativos' };
    }
    const { data: novo, error: err2 } = await supabase
        .from('clientes_novos').select('*').eq('telefone', telefone).maybeSingle();
    if (novo) {
        console.log(`🟡 Cliente NOVO encontrado: ${telefone}`);
        return { dados: novo, tipo: 'novo', tabela: 'clientes_novos' };
    }
    const { data: amigo, error: err3 } = await supabase
        .from('contatos_amigos').select('*').eq('telefone', telefone).maybeSingle();
    if (amigo) {
        console.log(`🤝 Contato AMIGO encontrado: ${telefone}`);
        return { dados: amigo, tipo: 'amigo', tabela: 'contatos_amigos' };
    }
    console.log(`📝 Cliente ${telefone} NÃO encontrado`);
    return null;
}

async function cadastrarCliente(telefone, nome = null) {
    console.log(`📝 Cadastrando/atualizando ${telefone}...`);
    const dadosCliente = {
        telefone: telefone,
        nome: nome || `Cliente_${telefone}`,
        data_contato: new Date().toISOString(),
        status: 'pendente'
    };

    // ✅ CORREÇÃO: Usar UPSERT para evitar erro de chave duplicada
    const { data, error } = await supabase
        .from('clientes_novos')
        .upsert(dadosCliente, {
            onConflict: 'telefone',
            ignoreDuplicates: false
        })
        .select()
        .single();

    if (error) {
        console.error('❌ Erro ao cadastrar cliente:', error);
        return null;
    }
    console.log(`✅ Cliente ${telefone} cadastrado/atualizado como NOVO`);
    return { dados: data, tipo: 'novo', tabela: 'clientes_novos' };
}
// ============================================================
//  SISTEMA DE ETAPAS - FUNÇÕES
// ============================================================
async function criarEtapaInicial(telefone) {
    try {
        const telefoneFormatado = formatarTelefone(telefone);

        const { data: cliente, error: clienteError } = await supabase
            .from('clientes_ativos')
            .select('telefone, nome, criado_em')
            .eq('telefone', telefoneFormatado)
            .maybeSingle();

        if (!cliente) {
            const telefoneLimpo = limparTelefone(telefone);
            const { data: clienteLimpo } = await supabase
                .from('clientes_ativos')
                .select('telefone, nome, criado_em')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();

            if (clienteLimpo) {
                await supabase
                    .from('clientes_ativos')
                    .update({ telefone: telefoneFormatado })
                    .eq('telefone', telefoneLimpo);

                const { data: clienteAtualizado } = await supabase
                    .from('clientes_ativos')
                    .select('telefone, nome, criado_em')
                    .eq('telefone', telefoneFormatado)
                    .maybeSingle();

                if (clienteAtualizado) {
                    return criarEtapaComCliente(clienteAtualizado, telefoneFormatado);
                }
            }
            console.log(`⚠️ Cliente ${telefone} não encontrado em clientes_ativos.`);
            return null;
        }
        return criarEtapaComCliente(cliente, telefoneFormatado);
    } catch (error) {
        console.error('❌ Erro ao criar etapa inicial:', error);
        return null;
    }
}

async function criarEtapaComCliente(cliente, telefone) {
    const novaEtapa = {
        cliente_telefone: telefone,
        etapa_atual: 'formulario_enviado',
        data_inicio: cliente.criado_em || new Date().toISOString(),
        data_atualizacao: new Date().toISOString(),
        historico: [{
            etapa: 'formulario_enviado',
            data: new Date().toISOString(),
            nota: 'Início do processo',
            observacao: 'Cliente movido para clientes_ativos'
        }]
    };

    const { data, error } = await supabase
        .from('etapas_processo')
        .insert(novaEtapa)
        .select()
        .single();

    if (error) throw error;
    console.log(`✅ Etapa inicial criada para: ${telefone}`);
    return data;
}

async function notificarClienteEtapa(telefone, novaEtapa) {
    try {
        const { data: cliente } = await supabase
            .from('clientes_ativos')
            .select('nome')
            .eq('telefone', telefone)
            .single();
        const nomeCliente = cliente?.nome || 'Cliente';
        const mensagem = gerarMensagemEtapa(novaEtapa, nomeCliente);
        await enviarWhatsApp(telefone, mensagem);
        console.log(`📨 Notificação enviada para ${telefone}: ${novaEtapa}`);
    } catch (error) {
        console.error('Erro ao notificar cliente:', error);
    }
}

function gerarMensagemEtapa(etapa, nomeCliente) {
    const mensagens = {
        'formulario_enviado': `📝 *Olá ${nomeCliente}!*\n\nSeu formulário DS-160 foi recebido com sucesso!\n\n✅ Iniciamos a análise do seu processo.\n\nPróxima etapa: Análise e correções dos dados.`,
        'analise_correcoes': `🔍 *${nomeCliente}, estamos analisando seu processo!*\n\nNossa equipe está revisando todos os dados do seu formulário.\n\n⏳ Em breve entraremos em contato com o próximo passo.`,
        'boleto_emitido': `💰 *${nomeCliente}, boleto emitido!*\n\nO boleto do consulado foi gerado com sucesso.\n\n📎 Você receberá o PDF por e-mail.\n\nPrazo de pagamento: 7 dias úteis.`,
        'boleto_pago': `✅ *Boleto pago, ${nomeCliente}!*\n\nConfirmamos o pagamento do seu boleto consular.\n\nPróxima etapa: Agendamento da entrevista.`,
        'agendamento_realizado': `📅 *Entrevista agendada, ${nomeCliente}!*\n\nSua entrevista foi agendada com sucesso.\n\n📌 Você receberá todos os detalhes por e-mail e WhatsApp.\n\nNão se esqueça do treinamento!`,
        'treinamento_realizado': `🎯 *Treinamento concluído, ${nomeCliente}!*\n\nExcelente! Você está preparado para a entrevista.\n\n📆 Aguarde as instruções para o grande dia.`,
        'entrevista_realizada': `🎤 *Entrevista realizada, ${nomeCliente}!*\n\nParabéns por completar sua entrevista!\n\n📫 Aguarde o retorno do seu passaporte.`,
        'passaporte_retornado': `🎉 *PARABÉNS, ${nomeCliente}!*\n\nSeu passaporte com o visto foi retornado!\n\n🌟 Seu processo foi concluído com sucesso!\n\nAgradecemos por confiar na GetVisa Assessoria! 🙏`
    };
    return mensagens[etapa] || `📌 ${nomeCliente}, seu processo avançou para: ${ETAPAS[etapa]?.label || etapa}`;
}
// ============================================================
//  RESPOSTAS DOS SUBMENUS
// ============================================================
function getRespostaSubmenu(servico, opcao) {
    const respostas = {
        preco: {
            visto_americano: `💰 *INVESTIMENTO - VISTO AMERICANO*\n\n🇺🇸 *Taxa Consular:* ~R$ 950\n📋 *Assessoria:* R$ 350\n\n✅ Inclui: DS-160, agendamento, preparação para entrevista e acompanhamento total.\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            visto_canadense: `💰 *INVESTIMENTO - VISTO CANADENSE*\n\n🇨🇦 *Taxa Consular:* ~R$ 750\n📋 *Assessoria:* R$ 400\n\n✅ Inclui: Aplicação online, documentação, preparação para biometria e entrevista.\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            visto_australiano: `💰 *INVESTIMENTO - VISTO AUSTRALIANO*\n\n🇦🇺 *Taxa Consular:* ~R$ 850\n📋 *Assessoria:* R$ 450\n\n✅ Inclui: Análise de perfil, aplicação online, documentação específica.\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            eta_uk: `💰 *INVESTIMENTO - eTA UK (REINO UNIDO)*\n\n🇬🇧 *Taxa:* ~R$ 120\n📋 *Assessoria:* R$ 150\n\n✅ Inclui: Aplicação online, validação de dados, acompanhamento.\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            eta_canadense: `💰 *INVESTIMENTO - eTA CANADENSE*\n\n🇨🇦 *Taxa:* ~R$ 50\n📋 *Assessoria:* R$ 100\n\n✅ Inclui: Aplicação online rápida, validação, entrega por e-mail.\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            passaporte: `💰 *INVESTIMENTO - PASSAPORTE*\n\n📘 *Taxa PF:* ~R$ 257\n📋 *Assessoria:* R$ 150\n\n✅ Inclui: Agendamento, orientação documental, acompanhamento.\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`
        },
        prazo: {
            visto_americano: `⏰ *PRAZO - VISTO AMERICANO*\n\n📅 *Agendamento:* até 8 semanas\n🔍 *Análise consular:* 7 a 10 dias úteis\n📬 *Retorno do passaporte:* 5 a 7 dias úteis\n\n🕒 *Total estimado:* 30 a 40 dias\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            visto_canadense: `⏰ *PRAZO - VISTO CANADENSE*\n\n📅 *Processamento:* 4 a 8 semanas\n📬 *Retorno:* 2 a 3 dias úteis\n\n🕒 *Total estimado:* 30 a 60 dias\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            visto_australiano: `⏰ *PRAZO - VISTO AUSTRALIANO*\n\n📅 *Processamento:* 2 a 4 semanas\n\n🕒 *Total estimado:* 15 a 30 dias\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            eta_uk: `⏰ *PRAZO - eTA UK*\n\n📅 *Processamento:* até 72 horas\n\n🕒 *Total estimado:* 1 a 3 dias\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            eta_canadense: `⏰ *PRAZO - eTA CANADENSE*\n\n📅 *Processamento:* até 24 horas\n\n🕒 *Total estimado:* 1 dia\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            passaporte: `⏰ *PRAZO - PASSAPORTE*\n\n📅 *Emissão:* 7 a 15 dias úteis\n\n🕒 *Total estimado:* 10 a 20 dias\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`
        },
        documentos: {
            visto_americano: `📄 *DOCUMENTOS - VISTO AMERICANO*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido (mínimo 6 meses)\n• Foto 5x7 recente\n• Comprovante da taxa consular\n• DS-160 preenchido\n\n📌 *RECOMENDADOS:*\n• Comprovante de renda\n• Extratos bancários\n• Comprovante de imóvel/veículo\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            visto_canadense: `📄 *DOCUMENTOS - VISTO CANADENSE*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido\n• Foto digital\n• Comprovantes financeiros\n\n📌 *RECOMENDADOS:*\n• Carta de intenção\n• Histórico de viagens\n• Vínculos com o Brasil\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            visto_australiano: `📄 *DOCUMENTOS - VISTO AUSTRALIANO*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido\n• Comprovantes de recursos\n• Seguro saúde (recomendado)\n\n📌 *RECOMENDADOS:*\n• Roteiro de viagem\n• Reservas de hospedagem\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            eta_uk: `📄 *DOCUMENTOS - eTA UK*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido\n• E-mail válido\n• Dados de viagem\n\n📌 *PROCESSO:*\n• Aplicação 100% online\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            eta_canadense: `📄 *DOCUMENTOS - eTA CANADENSE*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido\n• Cartão de crédito para taxa\n• E-mail válido\n\n📌 *PROCESSO:*\n• Aplicação 100% online\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            passaporte: `📄 *DOCUMENTOS - PASSAPORTE*\n\n📌 *OBRIGATÓRIOS:*\n• RG original\n• CPF\n• Título de eleitor (homens 18-70)\n• Certidão de nascimento/casamento\n• Comprovante de quitação militar (homens)\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`
        },
        processo: {
            visto_americano: `📋 *PROCESSO - VISTO AMERICANO*\n\n• Análise de perfil\n• Preenchimento do DS-160\n• Pagamento da taxa consular\n• Agendamento da entrevista\n• Coleta biométrica (CASV)\n• Entrevista no Consulado\n• Retirada do passaporte\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            visto_canadense: `📋 *PROCESSO - VISTO CANADENSE*\n\n• Análise de perfil\n• Aplicação online GCKey\n• Pagamento das taxas\n• Agendamento da biometria\n• Coleta de dados biométricos\n• Entrevista (se solicitado)\n• Decisão e envio\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            visto_australiano: `📋 *PROCESSO - VISTO AUSTRALIANO*\n\n• Análise de perfil\n• Aplicação online ImmiAccount\n• Pagamento das taxas\n• Envio de documentos\n• Acompanhamento\n• Decisão por e-mail\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            eta_uk: `📋 *PROCESSO - eTA UK*\n\n• Coleta de dados\n• Aplicação online\n• Pagamento da taxa\n• Análise automatizada\n• Recebimento por e-mail\n• Vincular ao passaporte\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            eta_canadense: `📋 *PROCESSO - eTA CANADENSE*\n\n• Coleta de dados\n• Aplicação online\n• Pagamento da taxa\n• Análise automatizada\n• Recebimento por e-mail\n• Vincular ao passaporte\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
            passaporte: `📋 *PROCESSO - PASSAPORTE*\n\n• Agendamento no site da PF\n• Separação dos documentos\n• Pagamento da GRU\n• Comparecimento ao posto\n• Coleta de dados biométricos\n• Aguardar emissão\n• Retirada do passaporte\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`
        }
    };
    let resposta = respostas[opcao]?.[servico];
    if (!resposta) {
        resposta = `ℹ️ *INFORMAÇÕES EM BREVE*\n\nEstamos preparando o conteúdo específico para ${servico.replace('_', ' ').toUpperCase()}.\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`;
    }
    return resposta;
}

function getRespostaIntencao(intent, service = null) {
    const respostas = {
        'visto_americano': `🇺🇸 *VISTO AMERICANO*\n\n✅ *Processo completo:*\n• Preenchimento DS-160\n• Agendamento da entrevista\n• Preparação para entrevista\n• Acompanhamento total\n\n💰 *Investimento:* Taxa ~R$ 950 + Assessoria R$ 350\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'visto_canadense': `🇨🇦 *VISTO CANADENSE*\n\n✅ *Processo completo:*\n• Aplicação online GCKey\n• Biometria\n• Preparação de documentos\n• Acompanhamento total\n\n💰 *Investimento:* Taxa ~R$ 750 + Assessoria R$ 400\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'visto_australiano': `🇦🇺 *VISTO AUSTRALIANO*\n\n✅ *Processo completo:*\n• Análise de perfil\n• Aplicação online ImmiAccount\n• Envio de documentos\n• Acompanhamento total\n\n💰 *Investimento:* Taxa ~R$ 850 + Assessoria R$ 450\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'eta_uk': `🇬🇧 *eTA UK (REINO UNIDO)*\n\n✅ *Processo completo:*\n• Aplicação 100% online\n• Validação de dados\n• Acompanhamento\n\n💰 *Investimento:* Taxa ~R$ 120 + Assessoria R$ 150\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'passaporte': `📘 *PASSAPORTE*\n\n✅ *Processo completo:*\n• Agendamento na PF\n• Orientação documental\n• Acompanhamento total\n\n💰 *Investimento:* Taxa PF ~R$ 257 + Assessoria R$ 150\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'preco': `💰 *INVESTIMENTO DOS SERVIÇOS*\n\n🇺🇸 Visto Americano: Taxa ~R$ 950 + Assessoria R$ 350\n🇨🇦 Visto Canadense: Taxa ~R$ 750 + Assessoria R$ 400\n🇦🇺 Visto Australiano: Taxa ~R$ 850 + Assessoria R$ 450\n🇬🇧 eTA UK: ~R$ 120 + Assessoria R$ 150\n🇨🇦 eTA Canadense: ~R$ 50 + Assessoria R$ 100\n📘 Passaporte: Taxa ~R$ 257 + Assessoria R$ 150\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'prazo': `⏰ *PRAZOS DOS SERVIÇOS*\n\n🇺🇸 Visto Americano: 30-40 dias\n🇨🇦 Visto Canadense: 30-60 dias\n🇦🇺 Visto Australiano: 15-30 dias\n🇬🇧 eTA UK: 1-3 dias\n🇨🇦 eTA Canadense: 1 dia\n📘 Passaporte: 10-20 dias\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'documentos': `📄 *DOCUMENTOS NECESSÁRIOS*\n\n📌 *Gerais:*\n• Passaporte válido (mínimo 6 meses)\n• Foto 5x7 recente\n• Comprovante de renda\n• Extratos bancários\n\n📌 *Específicos:*\n• EUA: DS-160 preenchido\n• Canadá: Carta de intenção\n• Passaporte: RG, CPF, Título de Eleitor\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'visto_negado': `⚠️ *VISTO NEGADO - RECUPERAÇÃO*\n\n📊 *Faça uma análise gratuita do seu caso:*\n🔗 https://getvisa.com.br/visto-americano-negado\n\n*O que fazemos:*\n✅ Análise do motivo da negativa\n✅ Correção do formulário\n✅ Documentação reforçada\n✅ Preparação para entrevista\n\n💰 *Assessoria especializada:* R$ 380\n\n📋 *Digite 0 para voltar ao MENU principal* 🚀`,
        'iniciar_processo': `✅ *Ótimo! Vamos iniciar seu processo!*\n\n📋 *Escolha o serviço:*\n\n1️⃣ 🇺🇸 Visto Americano\n2️⃣ 🇨🇦 Visto Canadense\n3️⃣ 🇦🇺 Visto Australiano\n4️⃣ 🇬🇧 eTA UK\n5️⃣ 🇨🇦 eTA Canadense\n6️⃣ 📘 Passaporte\n\n💬 *Digite o número ou me pergunte algo!*`
    };
    return respostas[intent] || '💬 *Desculpe, não entendi sua pergunta. Pode reformular?*';
}

// ============================================================
//  FUNÇÕES DE MENU
// ============================================================
async function getMenuPrincipal() {
    return `🇺🇸 *GETVISA - ESCOLHA O SERVIÇO* 🇺🇸\n\n1️⃣ 🇺🇸 VISTO AMERICANO\n2️⃣ 🇨🇦 VISTO CANADENSE\n3️⃣ 🇦🇺 VISTO AUSTRALIANO\n4️⃣ 🇬🇧 eTA UK (REINO UNIDO)\n5️⃣ 🇨🇦 eTA CANADENSE\n6️⃣ 📘 PASSAPORTE\n7️⃣ 📞 AJUDA / CONTATO\n\n💬 *Digite o número da opção desejada (1 a 7) ou me pergunte algo!*\n• Digite *0* para ver este MENU novamente 🚀`;
}

async function getSubmenu(service) {
    const names = {
        'visto_americano': '🇺🇸 VISTO AMERICANO',
        'visto_canadense': '🇨🇦 VISTO CANADENSE',
        'visto_australiano': '🇦🇺 VISTO AUSTRALIANO',
        'eta_uk': '🇬🇧 eTA UK',
        'eta_canadense': '🇨🇦 eTA CANADENSE',
        'passaporte': '📘 PASSAPORTE'
    };
    const isPassaporte = service === 'passaporte';
    return `${names[service] || 'SERVIÇO'}\n\n1️⃣ 💰 PREÇO\n2️⃣ ⏰ PRAZO\n3️⃣ 📄 DOCUMENTOS\n4️⃣ 📋 PROCESSO\n5️⃣ ${isPassaporte ? '📍 ONDE FAZER' : '⚠️ VISTO NEGADO'}\n6️⃣ 📊 AVALIAÇÃO GRATUITA\n7️⃣ 📞 FALAR COM ESPECIALISTA\n0️⃣ 🔙 VOLTAR AO MENU PRINCIPAL\n\n💬 *Digite o número da opção desejada ou me pergunte algo!* 🚀`;
}
// ============================================================
//  AUTENTICAÇÃO ADMIN
// ============================================================
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== ADMIN_API_KEY) return res.status(403).json({ error: 'Acesso negado' });
    next();
}

// ============================================================
//  FUNÇÃO PARA PROCESSAR O MENU (CORRIGIDA)
// ============================================================
async function processarMenu(cleanPhone, messageText, body) {
    console.log(`🔄 Processando menu para ${cleanPhone}: "${messageText}"`);

    // PEGAR OU CRIAR O ESTADO DA CONVERSA
    let state = userState.get(cleanPhone);
    if (!state) {
        state = {
            nivel: 'principal',
            service: null,
            lastActivity: Date.now()
        };
        userState.set(cleanPhone, state);
        console.log(`📌 Novo estado criado para ${cleanPhone}: principal`);
    }
    state.lastActivity = Date.now();

    // Comando 0 - Volta ao menu principal
    if (messageText === '0') {
        state.nivel = 'principal';
        state.service = null;
        userState.set(cleanPhone, state);
        await sendReply(cleanPhone, await getMenuPrincipal());
        console.log(`↩️ Voltou ao menu principal`);
        return;
    }

    // Saudações
    const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e aí', 'hey', 'hi', 'hello', 'teste'];
    if (saudacoes.includes(messageText.toLowerCase())) {
        await sendReply(cleanPhone, await getMenuPrincipal());
        console.log(`👋 Saudação detectada, enviando menu`);
        return;
    }

    console.log(`📊 Estado atual: nivel=${state.nivel}, service=${state.service}`);

    // ============================================================
    // SUBMENU
    // ============================================================
    if (state.nivel === 'submenu') {
        const service = state.service;
        console.log(`📌 Processando SUBMENU para serviço: ${service}`);

        if (messageText === '7') {
            await sendReply(cleanPhone, `📞 *FALAR COM ESPECIALISTA - ${getServiceName(service)}*\n\nMeu nome é *Moisés* e estou aqui para te ajudar!\n\n📱 *WhatsApp:* https://wa.me/5521974601812\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
            return;
        }

        if (messageText === '6') {
            const links = {
                'visto_americano': 'https://getvisa.com.br/simulador-visto-americano',
                'visto_canadense': 'https://getvisa.com.br/simulador-visto-canadense',
                'visto_australiano': 'https://getvisa.com.br/simulador-visto-australiano',
                'eta_uk': 'https://getvisa.com.br/simulador-eta-uk',
                'eta_canadense': 'https://getvisa.com.br/simulador-eta-canadense',
                'passaporte': 'https://getvisa.com.br/formulario-passaporte/'
            };
            await sendReply(cleanPhone, `📊 *AVALIAÇÃO GRATUITA - ${getServiceName(service)}*\n\n🔗 ${links[service] || 'https://getvisa.com.br/simulador-visto-americano'}\n\n⏱️ Leva menos de 2 minutos!\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
            return;
        }

        if (messageText === '5') {
    if (service === 'passaporte') {
        await sendReply(cleanPhone, `📍 *ONDE FAZER O PASSAPORTE*\n\n• Polícia Federal (agendar no site da PF)\n• Postos de atendimento em todo Brasil\n• Agendamento online obrigatório\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
    } else {
        await sendReply(cleanPhone, `⚠️ *VISTO NEGADO - ${getServiceName(service).toUpperCase()}*\n\n📊 *Faça uma análise gratuita:*\n🔗 https://getvisa.com.br/visto-americano-negado/\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
    }
    return;
}

        if (['1', '2', '3', '4'].includes(messageText)) {
            const opcoesMap = { '1': 'preco', '2': 'prazo', '3': 'documentos', '4': 'processo' };
            let resposta = getRespostaSubmenu(service, opcoesMap[messageText]);
            resposta += `\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`;
            await sendReply(cleanPhone, resposta);
            console.log(`📤 Resposta do submenu enviada: ${opcoesMap[messageText]}`);
            return;
        }

        await sendReply(cleanPhone, await getSubmenu(service));
        return;
    }

    // ============================================================
    // MENU PRINCIPAL
    // ============================================================
    if (state.nivel === 'principal') {
        console.log(`📌 Processando MENU PRINCIPAL para: "${messageText}"`);
        let serviceKey = null;
        switch (messageText) {
            case '1': serviceKey = 'visto_americano'; break;
            case '2': serviceKey = 'visto_canadense'; break;
            case '3': serviceKey = 'visto_australiano'; break;
            case '4': serviceKey = 'eta_uk'; break;
            case '5': serviceKey = 'eta_canadense'; break;
            case '6': serviceKey = 'passaporte'; break;
            case '7':
                await sendReply(cleanPhone, `📞 *FALAR COM ESPECIALISTA*\n\nMeu nome é *Moisés* e estou aqui para te ajudar!\n\n📱 *WhatsApp:* https://wa.me/5521974601812\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
                return;
            default:
                const intent = detectIntent(messageText);
                if (intent) {
                    await sendReply(cleanPhone, getRespostaIntencao(intent));
                    return;
                }
                await sendReply(cleanPhone, await getMenuPrincipal());
                return;
        }

        if (serviceKey) {
            state.nivel = 'submenu';
            state.service = serviceKey;
            userState.set(cleanPhone, state);
            console.log(`✅ Mudou para SUBMENU: ${serviceKey}`);
            await sendReply(cleanPhone, await getSubmenu(serviceKey));
        }
    }
}

/// ============================================================
//  WEBHOOK Z-API (VERSÃO COMPLETA COM MENU)
// ============================================================
app.post('/api/webhook/zapi', async (req, res) => {
    console.log('📥 ========== WEBHOOK Z-API RECEBIDO ==========');
    console.log('📥 Timestamp:', new Date().toISOString());
    console.log('📥 Body:', JSON.stringify(req.body, null, 2));

    res.status(200).json({
        status: 'ok',
        received: true,
        timestamp: new Date().toISOString()
    });

    (async () => {
        try {
            const body = req.body;

            // Verificações iniciais
            if (body.isGroup === true || body.isGroupMsg === true || body.chatId?.includes('@g.us')) {
                console.log('👥 Mensagem de grupo ignorada');
                return;
            }
            if (body.fromMe === true) {
                console.log('🤖 Mensagem do próprio bot ignorada');
                return;
            }
            if (body.isStatusReply === true || body.waitingMessage === true) {
                console.log('⏳ Mensagem de status/waiting ignorada');
                return;
            }

            // Extrair mensagem e telefone
            let messageText = '';
            let senderPhone = '';

            if (body.text) {
                if (typeof body.text === 'string') messageText = body.text;
                else if (body.text.message) messageText = body.text.message;
                else if (body.text.body) messageText = body.text.body;
            }
            if (!messageText && body.message) {
                if (typeof body.message === 'string') messageText = body.message;
                else if (body.message.text) messageText = body.message.text;
                else if (body.message.content) messageText = body.message.content;
                else if (body.message.body) messageText = body.message.body;
            }
            if (!messageText && body.content) messageText = body.content;
            if (!messageText && body.body) messageText = body.body;

            if (body.phone) senderPhone = body.phone;
            else if (body.from) senderPhone = body.from;
            else if (body.sender) senderPhone = body.sender;
            else if (body.wa_id) senderPhone = body.wa_id;
            else if (body.chatId) senderPhone = body.chatId;

            console.log(`📩 Mensagem bruta: "${messageText}"`);
            console.log(`📱 Telefone bruto: "${senderPhone}"`);

            if (!senderPhone || !messageText || messageText.trim().length === 0) {
                console.log('⚠️ Dados inválidos - ignorando');
                return;
            }

            messageText = messageText.trim();

            let cleanPhone = senderPhone.toString().replace(/\D/g, '');
            if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);
            if (cleanPhone.length < 10) {
                console.log(`⚠️ Telefone inválido (${cleanPhone})`);
                await sendReply(senderPhone, '⚠️ Desculpe, não conseguimos identificar seu número. Tente novamente.');
                return;
            }

            console.log(`📱 Telefone limpo: ${cleanPhone}`);
            console.log(`📝 Mensagem: "${messageText}"`);

            // ============================================================
            // 1. VERIFICAR SE É AMIGO
            // ============================================================
            const { data: amigo } = await supabase
                .from('contatos_amigos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (amigo) {
                console.log(`🤝 Contato AMIGO: ${cleanPhone} - SILÊNCIO TOTAL`);
                return;
            }

            // ============================================================
            // 2. VERIFICAR SE É FINALIZADO
            // ============================================================
            const { data: finalizado } = await supabase
                .from('clientes_finalizados')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (finalizado) {
                console.log(`🏁 Cliente FINALIZADO: ${cleanPhone}`);
                await sendReply(cleanPhone, `🙏 *Muito obrigado por confiar na GetVisa!*\n\nSeu processo foi concluído com sucesso.\n\n📋 *Serviço:* ${finalizado.servico || 'não informado'}\n📅 *Finalizado em:* ${new Date(finalizado.data_finalizacao).toLocaleDateString('pt-BR')}\n\n⭐ *Avalie nosso serviço:* https://getvisa.com.br/avaliacao\n\n💬 *Estamos aqui para você sempre que precisar!* 🙏`);
                return;
            }

            // ============================================================
            // 3. VERIFICAR SE É ATIVO
            // ============================================================
            const { data: ativo } = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (ativo) {
                console.log(`🟢 Cliente ATIVO: ${cleanPhone}`);

                let etapaMsg = '';
                try {
                    const { data: etapa } = await supabase
                        .from('etapas_processo')
                        .select('etapa_atual')
                        .eq('cliente_telefone', cleanPhone)
                        .maybeSingle();

                    if (etapa) {
                        const etapaInfo = ETAPAS[etapa.etapa_atual];
                        etapaMsg = `\n📌 *Etapa atual:* ${etapaInfo?.label || etapa.etapa_atual}`;
                    }
                } catch (err) {
                    console.log('⚠️ Erro ao buscar etapa:', err);
                }

                await sendReply(cleanPhone, `👋 *Olá!*\n\n📋 *Seu processo está em andamento.*${etapaMsg}\n\n✅ *Status:* ${ativo.status || 'em_processo'}\n\n📌 *Digite 0 para o MENU principal* 🚀`);
                return;
            }

                         // ============================================================
            // 4. VERIFICAR SE É NOVO (JÁ CADASTRADO) ou CADASTRAR
            // ============================================================
            console.log('🔍 Verificando se é NOVO...');

            // Buscar em clientes_novos com o telefone limpo
            const { data: novo, error: errNovo } = await supabase
                .from('clientes_novos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            // Se não encontrou, tentar buscar com o telefone formatado
            let clienteExistente = novo;
            if (!clienteExistente) {
                const telefoneFormatado = formatarTelefone(cleanPhone);
                const { data: novoFormatado } = await supabase
                    .from('clientes_novos')
                    .select('*')
                    .eq('telefone', telefoneFormatado)
                    .maybeSingle();
                clienteExistente = novoFormatado;
            }

            if (clienteExistente) {
                console.log(`🟡 Cliente NOVO já cadastrado: ${cleanPhone}`);
                await processarMenu(cleanPhone, messageText, body);
                return;
            }

            // Se não existe, cadastrar
            console.log(`✅ NOVO CLIENTE DETECTADO: ${cleanPhone}`);
            let nomeCliente = body.name || body.sender?.name || body.pushName || 'Cliente';
            const resultado = await cadastrarCliente(cleanPhone, nomeCliente);
            if (!resultado) {
                await sendReply(cleanPhone, '⚠️ Desculpe, estamos com problemas técnicos.');
                return;
            }
            console.log(`✅ Cliente ${cleanPhone} cadastrado com sucesso!`);

            // Processar menu após cadastro
            await processarMenu(cleanPhone, messageText, body);

        } catch (error) {
            console.error('❌ ERRO NO PROCESSAMENTO DO WEBHOOK:');
            console.error('❌ Mensagem:', error.message);
            console.error('❌ Stack:', error.stack);

            try {
                const phone = req.body?.phone || req.body?.from || null;
                if (phone) {
                    const cleanPhone = phone.toString().replace(/\D/g, '');
                    if (cleanPhone.length >= 10) {
                        await sendReply(cleanPhone, '⚠️ Desculpe, estamos com problemas técnicos. Nossa equipe já foi notificada e entrará em contato em breve. 🙏');
                    }
                }
            } catch (e) {
                console.error('❌ Falha ao enviar mensagem de erro:', e);
            }
        }
    })();
});

// ============================================================
//  ENDPOINT DE TESTE MANUAL
// ============================================================
app.post('/api/test/webhook-manual', async (req, res) => {
    console.log('🧪 ========== TESTE MANUAL ==========');
    console.log('📥 Body:', JSON.stringify(req.body, null, 2));

    const { phone, message, name } = req.body;

    if (!phone) {
        return res.status(400).json({ error: 'Phone é obrigatório' });
    }

    try {
        const cleanPhone = phone.toString().replace(/\D/g, '');
        console.log(`📱 Telefone limpo: ${cleanPhone}`);
        console.log(`📝 Mensagem: "${message || 'Teste'}"`);

        const resultado = await sendReply(cleanPhone, '🧪 *TESTE MANUAL*\n\nSe você está vendo esta mensagem, o sistema está funcionando!\n\n📋 *Digite 0 para o menu principal* 🚀');

        res.json({
            success: true,
            phone: cleanPhone,
            message_sent: resultado,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erro no teste manual:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================
//  ROTAS DE SAÚDE
// ============================================================
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/ping', (req, res) => res.status(200).send('ok'));

// ============================================================
//  ROTAS DO PAINEL
// ============================================================
app.get('/api/painel/pendentes', async (req, res) => {
    try {
        const { data: pendentes, error: err1 } = await supabase
            .from('clientes_novos').select('*').order('data_contato', { ascending: false });
        if (err1) return res.status(500).json({ success: false, message: err1.message });

        const { data: ativos, error: err2 } = await supabase
            .from('clientes_ativos').select('*').order('criado_em', { ascending: false });
        if (err2) return res.status(500).json({ success: false, message: err2.message });

        const { data: amigos, error: err3 } = await supabase
            .from('contatos_amigos').select('*').order('criado_em', { ascending: false });
        if (err3) return res.status(500).json({ success: false, message: err3.message });

        res.json({ success: true, pendentes: pendentes || [], ativos: ativos || [], amigos: amigos || [] });
    } catch (error) {
        console.error('❌ Erro ao buscar dados:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/clientes/ativos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clientes_ativos')
            .select('telefone, nome')
            .order('criado_em', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar ativos:', error);
            return res.status(500).json({ success: false, message: error.message });
        }

        res.json({
            success: true,
            ativos: data || []
        });

    } catch (error) {
        console.error('❌ Erro ao buscar ativos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/clientes/listar', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .order('nome_completo', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            clientes: data || []
        });

    } catch (error) {
        console.error('❌ Erro ao listar clientes:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/painel/mover', async (req, res) => {
    try {
        const { telefone, destino } = req.body;
        if (!telefone || !destino) return res.status(400).json({ success: false, message: 'Telefone e destino são obrigatórios' });
        if (!['ativo', 'amigo'].includes(destino)) return res.status(400).json({ success: false, message: 'Destino deve ser "ativo" ou "amigo"' });

        const { data: cliente, error: buscaError } = await supabase
            .from('clientes_novos').select('*').eq('telefone', telefone).maybeSingle();
        if (buscaError) return res.status(500).json({ success: false, message: buscaError.message });
        if (!cliente) return res.status(404).json({ success: false, message: 'Cliente não encontrado em clientes_novos' });

        if (destino === 'ativo') {
            const { error: insertError } = await supabase.from('clientes_ativos').insert({
                telefone: cliente.telefone, nome: cliente.nome,
                criado_em: cliente.data_contato, atualizado_em: new Date().toISOString()
            });
            if (insertError) return res.status(500).json({ success: false, message: insertError.message });
            try { await criarEtapaInicial(cliente.telefone); } catch (err) { console.error('⚠️ Erro ao criar etapa:', err); }
        } else {
            const { error: insertError } = await supabase.from('contatos_amigos').insert({
                telefone: cliente.telefone, nome: cliente.nome, criado_em: cliente.data_contato
            });
            if (insertError) return res.status(500).json({ success: false, message: insertError.message });
        }

        await supabase.from('clientes_novos').delete().eq('telefone', telefone);
        res.json({ success: true, message: `Cliente ${telefone} movido para ${destino}` });
    } catch (error) {
        console.error('❌ Erro ao mover cliente:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/painel/mover-varios', async (req, res) => {
    try {
        const { telefones, destino } = req.body;
        if (!telefones || !Array.isArray(telefones) || telefones.length === 0) {
            return res.status(400).json({ success: false, message: 'Lista de telefones é obrigatória' });
        }

        let movidos = 0, erros = [];
        for (const telefone of telefones) {
            try {
                const { data: cliente } = await supabase.from('clientes_novos').select('*').eq('telefone', telefone).maybeSingle();
                if (!cliente) { erros.push(`${telefone}: não encontrado`); continue; }

                if (destino === 'ativo') {
                    await supabase.from('clientes_ativos').insert({
                        telefone: cliente.telefone, nome: cliente.nome,
                        criado_em: cliente.data_contato, atualizado_em: new Date().toISOString()
                    });
                } else {
                    await supabase.from('contatos_amigos').insert({
                        telefone: cliente.telefone, nome: cliente.nome, criado_em: cliente.data_contato
                    });
                }
                await supabase.from('clientes_novos').delete().eq('telefone', telefone);
                movidos++;
            } catch (err) { erros.push(`${telefone}: ${err.message}`); }
        }

        res.json({ success: true, movidos, erros: erros.length > 0 ? erros : undefined, message: `${movidos} cliente(s) movido(s)` });
    } catch (error) {
        console.error('❌ Erro ao mover clientes:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
//  ROTAS DO SISTEMA DE ETAPAS
// ============================================================
app.get('/api/etapas/cliente/:telefone', async (req, res) => {
    try {
        const telefoneLimpo = req.params.telefone.replace(/\D/g, '');
        const telefoneFormatado = formatarTelefone(telefoneLimpo);

        const { data, error } = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', telefoneFormatado)
            .maybeSingle();

        if (!data) {
            const { data: dataLimpo } = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', telefoneLimpo)
                .maybeSingle();

            if (dataLimpo) {
                return res.json(dataLimpo);
            }
        }

        if (!data) {
            const novaEtapa = await criarEtapaInicial(telefoneFormatado);
            if (novaEtapa) return res.json(novaEtapa);
            return res.status(404).json({ erro: 'Cliente não encontrado' });
        }

        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar etapa:', error);
        res.status(500).json({ erro: 'Erro ao buscar etapa do cliente' });
    }
});

app.post('/api/etapas/avancar', async (req, res) => {
    try {
        const { telefone, nota, observacao } = req.body;
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const telefoneFormatado = formatarTelefone(telefoneLimpo);

        console.log(`📱 Avançando etapa para: ${telefoneFormatado}`);

        if (!FEATURES.SISTEMA_ETAPAS.ativo) {
            return res.status(503).json({ erro: 'Sistema de etapas está temporariamente desativado' });
        }

        const { data: etapaAtual, error: buscaError } = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', telefoneFormatado)
            .maybeSingle();

        if (!etapaAtual) {
            const { data: etapaLimpo } = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', telefoneLimpo)
                .maybeSingle();

            if (etapaLimpo) {
                await supabase
                    .from('etapas_processo')
                    .update({ cliente_telefone: telefoneFormatado })
                    .eq('cliente_telefone', telefoneLimpo);

                const { data: etapaCorrigida } = await supabase
                    .from('etapas_processo')
                    .select('*')
                    .eq('cliente_telefone', telefoneFormatado)
                    .maybeSingle();

                if (etapaCorrigida) {
                    return processarAvanco(res, etapaCorrigida, nota, observacao, telefoneFormatado);
                }
            }

            return res.status(404).json({ erro: 'Cliente não encontrado em etapas_processo' });
        }

        return processarAvanco(res, etapaAtual, nota, observacao, telefoneFormatado);
    } catch (error) {
        console.error('Erro ao avançar etapa:', error);
        res.status(500).json({ erro: 'Erro ao avançar etapa', detalhe: error.message });
    }
});

async function processarAvanco(res, etapaAtual, nota, observacao, telefone) {
    const etapaId = etapaAtual.etapa_atual;
    const proximaEtapa = ETAPAS[etapaId]?.next;

    if (!proximaEtapa) {
        return res.status(400).json({ erro: 'Cliente já está na última etapa' });
    }

    const historicoAtualizado = [
        ...(etapaAtual.historico || []),
        {
            etapa: etapaId,
            data: new Date().toISOString(),
            nota: nota || 'Avanço manual',
            observacao: observacao || 'Avançado pelo painel administrativo'
        }
    ];

    const dadosAtualizacao = {
        etapa_atual: proximaEtapa,
        data_atualizacao: new Date().toISOString(),
        historico: historicoAtualizado
    };

    const campoData = `data_${proximaEtapa}`;
    dadosAtualizacao[campoData] = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
        .from('etapas_processo')
        .update(dadosAtualizacao)
        .eq('cliente_telefone', telefone)
        .select()
        .single();

    if (updateError) throw updateError;

    if (FEATURES.SISTEMA_ETAPAS.notificar_cliente) {
        await notificarClienteEtapa(telefone, proximaEtapa);
    }

    console.log(`📊 Cliente ${telefone} avançou para: ${proximaEtapa}`);

    res.json({
        sucesso: true,
        etapa_anterior: etapaId,
        etapa_atual: proximaEtapa,
        dados: updated
    });
}

app.get('/api/etapas/historico/:telefone', async (req, res) => {
    try {
        const telefoneLimpo = req.params.telefone.replace(/\D/g, '');
        const { data, error } = await supabase
            .from('etapas_processo')
            .select('historico, etapa_atual, data_inicio, data_atualizacao')
            .eq('cliente_telefone', telefoneLimpo)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ erro: 'Cliente não encontrado' });
            throw error;
        }

        res.json({
            etapa_atual: data.etapa_atual,
            data_inicio: data.data_inicio,
            data_atualizacao: data.data_atualizacao,
            historico: data.historico || []
        });
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ erro: 'Erro ao buscar histórico' });
    }
});

app.get('/api/etapas/estatisticas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('etapas_processo').select('etapa_atual');
        if (error) throw error;

        const estatisticas = {};
        const total = data.length;
        data.forEach(item => {
            if (!estatisticas[item.etapa_atual]) estatisticas[item.etapa_atual] = 0;
            estatisticas[item.etapa_atual]++;
        });

        const resultado = Object.keys(estatisticas).map(etapa => ({
            etapa,
            label: ETAPAS[etapa]?.label || etapa,
            quantidade: estatisticas[etapa],
            porcentagem: total > 0 ? ((estatisticas[etapa] / total) * 100).toFixed(2) : 0
        }));

        res.json({
            total_clientes_ativos: total,
            distribuicao: resultado,
            ultima_atualizacao: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ erro: 'Erro ao buscar estatísticas' });
    }
});

// ============================================================
//  VALIDAÇÃO DS-160
// ============================================================
function validateDS160(data) {
    const errors = [];

    if (data['radio-visto-negado'] === 'one') {
        if (!data['text-visto-negado-ano'] || data['text-visto-negado-ano'] === '') {
            errors.push('Ano da negativa do visto é obrigatório');
        }
    }

    if (data['radio-entrada-negada'] === 'one') {
        if (!data['text-entrada-negada-ano'] || data['text-entrada-negada-ano'] === '') {
            errors.push('Ano da negativa de entrada é obrigatório');
        }
    }

    if (data['radio-deportado'] === 'one') {
        if (!data['text-deportado-ano'] || data['text-deportado-ano'] === '') {
            errors.push('Ano da deportação é obrigatório');
        }
        if (!data['select-deportado-duracao'] || data['select-deportado-duracao'] === '') {
            errors.push('Duração da deportação é obrigatória');
        }
    }

    return { isValid: errors.length === 0, errors: errors };
}
// ============================================================
//  ENDPOINTS ADMIN - AGENDAMENTOS E COMPROMISSOS
// ============================================================
app.get('/api/agendamentos/listar', async (req, res) => {
    try {
        const { data: compromissos, error } = await supabase
            .from('compromissos')
            .select('id, cliente, atividade, data, hora, local, concluido')
            .order('data', { ascending: false });

        if (error) throw error;

        const resultado = compromissos.map(item => ({
            id: item.id,
            tipo: item.atividade || 'N/A',
            data_hora: item.data && item.hora ? `${item.data}T${item.hora}:00` : null,
            local: item.local || 'N/A',
            status: item.concluido === 1 ? 'realizado' : 'agendado',
            cliente_nome: item.cliente || 'N/A'
        }));

        res.json({
            success: true,
            agendamentos: resultado
        });
    } catch (error) {
        console.error('❌ Erro ao listar agendamentos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.get('/api/agendamentos', validateApiKey, async (req, res) => {
    const { solicitacao_id } = req.query;
    let query = supabase.from('agendamentos').select('*');
    if (solicitacao_id) query = query.eq('solicitacao_id', solicitacao_id);
    const { data, error } = await query.order('data_hora', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/agendamentos', validateApiKey, async (req, res) => {
    const { solicitacao_id, tipo, data_hora, local, observacoes } = req.body;
    if (!solicitacao_id || !tipo || !data_hora) {
        return res.status(400).json({ error: 'Campos obrigatorios: solicitacao_id, tipo, data_hora' });
    }
    const { data, error } = await supabase.from('agendamentos').insert({
        solicitacao_id, tipo, data_hora, local, observacoes, status: 'agendado'
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

app.put('/api/agendamentos/:id', validateApiKey, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    delete updates.id;
    delete updates.created_at;
    const { data, error } = await supabase
        .from('agendamentos')
        .update({ ...updates, updated_at: new Date() })
        .eq('id', id)
        .select()
        .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.delete('/api/agendamentos/:id', validateApiKey, async (req, res) => {
    const { error } = await supabase.from('agendamentos').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
});

app.get('/api/solicitacoes', validateApiKey, async (req, res) => {
    const { data, error } = await supabase
        .from('solicitacoes')
        .select('id, tipo, clientes_ativos(nome_completo, email)')
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/compromissos', validateApiKey, async (req, res) => {
    const { data, error } = await supabase
        .from('compromissos')
        .select('*')
        .order('data', { ascending: true })
        .order('hora', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/compromissos', validateApiKey, async (req, res) => {
    const { cliente, cliente_id, atividade, data, hora, local, concluido } = req.body;
    if (!cliente || !atividade || !data || !hora) {
        return res.status(400).json({ error: 'Cliente, atividade, data e hora sao obrigatorios' });
    }
    const { data: inserted, error } = await supabase
        .from('compromissos')
        .insert({
            cliente, cliente_id, atividade, data, hora, local, concluido: concluido || 0
        })
        .select()
        .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(inserted);
});

app.put('/api/compromissos/:id', validateApiKey, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const { data, error } = await supabase
        .from('compromissos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.delete('/api/compromissos/:id', validateApiKey, async (req, res) => {
    const { error } = await supabase.from('compromissos').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
});
// ============================================================
//  ROTA DS-160 - COM SALVAMENTO NO SUPABASE
// ============================================================
app.post('/api/submit-ds160', async (req, res) => {
    const data = req.body;

    if (isSpamData(data)) {
        console.log('🚫 SPAM DS-160 - Dados rejeitados');
        return res.status(200).json({ success: true, message: 'Recebido' });
    }

    const validation = validateDS160(data);
    if (!validation.isValid) {
        console.error('❌ Erro de validação:', validation.errors);
        return res.status(400).json({
            success: false,
            errors: validation.errors,
            message: 'Por favor, responda todas as perguntas obrigatórias corretamente.'
        });
    }

    console.log('📥 Dados recebidos (DS-160) - VALIDAÇÃO OK');
    res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

    (async () => {
        try {
            const nome = data['full_name'] || 'Cliente_Sem_Nome';
            const emailCliente = data['email-1'] || null;
            const telefoneCliente = limparTelefone(data['text-77'] || data['telefone'] || null);

            // Salvar formulário
            let formularioId = null;
            try {
                const { data: formulario, error: insertError } = await supabase
                    .from('formulario_ds160')
                    .insert({
                        nome: nome,
                        email_principal: emailCliente,
                        telefone: telefoneCliente,
                        numero_passaporte: data['text-38'] || null,
                        cpf: data['text-86'] || null,
                        protocolo: data['protocolo'] || null,
                        consulado_preferido: data['consulado_cidade'] || null,
                        proposito_viagem: data['radio-28'] || null,
                        data_chegada_prevista: data['text-21'] || null,
                        form_data: data,
                        status: 'recebido',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (insertError) {
                    console.error('❌ Erro ao salvar formulário DS-160:', insertError);
                } else {
                    formularioId = formulario.id;
                    console.log(`✅ Formulário DS-160 salvo com ID: ${formularioId}`);
                }
            } catch (err) {
                console.error('⚠️ Erro ao salvar no Supabase:', err.message);
            }

            // Criar cliente e etapa
            if (telefoneCliente) {
                try {
                    const telefoneLimpo = limparTelefone(telefoneCliente);
                    console.log(`📱 Telefone limpo: ${telefoneLimpo}`);

                    // Verificar se cliente já existe
                    const { data: clienteExistente } = await supabase
                        .from('clientes_ativos')
                        .select('*')
                        .eq('telefone', telefoneLimpo)
                        .maybeSingle();

                    // Criar cliente se não existir
                    // Criar/atualizar cliente em ATIVOS (USANDO UPSERT)
                    const { error: insertError } = await supabase
                        .from('clientes_ativos')
                        .upsert({
                            telefone: telefoneLimpo,
                            nome: nome,
                            atualizado_em: new Date().toISOString()
                        }, {
                            onConflict: 'telefone',
                            ignoreDuplicates: false
                        });

                    if (insertError) {
                        console.error('❌ Erro ao criar/atualizar cliente em ATIVOS:', insertError);
                    } else {
                        console.log(`✅ Cliente ${telefoneLimpo} criado/atualizado em ATIVOS`);
                    }

                    // Criar etapa
                    const { error: etapaError } = await supabase
                        .from('etapas_processo')
                        .insert({
                            cliente_telefone: formatarTelefone(telefoneLimpo),
                            etapa_atual: 'formulario_enviado',
                            data_inicio: new Date().toISOString(),
                            data_atualizacao: new Date().toISOString(),
                            historico: [{
                                etapa: 'formulario_enviado',
                                data: new Date().toISOString(),
                                nota: 'Início do processo',
                                observacao: 'Cliente criado via formulário DS-160'
                            }]
                        });

                    if (etapaError) {
                        console.error('❌ Erro ao criar etapa:', etapaError);
                    }

                    // Remover de clientes_novos se existir
                    const { data: clienteNovo } = await supabase
                        .from('clientes_novos')
                        .select('*')
                        .eq('telefone', telefoneLimpo)
                        .maybeSingle();

                    if (clienteNovo) {
                        await supabase
                            .from('clientes_novos')
                            .delete()
                            .eq('telefone', telefoneLimpo);
                        console.log(`✅ Cliente ${telefoneLimpo} removido de NOVOS`);
                    }

                } catch (err) {
                    console.error('⚠️ Erro ao processar cliente:', err.message);
                }
            }

            // Enviar e-mails
            const pdfBuffer = await gerarPDF_DS160(data);
            console.log(`📄 PDF gerado para ${nome}, tamanho: ${pdfBuffer.length} bytes`);

            await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: ['getvisa.assessoria@gmail.com'],
                subject: `🇺🇸 DS-160: ${nome}`,
                html: `<strong>Formulario DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
                attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
            });
            console.log('✅ E-mail enviado para a equipe');

            if (emailCliente && emailCliente.trim() !== '') {
                await resend.emails.send({
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: [emailCliente],
                    subject: `Seu formulario DS-160 foi recebido - ${nome}`,
                    html: `<strong>Ola ${nome},</strong><br><p>Recebemos seu formulario. Segue em anexo uma copia.</p><p>Em breve nossa equipe entrara em contato.</p>`,
                    attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                });
                console.log(`✅ E-mail enviado para o cliente: ${emailCliente}`);
            }

        } catch (err) {
            console.error('❌ Erro no processamento DS-160 (background):', err);
        }
    })();
});
// ============================================================
//  FUNÇÃO GERAR PDF DS-160 (COMPLETA)
// ============================================================
async function gerarPDF_DS160(data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const nomeCliente = getFormData(data, 'nome', 'nome_completo', 'Cliente_Sem_Nome');

        doc.fillColor('#003366').fontSize(22).text('SOLICITACAO DE VISTO DS-160', { align: 'center' });
        doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentacao Consular', { align: 'center' });
        doc.moveDown(2);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        let currentSection = null;
        let hasContentInSection = false;

        function renderField(fieldName, label) {
            let value = data[fieldName];
            if (value !== undefined && value !== null && value !== '') {
                const formatted = formatValue(fieldName, value);
                if (formatted && formatted !== '(não informado)') {
                    doc.font('Helvetica-Bold').fontSize(10).text(`${label}: `, { continued: true });
                    doc.font('Helvetica').text(formatted);
                    doc.moveDown(0.6);
                    return true;
                }
            }
            return false;
        }

        function startSection(sectionTitle) {
            if (currentSection !== null && hasContentInSection) {
                doc.moveDown(0.8);
            }
            drawSectionTitle(doc, sectionTitle);
            currentSection = sectionTitle;
            hasContentInSection = false;
        }

        // ============================================================
        // SEÇÃO 1 - INFORMAÇÕES INICIAIS
        // ============================================================
        startSection('INFORMACOES INICIAIS');
        renderField('consulado_cidade', 'Cidade do Consulado');
        if (renderField('radio-26', 'Indicado por agencia/agente?') && data['radio-26'] === 'one') {
            renderField('text-1', 'Nome da agencia/agente');
        }
        renderField('text-64', 'Idioma usado para preencher');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 2 - INFORMAÇÕES PESSOAIS
        // ============================================================
        startSection('INFORMACOES PESSOAIS');
        renderField('full_name', 'Nome completo');
        if (renderField('radio-2', 'Ja teve outro nome?') && data['radio-2'] === 'one') {
            renderField('text-87', 'Nome anterior');
        }
        renderField('radio-3', 'Sexo');
        renderField('select-4', 'Estado civil');
        renderField('text-5', 'Data de nascimento');
        renderField('text-7', 'Cidade de nascimento');
        renderField('text-6', 'Estado/Provincia');
        renderField('text-95', 'Pais de nacionalidade');
        if (renderField('radio-outra-nac', 'Possui outra nacionalidade?') && data['radio-outra-nac'] === 'one') {
            renderField('outra_nacionalidade_text', 'Qual outra nacionalidade?');
        }
        renderField('radio-residente', 'Residente permanente de outro pais?');
        renderField('text-86', 'CPF');
        renderField('text-17', 'Numero do Seguro Social (SSN)');
        renderField('text-18', 'Numero do contribuinte dos EUA (TIN)');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 3 - INFORMAÇÕES DA VIAGEM
        // ============================================================
        startSection('INFORMACOES DA VIAGEM');
        renderField('radio-28', 'Proposito da viagem');
        renderField('radio-planos', 'Planos especificos?');
        renderField('text-21', 'Data de chegada prevista');
        renderField('text-34', 'Duracao da estadia (dias)');
        renderField('text-41', 'Endereco nos EUA');
        renderField('text-42', 'Cidade (EUA)');
        renderField('text-43', 'Estado (EUA)');
        renderField('email-4', 'CEP (EUA)');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 4 - PAGADOR DA VIAGEM
        // ============================================================
        startSection('PAGADOR DA VIAGEM');
        renderField('radio-6', 'Quem vai pagar?');
        renderField('text-22', 'Nome do pagador');
        renderField('text-25', 'Relacionamento com pagador');
        renderField('phone-1', 'Telefone do pagador');
        renderField('text-24', 'E-mail do pagador');
        renderField('text-26', 'Endereco do pagador');
        renderField('text-27', 'Cidade do pagador');
        renderField('text-96', 'UF do pagador');
        renderField('text-29', 'CEP do pagador');
        renderField('text-30', 'Pais do pagador');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 5 - ACOMPANHANTES
        // ============================================================
        if (data['radio-7'] === 'one') {
            startSection('ACOMPANHANTES');
            renderField('radio-7', 'Ha acompanhantes?');
            const acompanhantes = groupParallelArrays(data, 'acompanhante_nome[]', 'acompanhante_rel[]');
            if (acompanhantes.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Acompanhantes:');
                acompanhantes.forEach(acc => doc.font('Helvetica').text(`  - ${acc}`));
                doc.moveDown(0.6);
            }
            hasContentInSection = true;
        }

        // ============================================================
        // SEÇÃO 6 - HISTÓRICO DE VIAGENS AOS EUA
        // ============================================================
        if (data['radio-8'] === 'one') {
            startSection('HISTORICO DE VIAGENS AOS EUA');
            renderField('radio-8', 'Ja esteve nos EUA?');
            const viagens = groupTravels(data);
            if (viagens.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Viagens anteriores aos EUA:');
                viagens.forEach(viagem => doc.font('Helvetica').text(`  - ${viagem}`));
                doc.moveDown(0.6);
            }
            hasContentInSection = true;
        }

        // ============================================================
        // SEÇÃO 7 - INFORMAÇÕES DO VISTO
        // ============================================================
        if (data['radio-23'] === 'one') {
            startSection('INFORMACOES DO VISTO');
            renderField('radio-23', 'Ja teve visto americano?');
            renderField('text-35', 'Data de emissao do visto');
            renderField('text-68', 'Numero do visto');
            renderField('text-69', 'Data de expiracao');
            renderField('radio-33', 'Impressoes digitais coletadas?');
            renderField('radio-29', 'Mesmo tipo de visto?');
            renderField('radio-30', 'Mesmo pais de emissao?');
            hasContentInSection = true;
        }

        // ============================================================
        // SEÇÃO 8 - HISTÓRICO DE NEGATIVAS
        // ============================================================
        startSection('HISTORICO DE NEGATIVAS');
        doc.fillColor('#666666').fontSize(9).font('Helvetica').text('Estas perguntas sao obrigatorias no formulario DS-160 oficial. Responder falsamente constitui fraude.', { align: 'center' });
        doc.moveDown(0.5);
        doc.fillColor('#000000').fontSize(10);

        let vistoNegado = data['radio-visto-negado'];
        if (vistoNegado === 'one') vistoNegado = 'Sim';
        else if (vistoNegado === 'two') vistoNegado = 'Nao';
        doc.font('Helvetica-Bold').text('1. Ja teve visto americano NEGADO anteriormente?: ', { continued: true });
        doc.font('Helvetica').text(vistoNegado || 'Nao informado');
        doc.moveDown(0.3);

        if (data['radio-visto-negado'] === 'one') {
            doc.font('Helvetica').text(`   - Ano da negativa: ${data['text-visto-negado-ano'] || 'Nao informado'}`);
            doc.font('Helvetica').text(`   - Consulado: ${data['text-visto-negado-consulado'] || 'Nao informado'}`);
            doc.font('Helvetica').text(`   - Tipo de visto: ${data['select-visto-negado-tipo'] || 'Nao informado'}`);
            doc.moveDown(0.3);
        }

        let entradaNegada = data['radio-entrada-negada'];
        if (entradaNegada === 'one') entradaNegada = 'Sim';
        else if (entradaNegada === 'two') entradaNegada = 'Nao';
        doc.font('Helvetica-Bold').text('2. Ja teve a entrada NEGADA nos EUA pelo oficial de imigracao?: ', { continued: true });
        doc.font('Helvetica').text(entradaNegada || 'Nao informado');
        doc.moveDown(0.3);

        if (data['radio-entrada-negada'] === 'one') {
            doc.font('Helvetica').text(`   - Ano da negativa: ${data['text-entrada-negada-ano'] || 'Nao informado'}`);
            doc.font('Helvetica').text(`   - Porto de entrada: ${data['text-entrada-negada-local'] || 'Nao informado'}`);
            doc.font('Helvetica').text(`   - Motivo: ${data['textarea-entrada-negada-motivo'] || 'Nao informado'}`);
            doc.moveDown(0.3);
        }

        let deportado = data['radio-deportado'];
        if (deportado === 'one') deportado = 'Sim';
        else if (deportado === 'two') deportado = 'Nao';
        doc.font('Helvetica-Bold').text('3. Ja foi deportado ou removido dos Estados Unidos?: ', { continued: true });
        doc.font('Helvetica').text(deportado || 'Nao informado');
        doc.moveDown(0.3);

        if (data['radio-deportado'] === 'one') {
            doc.font('Helvetica').text(`   - Ano da deportacao: ${data['text-deportado-ano'] || 'Nao informado'}`);
            let duracao = data['select-deportado-duracao'] || '';
            if (duracao === 'menos_5_anos') duracao = 'Menos de 5 anos';
            else if (duracao === '5_a_10_anos') duracao = 'Entre 5 e 10 anos';
            else if (duracao === 'mais_10_anos') duracao = 'Mais de 10 anos';
            else if (duracao === 'banimento_permanente') duracao = 'Banimento permanente';
            doc.font('Helvetica').text(`   - Duracao: ${duracao || 'Nao informado'}`);
            doc.moveDown(0.3);
        }

        if (data['textarea-detalhes-negativa']) {
            doc.font('Helvetica-Bold').text('Detalhes adicionais sobre negativas:');
            doc.font('Helvetica').text(`${data['textarea-detalhes-negativa']}`);
            doc.moveDown(0.3);
        }
        hasContentInSection = true;

        doc.moveDown(0.5);
        doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        // ============================================================
        // SEÇÃO 9 - ENDEREÇO RESIDENCIAL
        // ============================================================
        startSection('ENDERECO RESIDENCIAL');
        renderField('text-71', 'Logradouro');
        renderField('text-72', 'Complemento');
        renderField('text-73', 'CEP');
        renderField('text-74', 'Cidade');
        renderField('text-75', 'Estado');
        renderField('text-76', 'Pais');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 10 - ENDEREÇO DE CORRESPONDÊNCIA
        // ============================================================
        startSection('ENDERECO DE CORRESPONDENCIA');
        renderField('radio-9', 'Endereco de correspondencia e o mesmo?');
        if (data['radio-9'] === 'Não, é diferente') {
            doc.font('Helvetica-Bold').fontSize(10).text('Endereco de correspondencia (diferente):');
            doc.moveDown(0.3);
            renderField('text-80', '  Logradouro');
            renderField('text-81', '  Complemento');
            renderField('text-82', '  CEP');
            renderField('text-83', '  Cidade');
            renderField('text-84', '  Estado');
            renderField('text-85', '  Pais');
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 11 - TELEFONES
        // ============================================================
        startSection('TELEFONES');
        renderField('text-77', 'Telefone principal');
        renderField('text-78', 'Telefone comercial');
        if (renderField('radio-10', 'Usou outros numeros?') && data['radio-10'] === 'one') {
            const telefones = data['telefones_anteriores[]'] || [];
            if (telefones.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Telefones anteriores: ', { continued: true });
                doc.font('Helvetica').text(telefones.join(', '));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 12 - E-MAILS
        // ============================================================
        startSection('E-MAILS');
        renderField('email-1', 'E-mail principal');
        if (renderField('radio-11', 'Usou outros e-mails?') && data['radio-11'] === 'one') {
            const emails = data['emails_anteriores[]'] || [];
            if (emails.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('E-mails anteriores: ', { continued: true });
                doc.font('Helvetica').text(emails.join(', '));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 13 - MÍDIAS SOCIAIS
        // ============================================================
        startSection('MIDIAS SOCIAIS');
        if (renderField('radio-12', 'Presenca em midias sociais?') && data['radio-12'] === 'one') {
            const plataformas = data['midia_plataforma[]'] || [];
            const identificadores = data['midia_identificador[]'] || [];
            const midias = [];
            for (let i = 0; i < Math.max(plataformas.length, identificadores.length); i++) {
                if (plataformas[i] || identificadores[i]) {
                    midias.push(`${plataformas[i] || ''}${plataformas[i] && identificadores[i] ? ': ' : ''}${identificadores[i] || ''}`);
                }
            }
            if (midias.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Midias sociais: ', { continued: true });
                doc.font('Helvetica').text(midias.join('; '));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 14 - PASSAPORTE
        // ============================================================
        startSection('PASSAPORTE');
        renderField('text-38', 'Numero do passaporte');
        renderField('text-40', 'Pais que emitiu');
        renderField('text-39', 'Cidade de emissao');
        renderField('text-88', 'Estado de emissao');
        renderField('text-66', 'Data de emissao');
        renderField('text-67', 'Data de validade');
        renderField('radio-13', 'Passaporte perdido/roubado?');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 15 - CONTATO NOS EUA
        // ============================================================
        startSection('CONTATO NOS EUA');
        renderField('name-2', 'Contato nos EUA (nome)');
        renderField('text-41_contato', 'Endereco (EUA)');
        renderField('text-42_contato', 'Cidade (EUA)');
        renderField('text-43_contato', 'Estado (EUA)');
        renderField('email-4_contato', 'CEP (EUA)');
        renderField('checkbox-15[]', 'Relacionamento com contato');
        renderField('email-5', 'Telefone do contato (EUA)');
        renderField('email-3', 'E-mail do contato (EUA)');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 16 - FAMILIARES
        // ============================================================
        startSection('FAMILIARES');
        renderField('nome_pai', 'Nome do pai');
        renderField('text-44', 'Data de nascimento do pai');
        if (renderField('radio-14', 'Pai nos EUA?') && data['radio-14'] === 'one') {
            renderField('checkbox-16[]', 'Status do pai');
        }
        renderField('nome_mae', 'Nome da mae');
        renderField('text-45', 'Data de nascimento da mae');
        if (renderField('radio-15', 'Mae nos EUA?') && data['radio-15'] === 'one') {
            renderField('checkbox-17[]', 'Status da mae');
        }
        if (renderField('radio-16', 'Parentes imediatos nos EUA?') && data['radio-16'] === 'one') {
            const parentes = groupParallelArrays(data, 'parente_nome[]', 'parente_relacao[]');
            if (parentes.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Parentes nos EUA:');
                parentes.forEach(p => doc.font('Helvetica').text(`  - ${p}`));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 17 - CÔNJUGE
        // ============================================================
        if (data['spouse_fullname']) {
            startSection('CONJUGE');
            renderField('spouse_fullname', 'Nome do conjuge');
            renderField('spouse-dob', 'Data de nascimento do conjuge');
            renderField('spouse-nationality', 'Nacionalidade do conjuge');
            renderField('spouse-city', 'Cidade de nascimento do conjuge');
            renderField('spouse-country', 'Pais de nascimento do conjuge');
            if (renderField('spouse-address-same', 'Endereco do conjuge') && data['spouse-address-same'] === 'Diferente') {
                renderField('spouse_endereco', 'Endereco (diferente)');
                renderField('spouse_cidade', 'Cidade');
                renderField('spouse_estado', 'Estado');
                renderField('spouse_cep', 'CEP');
                renderField('spouse_pais', 'Pais');
            }
            hasContentInSection = true;
        }

        // ============================================================
        // SEÇÃO 18 - EX-CÔNJUGE
        // ============================================================
        if (data['ex_fullname']) {
            startSection('EX-CONJUGE');
            renderField('ex_fullname', 'Nome do ex-conjuge');
            renderField('ex_dob', 'Data de nascimento');
            renderField('ex_nationality', 'Nacionalidade');
            renderField('ex_city', 'Cidade de nascimento');
            renderField('ex_country', 'Pais de nascimento');
            renderField('data_casamento_div', 'Data do Casamento');
            renderField('data_divorcio', 'Data do Divorcio');
            renderField('cidade_divorcio', 'Cidade do Divorcio');
            renderField('como_divorcio', 'Como se deu o Divorcio');
            hasContentInSection = true;
        }

        // ============================================================
        // SEÇÃO 19 - CÔNJUGE FALECIDO
        // ============================================================
        if (data['falecido_fullname']) {
            startSection('CONJUGE FALECIDO');
            renderField('falecido_fullname', 'Nome do conjuge falecido');
            renderField('falecido_dob', 'Data de nascimento');
            renderField('falecido_nationality', 'Nacionalidade');
            renderField('falecido_city', 'Cidade de nascimento');
            renderField('falecido_country', 'Pais de nascimento');
            renderField('data_falecimento', 'Data do Falecimento');
            hasContentInSection = true;
        }

        // ============================================================
        // SEÇÃO 20 - OCUPAÇÃO ATUAL
        // ============================================================
        startSection('OCUPACAO ATUAL');
        renderField('radio-27', 'Ocupacao principal');
        renderField('text-49', 'Empregador / escola');
        renderField('text-101', 'Endereco');
        renderField('text-102', 'Cidade');
        renderField('text-104', 'Estado');
        renderField('text-103', 'CEP');
        renderField('phone-8', 'Telefone');
        renderField('text-50', 'Data inicio');
        renderField('text-51', 'Renda mensal (R$)');
        renderField('text-52', 'Descricao das funcoes');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 21 - OUTRAS OCUPAÇÕES
        // ============================================================
        const extra_descricoes = data['extra_descricao[]'] || [];
        if (extra_descricoes.length > 0) {
            startSection('OUTRAS OCUPACOES / FONTES DE RENDA');
            const extra_rendas = data['extra_renda[]'] || [];
            const extra_empregadores = data['extra_empregador[]'] || [];
            const extra_inicios = data['extra_data_inicio[]'] || [];
            const extra_enderecos = data['extra_endereco[]'] || [];
            const extra_cidades = data['extra_cidade[]'] || [];
            const extra_estados = data['extra_estado[]'] || [];
            const extra_telefones = data['extra_telefone[]'] || [];
            const extra_ceps = data['extra_cep[]'] || [];

            for (let i = 0; i < extra_descricoes.length; i++) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(`Ocupacao adicional ${i+1}: ${extra_descricoes[i] || '(nao informado)'}`);
                if (extra_empregadores[i]) doc.font('Helvetica').text(`  Empregador: ${extra_empregadores[i]}`);
                if (extra_rendas[i]) doc.font('Helvetica').text(`  Renda mensal: ${extra_rendas[i]}`);
                if (extra_inicios[i]) {
                    const dataInicioFormatada = formatDateToBrazilian(extra_inicios[i]);
                    doc.font('Helvetica').text(`  Data inicio: ${dataInicioFormatada}`);
                }
                if (extra_enderecos[i]) doc.font('Helvetica').text(`  Endereco: ${extra_enderecos[i]}`);
                if (extra_cidades[i] && extra_estados[i]) doc.font('Helvetica').text(`  Cidade/UF: ${extra_cidades[i]} / ${extra_estados[i]}`);
                if (extra_ceps[i]) doc.font('Helvetica').text(`  CEP: ${extra_ceps[i]}`);
                if (extra_telefones[i]) doc.font('Helvetica').text(`  Telefone: ${extra_telefones[i]}`);
                doc.moveDown(0.6);
            }
            hasContentInSection = true;
        }

        // ============================================================
        // SEÇÃO 22 - EMPREGOS ANTERIORES
        // ============================================================
        if (data['radio-17'] === 'one') {
            const empNomes = data['emprego_anterior_nome[]'] || [];
            if (empNomes.length > 0) {
                startSection('EMPREGOS ANTERIORES');
                const empCargos = data['emprego_anterior_cargo[]'] || [];
                const empInicios = data['emprego_anterior_inicio[]'] || [];
                const empFins = data['emprego_anterior_fim[]'] || [];
                const maxEmp = Math.max(empNomes.length, empCargos.length, empInicios.length, empFins.length);
                for (let i = 0; i < maxEmp; i++) {
                    if (empNomes[i] || empCargos[i]) {
                        let inicio = empInicios[i] ? formatDateToBrazilian(empInicios[i]) : '?';
                        let fim = empFins[i] ? formatDateToBrazilian(empFins[i]) : '?';
                        doc.font('Helvetica-Bold').fontSize(10).text(`Emprego anterior ${i+1}:`);
                        if (empNomes[i]) doc.font('Helvetica').text(`  Empregador: ${empNomes[i]}`);
                        if (empCargos[i]) doc.font('Helvetica').text(`  Cargo: ${empCargos[i]}`);
                        if (empInicios[i] || empFins[i]) doc.font('Helvetica').text(`  Periodo: ${inicio} a ${fim}`);
                        doc.moveDown(0.4);
                    }
                }
                hasContentInSection = true;
            }
        }

        // ============================================================
        // SEÇÃO 23 - ESCOLARIDADE
        // ============================================================
        if (data['radio-18'] === 'one') {
            startSection('ESCOLARIDADE');
            renderField('text-59', 'Instituicao de ensino');
            renderField('text-60', 'Curso');
            renderField('text-111', 'Endereco da instituicao');
            renderField('text-112', 'Cidade');
            renderField('text-114', 'Estado');
            renderField('text-113', 'CEP');
            renderField('text-61', 'Data inicio');
            renderField('text-62', 'Data conclusao');
            hasContentInSection = true;
        }

        // ============================================================
        // SEÇÃO 24 - SERVIÇO MILITAR
        // ============================================================
        startSection('SERVICO MILITAR');
        if (data['servico_militar'] === 'Sim') {
            doc.font('Helvetica-Bold').fontSize(10).text('Voce ja serviu nas forcas armadas?: ', { continued: true });
            doc.font('Helvetica').text('Sim');
            doc.moveDown(0.6);
            renderField('military_country', 'Pais');
            renderField('military_branch', 'Ramo das Forcas Armadas');
            renderField('military_rank', 'Patente / Posicao');
            renderField('military_specialty', 'Especialidade Militar');
            renderField('military_date_from', 'Data de inicio');
            renderField('military_date_to', 'Data de termino');
        } else {
            doc.font('Helvetica-Bold').fontSize(10).text('Voce ja serviu nas forcas armadas?: ', { continued: true });
            doc.font('Helvetica').text('Nao');
            doc.moveDown(0.6);
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 25 - TREINAMENTO ESPECIALIZADO
        // ============================================================
        startSection('TREINAMENTO ESPECIALIZADO');
        if (data['treinamento_especializado'] === 'Sim') {
            doc.font('Helvetica-Bold').fontSize(10).text('Voce tem alguma habilidade ou treinamento especializado? (armas de fogo, explosivos, nuclear, biologica ou quimica): ', { continued: true });
            doc.font('Helvetica').text('Sim');
            doc.moveDown(0.6);
            renderField('treinamento_descricao', 'Descricao do treinamento');
        } else {
            doc.font('Helvetica-Bold').fontSize(10).text('Voce tem alguma habilidade ou treinamento especializado? (armas de fogo, explosivos, nuclear, biologica ou quimica): ', { continued: true });
            doc.font('Helvetica').text('Nao');
            doc.moveDown(0.6);
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 26 - SEGURANÇA
        // ============================================================
        startSection('SEGURANCA');
        if (data['antecedentes_criminais'] === 'Sim') {
            doc.font('Helvetica-Bold').fontSize(10).text('Voce ja foi preso ou condenado por qualquer crime, mesmo que tenha sido perdoado ou anistiado?: ', { continued: true });
            doc.font('Helvetica').text('Sim');
            doc.moveDown(0.6);
            renderField('antecedentes_descricao', 'Descricao dos antecedentes');
            renderField('antecedentes_data', 'Data do ocorrido');
            renderField('antecedentes_local', 'Local');
            renderField('antecedentes_resolucao', 'Resolucao do caso');
        } else {
            doc.font('Helvetica-Bold').fontSize(10).text('Voce ja foi preso ou condenado por qualquer crime, mesmo que tenha sido perdoado ou anistiado?: ', { continued: true });
            doc.font('Helvetica').text('Nao');
            doc.moveDown(0.6);
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 27 - HISTÓRICO DE NEGATIVAS NOS EUA
        // ============================================================
        startSection('HISTORICO DE NEGATIVAS NOS EUA');
        renderField('radio-visto-negado', 'Ja teve visto americano NEGADO?');
        if (data['radio-visto-negado'] === 'one') {
            renderField('text-visto-negado-ano', 'Ano da negativa do visto');
            renderField('text-visto-negado-consulado', 'Consulado da negativa');
            renderField('select-visto-negado-tipo', 'Tipo de visto negado');
        }
        renderField('radio-entrada-negada', 'Ja teve entrada NEGADA nos EUA na imigracao?');
        if (data['radio-entrada-negada'] === 'one') {
            renderField('text-entrada-negada-ano', 'Ano da negativa de entrada');
            renderField('text-entrada-negada-local', 'Porto de entrada');
            renderField('textarea-entrada-negada-motivo', 'Motivo da negativa');
        }
        renderField('radio-deportado', 'Ja foi deportado ou removido dos EUA?');
        if (data['radio-deportado'] === 'one') {
            renderField('text-deportado-ano', 'Ano da deportacao');
            renderField('select-deportado-duracao', 'Duracao da deportacao');
        }
        renderField('textarea-detalhes-negativa', 'Detalhes adicionais sobre negativas');
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 28 - IDIOMAS
        // ============================================================
        startSection('IDIOMAS');
        if (data['radio-19'] === 'one') {
            const idiomas = data['idiomas[]'] || [];
            if (idiomas.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Outros idiomas: ', { continued: true });
                doc.font('Helvetica').text(idiomas.join(', '));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        // ============================================================
        // SEÇÃO 29 - VIAGENS INTERNACIONAIS
        // ============================================================
        startSection('VIAGENS INTERNACIONAIS');
        if (data['radio-20'] === 'one') {
            const paises = data['paises_visitados[]'] || [];
            if (paises.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Paises visitados (ultimos 5 anos): ', { continued: true });
                doc.font('Helvetica').text(paises.join(', '));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        // ============================================================
        // RODAPÉ
        // ============================================================
        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
    });
}

// ============================================================
//  FUNÇÃO GERAR PDF PASSAPORTE
// ============================================================
async function gerarPDF_Passaporte(data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fillColor('#003366').fontSize(22).text('SOLICITACAO DE PASSAPORTE', { align: 'center' });
        doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentacao Consular', { align: 'center' });
        doc.moveDown(2);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        const fields = [
            { label: 'Nome completo', name: 'nome_completo' },
            { label: 'Sexo', name: 'sexo' },
            { label: 'Data de nascimento', name: 'data_nascimento' },
            { label: 'Estado civil', name: 'estado_civil' },
            { label: 'Raca/Cor', name: 'raca' },
            { label: 'Nacionalidade', name: 'nacionalidade' },
            { label: 'Naturalidade (cidade)', name: 'naturalidade_cidade' },
            { label: 'UF de nascimento', name: 'naturalidade_uf' },
            { label: 'Pais de nascimento', name: 'pais_nascimento' },
            { label: 'Alteracao de nome?', name: 'alterou_nome' },
            { label: 'Motivo da alteracao', name: 'motivo_alteracao' },
            { label: 'Nome anterior', name: 'nome_anterior' },
            { label: 'Nome da mae', name: 'mae_nome' },
            { label: 'Nacionalidade da mae', name: 'mae_nacionalidade' },
            { label: 'Nome do pai', name: 'pai_nome' },
            { label: 'Nacionalidade do pai', name: 'pai_nacionalidade' },
            { label: 'Tipo de documento', name: 'tipo_documento' },
            { label: 'Numero do documento', name: 'documento_numero' },
            { label: 'Data de emissao do documento', name: 'documento_emissao' },
            { label: 'Orgao emissor', name: 'documento_orgao' },
            { label: 'UF de expedicao', name: 'documento_uf' },
            { label: 'CPF', name: 'cpf' },
            { label: 'Profissao', name: 'profissao' },
            { label: 'E-mail', name: 'email' },
            { label: 'Telefone celular', name: 'celular' },
            { label: 'Telefone fixo', name: 'fixo' },
            { label: 'CEP', name: 'cep' },
            { label: 'Logradouro', name: 'logradouro' },
            { label: 'Numero', name: 'numero' },
            { label: 'Complemento', name: 'complemento' },
            { label: 'Bairro', name: 'bairro' },
            { label: 'Cidade', name: 'cidade' },
            { label: 'UF', name: 'uf' },
            { label: 'Situacao do passaporte anterior', name: 'situacao_passaporte' },
            { label: 'Numero do passaporte anterior', name: 'passaporte_anterior_numero' },
            { label: 'Data de expedicao anterior', name: 'passaporte_anterior_expedicao' },
            { label: 'Data de validade anterior', name: 'passaporte_anterior_validade' }
        ];

        for (const field of fields) {
            let value = data[field.name];
            if (value && value !== '' && value !== 'nao' && value !== 'não') {
                if (field.name.includes('data') || field.name.includes('nascimento') ||
                    field.name.includes('emissao') || field.name.includes('expedicao') ||
                    field.name.includes('validade')) {
                    value = formatDateToBrazilian(value);
                }
                doc.font('Helvetica-Bold').fontSize(10).text(`${field.label}: `, { continued: true });
                doc.font('Helvetica').text(value);
                doc.moveDown(0.5);
            }
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
    });
}

// ============================================================
//  FUNÇÃO GERAR PDF VISTO NEGADO
// ============================================================
async function gerarPDF_VistoNegado(data, nome, emailCliente, score, classificacaoTipo, classificacaoTitulo, classificacaoMensagem) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fillColor('#003366').fontSize(22).text('AVALIACAO DE VISTO NEGADO', { align: 'center' });
        doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Analise Estrategica', { align: 'center' });
        doc.moveDown(2);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('DADOS DO CLIENTE');
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(10).fillColor('#000000');
        doc.text(`Nome completo: ${nome}`);
        doc.text(`E-mail: ${emailCliente || 'Nao informado'}`);
        doc.text(`Telefone/WhatsApp: ${data['telefone'] || 'Nao informado'}`);
        doc.moveDown(1);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('QUESTIONARIO DE AVALIACAO');
        doc.moveDown(0.5);

        const perguntas = [
            { label: '1. Quando seu visto foi negado pela ultima vez?', field: 'quando_negado' },
            { label: '2. Motivo da negativa informado pelo oficial', field: 'motivo_negativa' },
            { label: '3. Mudanca na situacao profissional/financeira?', field: 'mudanca_profissional' },
            { label: '4. Fortaleceu seus vinculos com o Brasil?', field: 'fortaleceu_vinculos' },
            { label: '5. Acredita que houve falha no preenchimento do DS-160?', field: 'falha_ds160' },
            { label: '6. Ja teve problemas com imigracao?', field: 'problemas_imigracao' }
        ];

        for (const q of perguntas) {
            let resposta = data[q.field] || '(nao informado)';
            doc.font('Helvetica-Bold').fontSize(10).text(`${q.label}: `, { continued: true });
            doc.font('Helvetica').text(resposta);
            doc.moveDown(0.8);
        }

        if (score !== null) {
            doc.moveDown(1);
            doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('RESULTADO DA AVALIACAO');
            doc.moveDown(0.5);
            doc.font('Helvetica').fontSize(10).fillColor('#000000');
            doc.text(`Pontuacao: ${score}/100`);
            let classificacaoTexto = '';
            if (classificacaoTipo === 'urgent') classificacaoTexto = 'Requer Atencao Urgente';
            else if (classificacaoTipo === 'moderate') classificacaoTexto = 'Potencial Moderado';
            else classificacaoTexto = 'Forte Potencial';
            doc.text(`Classificacao: ${classificacaoTexto}`);
            doc.text(`Mensagem: ${classificacaoMensagem}`);
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
    });
}
// ============================================================
//  ROTA AVALIAÇÃO NORMAL (SIMULADOR)
// ============================================================
app.post('/api/submit-avaliacao', async (req, res) => {
    const data = req.body;

    if (isSpamData(data)) {
        console.log('🚫 SPAM Avaliação - Dados rejeitados');
        return res.status(200).json({ success: true, message: 'Recebido' });
    }

    console.log('📥 Dados da Avaliação Normal recebidos');
    res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

    (async () => {
        try {
            const nome = data['nome'] || 'Cliente_Sem_Nome';
            const emailCliente = data['email'] || null;
            let telefoneCliente = data['telefone'] || data['whatsapp'] || null;

            if (telefoneCliente) {
                telefoneCliente = telefoneCliente.toString().replace(/\D/g, '');
                if (telefoneCliente.startsWith('55')) telefoneCliente = telefoneCliente.substring(2);
                if (telefoneCliente.length === 12) telefoneCliente = telefoneCliente.substring(1);
            }

            const score = data['score'] || data['pontuacao'] || 0;
            const classificacao = data['classificacao'] || data['classificacao_perfil'] ||
                (score < 50 ? 'Requer Atenção' : (score < 70 ? 'Potencial Moderado' : 'Forte Potencial'));

            if (telefoneCliente) {
                const { error: insertError } = await supabase
                    .from('leads_simulador')
                    .insert({
                        nome_cliente: nome,
                        telefone_whatsapp: telefoneCliente,
                        email: emailCliente,
                        pontuacao_total: score,
                        classificacao_perfil: classificacao,
                        respostas_simulador: data,
                        data_simulacao: new Date(),
                        status_lead: 'novo'
                    });

                if (insertError) {
                    console.error('❌ Erro ao salvar lead:', insertError);
                } else {
                    console.log(`✅ Lead salvo com sucesso! Telefone: ${telefoneCliente}`);

                    const primeiroNome = nome.split(' ')[0];
                    let mensagemWhats = `Olá, ${primeiroNome}! Recebemos sua avaliação. Seu perfil foi classificado como *${classificacao}* (${score}/100).\n\n`;
                    mensagemWhats += `✅ *Podemos dar início ao seu processo?*\n• Digite *SIM* para o link do DS-160\n• Digite *NÃO* para tirar dúvidas\n\n💬 *Me pergunte o que quiser!*`;

                    await enviarWhatsApp(telefoneCliente, mensagemWhats);
                }
            }
        } catch (err) {
            console.error('❌ Erro:', err);
        }
    })();
});

// ============================================================
//  ROTA PASSAPORTE
// ============================================================
app.post('/api/submit-passaporte', async (req, res) => {
    const data = req.body;

    console.log('📥 Dados de passaporte recebidos');

    if (isSpamData(data)) {
        console.log('🚫 SPAM Passaporte - Dados rejeitados');
        return res.status(200).json({ success: true, message: 'Recebido' });
    }

    res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

    (async () => {
        try {
            const nome = data['nome_completo'] || data['passaporte_nome'] || 'Cliente_Sem_Nome';
            const emailCliente = data['email'] || data['passaporte_email'] || null;
            const telefoneCliente = data['celular'] || data['telefone'] || data['passaporte_telefone'] || null;

            let solicitacaoId = null;
            try {
                const { data: cliente, error: clienteError } = await supabase
                    .from('clientes_ativos')
                    .upsert({
                        email: emailCliente,
                        nome_completo: nome,
                        telefone: telefoneCliente
                    }, { onConflict: 'email' })
                    .select()
                    .single();

                if (!clienteError && cliente) {
                    const { data: solicitacao, error: solError } = await supabase
                        .from('solicitacoes')
                        .insert({
                            cliente_id: cliente.id,
                            tipo: 'passaporte',
                            dados: data,
                            status: 'pendente'
                        })
                        .select()
                        .single();
                    if (!solError) solicitacaoId = solicitacao.id;
                    console.log(`✅ Passaporte salvo. ID: ${solicitacaoId}`);
                }
            } catch (supabaseErr) {
                console.error('⚠️ Erro ao salvar passaporte:', supabaseErr.message);
            }

            const pdfBuffer = await gerarPDF_Passaporte(data);
            console.log(`📄 PDF gerado para passaporte de ${nome}, tamanho: ${pdfBuffer.length} bytes`);

            await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: ['getvisa.assessoria@gmail.com'],
                subject: `📘 Passaporte: ${nome}`,
                html: `<strong>Solicitacao de passaporte recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
                attachments: [{
                    filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                    content: pdfBuffer.toString('base64')
                }]
            });
            console.log('✅ E-mail enviado para a equipe (passaporte)');

            if (emailCliente && emailCliente.trim() !== '') {
                await resend.emails.send({
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: [emailCliente],
                    subject: `Sua solicitacao de passaporte foi recebida - ${nome}`,
                    html: `<strong>Olá ${nome},</strong><br><p>Recebemos sua solicitação de passaporte com sucesso!</p><p>Nossa equipe entrará em contato em até 24h.</p>`,
                    attachments: [{
                        filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                        content: pdfBuffer.toString('base64')
                    }]
                });
                console.log(`✅ E-mail enviado para o cliente (passaporte): ${emailCliente}`);
            }

        } catch (err) {
            console.error('❌ Erro no processamento do passaporte (background):', err);
        }
    })();
});

// ============================================================
//  ROTA VISTO NEGADO
// ============================================================
app.post('/api/submit-visto-negado', async (req, res) => {
    const data = req.body;

    if (isSpamData(data)) {
        console.log('🚫 SPAM Visto Negado - Dados rejeitados');
        return res.status(200).json({ success: true, message: 'Recebido' });
    }

    console.log('📥 Dados de Visto Negado recebidos');
    res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

    (async () => {
        try {
            const nome = data['nome'] || 'Cliente_Sem_Nome';
            const emailCliente = data['email'] || null;
            const telefoneCliente = data['telefone'] || null;
            const score = data['score'] || null;
            const classificacaoTipo = data['classificacao_tipo'] || '';
            const classificacaoTitulo = data['classificacao_titulo'] || '';
            const classificacaoMensagem = data['classificacao_mensagem'] || '';

            if (telefoneCliente && score !== null) {
                const primeiroNome = nome.split(' ')[0];
                const classificacaoTexto = classificacaoTipo === 'urgent' ? 'que Requer Atenção Urgente'
                    : classificacaoTipo === 'moderate' ? 'com Potencial Moderado'
                    : 'com Forte Potencial';

                let mensagemWhats = `Olá, ${primeiroNome}! Tudo bem? Nosso time está pronto para te ajudar! Vamos te acompanhar por todo o processo.\n\n`;
                mensagemWhats += `Recebemos sua análise específica para *VISTO AMERICANO NEGADO*. Seu perfil foi classificado como ${classificacaoTexto} (${score}/100).\n\n`;
                mensagemWhats += `*O que identificamos:*\n`;
                mensagemWhats += `• Última negativa: ${data['quando_negado'] || 'recentemente'}\n`;
                mensagemWhats += `• Motivo: ${data['motivo_negativa'] || 'não informado'}\n\n`;
                mensagemWhats += `*Nossa estratégia para REVERTER seu caso:*\n`;
                mensagemWhats += `✅ Revisão completa do histórico de negativas\n`;
                mensagemWhats += `✅ Correção do DS-160\n`;
                mensagemWhats += `✅ Documentação de suporte reforçada\n`;
                mensagemWhats += `✅ Preparação para entrevista\n\n`;
                mensagemWhats += `💰 *Investimento:* Taxa Consular (~R$ 950) + Assessoria Especializada (R$ 380)\n\n`;
                mensagemWhats += `Podemos iniciar o processo de reversão hoje? 🚀\n\n`;
                mensagemWhats += `💬 *Me pergunte o que quiser!*`;

                await enviarWhatsApp(telefoneCliente, mensagemWhats);
            }

            const pdfBuffer = await gerarPDF_VistoNegado(data, nome, emailCliente, score, classificacaoTipo, classificacaoTitulo, classificacaoMensagem);
            console.log(`📄 PDF gerado para visto negado (${nome}), tamanho: ${pdfBuffer.length} bytes`);

            await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: ['getvisa.assessoria@gmail.com'],
                subject: `⚠️ Visto Negado: ${nome}`,
                html: `<strong>Avaliacao de visto negado recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
                attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
            });
            console.log('✅ E-mail enviado para a equipe (visto negado)');

            if (emailCliente && emailCliente.trim() !== '') {
                let resultadoHtml = '';
                if (score !== null) {
                    let cor = classificacaoTipo === 'urgent' ? '#dc2626' : (classificacaoTipo === 'moderate' ? '#ff6b35' : '#0066cc');
                    resultadoHtml = `
                        <div style="background: #f0f9ff; border-left: 5px solid ${cor}; padding: 15px; margin: 20px 0; border-radius: 12px;">
                            <h3 style="margin: 0 0 10px; color: ${cor};">📊 Resultado da sua avaliacao</h3>
                            <p><strong>Pontuacao:</strong> ${score}/100</p>
                            <p><strong>Classificacao:</strong> ${classificacaoTipo === 'urgent' ? 'Requer Atencao Urgente' : classificacaoTipo === 'moderate' ? 'Potencial Moderado' : 'Forte Potencial'}</p>
                            <p><strong>${classificacaoTitulo}</strong></p>
                            <p>${classificacaoMensagem}</p>
                        </div>
                    `;
                }
                await resend.emails.send({
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: [emailCliente],
                    subject: `Resultado da sua avaliacao de visto negado - ${nome}`,
                    html: `<strong>Ola ${nome},</strong><br><p>Recebemos sua solicitacao de analise para reversao de visto negado. Em breve um de nossos especialistas entrara em contato.</p>${resultadoHtml}<p>Segue em anexo o PDF completo.</p>`,
                    attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                });
                console.log(`✅ E-mail enviado para o cliente (visto negado): ${emailCliente}`);
            }
        } catch (err) {
            console.error('❌ Erro no processamento do visto negado (background):', err);
        }
    })();
});

// ============================================================
//  ROTA SIMULADOR 5 ETAPAS
// ============================================================
app.post('/api/submit-simulador', async (req, res) => {
    const data = req.body;

    if (isSpamData(data)) {
        console.log('🚫 SPAM Simulador - Dados rejeitados');
        return res.status(200).json({ success: true, message: 'Recebido' });
    }

    console.log('📥 Simulador 5 etapas recebido');
    res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

    (async () => {
        try {
            const nome = data['nome'] || 'Cliente_Sem_Nome';
            const telefoneCliente = data['telefone'] || null;
            const emailCliente = data['email'] || null;
            const situacaoProfissional = data['situacao_profissional'] || '';
            const renda = data['renda'] || '';
            const historicoViagens = data['historico_viagens'] || '';
            const propositoViagem = data['proposito_viagem'] || '';

            let score = 65;
            let classificacao = 'Potencial Moderado';

            if (situacaoProfissional === 'Desempregado(a) no momento') {
                score = 45;
                classificacao = 'Requer Atenção';
            } else if (renda === 'Acima de R$ 15.000') {
                score = 85;
                classificacao = 'Forte Potencial';
            }

            if (telefoneCliente) {
                const { error } = await supabase
                    .from('leads_simulador')
                    .insert({
                        nome_cliente: nome,
                        telefone_whatsapp: telefoneCliente,
                        email: emailCliente,
                        pontuacao_total: score,
                        classificacao_perfil: classificacao,
                        respostas_simulador: data,
                        data_simulacao: new Date(),
                        status_lead: 'novo'
                    });

                if (error) {
                    console.error('❌ Erro ao salvar:', error);
                } else {
                    console.log(`✅ Lead salvo: ${nome} - ${telefoneCliente}`);

                    const primeiroNome = nome.split(' ')[0];
                    const primeiraViagem = historicoViagens === 'Nunca viajei para fora do Brasil';

                    let mensagem = `Olá, ${primeiroNome}! Tudo bem? Meu nome é Moisés, consultor da GETVISA e vou te acompanhar.\n\n`;
                    mensagem += `Recebemos sua avaliação. Seu perfil foi classificado como *${classificacao}* (${score}/100).\n\n`;
                    mensagem += `📊 *Seus dados:*\n`;
                    mensagem += `• Situação: ${situacaoProfissional}\n`;
                    mensagem += `• Renda: ${renda}\n`;
                    mensagem += `• Histórico: ${historicoViagens}\n`;
                    mensagem += `• Motivo: ${propositoViagem}\n\n`;

                    if (primeiraViagem) {
                        mensagem += `Por ser sua primeira viagem internacional, vamos preparar uma documentação extra.\n\n`;
                    }

                    mensagem += `✅ *Podemos dar início ao seu processo?*\n`;
                    mensagem += `Se sua resposta for *SIM*, te envio o link do DS-160.\n\n`;
                    mensagem += `💬 *Me pergunte o que quiser!*`;

                    await enviarWhatsApp(telefoneCliente, mensagem);
                }
            }

        } catch (err) {
            console.error('❌ Erro:', err);
        }
    })();
});
// ============================================================
//  ROTAS DO DASHBOARD
// ============================================================
app.get('/api/dashboard/estatisticas', async (req, res) => {
    try {
        const { count: total_clientes, error: err1 } = await supabase
            .from('clientes')
            .select('*', { count: 'exact', head: true });

        const { count: total_ativos, error: err2 } = await supabase
            .from('clientes_ativos')
            .select('*', { count: 'exact', head: true });

        const { count: total_agendamentos, error: err3 } = await supabase
            .from('agendamentos')
            .select('*', { count: 'exact', head: true });

        const { count: total_etapas, error: err4 } = await supabase
            .from('etapas_processo')
            .select('*', { count: 'exact', head: true });

        const { data: agendamentosData, error: err5 } = await supabase
            .from('agendamentos')
            .select('status');

        const agendamentos_por_status = {};
        if (agendamentosData) {
            agendamentosData.forEach(a => {
                agendamentos_por_status[a.status] = (agendamentos_por_status[a.status] || 0) + 1;
            });
        }

        const { data: etapasData, error: err6 } = await supabase
            .from('etapas_processo')
            .select('etapa_atual');

        const etapas_por_status = {};
        if (etapasData) {
            etapasData.forEach(e => {
                etapas_por_status[e.etapa_atual] = (etapas_por_status[e.etapa_atual] || 0) + 1;
            });
        }

        res.json({
            success: true,
            estatisticas: {
                total_clientes: total_clientes || 0,
                total_ativos: total_ativos || 0,
                total_agendamentos: total_agendamentos || 0,
                total_etapas: total_etapas || 0,
                agendamentos_por_status: agendamentos_por_status,
                etapas_por_status: etapas_por_status
            }
        });

    } catch (error) {
        console.error('❌ Erro ao buscar estatísticas:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/dashboard/proximos-agendamentos', async (req, res) => {
    try {
        const { data: compromissos, error } = await supabase
            .from('compromissos')
            .select(`
                id,
                cliente,
                atividade,
                data,
                hora,
                local,
                cliente_id
            `)
            .gte('data', new Date().toISOString().split('T')[0])
            .order('data', { ascending: true })
            .order('hora', { ascending: true })
            .limit(10);

        if (error) throw error;

        const clienteIds = compromissos
            .filter(c => c.cliente_id)
            .map(c => c.cliente_id);

        let clientesMap = {};
        if (clienteIds.length > 0) {
            const { data: clientes } = await supabase
                .from('clientes')
                .select('id, nome_completo')
                .in('id', clienteIds);

            if (clientes) {
                clientes.forEach(c => {
                    clientesMap[c.id] = c.nome_completo;
                });
            }
        }

        const resultado = compromissos.map(item => {
            let cliente_nome = item.cliente || 'N/A';

            if (item.cliente_id && clientesMap[item.cliente_id]) {
                cliente_nome = clientesMap[item.cliente_id];
            }

            return {
                id: item.id,
                tipo: item.atividade,
                data_hora: `${item.data}T${item.hora}:00`,
                local: item.local,
                status: 'agendado',
                cliente_nome: cliente_nome
            };
        });

        res.json({ success: true, agendamentos: resultado });

    } catch (error) {
        console.error('❌ Erro ao buscar próximos agendamentos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
//  PORTAL DO CLIENTE - ROTAS
// ============================================================
const codigosTemp = {};

app.post('/api/portal/enviar-codigo', async (req, res) => {
    try {
        const { telefone } = req.body;
        const telefoneLimpo = limparTelefone(telefone);

        if (!telefoneLimpo) {
            return res.status(400).json({ success: false, message: 'Telefone inválido' });
        }

        const { data: cliente } = await supabase
            .from('clientes_ativos')
            .select('telefone, nome')
            .eq('telefone', formatarTelefone(telefoneLimpo))
            .maybeSingle();

        if (!cliente) {
            const { data: novo } = await supabase
                .from('clientes_novos')
                .select('telefone, nome')
                .eq('telefone', formatarTelefone(telefoneLimpo))
                .maybeSingle();

            if (!novo) {
                return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
            }
        }

        const codigo = Math.floor(100000 + Math.random() * 900000).toString();

        codigosTemp[telefoneLimpo] = {
            codigo,
            criado_em: Date.now()
        };

        const mensagem = `🔐 *Código de acesso GetVisa*\n\nOlá! Você solicitou acesso ao Portal do Cliente.\n\nSeu código é: *${codigo}*\n\nDigite no portal para acessar seu processo.\n\n⏰ Este código é válido por 5 minutos.`;

        await enviarWhatsApp(telefoneLimpo, mensagem);

        console.log(`📨 Código enviado para ${telefoneLimpo}: ${codigo}`);

        res.json({ success: true, message: 'Código enviado' });

    } catch (error) {
        console.error('❌ Erro ao enviar código:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/portal/verificar', async (req, res) => {
    try {
        const { telefone, codigo } = req.body;
        const telefoneLimpo = limparTelefone(telefone);

        if (!telefoneLimpo || !codigo) {
            return res.status(400).json({ success: false, message: 'Dados incompletos' });
        }

        const registro = codigosTemp[telefoneLimpo];
        if (!registro) {
            return res.status(401).json({ success: false, message: 'Código expirado' });
        }

        if (registro.codigo !== codigo) {
            return res.status(401).json({ success: false, message: 'Código inválido' });
        }

        if (Date.now() - registro.criado_em > 300000) {
            delete codigosTemp[telefoneLimpo];
            return res.status(401).json({ success: false, message: 'Código expirado' });
        }

        const telefoneFormatado = formatarTelefone(telefoneLimpo);

        const { data: cliente } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefoneFormatado)
            .maybeSingle();

        let clienteData = cliente;
        if (!cliente) {
            const { data: novo } = await supabase
                .from('clientes_novos')
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();
            clienteData = novo;
        }

        if (!clienteData) {
            return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        }

        const { data: etapa } = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', telefoneFormatado)
            .maybeSingle();

        const { data: agendamentos } = await supabase
            .from('compromissos')
            .select('*')
            .eq('cliente', clienteData.nome)
            .order('data', { ascending: true })
            .limit(10);

        delete codigosTemp[telefoneLimpo];

        res.json({
            success: true,
            cliente: clienteData,
            etapa: etapa,
            agendamentos: agendamentos || []
        });

    } catch (error) {
        console.error('❌ Erro ao verificar:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/portal/ds160/:telefone', async (req, res) => {
    try {
        const { telefone } = req.params;
        const telefoneLimpo = limparTelefone(telefone);
        const telefoneFormatado = formatarTelefone(telefoneLimpo);

        const { data: formulario, error } = await supabase
            .from('formulario_ds160')
            .select('*')
            .eq('telefone', telefoneFormatado)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!formulario) {
            return res.status(404).send('Formulário não encontrado');
        }

        const pdfBuffer = await gerarPDF_DS160(formulario.form_data || {});

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=DS160_${formulario.nome || 'cliente'}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('❌ Erro ao baixar DS-160:', error);
        res.status(500).send('Erro ao gerar PDF');
    }
});

// ============================================================
//  SISTEMA DE LOGS EM MEMÓRIA (PARA DEBUG)
// ============================================================
const logsMemoria = [];
const MAX_LOGS = 500;

function logMemoria(mensagem, dados = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        mensagem: mensagem,
        dados: dados
    };
    logsMemoria.push(entry);
    if (logsMemoria.length > MAX_LOGS) {
        logsMemoria.splice(0, logsMemoria.length - MAX_LOGS);
    }
    console.log(`[${entry.timestamp}] ${mensagem}`, dados || '');
}

app.get('/api/logs', (req, res) => {
    const limite = parseInt(req.query.limite) || 50;
    const logs = logsMemoria.slice(-limite);

    res.json({
        success: true,
        total: logsMemoria.length,
        limite: limite,
        logs: logs
    });
});

app.delete('/api/logs', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    logsMemoria.length = 0;
    res.json({ success: true, message: 'Logs limpos' });
});

// ============================================================
//  ENDPOINT PARA VERIFICAR STATUS DO SISTEMA
// ============================================================
app.get('/api/status', async (req, res) => {
    const status = {
        timestamp: new Date().toISOString(),
        servidor: 'online',
        supabase: 'desconhecido',
        zapi: 'desconhecido',
        logs: logsMemoria.length
    };

    try {
        const { error } = await supabase
            .from('clientes_novos')
            .select('count')
            .limit(1);

        status.supabase = error ? 'erro' : 'online';
        if (error) status.supabase_erro = error.message;
    } catch (e) {
        status.supabase = 'erro';
        status.supabase_erro = e.message;
    }

    try {
        const instance = process.env.ZAPI_INSTANCE;
        const token = process.env.ZAPI_TOKEN;

        if (instance && token) {
            const response = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/status`, {
                method: 'GET'
            });
            status.zapi = response.ok ? 'online' : 'offline';
            status.zapi_status = response.status;
        } else {
            status.zapi = 'nao_configurada';
        }
    } catch (e) {
        status.zapi = 'erro';
        status.zapi_erro = e.message;
    }

    res.json(status);
});

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Painel: https://app-vistos.onrender.com/painel.html`);
    console.log(`🔗 Webhook: https://app-vistos.onrender.com/api/webhook/zapi`);
});
