const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 10000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'minha-chave-secreta-123';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============ CONSTANTES ============
const ONBOARDING_STEPS = {
    SAUDACAO: 'saudacao',
    AGUARDANDO_NOME: 'aguardando_nome',
    CONFIRMACAO: 'confirmacao',
    COMPLETO: 'completo'
};

const BOAS_VINDAS_MESSAGES = {
    primeira_saudacao: [
        '👋 Olá! Seja muito bem-vindo(a) à GetVisa!',
        '🌟 Que prazer ter você aqui!',
        '🎉 Olá! Bem-vindo(a) à sua jornada de visto!',
        '✨ Seja bem-vindo(a) à GetVisa Assessoria!'
    ],
    solicitar_nome: [
        'Para começarmos seu atendimento de forma personalizada, poderia me dizer seu nome? 😊\n\nEx: Maria Silva',
        'Vou preparar um atendimento especial para você! Primeiro, qual é o seu nome?\n\nEx: João Santos',
        'Que tal nos conhecermos melhor? Me diga seu nome completo para eu te chamar corretamente!\n\nEx: Ana Oliveira'
    ],
    nome_invalido: [
        '🤔 Hmm, parece que não entendi bem seu nome. Poderia digitar novamente?\n\nEx: Maria Silva',
        '😅 Desculpe, não consegui identificar seu nome. Tente novamente no formato:\n\nEx: João Santos',
        '📝 Para um atendimento personalizado, preciso do seu nome completo.\n\nEx: Ana Oliveira'
    ],
    confirmacao_nome: {
        parte1: [
            '😊 Prazer, ',
            '🌟 Muito prazer, ',
            '✨ Que nome bonito, ',
            '🎯 Ótimo, '
        ],
        parte2: [
            '! Agora sim posso te ajudar da melhor forma.\n\nVamos lá: como posso ajudar hoje? Escolha uma opção:\n\n',
            '! Estou aqui para realizar o sonho da sua viagem!\n\nEm que posso te ajudar? Escolha:\n\n',
            '! Vamos encontrar a melhor solução para você!\n\nO que você precisa? Escolha uma opção:\n\n',
            '! Preparado(a) para começar essa jornada?\n\nComo posso te ajudar? Escolha:\n\n'
        ]
    }
};

const ETAPAS = {
    'formulario_enviado': { id: 'formulario_enviado', label: 'Formulario Enviado', next: 'analise_correcoes', color: '#3498db' },
    'analise_correcoes': { id: 'analise_correcoes', label: 'Analise e Correcoes', next: 'boleto_emitido', color: '#f39c12' },
    'boleto_emitido': { id: 'boleto_emitido', label: 'Boleto Emitido', next: 'boleto_pago', color: '#e67e22' },
    'boleto_pago': { id: 'boleto_pago', label: 'Boleto Pago', next: 'agendamento_realizado', color: '#27ae60' },
    'agendamento_realizado': { id: 'agendamento_realizado', label: 'Agendamento Realizado', next: 'treinamento_realizado', color: '#2980b9' },
    'treinamento_realizado': { id: 'treinamento_realizado', label: 'Treinamento Concluido', next: 'entrevista_realizada', color: '#8e44ad' },
    'entrevista_realizada': { id: 'entrevista_realizada', label: 'Entrevista Realizada', next: 'passaporte_retornado', color: '#2c3e50' },
    'passaporte_retornado': { id: 'passaporte_retornado', label: 'Passaporte Retornado', next: null, color: '#2ecc71' }
};

const RADIO_MAPPING = {
    'one': 'Sim',
    'two': 'Nao',
    'radio-28': { 'one': 'Turismo/negocio (B1/B2)', 'two': 'Estudos', 'Outros': 'Outros' },
    'radio-3': { 'one': 'Masculino', 'two': 'Feminino' },
    'select-4': { 'one': 'Casado(a)', 'two': 'Solteiro(a)', 'Uniao-estavel': 'Uniao estavel', 'Viuvo(a)': 'Viuvo(a)', 'Divorciado(a)': 'Divorciado(a)' },
    'radio-6': { 'one': 'Eu mesmo', 'two': 'Outra pessoa' },
    'radio-7': { 'one': 'Sim', 'two': 'Nao' },
    'radio-8': { 'one': 'Sim', 'two': 'Nao' },
    'radio-23': { 'one': 'Sim', 'two': 'Nao' },
    'radio-29': { 'one': 'Sim', 'two': 'Nao' },
    'radio-30': { 'one': 'Sim', 'two': 'Nao' },
    'radio-33': { 'one': 'Sim', 'two': 'Nao' },
    'radio-27': { 'Profissional': 'Profissional', 'Estudante': 'Estudante', 'Aposentado': 'Aposentado', 'Outra': 'Outra' },
    'radio-17': { 'one': 'Sim', 'two': 'Nao' },
    'radio-18': { 'one': 'Sim', 'two': 'Nao' },
    'radio-19': { 'one': 'Sim', 'two': 'Nao' },
    'radio-20': { 'one': 'Sim', 'two': 'Nao' },
    'radio-14': { 'one': 'Sim', 'two': 'Nao' },
    'radio-15': { 'one': 'Sim', 'two': 'Nao' },
    'radio-16': { 'one': 'Sim', 'two': 'Nao' },
    'radio-26': { 'one': 'Sim', 'two': 'Nao' },
    'radio-planos': { 'one': 'Sim', 'two': 'Nao' },
    'radio-9': { 'one': 'Sim', 'two': 'Nao, e diferente' },
    'radio-10': { 'one': 'Sim', 'two': 'Nao' },
    'radio-11': { 'one': 'Sim', 'two': 'Nao' },
    'radio-12': { 'one': 'Sim', 'two': 'Nao' },
    'radio-outra-nac': { 'one': 'Sim', 'two': 'Nao' },
    'radio-residente': { 'one': 'Sim', 'two': 'Nao' },
    'spouse-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'ex-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'falecido-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'radio-visto-negado': { 'one': 'Sim', 'two': 'Nao' },
    'radio-entrada-negada': { 'one': 'Sim', 'two': 'Nao' },
    'radio-deportado': { 'one': 'Sim', 'two': 'Nao' }
};

const DATE_FIELDS = [
    'text-5', 'text-21', 'text-35', 'text-66', 'text-67', 'text-69',
    'text-61', 'text-62', 'spouse-dob', 'data_casamento_div',
    'data_divorcio', 'data_falecimento', 'text-50', 'text-44',
    'text-45', 'military_date_from', 'military_date_to', 'antecedentes_data'
];

const SPAM_DOMAINS = ['tempmail', 'mailinator', '10minutemail', 'guerrillamail', 'throwaway', 'fake', 'spam'];

const FEATURES = {
    SISTEMA_ETAPAS: {
        ativo: true,
        notificar_cliente: true,
        auto_avancar: true
    }
};

const INTENT_KEYWORDS = {
    'visto_americano': ['visto americano', 'eua', 'estados unidos', 'us visa', 'b1', 'b2', 'entrevista eua', 'visto eua'],
    'visto_canadense': ['visto canadense', 'canada', 'visto canada'],
    'visto_australiano': ['visto australiano', 'australia', 'visto australia'],
    'eta_uk': ['eta uk', 'reino unido', 'inglaterra', 'uk visa'],
    'passaporte': ['passaporte', 'pf', 'policia federal', 'renovar passaporte', 'passaporte novo'],
    'preco': ['preco', 'valor', 'quanto custa', 'taxa', 'investimento', 'custo', 'valores', 'preco'],
    'prazo': ['prazo', 'tempo', 'dias', 'semanas', 'demora', 'quanto tempo', 'agendamento', 'processamento'],
    'documentos': ['documentos', 'documentacao', 'requisitos', 'necessario', 'obrigatorio', 'papeis'],
    'visto_negado': ['negado', 'negativa', 'recusado', 'visto recusado', 'deportado', 'visto negado'],
    'iniciar_processo': ['quero fazer o visto', 'quero visto', 'iniciar processo', 'comecar', 'quero comecar', 'vou fazer']
};

// ============ ESTADO DO USUÁRIO ============
const userState = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of userState.entries()) {
        if (data.lastActivity && (now - data.lastActivity) > 30 * 60 * 1000) {
            userState.delete(phone);
        }
    }
}, 60 * 1000);

// ============ FUNÇÕES AUXILIARES ============
function limparTelefone(telefone) {
    if (!telefone) return null;
    const limpo = telefone.toString().replace(/\D/g, '');
    if (limpo.startsWith('55')) return limpo.substring(2);
    return limpo;
}

function formatarTelefone(telefone) {
    if (!telefone) return null;
    const numeros = telefone.toString().replace(/\D/g, '');
    if (numeros.length === 11) {
        return '(' + numeros.substring(0, 2) + ') ' + numeros.substring(2, 7) + '-' + numeros.substring(7, 11);
    }
    if (numeros.length === 10) {
        return '(' + numeros.substring(0, 2) + ') ' + numeros.substring(2, 6) + '-' + numeros.substring(6, 10);
    }
    return telefone;
}

function getFormData(data, campoNovo, campoAntigo, padrao) {
    return data[campoNovo] || data[campoAntigo] || padrao;
}

function getRandomMessage(messageArray) {
    return messageArray[Math.floor(Math.random() * messageArray.length)];
}

function validarNome(nome) {
    if (!nome || nome.trim().length === 0) return false;
    
    const nomeLimpo = nome.trim();
    
    if (nomeLimpo.length < 2 || nomeLimpo.length > 100) return false;
    
    const regexNome = /^[a-zA-ZÀ-ÿ\s'-]+$/;
    if (!regexNome.test(nomeLimpo)) return false;
    
    if (/^\d+$/.test(nomeLimpo.replace(/\s/g, ''))) return false;
    
    const palavrasInvalidas = ['sim', 'nao', 'ok', 'yes', 'no', 'teste', 'oi', 'ola'];
    if (palavrasInvalidas.includes(nomeLimpo.toLowerCase())) return false;
    
    return true;
}

function formatarNome(nome) {
    return nome
        .trim()
        .toLowerCase()
        .split(' ')
        .map(palavra => {
            if (palavra.length <= 2) return palavra.toLowerCase();
            return palavra.charAt(0).toUpperCase() + palavra.slice(1);
        })
        .join(' ');
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
    return names[service] || 'Servico';
}

function formatDateToBrazilian(dateString) {
    if (!dateString || dateString === '') return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return match[3] + '/' + match[2] + '/' + match[1];
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return day + '/' + month + '/' + date.getFullYear();
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
        const mapped = value.map(function(v) {
            if (RADIO_MAPPING[fieldName] && RADIO_MAPPING[fieldName][v]) return RADIO_MAPPING[fieldName][v];
            if (RADIO_MAPPING[v]) return RADIO_MAPPING[v];
            return v;
        });
        return mapped.join(', ');
    }
    if (RADIO_MAPPING[fieldName] && RADIO_MAPPING[fieldName][value]) return RADIO_MAPPING[fieldName][value];
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
        if (nome || rel) result.push(nome + (nome && rel ? ' - ' : '') + rel);
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
        if (d || dur) result.push(d + (d && dur ? ' - ' : '') + dur + ' dias');
    }
    return result;
}

