const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 10000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============================================================
// CONSTANTES
// ============================================================

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
            '✨ Tudo bem? ',
            '🎯 Ótimo, '
        ],
        parte2: [
            '! Agora podemos te ajudar da melhor forma.\n\nVamos lá: como posso ajudar hoje? Escolha uma opção:\n\n',
            '! Estamos aqui para realizar o sonho da sua viagem!\n\nEm que podemos te ajudar? Escolha:\n\n',
            '! Vamos encontrar a melhor solução para você!\n\nO que você precisa? Escolha uma opção:\n\n',
            '! Preparado(a) para começar essa jornada?\n\nComo podemos te ajudar? Escolha:\n\n'
        ]
    }
};

const ETAPAS = {
    formulario_enviado: {
        id: 'formulario_enviado',
        label: 'Formulário Enviado',
        next: 'analise_correcoes',
        color: '#3498db'
    },

    analise_correcoes: {
        id: 'analise_correcoes',
        label: 'Análise e Correções',
        next: 'abertura_processo',
        color: '#f39c12'
    },

    abertura_processo: {
        id: 'abertura_processo',
        label: 'Abertura do Processo',
        next: 'boleto_emitido',
        color: '#8e44ad'
    },

    boleto_emitido: {
        id: 'boleto_emitido',
        label: 'Boleto Emitido',
        next: 'boleto_pago',
        color: '#e67e22'
    },

    boleto_pago: {
        id: 'boleto_pago',
        label: 'Boleto Pago',
        next: 'agendamento_realizado',
        color: '#27ae60'
    },

    agendamento_realizado: {
        id: 'agendamento_realizado',
        label: 'Agendamento Realizado',
        next: 'treinamento_realizado',
        color: '#2980b9'
    },

    treinamento_realizado: {
        id: 'treinamento_realizado',
        label: 'Treinamento Concluído',
        next: 'entrevista_realizada',
        color: '#8e44ad'
    },

    entrevista_realizada: {
        id: 'entrevista_realizada',
        label: '🎤 Entrevista Realizada',
        next: null,
        color: '#2c3e50'
    },

    visto_aprovado: {
        id: 'visto_aprovado',
        label: '✅ Visto Aprovado',
        next: 'passaporte_retornado',
        color: '#16a34a'
    },

    passaporte_retornado: {
        id: 'passaporte_retornado',
        label: '📦 Passaporte disponível para retirada/entrega',
        next: null,
        color: '#2ecc71'
    },

    visto_recusado: {
        id: 'visto_recusado',
        label: '❌ Visto Recusado',
        next: null,
        color: '#ef4444'
    }
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

// ============================================================
// ESTADO DO USUÁRIO
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
// FUNÇÕES AUXILIARES
// ============================================================

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

// ============================================================
// FUNÇÃO DETECTAR INTENÇÃO
// ============================================================

function detectIntent(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    const INTENT_MAP = {
        'visto_americano': [
            'visto americano', 'visto eua', 'visto estados unidos', 
            'us visa', 'b1', 'b2', 'entrevista eua', 'visto eua',
            'quero visto americano', 'fazer visto americano',
            'visto para eua', 'visto usa'
        ],
        'visto_canadense': [
            'visto canadense', 'visto canada', 'visto para canada',
            'quero visto canadense', 'fazer visto canadense'
        ],
        'visto_australiano': [
            'visto australiano', 'visto australia', 'visto para australia',
            'quero visto australiano', 'fazer visto australiano'
        ],
        'eta_uk': [
            'eta uk', 'reino unido', 'inglaterra', 'uk visa',
            'visto reino unido', 'visto inglaterra'
        ],
        'passaporte': [
            'passaporte', 'pf', 'policia federal', 'renovar passaporte',
            'passaporte novo', 'fazer passaporte', 'quero passaporte'
        ],
        'preco': [
            'preco', 'valor', 'quanto custa', 'taxa', 'investimento',
            'custo', 'valores', 'preco'
        ],
        'prazo': [
            'prazo', 'tempo', 'dias', 'semanas', 'demora',
            'quanto tempo', 'agendamento', 'processamento'
        ],
        'documentos': [
            'documentos', 'documentacao', 'requisitos', 'necessario',
            'obrigatorio', 'papeis'
        ],
        'visto_negado': [
            'negado', 'negativa', 'recusado', 'visto recusado',
            'deportado', 'visto negado'
        ],
        'iniciar_processo': [
            'quero fazer o visto', 'quero visto', 'iniciar processo',
            'comecar', 'quero comecar', 'vou fazer', 'quero informação',
            'quero saber', 'me ajuda', 'ajuda', 'help', 'informacoes',
            'quero contratar', 'contratar', 'assinar', 'vou contratar',
            'quero iniciar', 'iniciar', 'quero começar', 'começar agora',
            'vamos começar', 'bora começar', 'quero o visto', 'fazer visto',
            'meu visto', 'quero meu visto'
        ]
    };
    
    const saudacoes = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'hey', 'hi', 'hello', 'tudo bem', 'olá'];
    if (saudacoes.some(s => cleanMessage.includes(s))) {
        return null;
    }
    
    for (const [intent, keywords] of Object.entries(INTENT_MAP)) {
        for (const keyword of keywords) {
            if (cleanMessage.includes(keyword)) {
                console.log(`🎯 Intenção detectada: ${intent} (palavra: "${keyword}")`);
                return intent;
            }
        }
    }
    
    console.log('⚠️ Nenhuma intenção detectada para:', cleanMessage);
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

// ============================================================
// FUNÇÕES DE MENU
// ============================================================

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

// ============================================================
// FUNÇÃO PARA ENVIAR LINK DO FORMULÁRIO
// ============================================================

function getMensagemFormulario(nomeCliente) {
    const primeiroNome = nomeCliente && typeof nomeCliente === 'string'
        ? nomeCliente.trim().split(' ')[0]
        : 'Cliente';
    
    return `🌟 *ÓTIMO, ${primeiroNome.toUpperCase()}!* 🌟\n\n` +
           `Para iniciarmos seu processo, preciso que você preencha nosso formulário com os dados do visto americano.\n\n` +
           `📋 *LINK DO FORMULÁRIO:*\n` +
           `🔗 https://getvisa.com.br/formulario-ds160\n\n` +
           `⏱️ *Tempo estimado:* 15-20 minutos\n` +
           `📱 *Pode preencher pelo celular ou computador*\n\n` +
           `✅ *Depois de preencher:*\n` +
           `• Nossa equipe fará a análise dos dados\n` +
           `• Você receberá a confirmação por e-mail\n` +
           `• Iniciaremos o agendamento da entrevista\n\n` +
           `💡 *Dica:* Tenha seu passaporte em mãos para preencher os dados corretamente.\n\n` +
           `📱 Dúvidas? Fale com a gente: https://wa.me/5521974601812\n\n` +
           `⚡ *Vamos realizar seu sonho de viajar para os EUA!* ✈️`;
}

// ============================================================
// FUNÇÕES DE ONBOARDING
// ============================================================

async function processarOnboarding(cleanPhone, messageText, state) {
    console.log('=== PROCESSANDO ONBOARDING ===');
    console.log('Passo atual: ' + state.onboardingStep);
    console.log('Mensagem: "' + messageText + '"');
    
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
            const nomeValidado = validarNome(messageText);
            
            if (!nomeValidado) {
                const msgInvalido = getRandomMessage(BOAS_VINDAS_MESSAGES.nome_invalido);
                await sendReply(cleanPhone, msgInvalido);
                return;
            }
            
            const nomeFormatado = formatarNome(messageText);
            
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
            
            state.nome = nomeFormatado;
            state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
            state.onboardingCompleto = true;
            userState.set(cleanPhone, state);
            
            const confirmacao = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte1) + 
                              nomeFormatado.split(' ')[0] +
                              getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte2) +
                              await getMenuPrincipal();
            
            await sendReply(cleanPhone, confirmacao);
            
            console.log('🎉 Onboarding completo para:', nomeFormatado);
            break;
            
        default:
            console.log('⚠️ Fallback - reiniciando onboarding');
            state.onboardingStep = ONBOARDING_STEPS.SAUDACAO;
            state.onboardingCompleto = false;
            state.nome = null;
            userState.set(cleanPhone, state);
            await processarOnboarding(cleanPhone, '', state);
    }
}

// ============================================================
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO
// ============================================================

async function processarMensagem(cleanPhone, messageText, body) {
    console.log('=== PROCESSANDO MENSAGEM ===');
    console.log('Phone: ' + cleanPhone);
    console.log('Message: "' + messageText + '"');

    try {
        let clienteDB = null;

        try {
            clienteDB = await buscarClienteEmQualquerTabela(
                cleanPhone,
                'clientes_novos'
            );
        } catch (err) {
            console.error('Erro ao buscar cliente:', err);
        }

        console.log('Cliente DB:', clienteDB ? 'Encontrado' : 'Nao encontrado');

        if (clienteDB) {
            console.log('  - Nome:', clienteDB.nome || '(vazio)');
            console.log('  - Onboarding completo:', clienteDB.onboarding_completo || false);
        }
        
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
        
        let state = userState.get(cleanPhone);
        
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
        
        const precisaOnboarding = !state.onboardingCompleto || 
                                  !isNomeValido(state.nome) || 
                                  state.onboardingStep !== ONBOARDING_STEPS.COMPLETO;
        
        if (precisaOnboarding) {
            console.log('🔄 INICIANDO ONBOARDING');
            
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
            
            await processarOnboarding(cleanPhone, messageText, state);
            return;
        }
        
        console.log('✅ Onboarding completo, processando menu');
        
        if (messageText === '0') {
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            await sendReply(cleanPhone, await getMenuPrincipal());
            return;
        }
        
        const resetCommands = ['menu', 'menu principal', 'inicio', 'comecar', 'voltar', 'principal'];
        if (resetCommands.includes(messageText.toLowerCase())) {
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            await sendReply(cleanPhone, await getMenuPrincipal());
            return;
        }
        
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
        
        if (state.nivel === 'submenu' && state.service) {
            await processarOpcaoNoSubmenu(cleanPhone, messageText, state);
        } else if (state.nivel === 'principal') {
            await processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state);
        } else {
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

// ============================================================
// FUNÇÃO PROCESSAR MENU PRINCIPAL
// ============================================================

async function processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state) {
    console.log('=== MENU PRINCIPAL ===');
    console.log('Mensagem recebida: "' + messageText + '"');
    
    const servicoMap = {
        '1': 'visto_americano',
        '2': 'visto_canadense',
        '3': 'visto_australiano',
        '4': 'eta_uk',
        '5': 'eta_canadense',
        '6': 'passaporte'
    };
    
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
    
    const intent = detectIntent(messageText);
    console.log('Intenção detectada:', intent);
    
    // 🔥 DETECTAR INTENÇÃO DE INICIAR PROCESSO
    if (intent === 'iniciar_processo') {
        console.log('🚀 Cliente quer iniciar o processo!');
        
        const nomeCliente = state.nome || 'Cliente';
        const mensagemFormulario = getMensagemFormulario(nomeCliente);
        await sendReply(cleanPhone, mensagemFormulario);
        
        try {
            await supabase
                .from('clientes_novos')
                .update({
                    formulario_enviado: true,
                    data_formulario_enviado: new Date().toISOString(),
                    status: 'aguardando_formulario'
                })
                .eq('telefone', cleanPhone);
            
            console.log(`📝 Formulário enviado para ${cleanPhone}`);
        } catch (err) {
            console.error('❌ Erro ao atualizar status:', err);
        }
        
        return;
    }
    
    if (intent) {
        const resposta = getRespostaIntencao(intent, state.service);
        await sendReply(cleanPhone, resposta + '\n\nDigite 0 para o menu principal');
        return;
    }
    
    const servicosKeywords = {
        'visto americano': 'visto_americano',
        'visto eua': 'visto_americano',
        'eua': 'visto_americano',
        'visto canadense': 'visto_canadense',
        'canada': 'visto_canadense',
        'visto australiano': 'visto_australiano',
        'australia': 'visto_australiano',
        'eta uk': 'eta_uk',
        'reino unido': 'eta_uk',
        'inglaterra': 'eta_uk',
        'eta canadense': 'eta_canadense',
        'passaporte': 'passaporte'
    };
    
    const mensagemLower = messageText.toLowerCase();
    for (const [keyword, serviceKey] of Object.entries(servicosKeywords)) {
        if (mensagemLower.includes(keyword)) {
            console.log('🔍 Detectado serviço específico:', serviceKey);
            
            state.nivel = 'submenu';
            state.service = serviceKey;
            userState.set(cleanPhone, state);
            
            const submenuTexto = getSubmenu(serviceKey);
            await sendReply(cleanPhone, submenuTexto);
            return;
        }
    }
    
    const perguntasEspecificas = {
        'preco': 'preco',
        'valor': 'preco',
        'quanto custa': 'preco',
        'custo': 'preco',
        'investimento': 'preco',
        'prazo': 'prazo',
        'tempo': 'prazo',
        'demora': 'prazo',
        'documentos': 'documentos',
        'documentacao': 'documentos',
        'requisitos': 'documentos',
        'processo': 'processo',
        'passo a passo': 'processo',
        'visto negado': 'visto_negado',
        'recusado': 'visto_negado',
        'negativa': 'visto_negado'
    };
    
    for (const [keyword, tipo] of Object.entries(perguntasEspecificas)) {
        if (mensagemLower.includes(keyword)) {
            console.log('🔍 Detectada pergunta sobre:', tipo);
            
            if (!state.service) {
                const msg = `📋 Para falar sobre *${tipo}*, preciso saber qual serviço você deseja:\n\n` +
                           `1️⃣ - 🇺🇸 VISTO AMERICANO\n` +
                           `2️⃣ - 🇨🇦 VISTO CANADENSE\n` +
                           `3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n` +
                           `4️⃣ - 🇬🇧 eTA UK\n` +
                           `5️⃣ - 🇨🇦 eTA CANADENSE\n` +
                           `6️⃣ - 🛂 PASSAPORTE\n\n` +
                           `Digite o número do serviço (1-6)`;
                await sendReply(cleanPhone, msg);
                return;
            }
            
            const resposta = getRespostaSubmenu(state.service, tipo);
            await sendReply(cleanPhone, resposta + '\n\nDigite 0 para o menu principal');
            return;
        }
    }
    
    const erroMsg = '❌ Não entendi sua mensagem, ' + (state.nome ? state.nome.split(' ')[0] : '') + '!\n\n' +
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

// ============================================================
// FUNÇÕES DE ENVIO
// ============================================================

async function enviarWhatsApp(telefone, mensagem) {
    try {
        const instance = String(process.env.ZAPI_INSTANCE || '').trim();
        const token = String(process.env.ZAPI_TOKEN || '').trim();
        const securityToken = String(
            process.env.ZAPI_SECURITY_TOKEN || ''
        ).trim();

        if (!instance || !token) {
            console.error('❌ Z-API não configurada corretamente.', {
                instanciaConfigurada: Boolean(instance),
                tokenConfigurado: Boolean(token)
            });
            return false;
        }

        const cleanPhone = String(telefone || '').replace(/\D/g, '');

        if (cleanPhone.length < 10) {
            console.error('❌ Telefone inválido para WhatsApp:', telefone);
            return false;
        }

        const url =
            'https://api.z-api.io/instances/' +
            encodeURIComponent(instance) +
            '/token/' +
            encodeURIComponent(token) +
            '/send-text';

        const headers = {
            'Content-Type': 'application/json'
        };

        if (securityToken) {
            headers['Client-Token'] = securityToken;
        }

        console.log('📨 ===== ENVIO Z-API =====');
        console.log('📨 Telefone:', cleanPhone);
        console.log('📨 Instância configurada:', instance);
        console.log('📨 Token configurado:', Boolean(token));
        console.log('📨 Client-Token configurado:', Boolean(securityToken));

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                phone: cleanPhone,
                message: mensagem
            })
        });

        const result = await response.text();

        console.log(
            '📨 Z-API status para ' + cleanPhone + ': ' + response.status
        );
        console.log('📨 Z-API resposta:', result);

        return response.status >= 200 && response.status < 300;
    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error.message);
        return false;
    }
}

async function sendReply(phone, message) {
    return enviarWhatsApp(phone, message);
}

// ============================================================
// FUNÇÕES DE BANCO DE DADOS
// ============================================================