function drawSectionTitle(doc, title) {
    doc.moveDown(1);
    doc.fillColor('#003366').fontSize(14).font('Helvetica-Bold').text(title);
    doc.moveDown(0.3);
    doc.strokeColor('#003366').lineWidth(1.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.lineWidth(0.5);
    doc.moveDown(0.5);
    doc.fillColor('#000000').fontSize(10).font('Helvetica');
}

function isSpamData(dados) {
    const nome = dados.nome || dados.nome_cliente || dados.full_name || '';
    const telefone = dados.telefone || dados.whatsapp || dados.telefone_whatsapp || '';
    const email = dados.email || '';
    if (/^[a-z]{10,}$/i.test(nome)) return true;
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(nome)) return true;
    if (nome.length > 0 && nome.length < 3) return true;
    if (telefone && /[a-zA-Z]/.test(telefone)) return true;
    const telefoneLimpo = (telefone || '').toString().replace(/\D/g, '');
    if (telefoneLimpo.length > 0 && telefoneLimpo.length < 10) return true;
    if (telefoneLimpo && /^(\d)\1+$/.test(telefoneLimpo)) return true;
    for (const dominio of SPAM_DOMAINS) {
        if (email.toLowerCase().includes(dominio)) return true;
    }
    if (email && (!email.includes('@') || email.split('@').length !== 2)) return true;
    return false;
}

function detectIntent(message) {
    const cleanMessage = message.toLowerCase();
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
        for (const keyword of keywords) {
            if (cleanMessage.includes(keyword)) return intent;
        }
    }
    return null;
}

function getRespostaIntencao(intent, service) {
    const respostas = {
        'visto_americano': 'VISTO AMERICANO\n\nProcesso completo:\n- Preenchimento DS-160\n- Agendamento da entrevista\n- Preparacao para entrevista\n- Acompanhamento total\n\nInvestimento: Taxa ~R$ 950 + Assessoria R$ 350\n\nDigite 0 para voltar ao MENU principal',
        'visto_canadense': 'VISTO CANADENSE\n\nProcesso completo:\n- Aplicacao online GCKey\n- Biometria\n- Preparacao de documentos\n- Acompanhamento total\n\nInvestimento: Taxa ~R$ 750 + Assessoria R$ 400\n\nDigite 0 para voltar ao MENU principal',
        'visto_australiano': 'VISTO AUSTRALIANO\n\nProcesso completo:\n- Analise de perfil\n- Aplicacao online ImmiAccount\n- Envio de documentos\n- Acompanhamento total\n\nInvestimento: Taxa ~R$ 850 + Assessoria R$ 450\n\nDigite 0 para voltar ao MENU principal',
        'eta_uk': 'eTA UK (REINO UNIDO)\n\nProcesso completo:\n- Aplicacao 100% online\n- Validacao de dados\n- Acompanhamento\n\nInvestimento: Taxa ~R$ 120 + Assessoria R$ 150\n\nDigite 0 para voltar ao MENU principal',
        'passaporte': 'PASSAPORTE\n\nProcesso completo:\n- Agendamento na PF\n- Orientacao documental\n- Acompanhamento total\n\nInvestimento: Taxa PF ~R$ 257 + Assessoria R$ 150\n\nDigite 0 para voltar ao MENU principal',
        'preco': 'INVESTIMENTO DOS SERVICOS\n\nVisto Americano: Taxa ~R$ 950 + Assessoria R$ 350\nVisto Canadense: Taxa ~R$ 750 + Assessoria R$ 400\nVisto Australiano: Taxa ~R$ 850 + Assessoria R$ 450\neTA UK: ~R$ 120 + Assessoria R$ 150\neTA Canadense: ~R$ 50 + Assessoria R$ 100\nPassaporte: Taxa ~R$ 257 + Assessoria R$ 150\n\nDigite 0 para voltar ao MENU principal',
        'prazo': 'PRAZOS DOS SERVICOS\n\nVisto Americano: 30-40 dias\nVisto Canadense: 30-60 dias\nVisto Australiano: 15-30 dias\neTA UK: 1-3 dias\neTA Canadense: 1 dia\nPassaporte: 10-20 dias\n\nDigite 0 para voltar ao MENU principal',
        'documentos': 'DOCUMENTOS NECESSARIOS\n\nGerais:\n- Passaporte valido (minimo 6 meses)\n- Foto 5x7 recente\n- Comprovante de renda\n- Extratos bancarios\n\nEspecificos:\n- EUA: DS-160 preenchido\n- Canada: Carta de intencao\n- Passaporte: RG, CPF, Titulo de Eleitor\n\nDigite 0 para voltar ao MENU principal',
        'visto_negado': 'VISTO NEGADO - RECUPERACAO\n\nFaca uma analise gratuita do seu caso:\nhttps://getvisa.com.br/visto-americano-negado/\n\nO que fazemos:\n- Analise do motivo da negativa\n- Correcao do formulario\n- Documentacao reforcada\n- Preparacao para entrevista\n\nAssessoria especializada: R$ 380\n\nDigite 0 para voltar ao MENU principal',
        'iniciar_processo': 'Otimo! Vamos iniciar seu processo!\n\nEscolha o servico:\n\n1 - Visto Americano\n2 - Visto Canadense\n3 - Visto Australiano\n4 - eTA UK\n5 - eTA Canadense\n6 - Passaporte\n\nDigite o numero ou me pergunte algo!'
    };
    return respostas[intent] || 'Desculpe, nao entendi sua pergunta. Pode reformular?';
}

function getRespostaSubmenu(servico, opcao) {
    var respostas = {
        preco: {
            visto_americano: '💰 INVESTIMENTO - VISTO AMERICANO\n\n💵 Taxa Consular: ~R$ 950,00\n💼 Assessoria GetVisa: R$ 350,00\n\n✅ INCLUI: Preenchimento DS-160, agendamento, preparação para entrevista e acompanhamento total.\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '💰 INVESTIMENTO - VISTO CANADENSE\n\n💵 Taxa Consular: ~R$ 750,00\n💼 Assessoria GetVisa: R$ 400,00\n\n✅ INCLUI: Aplicação online, biometria, preparação de documentos e acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '💰 INVESTIMENTO - VISTO AUSTRALIANO\n\n💵 Taxa Consular: ~R$ 850,00\n💼 Assessoria GetVisa: R$ 450,00\n\n✅ INCLUI: Análise de perfil, aplicação online, documentação específica.\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '💰 INVESTIMENTO - eTA UK\n\n💵 Taxa: ~R$ 120,00\n💼 Assessoria GetVisa: R$ 150,00\n\n✅ INCLUI: Aplicação online, validação de dados, acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '💰 INVESTIMENTO - eTA CANADENSE\n\n💵 Taxa: ~R$ 50,00\n💼 Assessoria GetVisa: R$ 100,00\n\n✅ INCLUI: Aplicação online rápida, validação, entrega por e-mail.\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '💰 INVESTIMENTO - PASSAPORTE\n\n💵 Taxa PF: ~R$ 257,00\n💼 Assessoria GetVisa: R$ 150,00\n\n✅ INCLUI: Agendamento, orientação documental, acompanhamento.\n\nDigite 0 para voltar ao MENU principal'
        },
        prazo: {
            visto_americano: '⏱️ PRAZO - VISTO AMERICANO\n\nAgendamento: até 8 semanas\nAnálise consular: 7 a 10 dias úteis\nRetorno do passaporte: 5 a 7 dias úteis\n\nTotal estimado: 30 a 40 dias\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '⏱️ PRAZO - VISTO CANADENSE\n\nProcessamento: 4 a 8 semanas\nRetorno: 2 a 3 dias úteis\n\nTotal estimado: 30 a 60 dias\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '⏱️ PRAZO - VISTO AUSTRALIANO\n\nProcessamento: 2 a 4 semanas\n\nTotal estimado: 15 a 30 dias\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '⏱️ PRAZO - eTA UK\n\nProcessamento: até 72 horas\n\nTotal estimado: 1 a 3 dias\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '⏱️ PRAZO - eTA CANADENSE\n\nProcessamento: até 24 horas\n\nTotal estimado: 1 dia\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '⏱️ PRAZO - PASSAPORTE\n\nEmissão: 7 a 15 dias úteis\n\nTotal estimado: 10 a 20 dias\n\nDigite 0 para voltar ao MENU principal'
        },
        documentos: {
            visto_americano: '📄 DOCUMENTOS - VISTO AMERICANO\n\nOBRIGATÓRIOS:\n- Passaporte válido (mínimo 6 meses)\n- Foto 5x7 recente\n- Comprovante da taxa consular\n- DS-160 preenchido\n\nRECOMENDADOS:\n- Comprovante de renda\n- Extratos bancários\n- Comprovante de imóvel/veículo\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '📄 DOCUMENTOS - VISTO CANADENSE\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Foto digital\n- Comprovantes financeiros\n\nRECOMENDADOS:\n- Carta de intenção\n- Histórico de viagens\n- Vínculos com o Brasil\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '📄 DOCUMENTOS - VISTO AUSTRALIANO\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Comprovantes de recursos\n- Seguro saúde (recomendado)\n\nRECOMENDADOS:\n- Roteiro de viagem\n- Reservas de hospedagem\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '📄 DOCUMENTOS - eTA UK\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- E-mail válido\n- Dados de viagem\n\nPROCESSO:\n- Aplicação 100% online\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '📄 DOCUMENTOS - eTA CANADENSE\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Cartão de crédito para taxa\n- E-mail válido\n\nPROCESSO:\n- Aplicação 100% online\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '📄 DOCUMENTOS - PASSAPORTE\n\nOBRIGATÓRIOS:\n- RG original\n- CPF\n- Título de eleitor (homens 18-70)\n- Certidão de nascimento/casamento\n- Comprovante de quitação militar (homens)\n\nDigite 0 para voltar ao MENU principal'
        },
        processo: {
            visto_americano: '🔄 PROCESSO - VISTO AMERICANO\n\n- Análise de perfil\n- Preenchimento do DS-160\n- Pagamento da taxa consular\n- Agendamento da entrevista\n- Coleta biométrica (CASV)\n- Entrevista no Consulado\n- Retirada do passaporte\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '🔄 PROCESSO - VISTO CANADENSE\n\n- Análise de perfil\n- Aplicação online GCKey\n- Pagamento das taxas\n- Agendamento da biometria\n- Coleta de dados biométricos\n- Entrevista (se solicitado)\n- Decisão e envio\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '🔄 PROCESSO - VISTO AUSTRALIANO\n\n- Análise de perfil\n- Aplicação online ImmiAccount\n- Pagamento das taxas\n- Envio de documentos\n- Acompanhamento\n- Decisão por e-mail\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '🔄 PROCESSO - eTA UK\n\n- Coleta de dados\n- Aplicação online\n- Pagamento da taxa\n- Análise automatizada\n- Recebimento por e-mail\n- Vincular ao passaporte\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '🔄 PROCESSO - eTA CANADENSE\n\n- Coleta de dados\n- Aplicação online\n- Pagamento da taxa\n- Análise automatizada\n- Recebimento por e-mail\n- Vincular ao passaporte\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '🔄 PROCESSO - PASSAPORTE\n\n- Agendamento no site da PF\n- Separação dos documentos\n- Pagamento da GRU\n- Comparecimento ao posto\n- Coleta de dados biométricos\n- Aguardar emissão\n- Retirada do passaporte\n\nDigite 0 para voltar ao MENU principal'
        }
    };
    var resposta = respostas[opcao] && respostas[opcao][servico];
    if (!resposta) {
        resposta = '📋 INFORMAÇÕES EM BREVE\n\nEstamos preparando o conteúdo específico para ' + servico.replace('_', ' ').toUpperCase() + '.\n\nDigite 0 para voltar ao MENU principal';
    }
    return resposta;
}

// ============ FUNÇÕES DE MENU ============
async function getMenuPrincipal() {
    return '🌟 GETVISA - ASSESSORIA EM VISTOS\n\n' +
           'Escolha o serviço desejado:\n\n' +
           '1️⃣ - 🇺🇸 VISTO AMERICANO\n' +
           '2️⃣ - 🇨🇦 VISTO CANADENSE\n' +
           '3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n' +
           '4️⃣ - 🇬🇧 eTA UK (REINO UNIDO)\n' +
           '5️⃣ - 🇨🇦 eTA CANADENSE\n' +
           '6️⃣ - 🛂 PASSAPORTE\n' +
           '7️⃣ - 📞 AJUDA / CONTATO\n\n' +
           'Digite o número da opção (1-7) ou 0 para ver este MENU novamente';
}