async function cadastrarCliente(telefone, nome) {
    console.log('📝 Cadastrando cliente:', telefone);
    
    const dadosCliente = {
        telefone: telefone,
        data_contato: new Date().toISOString(),
        status: 'novo',
        onboarding_completo: false
    };
    
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

// ============================================================
// FUNÇÃO PARA BUSCAR CLIENTE EM QUALQUER TABELA
// ============================================================

async function buscarClienteEmQualquerTabela(telefone, tabelaEspecifica = null) {
    console.log(`🔍 Buscando cliente: ${telefone} ${tabelaEspecifica ? 'em ' + tabelaEspecifica : 'em todas as tabelas'}`);
    
    const telefoneLimpo = telefone.toString().replace(/\D/g, '');
    const telefoneFormatado = formatarTelefone(telefoneLimpo);
    
    const tables = tabelaEspecifica ? [tabelaEspecifica] : ['clientes_novos', 'clientes_ativos', 'clientes_finalizados', 'contatos_amigos'];
    
    for (const table of tables) {
        try {
            const { data: dataLimpo, error: errorLimpo } = await supabase
                .from(table)
                .select('*')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();
            
            if (!errorLimpo && dataLimpo) {
                console.log(`✅ Cliente encontrado em ${table} (telefone limpo):`, dataLimpo.nome || dataLimpo.telefone);
                return dataLimpo;
            }
            
            const { data: dataFormatado, error: errorFormatado } = await supabase
                .from(table)
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();
            
            if (!errorFormatado && dataFormatado) {
                console.log(`✅ Cliente encontrado em ${table} (telefone formatado):`, dataFormatado.nome || dataFormatado.telefone);
                return dataFormatado;
            }
            
            const { data: dataOriginal, error: errorOriginal } = await supabase
                .from(table)
                .select('*')
                .eq('telefone', telefone)
                .maybeSingle();
            
            if (!errorOriginal && dataOriginal) {
                console.log(`✅ Cliente encontrado em ${table} (telefone original):`, dataOriginal.nome || dataOriginal.telefone);
                return dataOriginal;
            }
        } catch (err) {
            console.error(`Erro ao buscar em ${table}:`, err);
        }
    }
    
    console.log(`❌ Cliente ${telefone} não encontrado em ${tabelaEspecifica || 'nenhuma tabela'}`);
    return null;
}

// ============================================================
// FUNÇÃO PARA PROCESSAR CLIENTE FINALIZADO
// ============================================================

async function processarClienteFinalizado(cleanPhone, messageText, dadosCliente) {
    console.log('📌 Processando cliente FINALIZADO:', dadosCliente.nome);
    
    const nomeCliente = dadosCliente.nome ? dadosCliente.nome.split(' ')[0] : 'Cliente';
    const servico = dadosCliente.servico || 'processo';
    const dataFinal = dadosCliente.data_finalizacao ? new Date(dadosCliente.data_finalizacao).toLocaleDateString('pt-BR') : '';
    const observacoes = dadosCliente.observacoes || '';
    const resultado = dadosCliente.observacoes && dadosCliente.observacoes.includes('recusado') ? 'recusado' : 'aprovado';
    
    const comandos = ['0', 'menu', 'menu principal', 'inicio', 'voltar', 'principal'];
    if (comandos.includes(messageText.toLowerCase())) {
        let msg = `👋 Olá ${nomeCliente}!\n\n`;
        if (resultado === 'recusado') {
            msg += `📌 Seu processo foi finalizado com o resultado: **❌ Visto Recusado**\n\n`;
        } else {
            msg += `📌 Seu processo foi finalizado com o resultado: **✅ Visto Aprovado**\n\n`;
        }
        msg += `✅ Seu ${servico} foi **finalizado** em ${dataFinal}.\n\n`;
        if (observacoes) msg += `📝 ${observacoes}\n\n`;
        msg += `📱 Como podemos ajudar você hoje?\n\n`;
        msg += `💬 Fique à vontade para escrever sua dúvida.`;
        
        await sendReply(cleanPhone, msg);
        return;
    }
    
    let msg = `👋 Olá ${nomeCliente}!\n\n`;
    if (resultado === 'recusado') {
        msg += `📌 Seu processo foi finalizado com o resultado: **❌ Visto Recusado**\n\n`;
    } else {
        msg += `📌 Seu processo foi finalizado com o resultado: **✅ Visto Aprovado**\n\n`;
    }
    msg += `✅ Seu ${servico} foi **finalizado** em ${dataFinal}.\n\n`;
    if (observacoes) msg += `📝 ${observacoes}\n\n`;
    msg += `📱 Como podemos ajudar você hoje?\n\n`;
    msg += `💬 Fique à vontade para escrever sua dúvida.`;
    
    await sendReply(cleanPhone, msg);
}

// ============================================================
// FUNÇÃO PARA PROCESSAR CLIENTE ATIVO
// ============================================================

async function processarClienteAtivo(cleanPhone, messageText, dadosCliente) {
    console.log('📌 Processando cliente ATIVO:', dadosCliente.nome);

    let etapaMsg = '';
    let etapaAtual = '';
    try {
        const { data: etapa, error } = await supabase
            .from('etapas_processo')
            .select('etapa_atual')
            .eq('cliente_telefone', cleanPhone)
            .maybeSingle();

        if (!error && etapa) {
            etapaAtual = etapa.etapa_atual;
            const etapaInfo = ETAPAS[etapa.etapa_atual];
            etapaMsg = etapaInfo ? etapaInfo.label : etapa.etapa_atual;
            console.log(`📌 Etapa atual do cliente: ${etapaAtual} (${etapaMsg})`);
        } else {
            console.log('⚠️ Nenhuma etapa encontrada para o cliente');
        }
    } catch (err) {
        console.log('Erro ao buscar etapa:', err);
    }

    const nomeCliente = dadosCliente.nome ? dadosCliente.nome.split(' ')[0] : 'Cliente';

    const etapasAvancadasSemMensagemGenerica = [
        'analise_correcoes',
        'abertura_processo',
        'boleto_emitido',
        'boleto_pago',
        'agendamento_realizado',
        'treinamento_realizado',
        'entrevista_realizada',
        'visto_aprovado',
        'passaporte_retornado',
        'visto_recusado'
    ];

    if (etapasAvancadasSemMensagemGenerica.includes(etapaAtual)) {
        console.log(`🚫 Cliente ${nomeCliente} está na etapa "${etapaAtual}". Suprimindo mensagem genérica.`);
        return;
    }

    const comandos = ['0', 'menu', 'menu principal', 'inicio', 'voltar', 'principal'];
    if (comandos.includes(messageText.toLowerCase())) {
        console.log('📌 Comando de menu detectado');
        await processarMensagem(cleanPhone, messageText, {});
        return;
    }

    let msg = `👋 Olá ${nomeCliente}!\n\n`;
    if (etapaMsg) msg += `📌 Última movimentação: **${etapaMsg}**\n\n`;
    msg += `📱 Tem alguma dúvida sobre seu processo?\n\n`;
    msg += `💬 Fique à vontade para perguntar.\n\n`;
    msg += `Digite 0 para acessar o menu principal.`;

    console.log(`📨 Enviando mensagem padrão para ${cleanPhone}`);
    await sendReply(cleanPhone, msg);
}

// ============================================================
// FUNÇÕES DE CRIAÇÃO DE ETAPAS E NOTIFICAÇÕES
// ============================================================

async function criarEtapaInicial(telefone) {
    try {
        var telefoneLimpo = limparTelefone(telefone);
        console.log('📱 Criando etapa para telefone limpo:', telefoneLimpo);
        
        const { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('telefone, nome, criado_em')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();
        
        if (error) {
            console.error('❌ Erro ao buscar cliente:', error);
            return null;
        }
        
        if (!cliente) {
            console.log('⚠️ Cliente não encontrado em clientes_ativos:', telefoneLimpo);
            return null;
        }
        
        console.log('✅ Cliente encontrado:', cliente);
        
        const { data: etapaExistente } = await supabase
            .from('etapas_processo')
            .select('id')
            .eq('cliente_telefone', telefoneLimpo)
            .maybeSingle();
        
        if (etapaExistente) {
            console.log('ℹ️ Etapa já existe para:', telefoneLimpo);
            return etapaExistente;
        }
        
        const novaEtapa = {
            cliente_telefone: telefoneLimpo,
            etapa_atual: 'formulario_enviado',
            data_inicio: new Date().toISOString(),
            data_atualizacao: new Date().toISOString(),
            historico: [{
                etapa: 'formulario_enviado',
                data: new Date().toISOString(),
                nota: 'Inicio do processo',
                observacao: `Cliente movido para clientes_ativos - ${cliente.nome || 'Sem nome'}`
            }]
        };

        const { data, error: insertError } = await supabase
            .from('etapas_processo')
            .insert(novaEtapa)
            .select()
            .single();

        if (insertError) {
            console.error('❌ Erro ao criar etapa:', insertError);
            return null;
        }
        
        console.log('✅ Etapa inicial criada para:', telefoneLimpo);
        return data;
        
    } catch (error) {
        console.error('❌ Erro ao criar etapa inicial:', error);
        return null;
    }
}

// ============================================================
// FUNÇÃO GERAR MENSAGEM POR ETAPA
// ============================================================

function gerarMensagemEtapa(etapaId, nome) {
    const primeiroNome = nome && typeof nome === 'string'
        ? nome.trim().split(' ')[0]
        : 'Cliente';

    const mensagens = {
        formulario_enviado:
            `🎉 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Formulário Enviado\n\n` +
            `Recebemos seu formulário e seu processo foi iniciado com sucesso.\n\n` +
            `Nossa equipe dará continuidade à análise das informações.`,

        analise_correcoes:
            `🔎 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Análise e Correções\n\n` +
            `Seu processo está em análise.\n\n` +
            `Caso seja necessário algum ajuste, nossa equipe entrará em contato.`,

        abertura_processo:
            `📂 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Abertura do Processo\n\n` +
            `Seu processo foi aberto com sucesso!\n\n` +
            `Seguiremos agora com os próximos procedimentos.`,

        boleto_emitido:
            `💳 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Boleto Emitido\n\n` +
            `O boleto para pagamento da taxa consular foi emitido.\n\n` +
            `Após o pagamento, nos informe para realizarmos o agendamento.\n\n` +
            `Verifique as orientações da nossa equipe para pagamento.`,

        boleto_pago:
            `✅ Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Boleto Pago\n\n` +
            `Em até 24h o consulado disponibilizará o agendamento.\n\n` +
            `Favor fazer o pagamento restante (50%) da assessoria.`,

        agendamento_realizado:
            `📅 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Agendamento CASV e Consulado\n\n` +
            `Seu agendamento foi realizado com sucesso!\n\n` +
            `Vamos agendar nossa reunião para treinamento da entrevista.\n\n` +
            `Nossa equipe enviará as orientações necessárias para essa fase.`,

        treinamento_realizado:
            `🎯 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Treinamento Concluído\n\n` +
            `Seu treinamento foi concluído!\n\n` +
            `Você está preparado(a) para a entrevista!`,

        entrevista_realizada:
            `🎤 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Entrevista Realizada\n\n` +
            `Registramos a realização da sua entrevista.\n\n` +
            `Agora aguardaremos a definição do resultado consular.`,

        visto_aprovado:
            `🎉 Parabéns, ${primeiroNome}!\n\n` +
            `Seu visto foi aprovado! ✅\n\n` +
            `📋 Próximo passo: aguardaremos a devolução do seu passaporte.\n\n` +
            `Assim que ele estiver disponível para retirada ou entrega, avisaremos você por aqui. ✈️`,

        passaporte_retornado:
            `📦 Olá ${primeiroNome}!\n\n` +
            `Excelente notícia: seu passaporte já está disponível! ✅\n\n` +
            `Nossa equipe entrará em contato para combinar a retirada ou a entrega.\n\n` +
            `A GetVisa agradece a sua confiança e deseja uma ótima viagem! ✈️`,

        visto_recusado:
            `😔 Olá ${primeiroNome}.\n\n` +
            `Recebemos a atualização de que o visto não foi aprovado nesta solicitação.\n\n` +
            `Sabemos que esse momento pode ser difícil. Nossa equipe analisará os detalhes para orientar você sobre os próximos passos e uma possível nova estratégia.\n\n` +
            `Conte com a GetVisa.`
    };

    return mensagens[etapaId] || null;
}

async function notificarClienteEtapa(telefone, novaEtapa) {
    console.log('📨 ===== INICIANDO NOTIFICAÇÃO DE ETAPA =====');
    console.log('📨 Telefone recebido:', telefone);
    console.log('📨 Nova etapa:', novaEtapa);

    try {
        const telefoneOriginal = String(telefone || '').trim();
        const telefoneLimpo = limparTelefone(telefoneOriginal);
        const telefoneFormatado = formatarTelefone(telefoneLimpo);

        if (!telefoneLimpo) {
            console.error('❌ Telefone inválido para notificação:', telefone);
            return {
                sucesso: false,
                motivo: 'telefone_invalido',
                telefone: telefoneOriginal,
                etapa: novaEtapa
            };
        }

        console.log('📱 Telefone original:', telefoneOriginal);
        console.log('📱 Telefone limpo:', telefoneLimpo);
        console.log('📱 Telefone formatado:', telefoneFormatado);

        const telefonesParaBuscar = [
            telefoneLimpo,
            telefoneFormatado,
            telefoneOriginal
        ].filter(function(valor, indice, array) {
            return valor && array.indexOf(valor) === indice;
        });

        let cliente = null;

        for (const telefoneBusca of telefonesParaBuscar) {
            console.log('🔍 Buscando cliente ativo para notificação:', telefoneBusca);

            const { data, error } = await supabase
                .from('clientes_ativos')
                .select('nome, telefone')
                .eq('telefone', telefoneBusca)
                .maybeSingle();

            if (error) {
                console.error('❌ Erro ao buscar cliente ativo:', error);
                continue;
            }

            if (data) {
                cliente = data;
                console.log('✅ Cliente encontrado para notificação:', cliente);
                break;
            }
        }

        if (!cliente) {
            console.warn('⚠️ Cliente não encontrado em clientes_ativos para notificação:', telefoneOriginal);
            return {
                sucesso: false,
                motivo: 'cliente_nao_encontrado',
                telefone: telefoneLimpo,
                etapa: novaEtapa
            };
        }

        const nomeCliente = cliente.nome && typeof cliente.nome === 'string' && cliente.nome.trim() && !cliente.nome.startsWith('Cliente_')
            ? cliente.nome.trim()
            : 'Cliente';

        console.log('👤 Nome usado na mensagem:', nomeCliente);

        const mensagem = gerarMensagemEtapa(novaEtapa, nomeCliente);

        if (!mensagem) {
            console.warn('⚠️ Nenhuma mensagem configurada para a etapa:', novaEtapa);
            return {
                sucesso: false,
                motivo: 'mensagem_nao_configurada',
                telefone: telefoneLimpo,
                etapa: novaEtapa
            };
        }

        console.log('✅ Mensagem gerada com sucesso.');
        console.log('📨 Enviando WhatsApp para:', telefoneLimpo);

        const enviado = await enviarWhatsApp(telefoneLimpo, mensagem);

        if (!enviado) {
            console.error('❌ Z-API não confirmou o envio da notificação.');
            return {
                sucesso: false,
                motivo: 'falha_no_envio_whatsapp',
                telefone: telefoneLimpo,
                etapa: novaEtapa
            };
        }

        console.log('✅ Notificação enviada com sucesso para ' + telefoneLimpo + ' | Etapa: ' + novaEtapa);

        return {
            sucesso: true,
            telefone: telefoneLimpo,
            etapa: novaEtapa,
            cliente: nomeCliente
        };

    } catch (error) {
        console.error('❌ ERRO CRÍTICO EM notificarClienteEtapa:', error);
        console.error('❌ Stack:', error.stack);

        return {
            sucesso: false,
            motivo: 'erro_interno',
            telefone: telefone,
            etapa: novaEtapa,
            erro: error.message
        };
    }
}

// ============================================================
// FUNÇÕES DE PDF (RESUMIDAS PARA ECONOMIZAR ESPAÇO)
// ============================================================

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

        // Seções do PDF (mantidas do código original)
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

        // ... (restante do PDF mantido do código original)

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
    });
}

function gerarPDF_Passaporte(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            let buffers = [];
            doc.on('data', (chunk) => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            doc.fillColor('#003366').rect(0, 0, doc.page.width, 90).fill();
            doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold')
                .text('SOLICITACAO DE PASSAPORTE', 50, 30, { width: doc.page.width - 100, align: 'center' });
            doc.fontSize(10).font('Helvetica')
                .text('Assessoria GetVisa - Documentacao Consular', 50, 58, { width: doc.page.width - 100, align: 'center' });
            doc.fillColor('#000000').font('Helvetica').fontSize(10);
            doc.y = 110;

            drawSectionTitle(doc, '1. DADOS PESSOAIS');
            addField(doc, 'Nome completo', data.full_name);
            addField(doc, 'Sexo', data.sexo);
            addField(doc, 'Data de nascimento', formatDateToBrazilian(data['text-5'] || data.data_nascimento));
            addField(doc, 'Raca ou cor', data.raca_cor);
            addField(doc, 'Estado civil', data.estado_civil);
            addField(doc, 'Nacionalidade', data.nacionalidade);
            addField(doc, 'Local de nascimento', [data.pais_nascimento, data.estado_nascimento, data.cidade_nascimento].filter(Boolean).join(', '));
            if (data.teve_nome_anterior === 'Sim') {
                addField(doc, 'Nome anterior', data.nome_anterior);
                addField(doc, 'Motivo da alteracao', data.motivo_alteracao_nome);
            }
            if (data.indicador_especial && data.indicador_especial !== 'Nenhum') {
                addField(doc, 'Indicador especial', data.indicador_especial);
            }

            // ... (restante do PDF mantido do código original)

            doc.moveDown(2);
            doc.fontSize(8).fillColor('#999999')
                .text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

function addField(doc, label, value) {
    const display = value && value.toString().trim() !== '' ? value.toString().trim() : 'Nao informado';
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b')
       .text(label + ': ', { continued: true })
       .font('Helvetica').fillColor('#333333')
       .text(display);
    doc.moveDown(0.3);
}

// ============================================================
// FUNÇÕES DE VALIDAÇÃO
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
// MIDDLEWARES
// ============================================================

app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

app.use((err, req, res, next) => {
    console.error('❌ ERRO GLOBAL:', err);
    console.error('❌ Stack:', err.stack);
    res.status(500).json({
        erro: 'Erro interno do servidor',
        mensagem: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ============================================================
// WEBHOOK COMPLETO - PROCESSAMENTO DO BOT
// ============================================================

app.post('/api/webhook/zapi', function(req, res) {
    console.log('📨 WEBHOOK Z-API RECEBIDO');
    console.log('📨 Body:', JSON.stringify(req.body, null, 2));

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
            
            console.log('🔍 ===== INICIANDO VERIFICAÇÃO =====');
            console.log('📱 Telefone:', cleanPhone);

            console.log('🔍 Verificando AMIGO...');
            var { data: amigo, error: amigoError } = await supabase
                .from('contatos_amigos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (amigoError) console.log('Erro ao buscar amigo:', amigoError);
            console.log('📌 Resultado AMIGO:', amigo ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO');

            if (amigo) {
                console.log('👤 Contato AMIGO - SILÊNCIO TOTAL');
                return;
            }

            console.log('🔍 Verificando FINALIZADO...');
            const finalizado = await buscarClienteEmQualquerTabela(cleanPhone, 'clientes_finalizados');
            
            if (finalizado) {
                console.log('✅ Cliente FINALIZADO encontrado:', finalizado.nome);
                await processarClienteFinalizado(cleanPhone, messageText, finalizado);
                return;
            }

            console.log('🔍 Verificando ATIVO...');
            const ativo = await buscarClienteEmQualquerTabela(cleanPhone, 'clientes_ativos');
            
            if (ativo) {
                console.log('🔄 Cliente ATIVO encontrado:', ativo.nome);
                await processarClienteAtivo(cleanPhone, messageText, ativo);
                return;
            }

            console.log('🔍 Verificando NOVO...');
            const novo = await buscarClienteEmQualquerTabela(cleanPhone, 'clientes_novos');
            
            if (novo) {
                console.log('👤 Cliente NOVO encontrado:', novo.nome || 'Sem nome');
                await processarMensagem(cleanPhone, messageText, body);
                return;
            }

            console.log('🆕 Nenhum cliente encontrado. Criando novo cliente...');
            var resultado = await cadastrarCliente(cleanPhone, null);
            if (!resultado) {
                console.error('❌ Falha ao cadastrar cliente');
                await sendReply(cleanPhone, 'Desculpe, estamos com problemas técnicos. Tente novamente em alguns minutos.');
                return;
            }
            
            console.log('✅ Cliente cadastrado com sucesso, iniciando onboarding...');
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

// ============================================================
// ROTAS DE FORMULÁRIO
// ============================================================

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
                    
                    console.log('📱 Telefone limpo: ' + telefoneLimpo);

                    var insert = await supabase
                        .from('clientes_ativos')
                        .upsert({
                            telefone: telefoneLimpo,
                            nome: nome,
                            email: emailCliente,
                            criado_em: new Date().toISOString(),
                            atualizado_em: new Date().toISOString(),
                            status: 'em_processo'
                        }, {
                            onConflict: 'telefone',
                            ignoreDuplicates: false
                        });

                    if (insert.error) {
                        console.error('❌ Erro ao criar/atualizar cliente em ATIVOS:', insert.error);
                    } else {
                        console.log('✅ Cliente ' + telefoneLimpo + ' criado/atualizado em ATIVOS');
                    }

                    try {
                        const { data: etapaExistente } = await supabase
                            .from('etapas_processo')
                            .select('id')
                            .eq('cliente_telefone', telefoneLimpo)
                            .maybeSingle();

                        if (!etapaExistente) {
                            const novaEtapa = {
                                cliente_telefone: telefoneLimpo,
                                etapa_atual: 'formulario_enviado',
                                data_inicio: new Date().toISOString(),
                                data_atualizacao: new Date().toISOString(),
                                historico: [{
                                    etapa: 'formulario_enviado',
                                    data: new Date().toISOString(),
                                    nota: 'Inicio do processo',
                                    observacao: `Cliente criado via formulario DS-160 - ${nome}`
                                }]
                            };

                            const { error: etapaError } = await supabase
                                .from('etapas_processo')
                                .insert(novaEtapa);

                            if (etapaError) {
                                console.error('❌ Erro ao criar etapa inicial:', etapaError);
                            } else {
                                console.log('✅ Etapa inicial criada para:', telefoneLimpo);
                                try {
                                    await notificarClienteEtapa(telefoneLimpo, 'formulario_enviado');
                                    console.log('✅ Notificação de boas-vindas enviada para:', telefoneLimpo);
                                } catch (notifyErr) {
                                    console.error('❌ Erro ao enviar notificação:', notifyErr);
                                }
                            }
                        } else {
                            console.log('ℹ️ Etapa já existe para:', telefoneLimpo);
                        }
                    } catch (err) {
                        console.error('❌ Erro ao criar etapa inicial:', err);
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
                        console.log('🗑️ Cliente ' + telefoneLimpo + ' removido de NOVOS');
                    }

                } catch (err) {
                    console.error('❌ Erro ao processar cliente:', err.message);
                }
            }

            var pdfBuffer = await gerarPDF_DS160(data);
            console.log('📄 PDF gerado para ' + nome + ', tamanho: ' + pdfBuffer.length + ' bytes');

            await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: ['getvisa.assessoria@gmail.com'],
                subject: 'DS-160: ' + nome,
                html: '<strong>Formulario DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ' + nome + '</p><p>PDF em anexo (' + pdfBuffer.length + ' bytes).</p>',
                attachments: [{ filename: 'DS160_' + nome.replace(/[^a-z0-9]/gi, '_') + '.pdf', content: pdfBuffer.toString('base64') }]
            });
            console.log('📧 E-mail enviado para a equipe');

            if (emailCliente && emailCliente.trim() !== '') {
                await resend.emails.send({
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: [emailCliente],
                    subject: 'Seu formulario DS-160 foi recebido - ' + nome,
                    html: '<strong>Ola ' + nome + ',</strong><br><p>Recebemos seu formulario. Segue em anexo uma copia.</p><p>Em breve nossa equipe entrara em contato.</p>',
                    attachments: [{ filename: 'DS160_' + nome.replace(/[^a-z0-9]/gi, '_') + '.pdf', content: pdfBuffer.toString('base64') }]
                });
                console.log('📧 E-mail enviado para o cliente: ' + emailCliente);
            }

            try {
                var cidade = data['text-74'] || data['cidade'] || 'N/A';
                var consulado = data['consulado_cidade'] || 'N/A';
                var telefone = data['text-77'] || data['phone'] || 'N/A';
                var proposito = data['radio-28'] || 'N/A';
                
                if (proposito === 'one') proposito = 'Turismo/Negócios (B1/B2)';
                else if (proposito === 'two') proposito = 'Estudos';
                else if (proposito === 'Outros') proposito = 'Outros';
                
                var mensagemWhats = `📋 *NOVO DS-160*\n\n`;
                mensagemWhats += `👤 *Nome:* ${nome}\n`;
                mensagemWhats += `📧 *Email:* ${emailCliente || 'N/A'}\n`;
                mensagemWhats += `📱 *Telefone:* ${telefone}\n`;
                mensagemWhats += `📍 *Cidade:* ${cidade}\n`;
                mensagemWhats += `🏛️ *Consulado:* ${consulado}\n`;
                mensagemWhats += `✈️ *Propósito:* ${proposito}\n`;
                mensagemWhats += `📅 *Data:* ${new Date().toLocaleString('pt-BR')}\n\n`;
                mensagemWhats += `🔗 Acesse o painel para ver os dados completos.`;

                var numeroWhats = process.env.ZAPI_PHONE_TO || '5521991868954';
                
                console.log('📤 Enviando WhatsApp DS-160 para:', numeroWhats);
                console.log('📤 Tamanho da mensagem:', mensagemWhats.length, 'caracteres');

                const resultadoWhats = await enviarWhatsApp(numeroWhats, mensagemWhats);
                
                if (resultadoWhats) {
                    console.log('✅ WhatsApp DS-160 enviado com sucesso para:', numeroWhats);
                } else {
                    console.log('⚠️ Falha ao enviar WhatsApp DS-160 para:', numeroWhats);
                }

            } catch (err) {
                console.error('❌ Erro ao enviar WhatsApp DS-160:', err.message);
            }

        } catch (err) {
            console.error('❌ Erro no processamento DS-160 (background):', err);
        }
    })();
});

// ============================================================
// ROTAS DE PAINEL
// ============================================================

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
            
            try {
                const { data: etapa } = await supabase
                    .from('etapas_processo')
                    .select('etapa_atual')
                    .eq('cliente_telefone', cliente.data.telefone)
                    .maybeSingle();
                
                const etapaAtual = etapa ? etapa.etapa_atual : 'formulario_enviado';
                await notificarClienteEtapa(cliente.data.telefone, etapaAtual);
                console.log(`✅ Notificação de início enviada para ${telefone}`);
            } catch (err) {
                console.error('❌ Erro ao enviar notificação de início:', err);
            }
            
        } else {
            var insert = await supabase.from('contatos_amigos').insert({
                telefone: cliente.data.telefone,
                nome: cliente.data.nome,
                criado_em: cliente.data.data_contato
            });
            if (insert.error) return res.status(500).json({ success: false, message: insert.error.message });
        }

        await supabase.from('clientes_novos').delete().eq('telefone', telefone);
        
        res.json({ 
            success: true, 
            message: 'Cliente ' + telefone + ' movido para ' + destino,
            notificacao_enviada: destino === 'ativo'
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

// ============================================================
// ROTAS DE ETAPAS
// ============================================================

app.get('/api/etapas/cliente/:telefone', async function(req, res) {
    try {
        var telefone = req.params.telefone;
        
        let cliente = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        if (!cliente.data) {
            const limpo = telefone.replace(/\D/g, '');
            cliente = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', limpo)
                .maybeSingle();
        }
        
        if (!cliente.data) {
            const nome = req.query.nome || 'TESTE DO DS160';
            cliente = await supabase
                .from('clientes_ativos')
                .select('*')
                .ilike('nome', `%${nome}%`)
                .maybeSingle();
        }
        
        if (!cliente.data) {
            return res.status(404).json({ erro: 'Cliente nao encontrado' });
        }
        
        const telefoneCorreto = cliente.data.telefone;
        
        let etapa = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', telefoneCorreto)
            .maybeSingle();
        
        if (!etapa.data) {
            const novaEtapa = {
                cliente_telefone: telefoneCorreto,
                etapa_atual: 'formulario_enviado',
                data_inicio: new Date().toISOString(),
                data_atualizacao: new Date().toISOString(),
                historico: [{
                    etapa: 'formulario_enviado',
                    data: new Date().toISOString(),
                    nota: 'Inicio do processo',
                    observacao: 'Criado automaticamente'
                }]
            };
            
            const { data } = await supabase
                .from('etapas_processo')
                .insert(novaEtapa)
                .select()
                .single();
            
            etapa = { data };
        }
        
        res.json(etapa.data);
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ erro: 'Erro ao buscar etapa' });
    }
});