function getSubmenu(service) {
    const names = {
        'visto_americano': '🇺🇸 VISTO AMERICANO',
        'visto_canadense': '🇨🇦 VISTO CANADENSE',
        'visto_australiano': '🇦🇺 VISTO AUSTRALIANO',
        'eta_uk': '🇬🇧 eTA UK',
        'eta_canadense': '🇨🇦 eTA CANADENSE',
        'passaporte': '🛂 PASSAPORTE'
    };

    const isPassaporte = service === 'passaporte';
    const opcao5 = isPassaporte ? '🏛️ ONDE FAZER' : '🔄 VISTO NEGADO';
    const nome = names[service] || 'SERVIÇO';

    return '📋 ' + nome + '\n\n' + 
        '1️⃣ - 💰 PREÇO\n' + 
        '2️⃣ - ⏱️ PRAZO\n' + 
        '3️⃣ - 📄 DOCUMENTOS\n' + 
        '4️⃣ - 🔄 PROCESSO\n' + 
        '5️⃣ - ' + opcao5 + '\n' +
        '6️⃣ - 📊 AVALIAÇÃO GRATUITA\n' + 
        '7️⃣ - 👨‍💼 FALAR COM ESPECIALISTA\n\n' + 
        '0️⃣ - VOLTAR AO MENU PRINCIPAL\n\n' +
        'Digite o número da opção (1-7)';
}

// ============ FUNÇÕES DE ONBOARDING ============
async function processarOnboarding(cleanPhone, messageText, state) {
    console.log('=== PROCESSANDO ONBOARDING ===');
    console.log('Passo atual: ' + state.onboardingStep);
    console.log('Mensagem: "' + messageText + '"');
    
    // Bloquear comandos de escape durante o onboarding
    const escapeCommands = ['0', 'menu', 'menu principal', 'inicio', 'voltar', 'principal'];
    if (escapeCommands.includes(messageText.toLowerCase().trim())) {
        await sendReply(cleanPhone, '👋 Antes de continuar, preciso saber seu nome para te atender melhor!\n\n' +
            'Qual é o seu nome completo? 😊\n\nEx: Maria Silva');
        return;
    }
    
    switch (state.onboardingStep) {
        case ONBOARDING_STEPS.SAUDACAO:
            const saudacao = getRandomMessage(BOAS_VINDAS_MESSAGES.primeira_saudacao);
            const pedirNome = getRandomMessage(BOAS_VINDAS_MESSAGES.solicitar_nome);
            
            await sendReply(cleanPhone, saudacao + '\n\n' + pedirNome);
            
            state.onboardingStep = ONBOARDING_STEPS.AGUARDANDO_NOME;
            state.lastActivity = Date.now();
            userState.set(cleanPhone, state);
            break;
            
        case ONBOARDING_STEPS.AGUARDANDO_NOME:
            // Validar nome
            const nomeValidado = validarNome(messageText);
            
            if (!nomeValidado) {
                const msgInvalido = getRandomMessage(BOAS_VINDAS_MESSAGES.nome_invalido);
                await sendReply(cleanPhone, msgInvalido);
                return;
            }
            
            const nomeFormatado = formatarNome(messageText);
            
            // SALVAR NO BANCO COM O NOME CORRETO
            try {
                const { data, error } = await supabase
                    .from('clientes_novos')
                    .upsert({
                        telefone: cleanPhone,
                        nome: nomeFormatado,
                        data_contato: new Date().toISOString(),
                        status: 'novo',
                        onboarding_completo: true
                    }, {
                        onConflict: 'telefone'
                    });
                
                if (error) {
                    console.error('Erro ao salvar nome:', error);
                } else {
                    console.log('✅ Nome salvo no Supabase:', nomeFormatado);
                }
            } catch (err) {
                console.error('Erro ao atualizar cliente:', err);
            }
            
            // Atualizar estado
            state.nome = nomeFormatado;
            state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
            state.onboardingCompleto = true;
            userState.set(cleanPhone, state);
            
            // Enviar confirmação com menu
            const confirmacao = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte1) + 
                              nomeFormatado.split(' ')[0] +
                              getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte2) +
                              await getMenuPrincipal();
            
            await sendReply(cleanPhone, confirmacao);
            
            console.log('🎉 Onboarding completo para:', nomeFormatado);
            break;
            
        default:
            // Fallback: reiniciar onboarding
            console.log('⚠️ Fallback - reiniciando onboarding');
            state.onboardingStep = ONBOARDING_STEPS.SAUDACAO;
            state.onboardingCompleto = false;
            state.nome = null;
            userState.set(cleanPhone, state);
            await processarOnboarding(cleanPhone, '', state);
    }
}

// ============ FUNÇÃO PRINCIPAL DE PROCESSAMENTO ============
async function processarMensagem(cleanPhone, messageText, body) {
    console.log('=== PROCESSANDO MENSAGEM ===');
    console.log('Phone: ' + cleanPhone);
    console.log('Message: "' + messageText + '"');
    
    try {
        // ============================================================
        // PASSO 1: BUSCAR CLIENTE NO BANCO
        // ============================================================
        let clienteDB = null;
        try {
            const { data, error } = await supabase
                .from('clientes_novos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();
            
            if (error) {
                console.error('Erro ao buscar cliente:', error);
            } else {
                clienteDB = data;
            }
        } catch (err) {
            console.error('Erro ao buscar cliente:', err);
        }
        
        console.log('Cliente DB:', clienteDB ? 'Encontrado' : 'Nao encontrado');
        if (clienteDB) {
            console.log('  - Nome:', clienteDB.nome || '(vazio)');
            console.log('  - Onboarding completo:', clienteDB.onboarding_completo || false);
        }
        
        // ============================================================
        // PASSO 2: VERIFICAR SE NOME É VÁLIDO
        // ============================================================
        function isNomeValido(nome) {
            if (!nome) return false;
            if (typeof nome !== 'string') return false;
            if (nome === 'Cliente') return false;
            if (nome.startsWith('Cliente_')) return false;
            if (nome.trim().length < 2) return false;
            
            const regexNome = /^[a-zA-ZÀ-ÿ\s'-]+$/;
            if (!regexNome.test(nome.trim())) return false;
            
            if (/^\d+$/.test(nome.replace(/\s/g, ''))) return false;
            
            return true;
        }
        
        // ============================================================
        // PASSO 3: CRIAR OU RECUPERAR ESTADO
        // ============================================================
        let state = userState.get(cleanPhone);
        
        // Se não tem estado ou estado inválido, recriar
        if (!state || (state.nome && !isNomeValido(state.nome))) {
            console.log('🔄 Criando/recriando estado para:', cleanPhone);
            
            let nomeExistente = null;
            let onboardingCompleto = false;
            
            if (clienteDB) {
                if (isNomeValido(clienteDB.nome)) {
                    nomeExistente = clienteDB.nome;
                    onboardingCompleto = !!(clienteDB.onboarding_completo === true);
                    console.log('✅ Nome válido do banco:', nomeExistente);
                } else if (clienteDB.nome) {
                    // Nome inválido - limpar
                    console.log('⚠️ Nome inválido no banco, removendo:', clienteDB.nome);
                    try {
                        await supabase
                            .from('clientes_novos')
                            .update({ 
                                nome: null, 
                                onboarding_completo: false 
                            })
                            .eq('telefone', cleanPhone);
                    } catch (err) {
                        console.error('Erro ao limpar nome:', err);
                    }
                    nomeExistente = null;
                    onboardingCompleto = false;
                }
            }
            
            state = {
                nivel: 'principal',
                service: null,
                nome: nomeExistente,
                onboardingStep: onboardingCompleto ? ONBOARDING_STEPS.COMPLETO : ONBOARDING_STEPS.SAUDACAO,
                onboardingCompleto: onboardingCompleto,
                lastActivity: Date.now()
            };
            userState.set(cleanPhone, state);
        }
        
        state.lastActivity = Date.now();
        userState.set(cleanPhone, state);
        
        console.log('Estado atual:', {
            nivel: state.nivel,
            service: state.service,
            nome: state.nome || '(vazio)',
            onboardingStep: state.onboardingStep,
            onboardingCompleto: state.onboardingCompleto
        });
        
        // ============================================================
        // PASSO 4: VERIFICAR ONBOARDING - PRIORIDADE MÁXIMA
        // ============================================================
        const precisaOnboarding = !state.onboardingCompleto || 
                                  !isNomeValido(state.nome) || 
                                  state.onboardingStep !== ONBOARDING_STEPS.COMPLETO;
        
        if (precisaOnboarding) {
            console.log('🔄 INICIANDO ONBOARDING');
            
            // Se já tem nome válido mas onboarding não está completo, corrigir
            if (isNomeValido(state.nome) && !state.onboardingCompleto) {
                console.log('✅ Nome válido encontrado, corrigindo onboarding');
                state.onboardingCompleto = true;
                state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
                userState.set(cleanPhone, state);
                
                try {
                    await supabase
                        .from('clientes_novos')
                        .update({ onboarding_completo: true })
                        .eq('telefone', cleanPhone);
                } catch (err) {
                    console.error('Erro ao atualizar onboarding:', err);
                }
                
                const confirmacao = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte1) + 
                                  state.nome.split(' ')[0] +
                                  getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte2) +
                                  await getMenuPrincipal();
                
                await sendReply(cleanPhone, confirmacao);
                return;
            }
            
            // Se não tem nome, iniciar onboarding
            await processarOnboarding(cleanPhone, messageText, state);
            return;
        }
        
        // ============================================================
        // PASSO 5: ONBOARDING COMPLETO - PROCESSAR MENU
        // ============================================================
        console.log('✅ Onboarding completo, processando menu');
        
        // COMANDO 0 - VOLTA AO MENU PRINCIPAL
        if (messageText === '0') {
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            await sendReply(cleanPhone, await getMenuPrincipal());
            return;
        }
        
        // COMANDOS DE RESET
        const resetCommands = ['menu', 'menu principal', 'inicio', 'comecar', 'voltar', 'principal'];
        if (resetCommands.includes(messageText.toLowerCase())) {
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            await sendReply(cleanPhone, await getMenuPrincipal());
            return;
        }
        
        // SAUDAÇÕES
        const saudacoes = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'hey', 'hi', 'hello', 'tudo bem'];
        if (saudacoes.includes(messageText.toLowerCase())) {
            const nomeCliente = state.nome ? state.nome.split(' ')[0] : '';
            
            if (state.nivel === 'submenu' && state.service) {
                const msg = '👋 Olá ' + nomeCliente + '! Você está no menu de ' + getServiceName(state.service).toUpperCase() + '.\n\n' +
                           'Deseja:\n' +
                           '• Continuar neste menu? Digite 9\n' +
                           '• Voltar ao menu principal? Digite 0';
                await sendReply(cleanPhone, msg);
            } else {
                state.nivel = 'principal';
                state.service = null;
                userState.set(cleanPhone, state);
                
                const saudacaoMsg = nomeCliente ? 
                    '👋 Olá ' + nomeCliente + '! Que bom ver você de novo!\n\n' + await getMenuPrincipal() :
                    '👋 Olá! Que bom ter você aqui!\n\n' + await getMenuPrincipal();
                await sendReply(cleanPhone, saudacaoMsg);
            }
            return;
        }
        
        // PROCESSAR POR NÍVEL
        if (state.nivel === 'submenu' && state.service) {
            await processarOpcaoNoSubmenu(cleanPhone, messageText, state);
        } else if (state.nivel === 'principal') {
            await processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state);
        } else {
            // Fallback
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            await sendReply(cleanPhone, await getMenuPrincipal());
        }
        
    } catch (error) {
        console.error('❌ ERRO NO processarMensagem:', error);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// ============ FUNÇÕES DE PROCESSAMENTO DE MENU ============
async function processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state) {
    console.log('=== MENU PRINCIPAL ===');
    
    const servicoMap = {
        '1': 'visto_americano',
        '2': 'visto_canadense',
        '3': 'visto_australiano',
        '4': 'eta_uk',
        '5': 'eta_canadense',
        '6': 'passaporte'
    };
    
    // Se escolheu um serviço (1-6)
    if (servicoMap[messageText]) {
        const serviceKey = servicoMap[messageText];
        console.log('Entrando no submenu de: ' + serviceKey);
        
        state.nivel = 'submenu';
        state.service = serviceKey;
        userState.set(cleanPhone, state);
        
        const submenuTexto = getSubmenu(serviceKey);
        await sendReply(cleanPhone, submenuTexto);
        return;
    }
    
    // Opção 7 - Ajuda
    if (messageText === '7') {
        const ajudaMsg = '📞 AJUDA / CONTATO GETVISA\n\n' +
                        '👨‍💼 Moisés - Especialista em Vistos\n\n' +
                        '📱 WhatsApp: https://wa.me/5521974601812\n\n' +
                        '📧 E-mail: contato@getvisa.com.br\n\n' +
                        '🌐 Site: https://getvisa.com.br\n\n' +
                        '⏰ Horário: Seg-Sex, 9h às 18h\n\n' +
                        'Digite 0 para voltar ao MENU principal';
        await sendReply(cleanPhone, ajudaMsg);
        return;
    }
    
    // Detectar intenção
    const intent = detectIntent(messageText);
    if (intent) {
        const resposta = getRespostaIntencao(intent, state.service);
        await sendReply(cleanPhone, resposta + '\n\nDigite 0 para o menu principal');
        return;
    }
    
    // Mensagem não reconhecida
    const erroMsg = '❌ Opção não reconhecida!\n\n' +
                   'Por favor, escolha uma das opções:\n\n' +
                   await getMenuPrincipal();
    await sendReply(cleanPhone, erroMsg);
}