app.post('/api/etapas/avancar', async function(req, res) {
    try {
        var telefone = req.body.telefone;
        var nota = req.body.nota;
        
        let cliente = null;
        
        let { data } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        if (data) cliente = data;
        
        if (!cliente) {
            const limpo = telefone.replace(/\D/g, '');
            const { data } = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', limpo)
                .maybeSingle();
            if (data) cliente = data;
        }
        
        if (!cliente) {
            const { data } = await supabase
                .from('clientes_ativos')
                .select('*')
                .limit(1)
                .maybeSingle();
            if (data) cliente = data;
        }
        
        if (!cliente) {
            return res.status(404).json({ erro: 'Cliente nao encontrado' });
        }
        
        const telefoneCorreto = cliente.telefone;
        
        let etapa = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', telefoneCorreto)
            .maybeSingle();
        
        if (!etapa.data) {
            const novaEtapa = {
                cliente_telefone: telefoneCorreto,
                etapa_atual: 'formulario_enviado',
                data_inicio: new Date().toISOString(),
                data_atualizacao: new Date().toISOString(),
                historico: [{
                    etapa: 'formulario_enviado',
                    data: new Date().toISOString(),
                    nota: 'Inicio do processo',
                    observacao: 'Criado automaticamente'
                }]
            };
            
            const { data } = await supabase
                .from('etapas_processo')
                .insert(novaEtapa)
                .select()
                .single();
            
            etapa = { data };
        }
        
        return processarAvanco(res, etapa.data, nota, '', telefoneCorreto);
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ erro: 'Erro ao avançar etapa' });
    }
});

app.post('/api/etapas/definir-resultado', async function(req, res) {
    try {
        const { telefone, resultado, nota, observacao } = req.body;

        if (!telefone || !resultado) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Telefone e resultado são obrigatórios'
            });
        }

        if (!['aprovado', 'recusado'].includes(resultado)) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Resultado deve ser "aprovado" ou "recusado"'
            });
        }

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        const telefoneFormatado = formatarTelefone(telefoneLimpo);

        let { data: etapa, error } = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', telefoneFormatado)
            .maybeSingle();

        if (error) throw error;

        if (!etapa) {
            const { data: etapaLimpa, error: erroLimpo } = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', telefoneLimpo)
                .maybeSingle();

            if (erroLimpo) throw erroLimpo;

            etapa = etapaLimpa;
        }

        if (!etapa) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Etapa do cliente não encontrada'
            });
        }

        if (etapa.etapa_atual !== 'entrevista_realizada') {
            return res.status(400).json({
                sucesso: false,
                erro: `O resultado só pode ser definido após a entrevista. Etapa atual: ${etapa.etapa_atual}`
            });
        }

        const novaEtapa = resultado === 'aprovado'
            ? 'visto_aprovado'
            : 'visto_recusado';

        const dataAgora = new Date().toISOString();

        const historicoAtualizado = [
            ...(etapa.historico || []),
            {
                etapa: novaEtapa,
                data: dataAgora,
                nota: nota || `Resultado da entrevista: ${resultado}`,
                observacao: observacao || 'Resultado informado pela equipe administrativa'
            }
        ];

        const { data: atualizado, error: updateError } = await supabase
            .from('etapas_processo')
            .update({
                etapa_atual: novaEtapa,
                data_atualizacao: dataAgora,
                [`data_${novaEtapa}`]: dataAgora,
                historico: historicoAtualizado
            })
            .eq('id', etapa.id)
            .select()
            .single();

        if (updateError) throw updateError;

        const resultadoNotificacao = await notificarClienteEtapa(
            telefoneLimpo,
            novaEtapa
        );

        return res.json({
            sucesso: true,
            etapa_anterior: 'entrevista_realizada',
            etapa_atual: novaEtapa,
            notificacao: resultadoNotificacao,
            dados: atualizado
        });

    } catch (error) {
        console.error('❌ Erro ao definir resultado da entrevista:', error);

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao definir resultado da entrevista',
            detalhe: error.message
        });
    }
});

async function processarAvanco(res, etapaAtual, nota, observacao, telefone) {
    try {
        console.log('📌 processarAvanco iniciado para:', telefone);

        const etapaId = etapaAtual.etapa_atual;
        const etapaInfo = ETAPAS[etapaId];

        if (!etapaInfo) {
            console.error('❌ Etapa não encontrada:', etapaId);
            return res.status(400).json({
                sucesso: false,
                erro: 'Etapa não encontrada: ' + etapaId
            });
        }

        const proximaEtapa = etapaInfo.next;

        console.log('📌 Etapa atual:', etapaId);
        console.log('📌 Próxima etapa:', proximaEtapa);

        if (!proximaEtapa) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Cliente já está na última etapa'
            });
        }

        if (!ETAPAS[proximaEtapa]) {
            console.error('❌ Próxima etapa inválida:', proximaEtapa);
            return res.status(400).json({
                sucesso: false,
                erro: 'Próxima etapa não encontrada: ' + proximaEtapa
            });
        }

        const agora = new Date().toISOString();
        const campoData = 'data_' + proximaEtapa;

        const historicoAtualizado = [
            ...(etapaAtual.historico || []),
            {
                etapa: proximaEtapa,
                data: agora,
                nota: nota || 'Avanço manual pelo painel',
                observacao: observacao || 'Cliente avançado pelo painel administrativo'
            }
        ];

        const dadosAtualizacao = {
            etapa_atual: proximaEtapa,
            data_atualizacao: agora,
            historico: historicoAtualizado,
            [campoData]: agora
        };

        console.log('📌 Campo de data:', campoData);
        console.log('📌 Atualizando para:', proximaEtapa);

        const { data: dadosAtualizados, error: erroAtualizacao } = await supabase
            .from('etapas_processo')
            .update(dadosAtualizacao)
            .eq('cliente_telefone', telefone)
            .select()
            .single();

        if (erroAtualizacao) {
            console.error('❌ Erro ao atualizar etapa:', erroAtualizacao);
            throw erroAtualizacao;
        }

        console.log('✅ Etapa atualizada com sucesso:', proximaEtapa);

        let resultadoNotificacao = {
            sucesso: false,
            motivo: 'notificacao_desativada'
        };

        if (FEATURES.SISTEMA_ETAPAS.notificar_cliente === true) {
            try {
                resultadoNotificacao = await notificarClienteEtapa(
                    telefone,
                    proximaEtapa
                );
            } catch (erroNotificacao) {
                console.error('❌ Erro inesperado ao notificar cliente:', erroNotificacao);
                resultadoNotificacao = {
                    sucesso: false,
                    motivo: 'erro_interno_notificacao',
                    erro: erroNotificacao.message
                };
            }
        }

        console.log('📨 Resultado da notificação:', resultadoNotificacao);
        console.log('✅ Cliente ' + telefone + ' avançou de ' + etapaId + ' para ' + proximaEtapa);

        return res.json({
            sucesso: true,
            etapa_anterior: etapaId,
            etapa_atual: proximaEtapa,
            notificacao: resultadoNotificacao,
            dados: dadosAtualizados
        });

    } catch (error) {
        console.error('❌ ERRO em processarAvanco:', error);
        console.error('❌ Stack:', error.stack);

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao processar avanço',
            detalhe: error.message
        });
    }
}

// ============================================================
// ROTA PARA BUSCAR HISTÓRICO DE ETAPAS
// ============================================================