async function processarOpcaoNoSubmenu(cleanPhone, messageText, state) {
    const service = state.service;
    const nomeCliente = state.nome ? ', ' + state.nome.split(' ')[0] : '';
    
    console.log('=== SUBMENU ATIVO: ' + service + ' ===');
    console.log('Opção recebida: ' + messageText);
    
    const opcoesSubmenu = {
        '1': 'preco',
        '2': 'prazo', 
        '3': 'documentos',
        '4': 'processo',
        '5': 'especial',
        '6': 'avaliacao',
        '7': 'especialista'
    };
    
    if (opcoesSubmenu[messageText]) {
        console.log('Processando opção ' + messageText + ' do submenu de ' + service);
        
        switch(messageText) {
            case '1':
                const respostaPreco = getRespostaSubmenu(service, 'preco');
                await sendReply(cleanPhone, respostaPreco + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '2':
                const respostaPrazo = getRespostaSubmenu(service, 'prazo');
                await sendReply(cleanPhone, respostaPrazo + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '3':
                const respostaDocs = getRespostaSubmenu(service, 'documentos');
                await sendReply(cleanPhone, respostaDocs + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '4':
                const respostaProcesso = getRespostaSubmenu(service, 'processo');
                await sendReply(cleanPhone, respostaProcesso + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '5':
                if (service === 'passaporte') {
                    const msg = '🏛️ ONDE FAZER O PASSAPORTE\n\n' +
                               '📍 Polícia Federal (agendamento obrigatório)\n' +
                               '🌐 Site: https://www.gov.br/pf/pt-br/assuntos/passaporte\n\n' +
                               '📋 Passo a passo:\n' +
                               '1. Acesse o site da PF\n' +
                               '2. Preencha o formulário online\n' +
                               '3. Pague a taxa GRU (~R$ 257)\n' +
                               '4. Agende o atendimento\n' +
                               '5. Compareça ao posto com os documentos\n\n' +
                               '💡 Dica: Agende com antecedência!\n\n' +
                               '📌 ' + nomeCliente + ' - Você está em: PASSAPORTE\n' +
                               'Digite outra opção (1-7) ou 0 para menu principal';
                    await sendReply(cleanPhone, msg);
                } else {
                    const msg = '🔄 VISTO NEGADO - RECUPERAÇÃO\n\n' +
                               'Teve o visto negado? Não desanime!\n\n' +
                               '🔗 Análise gratuita: https://getvisa.com.br/visto-americano-negado/\n\n' +
                               '✅ Oferecemos:\n' +
                               '• Análise do motivo da negativa\n' +
                               '• Correção do formulário\n' +
                               '• Documentação reforçada\n' +
                               '• Preparação para entrevista\n\n' +
                               '💰 Investimento: R$ 380\n\n' +
                               '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                               'Digite outra opção (1-7) ou 0 para menu principal';
                    await sendReply(cleanPhone, msg);
                }
                break;
                
            case '6':
                const links = {
                    'visto_americano': 'https://getvisa.com.br/simulador-visto-americano/',
                    'visto_canadense': 'https://getvisa.com.br/simulador-visto-canadense/',
                    'visto_australiano': 'https://getvisa.com.br/simulador-visto-australiano/',
                    'eta_uk': 'https://getvisa.com.br/simulador-eta-uk/',
                    'eta_canadense': 'https://getvisa.com.br/simulador-eta-canadense/',
                    'passaporte': 'https://getvisa.com.br/formulario-passaporte/'
                };
                const link = links[service] || 'https://getvisa.com.br/simulador-visto-americano/';
                
                const msg = '📋 AVALIAÇÃO GRATUITA - ' + getServiceName(service).toUpperCase() + '\n\n' +
                           '🔗 Acesse: ' + link + '\n\n' +
                           '⏱️ Leva menos de 2 minutos!\n\n' +
                           '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                           'Digite outra opção (1-7) ou 0 para menu principal';
                await sendReply(cleanPhone, msg);
                break;
                
            case '7':
                const msgEsp = '👨‍💼 FALAR COM ESPECIALISTA - ' + getServiceName(service).toUpperCase() + '\n\n' +
                              'Meu nome é Moisés e estou aqui para ajudar' + nomeCliente + '!\n\n' +
                              '📱 WhatsApp: https://wa.me/5521974601812\n\n' +
                              '📧 E-mail: contato@getvisa.com.br\n\n' +
                              '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                              'Digite outra opção (1-7) ou 0 para menu principal';
                await sendReply(cleanPhone, msgEsp);
                break;
        }
        return;
    }
    
    if (messageText === '9') {
        const submenuTexto = getSubmenu(service);
        await sendReply(cleanPhone, submenuTexto);
        return;
    }
    
    const erroMsg = '❌ Opção inválida' + nomeCliente + '!\n\n' +
                   'Você está no menu: ' + getServiceName(service).toUpperCase() + '\n\n' +
                   'Opções disponíveis:\n' +
                   getSubmenu(service) + '\n\n' +
                   '💡 Para escolher outro serviço, digite 0 primeiro.';
    await sendReply(cleanPhone, erroMsg);
}

// ============ FUNÇÕES DE ENVIO ============
async function enviarWhatsApp(telefone, mensagem) {
    try {
        const instance = process.env.ZAPI_INSTANCE;
        const token = process.env.ZAPI_TOKEN;
        const securityToken = process.env.ZAPI_SECURITY_TOKEN;
        if (!instance || !token) {
            console.log('Z-API nao configurada');
            return false;
        }
        const cleanPhone = telefone.toString().replace(/\D/g, '');
        const url = 'https://api.z-api.io/instances/' + instance + '/token/' + token + '/send-text';
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Client-Token': securityToken || ''
            },
            body: JSON.stringify({ phone: cleanPhone, message: mensagem })
        });
        const result = await response.text();
        console.log('WhatsApp enviado para ' + cleanPhone + ': ' + response.status);
        return response.status === 200 || response.status === 201;
    } catch (error) {
        console.error('Erro ao enviar WhatsApp:', error.message);
        return false;
    }
}

async function sendReply(phone, message) {
    return enviarWhatsApp(phone, message);
}

// ============ FUNÇÕES DE BANCO DE DADOS ============
async function cadastrarCliente(telefone, nome) {
    console.log('📝 Cadastrando cliente:', telefone);
    
    const dadosCliente = {
        telefone: telefone,
        data_contato: new Date().toISOString(),
        status: 'novo',
        onboarding_completo: false
    };
    
    // Só adiciona nome se for fornecido e for válido
    if (nome && nome !== 'Cliente' && !nome.startsWith('Cliente_')) {
        dadosCliente.nome = nome;
        console.log('  - Com nome:', nome);
    } else {
        console.log('  - Sem nome (aguardando onboarding)');
    }

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
    
    console.log('✅ Cliente cadastrado com sucesso:', data);
    return { dados: data, tipo: 'novo', tabela: 'clientes_novos' };
}

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
            console.log('Cliente ' + telefone + ' nao encontrado em clientes_ativos.');
            return null;
        }
        return criarEtapaComCliente(cliente, telefoneFormatado);
    } catch (error) {
        console.error('Erro ao criar etapa inicial:', error);
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
            nota: 'Inicio do processo',
            observacao: 'Cliente movido para clientes_ativos'
        }]
    };

    const { data, error } = await supabase
        .from('etapas_processo')
        .insert(novaEtapa)
        .select()
        .single();

    if (error) throw error;
    console.log('Etapa inicial criada para: ' + telefone);
    return data;
}

async function notificarClienteEtapa(telefone, novaEtapa) {
    try {
        const { data: cliente } = await supabase
            .from('clientes_ativos')
            .select('nome')
            .eq('telefone', telefone)
            .single();
        const nomeCliente = cliente && cliente.nome || 'Cliente';
        const mensagem = gerarMensagemEtapa(novaEtapa, nomeCliente);
        await enviarWhatsApp(telefone, mensagem);
        console.log('Notificacao enviada para ' + telefone + ': ' + novaEtapa);
    } catch (error) {
        console.error('Erro ao notificar cliente:', error);
    }
}

function gerarMensagemEtapa(etapa, nomeCliente) {
    const mensagens = {
        'formulario_enviado': 'Ola ' + nomeCliente + '! Seu formulario DS-160 foi recebido com sucesso! Iniciamos a analise do seu processo. Proxima etapa: Analise e correcoes dos dados.',
        'analise_correcoes': nomeCliente + ', estamos analisando seu processo! Nossa equipe esta revisando todos os dados do seu formulario. Em breve entraremos em contato com o proximo passo.',
        'boleto_emitido': nomeCliente + ', boleto emitido! O boleto do consulado foi gerado com sucesso. Voce recebera o PDF por e-mail. Prazo de pagamento: 7 dias uteis.',
        'boleto_pago': 'Boleto pago, ' + nomeCliente + '! Confirmamos o pagamento do seu boleto consular. Proxima etapa: Agendamento da entrevista.',
        'agendamento_realizado': 'Entrevista agendada, ' + nomeCliente + '! Sua entrevista foi agendada com sucesso. Voce recebera todos os detalhes por e-mail e WhatsApp.',
        'treinamento_realizado': 'Treinamento concluido, ' + nomeCliente + '! Excelente! Voce esta preparado para a entrevista.',
        'entrevista_realizada': 'Entrevista realizada, ' + nomeCliente + '! Parabens por completar sua entrevista! Aguarde o retorno do seu passaporte.',
        'passaporte_retornado': 'PARABENS, ' + nomeCliente + '! Seu passaporte com o visto foi retornado! Seu processo foi concluido com sucesso! Agradecemos por confiar na GetVisa Assessoria!'
    };
    return mensagens[etapa] || nomeCliente + ', seu processo avancou para: ' + (ETAPAS[etapa] && ETAPAS[etapa].label || etapa);
}

function validateDS160(data) {
    var errors = [];

    if (data['radio-visto-negado'] === 'one') {
        if (!data['text-visto-negado-ano'] || data['text-visto-negado-ano'] === '') {
            errors.push('Ano da negativa do visto e obrigatorio');
        }
    }

    if (data['radio-entrada-negada'] === 'one') {
        if (!data['text-entrada-negada-ano'] || data['text-entrada-negada-ano'] === '') {
            errors.push('Ano da negativa de entrada e obrigatorio');
        }
    }

    if (data['radio-deportado'] === 'one') {
        if (!data['text-deportado-ano'] || data['text-deportado-ano'] === '') {
            errors.push('Ano da deportacao e obrigatorio');
        }
        if (!data['select-deportado-duracao'] || data['select-deportado-duracao'] === '') {
            errors.push('Duracao da deportacao e obrigatoria');
        }
    }

    return { isValid: errors.length === 0, errors: errors };
}

// ============ FUNÇÕES DE PDF ============
async function gerarPDF_DS160(data) {
    return new Promise(function(resolve, reject) {
        var doc = new PDFDocument({ margin: 50 });
        var buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', function() { resolve(Buffer.concat(buffers)); });
        doc.on('error', reject);

        var nomeCliente = getFormData(data, 'nome', 'nome_completo', 'Cliente_Sem_Nome');

        doc.fillColor('#003366').fontSize(22).text('SOLICITACAO DE VISTO DS-160', { align: 'center' });
        doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentacao Consular', { align: 'center' });
        doc.moveDown(2);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        var currentSection = null;
        var hasContentInSection = false;

        function renderField(fieldName, label) {
            var value = data[fieldName];
            if (value !== undefined && value !== null && value !== '') {
                var formatted = formatValue(fieldName, value);
                if (formatted && formatted !== '(nao informado)') {
                    doc.font('Helvetica-Bold').fontSize(10).text(label + ': ', { continued: true });
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

        startSection('INFORMACOES INICIAIS');
        renderField('consulado_cidade', 'Cidade do Consulado');
        if (renderField('radio-26', 'Indicado por agencia/agente?') && data['radio-26'] === 'one') {
            renderField('text-1', 'Nome da agencia/agente');
        }
        renderField('text-64', 'Idioma usado para preencher');
        hasContentInSection = true;

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

        if (data['radio-7'] === 'one') {
            startSection('ACOMPANHANTES');
            renderField('radio-7', 'Ha acompanhantes?');
            var acompanhantes = groupParallelArrays(data, 'acompanhante_nome[]', 'acompanhante_rel[]');
            if (acompanhantes.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Acompanhantes:');
                acompanhantes.forEach(function(acc) { doc.font('Helvetica').text('  - ' + acc); });
                doc.moveDown(0.6);
            }
            hasContentInSection = true;
        }

        if (data['radio-8'] === 'one') {
            startSection('HISTORICO DE VIAGENS AOS EUA');
            renderField('radio-8', 'Ja esteve nos EUA?');
            var viagens = groupTravels(data);
            if (viagens.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Viagens anteriores aos EUA:');
                viagens.forEach(function(viagem) { doc.font('Helvetica').text('  - ' + viagem); });
                doc.moveDown(0.6);
            }
            hasContentInSection = true;
        }

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

        startSection('HISTORICO DE NEGATIVAS');
        doc.fillColor('#666666').fontSize(9).font('Helvetica').text('Estas perguntas sao obrigatorias no formulario DS-160 oficial. Responder falsamente constitui fraude.', { align: 'center' });
        doc.moveDown(0.5);
        doc.fillColor('#000000').fontSize(10);

        var vistoNegado = data['radio-visto-negado'];
        if (vistoNegado === 'one') vistoNegado = 'Sim';
        else if (vistoNegado === 'two') vistoNegado = 'Nao';
        doc.font('Helvetica-Bold').text('1. Ja teve visto americano NEGADO anteriormente?: ', { continued: true });
        doc.font('Helvetica').text(vistoNegado || 'Nao informado');
        doc.moveDown(0.3);

        if (data['radio-visto-negado'] === 'one') {
            doc.font('Helvetica').text('   - Ano da negativa: ' + (data['text-visto-negado-ano'] || 'Nao informado'));
            doc.font('Helvetica').text('   - Consulado: ' + (data['text-visto-negado-consulado'] || 'Nao informado'));
            doc.font('Helvetica').text('   - Tipo de visto: ' + (data['select-visto-negado-tipo'] || 'Nao informado'));
            doc.moveDown(0.3);
        }

        var entradaNegada = data['radio-entrada-negada'];
        if (entradaNegada === 'one') entradaNegada = 'Sim';
        else if (entradaNegada === 'two') entradaNegada = 'Nao';
        doc.font('Helvetica-Bold').text('2. Ja teve a entrada NEGADA nos EUA pelo oficial de imigracao?: ', { continued: true });
        doc.font('Helvetica').text(entradaNegada || 'Nao informado');
        doc.moveDown(0.3);

        if (data['radio-entrada-negada'] === 'one') {
            doc.font('Helvetica').text('   - Ano da negativa: ' + (data['text-entrada-negada-ano'] || 'Nao informado'));
            doc.font('Helvetica').text('   - Porto de entrada: ' + (data['text-entrada-negada-local'] || 'Nao informado'));
            doc.font('Helvetica').text('   - Motivo: ' + (data['textarea-entrada-negada-motivo'] || 'Nao informado'));
            doc.moveDown(0.3);
        }

        var deportado = data['radio-deportado'];
        if (deportado === 'one') deportado = 'Sim';
        else if (deportado === 'two') deportado = 'Nao';
        doc.font('Helvetica-Bold').text('3. Ja foi deportado ou removido dos Estados Unidos?: ', { continued: true });
        doc.font('Helvetica').text(deportado || 'Nao informado');
        doc.moveDown(0.3);

        if (data['radio-deportado'] === 'one') {
            doc.font('Helvetica').text('   - Ano da deportacao: ' + (data['text-deportado-ano'] || 'Nao informado'));
            var duracao = data['select-deportado-duracao'] || '';
            if (duracao === 'menos_5_anos') duracao = 'Menos de 5 anos';
            else if (duracao === '5_a_10_anos') duracao = 'Entre 5 e 10 anos';
            else if (duracao === 'mais_10_anos') duracao = 'Mais de 10 anos';
            else if (duracao === 'banimento_permanente') duracao = 'Banimento permanente';
            doc.font('Helvetica').text('   - Duracao: ' + (duracao || 'Nao informado'));
            doc.moveDown(0.3);
        }

        if (data['textarea-detalhes-negativa']) {
            doc.font('Helvetica-Bold').text('Detalhes adicionais sobre negativas:');
            doc.font('Helvetica').text(data['textarea-detalhes-negativa']);
            doc.moveDown(0.3);
        }
        hasContentInSection = true;

        doc.moveDown(0.5);
        doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        startSection('ENDERECO RESIDENCIAL');
        renderField('text-71', 'Logradouro');
        renderField('text-72', 'Complemento');
        renderField('text-73', 'CEP');
        renderField('text-74', 'Cidade');
        renderField('text-75', 'Estado');
        renderField('text-76', 'Pais');
        hasContentInSection = true;

        startSection('ENDERECO DE CORRESPONDENCIA');
        renderField('radio-9', 'Endereco de correspondencia e o mesmo?');
        if (data['radio-9'] === 'Nao, e diferente') {
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

        startSection('TELEFONES');
        renderField('text-77', 'Telefone principal');
        renderField('text-78', 'Telefone comercial');
        if (renderField('radio-10', 'Usou outros numeros?') && data['radio-10'] === 'one') {
            var telefones = data['telefones_anteriores[]'] || [];
            if (telefones.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Telefones anteriores: ', { continued: true });
                doc.font('Helvetica').text(telefones.join(', '));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        startSection('E-MAILS');
        renderField('email-1', 'E-mail principal');
        if (renderField('radio-11', 'Usou outros e-mails?') && data['radio-11'] === 'one') {
            var emails = data['emails_anteriores[]'] || [];
            if (emails.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('E-mails anteriores: ', { continued: true });
                doc.font('Helvetica').text(emails.join(', '));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        startSection('MIDIAS SOCIAIS');
        if (renderField('radio-12', 'Presenca em midias sociais?') && data['radio-12'] === 'one') {
            var plataformas = data['midia_plataforma[]'] || [];
            var identificadores = data['midia_identificador[]'] || [];
            var midias = [];
            for (var i = 0; i < Math.max(plataformas.length, identificadores.length); i++) {
                if (plataformas[i] || identificadores[i]) {
                    midias.push((plataformas[i] || '') + (plataformas[i] && identificadores[i] ? ': ' : '') + (identificadores[i] || ''));
                }
            }
            if (midias.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Midias sociais: ', { continued: true });
                doc.font('Helvetica').text(midias.join('; '));
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

        startSection('PASSAPORTE');
        renderField('text-38', 'Numero do passaporte');
        renderField('text-40', 'Pais que emitiu');
        renderField('text-39', 'Cidade de emissao');
        renderField('text-88', 'Estado de emissao');
        renderField('text-66', 'Data de emissao');
        renderField('text-67', 'Data de validade');
        renderField('radio-13', 'Passaporte perdido/roubado?');
        hasContentInSection = true;

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
            var parentes = groupParallelArrays(data, 'parente_nome[]', 'parente_relacao[]');
            if (parentes.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Parentes nos EUA:');
                parentes.forEach(function(p) { doc.font('Helvetica').text('  - ' + p); });
                doc.moveDown(0.6);
            }
        }
        hasContentInSection = true;

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

        var extra_descricoes = data['extra_descricao[]'] || [];
        if (extra_descricoes.length > 0) {
            startSection('OUTRAS OCUPACOES / FONTES DE RENDA');
            var extra_rendas = data['extra_renda[]'] || [];
            var extra_empregadores = data['extra_empregador[]'] || [];
            var extra_inicios = data['extra_data_inicio[]'] || [];
            var extra_enderecos = data['extra_endereco[]'] || [];
            var extra_cidades = data['extra_cidade[]'] || [];
            var extra_estados = data['extra_estado[]'] || [];
            var extra_telefones = data['extra_telefone[]'] || [];
            var extra_ceps = data['extra_cep[]'] || [];

            for (var i = 0; i < extra_descricoes.length; i++) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('Ocupacao adicional ' + (i+1) + ': ' + (extra_descricoes[i] || '(nao informado)'));
                if (extra_empregadores[i]) doc.font('Helvetica').text('  Empregador: ' + extra_empregadores[i]);
                if (extra_rendas[i]) doc.font('Helvetica').text('  Renda mensal: ' + extra_rendas[i]);
                if (extra_inicios[i]) {
                    var dataInicioFormatada = formatDateToBrazilian(extra_inicios[i]);
                    doc.font('Helvetica').text('  Data inicio: ' + dataInicioFormatada);
                }
                if (extra_enderecos[i]) doc.font('Helvetica').text('  Endereco: ' + extra_enderecos[i]);
                if (extra_cidades[i] && extra_estados[i]) doc.font('Helvetica').text('  Cidade/UF: ' + extra_cidades[i] + ' / ' + extra_estados[i]);
                if (extra_ceps[i]) doc.font('Helvetica').text('  CEP: ' + extra_ceps[i]);
                if (extra_telefones[i]) doc.font('Helvetica').text('  Telefone: ' + extra_telefones[i]);
                doc.moveDown(0.6);
            }
            hasContentInSection = true;
        }

        if (data['radio-17'] === 'one') {
            var empNomes = data['emprego_anterior_nome[]'] || [];
            if (empNomes.length > 0) {
                startSection('EMPREGOS ANTERIORES');
                var empCargos = data['emprego_anterior_cargo[]'] || [];
                var empInicios = data['emprego_anterior_inicio[]'] || [];
                var empFins = data['emprego_anterior_fim[]'] || [];
                var maxEmp = Math.max(empNomes.length, empCargos.length, empInicios.length, empFins.length);
                for (var i = 0; i < maxEmp; i++) {
                    if (empNomes[i] || empCargos[i]) {
                        var inicio = empInicios[i] ? formatDateToBrazilian(empInicios[i]) : '?';
                        var fim = empFins[i] ? formatDateToBrazilian(empFins[i]) : '?';
                        doc.font('Helvetica-Bold').fontSize(10).text('Emprego anterior ' + (i+1) + ':');
                        if (empNomes[i]) doc.font('Helvetica').text('  Empregador: ' + empNomes[i]);
                        if (empCargos[i]) doc.font('Helvetica').text('  Cargo: ' + empCargos[i]);
                        if (empInicios[i] || empFins[i]) doc.font('Helvetica').text('  Periodo: ' + inicio + ' a ' + fim);
                        doc.moveDown(0.4);
                    }
                }
                hasContentInSection = true;
            }
        }

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

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
    });
}

// ============ ROTAS ============
app.post('/api/webhook/zapi', function(req, res) {
    console.log('📨 WEBHOOK Z-API RECEBIDO');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    res.status(200).json({
        status: 'ok',
        received: true,
        timestamp: new Date().toISOString()
    });

    (async function() {
        try {
            var body = req.body;

            if (body.isGroup === true || body.isGroupMsg === true || 
                (body.chatId && body.chatId.indexOf('@g.us') !== -1)) {
                console.log('👥 Mensagem de grupo ignorada');
                return;
            }
            
            if (body.fromMe === true) {
                console.log('🤖 Mensagem do próprio bot ignorada');
                return;
            }
            
            if (body.isStatusReply === true || body.waitingMessage === true) {
                console.log('📊 Mensagem de status/waiting ignorada');
                return;
            }

            var messageText = '';
            var senderPhone = '';

            if (body.text) {
                if (typeof body.text === 'string') messageText = body.text;
                else if (body.text.message) messageText = body.text.message;
                else if (body.text.body) messageText = body.text.body;
                else if (body.text.text) messageText = body.text.text;
            }
            if (!messageText && body.message) {
                if (typeof body.message === 'string') messageText = body.message;
                else if (body.message.text) messageText = body.message.text;
                else if (body.message.content) messageText = body.message.content;
                else if (body.message.body) messageText = body.message.body;
                else if (body.message.conversation) messageText = body.message.conversation;
            }
            if (!messageText && body.content) messageText = body.content;
            if (!messageText && body.body) messageText = body.body;
            if (!messageText && body.conversation) messageText = body.conversation;

            if (body.phone) senderPhone = body.phone;
            else if (body.from) senderPhone = body.from;
            else if (body.sender) senderPhone = body.sender;
            else if (body.wa_id) senderPhone = body.wa_id;
            else if (body.chatId) senderPhone = body.chatId;
            else if (body.author) senderPhone = body.author;

            console.log('📝 Mensagem bruta: "' + messageText + '"');
            console.log('📱 Telefone bruto: "' + senderPhone + '"');

            if (!senderPhone || !messageText || messageText.trim().length === 0) {
                console.log('❌ Dados inválidos - ignorando');
                return;
            }

            messageText = messageText.trim();

            var cleanPhone = senderPhone.toString().replace(/\D/g, '');
            if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);
            if (cleanPhone.length < 10) {
                console.log('❌ Telefone inválido (' + cleanPhone + ')');
                await sendReply(senderPhone, 'Desculpe, não conseguimos identificar seu número. Tente novamente.');
                return;
            }

            console.log('✅ Telefone limpo: ' + cleanPhone);
            console.log('💬 Mensagem: "' + messageText + '"');

            var amigo = await supabase
                .from('contatos_amigos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (amigo.data) {
                console.log('👤 Contato AMIGO: ' + cleanPhone + ' - SILÊNCIO TOTAL');
                return;
            }

            var finalizado = await supabase
                .from('clientes_finalizados')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (finalizado.data) {
                console.log('✅ Cliente FINALIZADO: ' + cleanPhone);
                const msgFinalizado = '🌟 Muito obrigado por confiar na GetVisa!\n\n' +
                                     'Seu processo foi concluído com sucesso.\n\n' +
                                     '📋 Serviço: ' + (finalizado.data.servico || 'não informado') + '\n' +
                                     '📅 Finalizado em: ' + new Date(finalizado.data.data_finalizacao).toLocaleDateString('pt-BR') + '\n\n' +
                                     '⭐ Avalie nosso serviço: https://getvisa.com.br/avaliacao\n\n' +
                                     'Estamos aqui para você sempre que precisar!\n\n' +
                                     'Digite 0 para o MENU principal';
                await sendReply(cleanPhone, msgFinalizado);
                return;
            }

            var ativo = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (ativo.data) {
                console.log('🔄 Cliente ATIVO: ' + cleanPhone);
                
                let state = userState.get(cleanPhone);
                if (!state) {
                    state = {
                        nivel: 'principal',
                        service: null,
                        nome: ativo.data.nome || null,
                        onboardingStep: ONBOARDING_STEPS.COMPLETO,
                        onboardingCompleto: true,
                        lastActivity: Date.now()
                    };
                    userState.set(cleanPhone, state);
                }

                var etapaMsg = '';
                try {
                    var etapa = await supabase
                        .from('etapas_processo')
                        .select('etapa_atual')
                        .eq('cliente_telefone', cleanPhone)
                        .maybeSingle();

                    if (etapa.data) {
                        var etapaInfo = ETAPAS[etapa.data.etapa_atual];
                        etapaMsg = '\n📍 Etapa atual: ' + (etapaInfo && etapaInfo.label || etapa.data.etapa_atual);
                    }
                } catch (err) {
                    console.log('Erro ao buscar etapa:', err);
                }

                const nomeCliente = ativo.data.nome ? ativo.data.nome.split(' ')[0] : 'Cliente';
                const msgAtivo = '👋 Olá ' + nomeCliente + '!\n\n' +
                                'Seu processo está em andamento.' + etapaMsg + '\n' +
                                '📊 Status: ' + (ativo.data.status || 'em_processo') + '\n\n' +
                                'Como posso ajudar?\n\n' +
                                'Digite 0 para o MENU principal';
                await sendReply(cleanPhone, msgAtivo);
                
                await processarMensagem(cleanPhone, messageText, body);
                return;
            }

            var novo = await supabase
                .from('clientes_novos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (novo.data) {
                console.log('👤 Cliente NOVO já cadastrado: ' + cleanPhone);
                
                if (novo.data.nome && novo.data.onboarding_completo) {
                    let state = userState.get(cleanPhone);
                    if (!state) {
                        state = {
                            nivel: 'principal',
                            service: null,
                            nome: novo.data.nome,
                            onboardingStep: ONBOARDING_STEPS.COMPLETO,
                            onboardingCompleto: true,
                            lastActivity: Date.now()
                        };
                        userState.set(cleanPhone, state);
                    }
                }
                
                await processarMensagem(cleanPhone, messageText, body);
                return;
            }

            console.log('🆕 NOVO CLIENTE: ' + cleanPhone);

            var resultado = await cadastrarCliente(cleanPhone, null);
            if (!resultado) {
                await sendReply(cleanPhone, 'Desculpe, estamos com problemas técnicos. Tente novamente em alguns minutos.');
                return;
            }

            console.log('✅ Cliente cadastrado (sem nome), iniciando onboarding');
            await processarMensagem(cleanPhone, messageText, body);

        } catch (error) {
            console.error('❌ ERRO NO PROCESSAMENTO DO WEBHOOK:');
            console.error('Mensagem:', error.message);
            console.error('Stack:', error.stack);

            try {
                var phone = req.body && (req.body.phone || req.body.from || req.body.chatId) || null;
                if (phone) {
                    var cleanPhone = phone.toString().replace(/\D/g, '');
                    if (cleanPhone.length >= 10) {
                        await sendReply(cleanPhone, '❌ Desculpe, estamos com problemas técnicos. Nossa equipe já foi notificada e entrará em contato em breve.\n\nDigite 0 para tentar novamente.');
                    }
                }
            } catch (e) {
                console.error('Falha ao enviar mensagem de erro:', e);
            }
        }
    })();
});

// ============ ROTAS ADICIONAIS ============
app.post('/api/submit-ds160', async function(req, res) {
    var data = req.body;

    if (isSpamData(data)) {
        console.log('SPAM DS-160 - Dados rejeitados');
        return res.status(200).json({ success: true, message: 'Recebido' });
    }

    var validation = validateDS160(data);
    if (!validation.isValid) {
        console.error('Erro de validacao:', validation.errors);
        return res.status(400).json({
            success: false,
            errors: validation.errors,
            message: 'Por favor, responda todas as perguntas obrigatorias corretamente.'
        });
    }

    console.log('Dados recebidos (DS-160) - VALIDACAO OK');
    res.status(200).json({ success: true, message: 'Requisicao recebida, processando...' });

    (async function() {
        try {
            var nome = data['full_name'] || 'Cliente_Sem_Nome';
            var emailCliente = data['email-1'] || null;
            var telefoneCliente = limparTelefone(data['text-77'] || data['telefone'] || null);

            if (telefoneCliente) {
                try {
                    var telefoneLimpo = limparTelefone(telefoneCliente);
                    console.log('Telefone limpo: ' + telefoneLimpo);

                    var insert = await supabase
                        .from('clientes_ativos')
                        .upsert({
                            telefone: telefoneLimpo,
                            nome: nome,
                            atualizado_em: new Date().toISOString()
                        }, {
                            onConflict: 'telefone',
                            ignoreDuplicates: false
                        });

                    if (insert.error) {
                        console.error('Erro ao criar/atualizar cliente em ATIVOS:', insert.error);
                    } else {
                        console.log('Cliente ' + telefoneLimpo + ' criado/atualizado em ATIVOS');
                    }

                    var etapa = await supabase
                        .from('etapas_processo')
                        .insert({
                            cliente_telefone: formatarTelefone(telefoneLimpo),
                            etapa_atual: 'formulario_enviado',
                            data_inicio: new Date().toISOString(),
                            data_atualizacao: new Date().toISOString(),
                            historico: [{
                                etapa: 'formulario_enviado',
                                data: new Date().toISOString(),
                                nota: 'Inicio do processo',
                                observacao: 'Cliente criado via formulario DS-160'
                            }]
                        });

                    if (etapa.error) {
                        console.error('Erro ao criar etapa:', etapa.error);
                    }

                    var clienteNovo = await supabase
                        .from('clientes_novos')
                        .select('*')
                        .eq('telefone', telefoneLimpo)
                        .maybeSingle();

                    if (clienteNovo.data) {
                        await supabase
                            .from('clientes_novos')
                            .delete()
                            .eq('telefone', telefoneLimpo);
                        console.log('Cliente ' + telefoneLimpo + ' removido de NOVOS');
                    }

                } catch (err) {
                    console.error('Erro ao processar cliente:', err.message);
                }
            }

            var pdfBuffer = await gerarPDF_DS160(data);
            console.log('PDF gerado para ' + nome + ', tamanho: ' + pdfBuffer.length + ' bytes');

            await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: ['getvisa.assessoria@gmail.com'],
                subject: 'DS-160: ' + nome,
                html: '<strong>Formulario DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ' + nome + '</p><p>PDF em anexo (' + pdfBuffer.length + ' bytes).</p>',
                attachments: [{ filename: 'DS160_' + nome.replace(/[^a-z0-9]/gi, '_') + '.pdf', content: pdfBuffer.toString('base64') }]
            });
            console.log('E-mail enviado para a equipe');

            if (emailCliente && emailCliente.trim() !== '') {
                await resend.emails.send({
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: [emailCliente],
                    subject: 'Seu formulario DS-160 foi recebido - ' + nome,
                    html: '<strong>Ola ' + nome + ',</strong><br><p>Recebemos seu formulario. Segue em anexo uma copia.</p><p>Em breve nossa equipe entrara em contato.</p>',
                    attachments: [{ filename: 'DS160_' + nome.replace(/[^a-z0-9]/gi, '_') + '.pdf', content: pdfBuffer.toString('base64') }]
                });
                console.log('E-mail enviado para o cliente: ' + emailCliente);
            }

        } catch (err) {
            console.error('Erro no processamento DS-160 (background):', err);
        }
    })();
});

// ============ ROTAS DE PAINEL ============
app.get('/api/painel/pendentes', async function(req, res) {
    try {
        var pendentes = await supabase.from('clientes_novos').select('*').order('data_contato', { ascending: false });
        var ativos = await supabase.from('clientes_ativos').select('*').order('criado_em', { ascending: false });
        var amigos = await supabase.from('contatos_amigos').select('*').order('criado_em', { ascending: false });

        res.json({ 
            success: true, 
            pendentes: pendentes.data || [], 
            ativos: ativos.data || [], 
            amigos: amigos.data || [] 
        });
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/painel/mover', async function(req, res) {
    try {
        var telefone = req.body.telefone;
        var destino = req.body.destino;
        
        if (!telefone || !destino) {
            return res.status(400).json({ success: false, message: 'Telefone e destino sao obrigatorios' });
        }
        if (['ativo', 'amigo'].indexOf(destino) === -1) {
            return res.status(400).json({ success: false, message: 'Destino deve ser "ativo" ou "amigo"' });
        }

        var cliente = await supabase
            .from('clientes_novos').select('*').eq('telefone', telefone).maybeSingle();
        
        if (cliente.error) return res.status(500).json({ success: false, message: cliente.error.message });
        if (!cliente.data) return res.status(404).json({ success: false, message: 'Cliente nao encontrado em clientes_novos' });

        if (destino === 'ativo') {
            var insert = await supabase.from('clientes_ativos').insert({
                telefone: cliente.data.telefone,
                nome: cliente.data.nome,
                criado_em: cliente.data.data_contato,
                atualizado_em: new Date().toISOString()
            });
            if (insert.error) return res.status(500).json({ success: false, message: insert.error.message });
            
            try { 
                await criarEtapaInicial(cliente.data.telefone); 
            } catch (err) { 
                console.error('Erro ao criar etapa:', err); 
            }
            
            // ============================================================
            // 🔔 ENVIAR NOTIFICAÇÃO AUTOMÁTICA PARA O CLIENTE
            // ============================================================
            try {
                const nomeCliente = cliente.data.nome && !cliente.data.nome.startsWith('Cliente_') 
                    ? cliente.data.nome.split(' ')[0] 
                    : 'Cliente';
                
                const mensagem = `🎉 Olá ${nomeCliente}!\n\n` +
                               `Seu processo foi iniciado com sucesso na GetVisa Assessoria!\n\n` +
                               `📋 Status: Em andamento\n` +
                               `📍 Etapa atual: Formulário recebido\n\n` +
                               `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                               `📱 Dúvidas? Fale conosco pelo WhatsApp: https://wa.me/5521974601812\n\n` +
                               `🌟 Estamos aqui para ajudar você a realizar seu sonho de viajar!`;
                
                await enviarWhatsApp(cliente.data.telefone, mensagem);
                console.log(`✅ Notificação automática enviada para ${telefone}`);
            } catch (err) {
                console.error('❌ Erro ao enviar notificação automática:', err);
            }
            // ============================================================
            
        } else {
            // Destino: amigo
            var insert = await supabase.from('contatos_amigos').insert({
                telefone: cliente.data.telefone,
                nome: cliente.data.nome,
                criado_em: cliente.data.data_contato
            });
            if (insert.error) return res.status(500).json({ success: false, message: insert.error.message });
            
            // 🔔 Notificar que foi marcado como amigo (opcional)
            try {
                const mensagem = `🔇 Olá! Você foi marcado como contato amigo no sistema GetVisa.\n\n` +
                               `Isso significa que você não receberá mais notificações automáticas.\n\n` +
                               `Se isso foi um engano, entre em contato conosco: https://wa.me/5521974601812`;
                await enviarWhatsApp(cliente.data.telefone, mensagem);
                console.log(`✅ Notificação de "amigo" enviada para ${telefone}`);
            } catch (err) {
                console.error('❌ Erro ao enviar notificação de amigo:', err);
            }
        }

        await supabase.from('clientes_novos').delete().eq('telefone', telefone);
        
        res.json({ 
            success: true, 
            message: 'Cliente ' + telefone + ' movido para ' + destino,
            notificacao_enviada: true
        });
        
    } catch (error) {
        console.error('Erro ao mover cliente:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/painel/mover-varios', async function(req, res) {
    try {
        var telefones = req.body.telefones;
        var destino = req.body.destino;
        
        if (!telefones || !Array.isArray(telefones) || telefones.length === 0) {
            return res.status(400).json({ success: false, message: 'Lista de telefones e obrigatoria' });
        }

        var movidos = 0;
        var erros = [];
        var notificacoes = 0;
        
        for (var i = 0; i < telefones.length; i++) {
            var telefone = telefones[i];
            try {
                var cliente = await supabase.from('clientes_novos').select('*').eq('telefone', telefone).maybeSingle();
                if (!cliente.data) { erros.push(telefone + ': nao encontrado'); continue; }

                if (destino === 'ativo') {
                    await supabase.from('clientes_ativos').insert({
                        telefone: cliente.data.telefone,
                        nome: cliente.data.nome,
                        criado_em: cliente.data.data_contato,
                        atualizado_em: new Date().toISOString()
                    });
                    
                    // 🔔 Notificar cada cliente movido
                    try {
                        const nomeCliente = cliente.data.nome && !cliente.data.nome.startsWith('Cliente_') 
                            ? cliente.data.nome.split(' ')[0] 
                            : 'Cliente';
                        
                        const mensagem = `🎉 Olá ${nomeCliente}!\n\n` +
                                       `Seu processo foi iniciado com sucesso na GetVisa Assessoria!\n\n` +
                                       `📋 Status: Em andamento\n` +
                                       `📍 Etapa atual: Formulário recebido\n\n` +
                                       `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                                       `📱 Dúvidas? Fale conosco pelo WhatsApp: https://wa.me/5521974601812`;
                        
                        await enviarWhatsApp(cliente.data.telefone, mensagem);
                        notificacoes++;
                        console.log(`✅ Notificação enviada para ${telefone}`);
                    } catch (err) {
                        console.error(`❌ Erro ao notificar ${telefone}:`, err);
                    }
                    
                } else {
                    await supabase.from('contatos_amigos').insert({
                        telefone: cliente.data.telefone,
                        nome: cliente.data.nome,
                        criado_em: cliente.data.data_contato
                    });
                }
                
                await supabase.from('clientes_novos').delete().eq('telefone', telefone);
                movidos++;
            } catch (err) { erros.push(telefone + ': ' + err.message); }
        }

        res.json({ 
            success: true, 
            movidos: movidos, 
            notificacoes_enviadas: notificacoes,
            erros: erros.length > 0 ? erros : undefined, 
            message: movidos + ' cliente(s) movido(s), ' + notificacoes + ' notificação(ões) enviada(s)' 
        });
    } catch (error) {
        console.error('Erro ao mover clientes:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/etapas/cliente/:telefone', async function(req, res) {
    try {
        var telefoneLimpo = req.params.telefone.replace(/\D/g, '');
        var telefoneFormatado = formatarTelefone(telefoneLimpo);

        var result = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', telefoneFormatado)
            .maybeSingle();

        if (!result.data) {
            var resultLimpo = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', telefoneLimpo)
                .maybeSingle();

            if (resultLimpo.data) {
                return res.json(resultLimpo.data);
            }
        }

        if (!result.data) {
            var novaEtapa = await criarEtapaInicial(telefoneFormatado);
            if (novaEtapa) return res.json(novaEtapa);
            return res.status(404).json({ erro: 'Cliente nao encontrado' });
        }

        res.json(result.data);
    } catch (error) {
        console.error('Erro ao buscar etapa:', error);
        res.status(500).json({ erro: 'Erro ao buscar etapa do cliente' });
    }
});

app.post('/api/etapas/avancar', async function(req, res) {
    try {
        var telefone = req.body.telefone;
        var nota = req.body.nota;
        var observacao = req.body.observacao;
        
        var telefoneLimpo = telefone.replace(/\D/g, '');
        var telefoneFormatado = formatarTelefone(telefoneLimpo);

        console.log('Avançando etapa para: ' + telefoneFormatado);

        if (!FEATURES.SISTEMA_ETAPAS.ativo) {
            return res.status(503).json({ erro: 'Sistema de etapas esta temporariamente desativado' });
        }

        var etapaAtual = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', telefoneFormatado)
            .maybeSingle();

        if (!etapaAtual.data) {
            var etapaLimpo = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', telefoneLimpo)
                .maybeSingle();

            if (etapaLimpo.data) {
                await supabase
                    .from('etapas_processo')
                    .update({ cliente_telefone: telefoneFormatado })
                    .eq('cliente_telefone', telefoneLimpo);

                var etapaCorrigida = await supabase
                    .from('etapas_processo')
                    .select('*')
                    .eq('cliente_telefone', telefoneFormatado)
                    .maybeSingle();

                if (etapaCorrigida.data) {
                    return processarAvanco(res, etapaCorrigida.data, nota, observacao, telefoneFormatado);
                }
            }

            return res.status(404).json({ erro: 'Cliente nao encontrado em etapas_processo' });
        }

        return processarAvanco(res, etapaAtual.data, nota, observacao, telefoneFormatado);
    } catch (error) {
        console.error('Erro ao avançar etapa:', error);
        res.status(500).json({ erro: 'Erro ao avançar etapa', detalhe: error.message });
    }
});

async function processarAvanco(res, etapaAtual, nota, observacao, telefone) {
    var etapaId = etapaAtual.etapa_atual;
    var proximaEtapa = ETAPAS[etapaId] && ETAPAS[etapaId].next;

    if (!proximaEtapa) {
        return res.status(400).json({ erro: 'Cliente ja esta na ultima etapa' });
    }

    var historicoAtualizado = (etapaAtual.historico || []).concat([{
        etapa: etapaId,
        data: new Date().toISOString(),
        nota: nota || 'Avanco manual',
        observacao: observacao || 'Avancado pelo painel administrativo'
    }]);

    var dadosAtualizacao = {
        etapa_atual: proximaEtapa,
        data_atualizacao: new Date().toISOString(),
        historico: historicoAtualizado
    };

    var campoData = 'data_' + proximaEtapa;
    dadosAtualizacao[campoData] = new Date().toISOString();

    var updated = await supabase
        .from('etapas_processo')
        .update(dadosAtualizacao)
        .eq('cliente_telefone', telefone)
        .select()
        .single();

    if (updated.error) throw updated.error;

    if (FEATURES.SISTEMA_ETAPAS.notificar_cliente) {
        await notificarClienteEtapa(telefone, proximaEtapa);
    }

    console.log('Cliente ' + telefone + ' avançou para: ' + proximaEtapa);

    res.json({
        sucesso: true,
        etapa_anterior: etapaId,
        etapa_atual: proximaEtapa,
        dados: updated.data
    });
}

app.get('/api/etapas/historico/:telefone', async function(req, res) {
    try {
        var telefoneLimpo = req.params.telefone.replace(/\D/g, '');
        var result = await supabase
            .from('etapas_processo')
            .select('historico, etapa_atual, data_inicio, data_atualizacao')
            .eq('cliente_telefone', telefoneLimpo)
            .single();

        if (result.error) {
            if (result.error.code === 'PGRST116') return res.status(404).json({ erro: 'Cliente nao encontrado' });
            throw result.error;
        }

        res.json({
            etapa_atual: result.data.etapa_atual,
            data_inicio: result.data.data_inicio,
            data_atualizacao: result.data.data_atualizacao,
            historico: result.data.historico || []
        });
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ erro: 'Erro ao buscar histórico' });
    }
});

app.get('/api/etapas/estatisticas', async function(req, res) {
    try {
        var result = await supabase.from('etapas_processo').select('etapa_atual');
        if (result.error) throw result.error;

        var estatisticas = {};
        var total = result.data.length;
        result.data.forEach(function(item) {
            if (!estatisticas[item.etapa_atual]) estatisticas[item.etapa_atual] = 0;
            estatisticas[item.etapa_atual]++;
        });

        var resultado = Object.keys(estatisticas).map(function(etapa) {
            return {
                etapa: etapa,
                label: ETAPAS[etapa] && ETAPAS[etapa].label || etapa,
                quantidade: estatisticas[etapa],
                porcentagem: total > 0 ? ((estatisticas[etapa] / total) * 100).toFixed(2) : 0
            };
        });

        res.json({
            total_clientes_ativos: total,
            distribuicao: resultado,
            ultima_atualizacao: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ erro: 'Erro ao buscar estatisticas' });
    }
});

app.get('/api/clientes/ativos', async function(req, res) {
    try {
        var result = await supabase
            .from('clientes_ativos')
            .select('telefone, nome')
            .order('criado_em', { ascending: false });

        if (result.error) {
            console.error('Erro ao buscar ativos:', result.error);
            return res.status(500).json({ success: false, message: result.error.message });
        }

        res.json({
            success: true,
            ativos: result.data || []
        });

    } catch (error) {
        console.error('Erro ao buscar ativos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/clientes/listar', async function(req, res) {
    try {
        var result = await supabase
            .from('clientes')
            .select('*')
            .order('nome_completo', { ascending: true });

        if (result.error) throw result.error;

        res.json({
            success: true,
            clientes: result.data || []
        });

    } catch (error) {
        console.error('Erro ao listar clientes:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/test/webhook-manual', async function(req, res) {
    console.log('TESTE MANUAL');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    var phone = req.body.phone;
    var message = req.body.message || 'Teste';

    if (!phone) {
        return res.status(400).json({ error: 'Phone e obrigatorio' });
    }

    try {
        var cleanPhone = phone.toString().replace(/\D/g, '');
        console.log('Telefone limpo: ' + cleanPhone);
        console.log('Mensagem: "' + message + '"');

        var resultado = await sendReply(cleanPhone, 'TESTE MANUAL\n\nSe voce esta vendo esta mensagem, o sistema esta funcionando!\n\nDigite 0 para o menu principal');

        res.json({
            success: true,
            phone: cleanPhone,
            message_sent: resultado,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro no teste manual:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ROTA PARA NOTIFICAR CLIENTE MANUALMENTE ============
app.post('/api/admin/notificar-cliente', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { telefone } = req.body;
        
        if (!telefone) {
            return res.status(400).json({ error: 'Telefone é obrigatório' });
        }
        
        console.log(`📨 Enviando notificação manual para: ${telefone}`);
        
        // Limpar telefone para busca
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        
        // Buscar cliente em clientes_ativos
        const { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        if (!cliente) {
            // Tentar buscar com telefone limpo
            const { data: clienteLimpo } = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();
            
            if (!clienteLimpo) {
                return res.status(404).json({ 
                    error: 'Cliente não encontrado em clientes_ativos',
                    telefone_buscado: telefone,
                    telefone_limpo: telefoneLimpo
                });
            }
            
            // Se encontrou com telefone limpo, usar esse
            cliente = clienteLimpo;
        }
        
        const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_') 
            ? cliente.nome.split(' ')[0] 
            : 'Cliente';
        
        const mensagem = `🎉 Olá ${nomeCliente}!\n\n` +
                       `Seu processo foi iniciado com sucesso na GetVisa Assessoria!\n\n` +
                       `📋 Status: Em andamento\n` +
                       `📍 Etapa atual: Formulário recebido\n\n` +
                       `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                       `📱 Dúvidas? Fale conosco pelo WhatsApp: https://wa.me/5521974601812\n\n` +
                       `🌟 Estamos aqui para ajudar você a realizar seu sonho de viajar!`;
        
        const enviado = await enviarWhatsApp(telefone, mensagem);
        
        res.json({
            success: true,
            telefone: telefone,
            cliente: {
                nome: cliente.nome,
                criado_em: cliente.criado_em
            },
            notificacao_enviada: enviado,
            mensagem: mensagem
        });
        
    } catch (error) {
        console.error('❌ Erro ao notificar cliente:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============ ROTA PARA VERIFICAR STATUS DO CLIENTE ============
app.get('/api/admin/verificar-cliente/:telefone', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const telefone = req.params.telefone;
        console.log(`🔍 Verificando cliente: ${telefone}`);
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        
        // Buscar em todas as tabelas
        const tables = ['clientes_novos', 'clientes_ativos', 'clientes_finalizados', 'contatos_amigos'];
        const results = {};
        
        for (const table of tables) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .eq('telefone', telefone)
                .maybeSingle();
            
            if (!error && data) {
                results[table] = data;
            }
            
            // Tentar com telefone limpo
            if (!results[table]) {
                const { data: dataLimpo } = await supabase
                    .from(table)
                    .select('*')
                    .eq('telefone', telefoneLimpo)
                    .maybeSingle();
                
                if (dataLimpo) {
                    results[table] = dataLimpo;
                }
            }
        }
        
        // Buscar etapa se estiver em clientes_ativos
        let etapa = null;
        if (results['clientes_ativos']) {
            const { data } = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', telefone)
                .maybeSingle();
            
            if (!data) {
                const { data: dataLimpo } = await supabase
                    .from('etapas_processo')
                    .select('*')
                    .eq('cliente_telefone', telefoneLimpo)
                    .maybeSingle();
                etapa = dataLimpo;
            } else {
                etapa = data;
            }
        }
        
        res.json({
            success: true,
            telefone_buscado: telefone,
            telefone_limpo: telefoneLimpo,
            encontrado_em: Object.keys(results).filter(k => results[k]),
            dados: results,
            etapa: etapa
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar cliente:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============ ROTAS ADMIN ============

// 1. Teste do Z-API
app.get('/api/test/zapi', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const testPhone = '21974601812';
        const testMessage = '🧪 Teste de conexão Z-API - ' + new Date().toLocaleString('pt-BR');
        
        console.log(`📨 Testando Z-API para: ${testPhone}`);
        const result = await enviarWhatsApp(testPhone, testMessage);
        
        res.json({
            success: result,
            message: result ? '✅ Mensagem enviada com sucesso!' : '❌ Falha ao enviar mensagem',
            phone: testPhone,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erro no teste Z-API:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 2. Verificar cliente
app.get('/api/admin/verificar-cliente/:telefone', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const telefone = req.params.telefone;
        console.log(`🔍 Verificando cliente: ${telefone}`);
        
        // Buscar em clientes_ativos
        const { data: ativo, error: ativoError } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        // Buscar etapa
        let etapa = null;
        if (ativo) {
            const { data: etapaData } = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', telefone)
                .maybeSingle();
            etapa = etapaData;
        }
        
        res.json({
            success: true,
            telefone: telefone,
            cliente: ativo || null,
            etapa: etapa || null,
            encontrado: !!ativo
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar cliente:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 3. Notificar cliente
app.post('/api/admin/notificar-cliente', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { telefone, mensagem } = req.body;
        
        if (!telefone) {
            return res.status(400).json({ error: 'Telefone é obrigatório' });
        }
        
        console.log(`📨 Enviando notificação para: ${telefone}`);
        
        // Buscar cliente
        const { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        if (!cliente) {
            return res.status(404).json({ 
                error: 'Cliente não encontrado em clientes_ativos',
                telefone: telefone
            });
        }
        
        // Nome do cliente
        const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_') 
            ? cliente.nome.split(' ')[0] 
            : 'Cliente';
        
        // Mensagem padrão
        const texto = mensagem || `🎉 Olá ${nomeCliente}!\n\n` +
                     `Seu processo foi iniciado com sucesso na GetVisa Assessoria!\n\n` +
                     `📋 Status: Em andamento\n` +
                     `📍 Etapa atual: Formulário recebido\n\n` +
                     `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                     `📱 Dúvidas? Fale conosco pelo WhatsApp: https://wa.me/5521974601812\n\n` +
                     `🌟 Estamos aqui para ajudar você a realizar seu sonho de viajar!`;
        
        const enviado = await enviarWhatsApp(telefone, texto);
        
        res.json({
            success: true,
            telefone: telefone,
            cliente: cliente.nome,
            notificacao_enviada: enviado,
            mensagem: texto
        });
        
    } catch (error) {
        console.error('❌ Erro ao notificar cliente:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 4. Mover cliente com notificação (versão melhorada)
app.post('/api/painel/mover-com-notificacao', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { telefone, destino, enviar_notificacao } = req.body;
        
        if (!telefone || !destino) {
            return res.status(400).json({ error: 'Telefone e destino são obrigatórios' });
        }
        
        // Buscar em clientes_novos
        const { data: cliente, error } = await supabase
            .from('clientes_novos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente não encontrado em clientes_novos' });
        }
        
        let resultado = {};
        
        if (destino === 'ativo') {
            // Mover para ativo
            const { data, error: insertError } = await supabase
                .from('clientes_ativos')
                .insert({
                    telefone: cliente.telefone,
                    nome: cliente.nome,
                    criado_em: cliente.data_contato,
                    atualizado_em: new Date().toISOString()
                })
                .select()
                .single();
            
            if (insertError) {
                return res.status(500).json({ error: insertError.message });
            }
            
            resultado = data;
            
            // Criar etapa
            try {
                await criarEtapaInicial(cliente.telefone);
            } catch (err) {
                console.error('Erro ao criar etapa:', err);
            }
            
            // Enviar notificação
            if (enviar_notificacao !== false) {
                try {
                    const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_') 
                        ? cliente.nome.split(' ')[0] 
                        : 'Cliente';
                    
                    const mensagem = `🎉 Olá ${nomeCliente}!\n\n` +
                                   `Seu processo foi iniciado com sucesso na GetVisa Assessoria!\n\n` +
                                   `📋 Status: Em andamento\n` +
                                   `📍 Etapa atual: Formulário recebido\n\n` +
                                   `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                                   `📱 Dúvidas? Fale conosco pelo WhatsApp: https://wa.me/5521974601812\n\n` +
                                   `🌟 Estamos aqui para ajudar você a realizar seu sonho de viajar!`;
                    
                    await enviarWhatsApp(cliente.telefone, mensagem);
                    resultado.notificacao_enviada = true;
                } catch (err) {
                    console.error('Erro ao enviar notificação:', err);
                    resultado.notificacao_enviada = false;
                }
            }
            
            // Remover de clientes_novos
            await supabase.from('clientes_novos').delete().eq('telefone', telefone);
            
            res.json({
                success: true,
                message: 'Cliente movido para ATIVO com sucesso',
                cliente: resultado,
                notificacao: resultado.notificacao_enviada ? 'Enviada' : 'Não enviada'
            });
            
        } else {
            res.status(400).json({ error: 'Destino inválido. Use "ativo"' });
        }
        
    } catch (error) {
        console.error('❌ Erro ao mover cliente:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/health', function(req, res) { res.status(200).send('OK'); });
app.get('/ping', function(req, res) { res.status(200).send('ok'); });

app.listen(PORT, '0.0.0.0', function() {
    console.log('Servidor rodando na porta ' + PORT);
    console.log('Painel: https://app-vistos.onrender.com/painel.html');
    console.log('Webhook: https://app-vistos.onrender.com/api/webhook/zapi');
});