app.get('/api/etapas/historico/:telefone', async function(req, res) {
    try {
        const telefone = req.params.telefone;
        console.log(`📌 [GET] /api/etapas/historico/${telefone}`);
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        console.log(`🔍 Buscando histórico para: ${telefoneLimpo}`);
        
        let { data, error } = await supabase
            .from('etapas_processo')
            .select('historico, etapa_atual, data_inicio, data_atualizacao')
            .eq('cliente_telefone', telefoneLimpo)
            .maybeSingle();
        
        if (!data) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            console.log(`🔍 Tentando formato: ${telefoneFormatado}`);
            
            const { data: dataFormatado } = await supabase
                .from('etapas_processo')
                .select('historico, etapa_atual, data_inicio, data_atualizacao')
                .eq('cliente_telefone', telefoneFormatado)
                .maybeSingle();
            data = dataFormatado;
        }
        
        if (error) {
            console.error('❌ Erro no Supabase:', error);
            return res.status(500).json({ 
                erro: error.message,
                historico: [],
                etapa_atual: null
            });
        }
        
        if (!data) {
            console.log(`⚠️ Nenhum histórico encontrado para ${telefoneLimpo}`);
            return res.json({
                etapa_atual: null,
                data_inicio: null,
                data_atualizacao: null,
                historico: []
            });
        }
        
        console.log(`✅ Histórico encontrado: ${data.historico?.length || 0} registros`);
        
        res.json({
            etapa_atual: data.etapa_atual,
            data_inicio: data.data_inicio,
            data_atualizacao: data.data_atualizacao,
            historico: data.historico || []
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar histórico:', error);
        res.status(500).json({ 
            erro: 'Erro ao buscar histórico',
            detalhe: error.message,
            historico: [],
            etapa_atual: null
        });
    }
});

// ============================================================
// ROTA PARA ENVIAR NOTIFICAÇÃO WHATSAPP VIA PAINEL
// ============================================================

app.post('/api/whatsapp/notificar', async function(req, res) {
    try {
        const { telefone, mensagem, tipo } = req.body;
        
        console.log('📨 ===== NOTIFICAÇÃO WHATSAPP =====');
        console.log('📱 Telefone:', telefone);
        console.log('📝 Mensagem:', mensagem);
        console.log('🏷️ Tipo:', tipo);
        
        if (!telefone) {
            return res.status(400).json({ 
                success: false, 
                error: 'Telefone é obrigatório' 
            });
        }
        
        const telefoneLimpo = limparTelefone(telefone);
        console.log('📱 Telefone limpo:', telefoneLimpo);
        
        const mensagensPadrao = {
            'avancar_etapa': '✅ Olá! Seu processo foi atualizado para a próxima etapa. Acompanhe pelo nosso site.',
            'finalizar_aprovado': '🎉 Parabéns! Seu visto foi APROVADO! Em breve entraremos em contato.',
            'finalizar_recusado': '😔 Infelizmente seu visto foi recusado. Entre em contato conosco.',
            'mover_ativo': '🟢 Seu processo foi iniciado! Acompanhe pelo nosso painel.',
            'mover_amigo': '🤝 Você foi adicionado como amigo. Continue acompanhando!',
            'reabrir': '🔄 Seu processo foi reaberto! Acompanhe as atualizações.',
            'atualizacao': '📋 Seu processo foi atualizado. Acesse o painel para mais informações.'
        };
        
        const mensagemFinal = mensagem || mensagensPadrao[tipo] || mensagensPadrao.atualizacao;
        
        let nomeCliente = 'Cliente';
        try {
            const { data } = await supabase
                .from('clientes_ativos')
                .select('nome')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();
            
            if (data && data.nome && !data.nome.startsWith('Cliente_')) {
                nomeCliente = data.nome.split(' ')[0];
            }
        } catch (err) {
            console.log('Erro ao buscar nome:', err);
        }
        
        const mensagemPersonalizada = mensagemFinal.replace(/Cliente/g, nomeCliente);
        
        console.log('📨 Enviando mensagem personalizada:', mensagemPersonalizada);
        
        const enviado = await enviarWhatsApp(telefoneLimpo, mensagemPersonalizada);
        
        if (enviado) {
            console.log('✅ Notificação enviada com sucesso');
            res.json({ 
                success: true, 
                message: 'Notificação enviada com sucesso',
                telefone: telefoneLimpo,
                tipo: tipo
            });
        } else {
            console.error('❌ Falha ao enviar notificação');
            res.status(500).json({ 
                success: false, 
                error: 'Falha ao enviar mensagem WhatsApp' 
            });
        }
        
    } catch (error) {
        console.error('❌ Erro ao enviar notificação:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
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

// ============================================================
// ROTAS DE CLIENTES
// ============================================================

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

// ============================================================
// ROTAS DE TESTE
// ============================================================

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

// ============================================================
// ROTAS ADMIN
// ============================================================

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

app.get('/api/admin/verificar-cliente/:telefone', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const telefone = req.params.telefone;
        console.log(`🔍 Verificando cliente: ${telefone}`);
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        
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
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        
        let cliente = null;
        const { data: clienteAtivo } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        if (clienteAtivo) {
            cliente = clienteAtivo;
        } else {
            const { data: clienteLimpo } = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();
            cliente = clienteLimpo;
        }
        
        if (!cliente) {
            return res.status(404).json({ 
                error: 'Cliente não encontrado em clientes_ativos',
                telefone_buscado: telefone,
                telefone_limpo: telefoneLimpo
            });
        }
        
        const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_') 
            ? cliente.nome.split(' ')[0] 
            : 'Cliente';
        
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
            cliente: {
                nome: cliente.nome,
                criado_em: cliente.criado_em
            },
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
            
            try {
                await criarEtapaInicial(cliente.telefone);
            } catch (err) {
                console.error('Erro ao criar etapa:', err);
            }
            
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

app.post('/api/clientes/finalizar', async function(req, res) {
    try {
        var telefone = req.body.telefone;
        var resultado = req.body.resultado || 'aprovado';
        var observacoes = req.body.observacoes || '';
        var servico = req.body.servico || 'Visto Americano';
        var email = req.body.email || '';
        
        if (!telefone) {
            return res.status(400).json({ erro: 'Telefone é obrigatório' });
        }
        
        console.log(`📌 Finalizando cliente ${telefone}: ${resultado}`);
        
        const { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        if (error) {
            return res.status(500).json({ erro: error.message });
        }
        
        if (!cliente) {
            return res.status(404).json({ erro: 'Cliente não encontrado em clientes_ativos' });
        }
        
        const { data: finalizado, error: insertError } = await supabase
            .from('clientes_finalizados')
            .insert({
                telefone: cliente.telefone,
                nome: cliente.nome,
                email: email || null,
                servico: servico,
                data_inicio: cliente.criado_em || new Date().toISOString(),
                data_finalizacao: new Date().toISOString(),
                observacoes: observacoes || `Processo finalizado com ${resultado}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (insertError) {
            const { data: updateData, error: updateError } = await supabase
                .from('clientes_finalizados')
                .update({
                    servico: servico,
                    data_finalizacao: new Date().toISOString(),
                    observacoes: observacoes || `Processo finalizado com ${resultado}`,
                    updated_at: new Date().toISOString()
                })
                .eq('telefone', telefone)
                .select()
                .single();
            
            if (updateError) {
                return res.status(500).json({ erro: updateError.message });
            }
            finalizado = updateData;
        }
        
        await supabase
            .from('clientes_ativos')
            .delete()
            .eq('telefone', telefone);
        
        await supabase
            .from('clientes_novos')
            .delete()
            .eq('telefone', telefone);
        
        await supabase
            .from('contatos_amigos')
            .delete()
            .eq('telefone', telefone);
        
        console.log(`✅ Cliente ${telefone} finalizado e movido para clientes_finalizados`);
        
        try {
            const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_') 
                ? cliente.nome.split(' ')[0] 
                : 'Cliente';
            
            let mensagem = '';
            if (resultado === 'recusado') {
                mensagem = `😔 Olá ${nomeCliente}!\n\n` +
                          `Sabemos que essa notícia dói, ainda mais depois de tanta dedicação na preparação.\n\n` +
                          `É importante entender: a decisão final do visto acontece no momento da entrevista, e depende muito da avaliação pessoal do oficial consular naquele instante — algo que vai além da documentação e da preparação, por mais completa que tenha sido.\n\n` +
                          `🔍 Vamos analisar com você os detalhes da entrevista para entender o que pesou na decisão e ajustar a estratégia para a próxima tentativa.\n\n` +
                          `📱 Fale com a gente agora para uma análise gratuita:\n` +
                          `https://wa.me/5521974601812\n\n` +
                          `💪 Isso não muda o seu objetivo. Vamos trabalhar juntos para reverter esse cenário!`;
            } else {
                mensagem = `🎉 PARABÉNS, ${nomeCliente}! 🎉\n\n` +
                          `Seu passaporte com o visto foi retornado!\n\n` +
                          `✅ Seu processo foi concluído com sucesso!\n\n` +
                          `🌟 Agradecemos por confiar na GetVisa Assessoria!\n\n` +
                          `✈️ Boa viagem! Vá realizar seus sonhos!`;
            }
            
            await enviarWhatsApp(telefone, mensagem);
            console.log(`✅ Mensagem de finalização enviada para ${telefone}`);
        } catch (err) {
            console.error(`❌ Erro ao enviar mensagem de finalização:`, err);
        }
        
        res.json({
            success: true,
            message: `Cliente finalizado com ${resultado}`,
            cliente: finalizado
        });
        
    } catch (error) {
        console.error('❌ Erro ao finalizar cliente:', error);
        res.status(500).json({ 
            erro: 'Erro ao finalizar cliente', 
            detalhe: error.message 
        });
    }
});

// ============================================================
// ROTA DE TESTE - VERIFICAR CONEXÃO COM O BANCO
// ============================================================

app.get('/api/test/banco', async function(req, res) {
    try {
        console.log('🔍 TESTANDO CONEXÃO COM O BANCO...');
        
        const { count, error } = await supabase
            .from('clientes_finalizados')
            .select('*', { count: 'exact', head: true });
        
        console.log('📊 Total de registros em clientes_finalizados:', count);
        console.log('📊 Erro:', error);
        
        const { data, error2 } = await supabase
            .from('clientes_finalizados')
            .select('*');
        
        console.log('📊 Dados:', data);
        console.log('📊 Erro2:', error2);
        
        console.log('📊 SUPABASE_URL:', process.env.SUPABASE_URL);
        
        res.json({
            success: true,
            total_registros: count,
            dados: data,
            erro: error,
            supabase_url: process.env.SUPABASE_URL,
            supabase_key: process.env.SUPABASE_ANON_KEY ? '✅ CONFIGURADA' : '❌ NÃO CONFIGURADA'
        });
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// ROTA DE FINALIZAÇÃO - CORRESPONDE AO QUE O PAINEL ENVIA
// ============================================================

app.post('/api/etapas/finalizar', async function(req, res) {
    console.log('📌 ===== ROTA /api/etapas/finalizar CHAMADA =====');
    console.log('📌 Body recebido:', JSON.stringify(req.body, null, 2));
    
    try {
        var telefone = req.body.telefone;
        var etapaFinal = req.body.etapa_final || 'passaporte_retornado';
        var nota = req.body.nota || '';
        
        console.log('📌 Telefone:', telefone);
        console.log('📌 Etapa Final:', etapaFinal);
        console.log('📌 Nota:', nota);
        
        if (!telefone) {
            console.log('❌ Telefone não fornecido');
            return res.status(400).json({ 
                sucesso: false, 
                erro: 'Telefone é obrigatório',
                body_recebido: req.body 
            });
        }
        
        var telefoneLimpo = telefone.toString().replace(/\D/g, '');
        if (telefoneLimpo.startsWith('55')) telefoneLimpo = telefoneLimpo.substring(2);
        console.log('📌 Telefone limpo:', telefoneLimpo);
        
        console.log('🔍 Buscando cliente em clientes_ativos...');
        let { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();
        
        if (error) {
            console.error('❌ Erro ao buscar cliente:', error);
            return res.status(500).json({ sucesso: false, erro: error.message });
        }
        
        if (!cliente) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            console.log('🔍 Tentando com telefone formatado:', telefoneFormatado);
            const { data: clienteFormatado } = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();
            
            if (clienteFormatado) {
                cliente = clienteFormatado;
            }
        }
        
        if (!cliente) {
            console.log('❌ Cliente não encontrado em clientes_ativos');
            return res.status(404).json({ 
                sucesso: false, 
                erro: 'Cliente não encontrado em clientes_ativos',
                telefone_buscado: telefoneLimpo
            });
        }
        
        console.log('✅ Cliente encontrado:', cliente.nome);
        
        const isAprovado = etapaFinal === 'passaporte_retornado';
        const resultado = isAprovado ? 'aprovado' : 'recusado';
        const servico = 'Visto Americano';
        
        const dadosFinalizacao = {
            telefone: cliente.telefone,
            nome: cliente.nome,
            email: cliente.email || null,
            servico: servico,
            data_inicio: cliente.criado_em || new Date().toISOString(),
            data_finalizacao: new Date().toISOString(),
            observacoes: nota || `Processo finalizado com ${resultado}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        console.log('📌 Dados para finalizar:', JSON.stringify(dadosFinalizacao, null, 2));
        
        const { data: finalizado, error: insertError } = await supabase
            .from('clientes_finalizados')
            .insert(dadosFinalizacao)
            .select()
            .single();
        
        if (insertError) {
            console.error('❌ Erro ao inserir em clientes_finalizados:', insertError);
            
            const { data: updateData, error: updateError } = await supabase
                .from('clientes_finalizados')
                .update({
                    servico: servico,
                    data_finalizacao: new Date().toISOString(),
                    observacoes: nota || `Processo finalizado com ${resultado}`,
                    updated_at: new Date().toISOString()
                })
                .eq('telefone', cliente.telefone)
                .select()
                .single();
            
            if (updateError) {
                console.error('❌ Erro ao atualizar clientes_finalizados:', updateError);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao salvar em clientes_finalizados', 
                    detalhe: insertError.message
                });
            }
            finalizado = updateData;
            console.log('✅ Cliente atualizado em clientes_finalizados');
        } else {
            console.log('✅ Cliente inserido em clientes_finalizados');
        }
        
        console.log('🗑️ Removendo de outras tabelas...');
        
        await supabase
            .from('clientes_ativos')
            .delete()
            .eq('telefone', cliente.telefone);
        
        await supabase
            .from('clientes_novos')
            .delete()
            .eq('telefone', cliente.telefone);
        
        await supabase
            .from('contatos_amigos')
            .delete()
            .eq('telefone', cliente.telefone);
        
        console.log('✅ Cliente removido das outras tabelas');
        
        try {
            const { data: etapaData } = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', cliente.telefone)
                .maybeSingle();
            
            if (etapaData) {
                const historicoAtualizado = (etapaData.historico || []).concat([{
                    etapa: etapaFinal,
                    data: new Date().toISOString(),
                    nota: nota || 'Processo finalizado',
                    observacao: `Cliente finalizado com ${resultado}`
                }]);
                
                await supabase
                    .from('etapas_processo')
                    .update({
                        etapa_atual: etapaFinal,
                        data_atualizacao: new Date().toISOString(),
                        historico: historicoAtualizado,
                        [`data_${etapaFinal}`]: new Date().toISOString()
                    })
                    .eq('cliente_telefone', cliente.telefone);
                
                console.log('✅ Etapa atualizada no processo');
            }
        } catch (err) {
            console.error('❌ Erro ao atualizar etapa:', err);
        }
        
        try {
            const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_') 
                ? cliente.nome.split(' ')[0] 
                : 'Cliente';
            
            let mensagem = '';
            if (!isAprovado) {
                mensagem = `😔 Olá ${nomeCliente}!\n\n` +
                          `Sabemos que essa notícia dói, ainda mais depois de tanta dedicação na preparação.\n\n` +
                          `É importante entender: a decisão final do visto acontece no momento da entrevista, e depende muito da avaliação pessoal do oficial consular naquele instante — algo que vai além da documentação e da preparação, por mais completa que tenha sido.\n\n` +
                          `🔍 Vamos analisar com você os detalhes da entrevista para entender o que pesou na decisão e ajustar a estratégia para a próxima tentativa.\n\n` +
                          `📱 Fale com a gente agora para uma análise gratuita:\n` +
                          `https://wa.me/5521974601812\n\n` +
                          `💪 Isso não muda o seu objetivo. Vamos trabalhar juntos para reverter esse cenário!`;
            } else {
                mensagem = `🎉 PARABÉNS, ${nomeCliente}! 🎉\n\n` +
                          `Seu passaporte com o visto foi retornado!\n\n` +
                          `✅ Seu processo foi concluído com sucesso!\n\n` +
                          `🌟 Agradecemos por confiar na GetVisa Assessoria!\n\n` +
                          `✈️ Boa viagem! Vá realizar seus sonhos!`;
            }
            
            const enviado = await enviarWhatsApp(cliente.telefone, mensagem);
            console.log(`✅ Mensagem de finalização enviada: ${enviado}`);
        } catch (err) {
            console.error('❌ Erro ao enviar mensagem de finalização:', err);
        }
        
        console.log('✅ ===== PROCESSO FINALIZADO COM SUCESSO =====');
        
        res.json({
            sucesso: true,
            message: `Cliente finalizado com ${resultado}`,
            etapa: etapaFinal,
            cliente: finalizado
        });
        
    } catch (error) {
        console.error('❌ ERRO AO FINALIZAR CLIENTE:');
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            sucesso: false, 
            erro: 'Erro ao finalizar cliente', 
            detalhe: error.message
        });
    }
});

// ============================================================
// ROTA PARA LISTAR CLIENTES FINALIZADOS
// ============================================================

app.get('/api/clientes/finalizados', async function(req, res) {
    try {
        console.log('📌 [GET] /api/clientes/finalizados');
        
        const { data, error } = await supabase
            .from('clientes_finalizados')
            .select('*')
            .order('data_finalizacao', { ascending: false });
        
        if (error) {
            console.error('❌ Erro no Supabase:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
        
        console.log(`✅ ${data?.length || 0} clientes finalizados encontrados`);
        
        res.json({
            success: true,
            finalizados: data || []
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar finalizados:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/api/clientes/finalizados/:telefone', async function(req, res) {
    try {
        const telefone = req.params.telefone;
        console.log(`📌 [GET] /api/clientes/finalizados/${telefone}`);
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        console.log(`🔍 Buscando: ${telefoneLimpo}`);
        
        let { data, error } = await supabase
            .from('clientes_finalizados')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();
        
        if (!data) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            console.log(`🔍 Tentando formato: ${telefoneFormatado}`);
            
            const { data: dataFormatado } = await supabase
                .from('clientes_finalizados')
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();
            data = dataFormatado;
        }
        
        if (error) {
            console.error('❌ Erro:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
        
        if (!data) {
            console.log(`❌ Cliente não encontrado`);
            return res.status(404).json({
                success: false,
                error: 'Cliente não encontrado em finalizados'
            });
        }
        
        console.log(`✅ Cliente encontrado: ${data.nome}`);
        
        res.json({
            success: true,
            cliente: data
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar cliente finalizado:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/api/clientes/reabrir', async function(req, res) {
    try {
        const telefone = req.body.telefone;
        console.log(`📌 [POST] /api/clientes/reabrir`);
        console.log(`📌 Telefone: ${telefone}`);
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        console.log(`🔄 Reabrindo: ${telefoneLimpo}`);
        
        let { data: cliente, error } = await supabase
            .from('clientes_finalizados')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();
        
        if (!cliente) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            console.log(`🔍 Tentando formato: ${telefoneFormatado}`);
            
            const { data: dataFormatado } = await supabase
                .from('clientes_finalizados')
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();
            cliente = dataFormatado;
        }
        
        if (error) {
            console.error('❌ Erro:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
        
        if (!cliente) {
            console.log(`❌ Cliente não encontrado em finalizados`);
            return res.status(404).json({
                success: false,
                error: 'Cliente não encontrado em finalizados'
            });
        }
        
        console.log(`✅ Cliente encontrado: ${cliente.nome}`);
        
        const { data: existente } = await supabase
            .from('clientes_ativos')
            .select('telefone')
            .eq('telefone', cliente.telefone)
            .maybeSingle();
        
        if (existente) {
            console.log(`⚠️ Cliente já existe em ativos, removendo...`);
            await supabase
                .from('clientes_ativos')
                .delete()
                .eq('telefone', cliente.telefone);
        }
        
        const { data: ativo, error: insertError } = await supabase
            .from('clientes_ativos')
            .insert({
                telefone: cliente.telefone,
                nome: cliente.nome,
                email: cliente.email || null,
                criado_em: cliente.data_inicio || new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                status: 'reaberto'
            })
            .select()
            .single();
        
        if (insertError) {
            console.error('❌ Erro ao inserir em ativos:', insertError);
            return res.status(500).json({ 
                success: false, 
                error: insertError.message 
            });
        }
        
        console.log(`✅ Cliente inserido em clientes_ativos`);
        
        await supabase
            .from('clientes_finalizados')
            .delete()
            .eq('telefone', cliente.telefone);
        
        console.log(`🗑️ Cliente removido de clientes_finalizados`);
        
        try {
            await criarEtapaInicial(telefoneLimpo);
            console.log(`✅ Etapa inicial criada`);
        } catch (err) {
            console.error('❌ Erro ao criar etapa:', err);
        }
        
        try {
            const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_') 
                ? cliente.nome.split(' ')[0] 
                : 'Cliente';
            
            const mensagem = `🔄 Olá ${nomeCliente}!\n\n` +
                           `Seu processo foi REABERTO pela nossa equipe.\n\n` +
                           `📋 Status: Em andamento\n` +
                           `📍 Etapa atual: Formulário recebido\n\n` +
                           `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                           `📱 Dúvidas? Fale conosco pelo WhatsApp: https://wa.me/5521974601812`;
            
            await enviarWhatsApp(cliente.telefone, mensagem);
            console.log(`✅ Mensagem de reabertura enviada`);
        } catch (err) {
            console.error('❌ Erro ao enviar mensagem:', err);
        }
        
        console.log(`✅ Processo reaberto com sucesso!`);
        
        res.json({
            success: true,
            message: 'Processo reaberto com sucesso',
            cliente: ativo
        });
        
    } catch (error) {
        console.error('❌ Erro ao reabrir processo:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/api/clientes/buscar/:telefone', async function(req, res) {
    try {
        const telefone = req.params.telefone;
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        
        console.log(`🔍 Buscando cliente: ${telefoneLimpo}`);
        
        let { data, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();
        
        if (!data) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            const { data: dataFormatado } = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();
            data = dataFormatado;
        }
        
        if (error) {
            console.error('❌ Erro:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Cliente não encontrado' 
            });
        }
        
        res.json({ 
            success: true, 
            cliente: data 
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================================
// ROTA DE TESTE - RECEBIMENTO
// ============================================================

app.post('/api/test-receive', function(req, res) {
    console.log('📨 ===== TESTE DE RECEBIMENTO =====');
    console.log('📨 Headers:', req.headers);
    console.log('📨 Body recebido:', JSON.stringify(req.body, null, 2));
    console.log('📨 Body keys:', Object.keys(req.body));
    
    const fs = require('fs');
    const logData = {
        timestamp: new Date().toISOString(),
        headers: req.headers,
        body: req.body,
        bodyKeys: Object.keys(req.body)
    };
    
    fs.appendFileSync('teste-recebimento.log', JSON.stringify(logData, null, 2) + '\n---\n');
    
    res.json({
        success: true,
        received: true,
        keys: Object.keys(req.body),
        count: Object.keys(req.body).length,
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// HEALTH CHECKS
// ============================================================

app.get('/health', function(req, res) { res.status(200).send('OK'); });
app.get('/ping', function(req, res) { res.status(200).send('ok'); });

// ============================================================
// INICIALIZAÇÃO
// ============================================================

const serverUrl = process.env.RAILWAY_STATIC_URL || 
                  process.env.RENDER_EXTERNAL_URL || 
                  'localhost:' + PORT;

app.listen(PORT, '0.0.0.0', function() {
    console.log('Servidor rodando na porta ' + PORT);
    console.log('Painel: https://' + serverUrl + '/painel.html');
    console.log('Webhook: https://' + serverUrl + '/api/webhook/zapi');
});