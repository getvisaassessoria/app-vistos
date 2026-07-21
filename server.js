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

const userState = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of userState.entries()) {
        if (data.lastActivity && (now - data.lastActivity) > 30 * 60 * 1000) {
            userState.delete(phone);
        }
    }
}, 60 * 1000);

const FEATURES = {
    SISTEMA_ETAPAS: {
        ativo: true,
        notificar_cliente: true,
        auto_avancar: true
    }
};

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

const SPAM_DOMAINS = ['tempmail', 'mailinator', '10minutemail', 'guerrillamail', 'throwaway', 'fake', 'spam'];

const DATE_FIELDS = [
    'text-5', 'text-21', 'text-35', 'text-66', 'text-67', 'text-69',
    'text-61', 'text-62', 'spouse-dob', 'data_casamento_div',
    'data_divorcio', 'data_falecimento', 'text-50', 'text-44',
    'text-45', 'military_date_from', 'military_date_to', 'antecedentes_data'
];

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

// ==================== SISTEMA DE ONBOARDING ====================

// Adicionar novo estado para controle de onboarding
const userState = new Map();

// Configuração do fluxo de onboarding
const ONBOARDING_STEPS = {
    SAUDACAO: 'saudacao',
    AGUARDANDO_NOME: 'aguardando_nome',
    CONFIRMACAO: 'confirmacao',
    COMPLETO: 'completo'
};

// Mensagens do fluxo de boas-vindas
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
            '! Agora sim posso te ajudar da melhor forma.\n\nVamos lá: como posso te ajudar hoje? Escolha uma opção:\n\n',
            '! Estou aqui para realizar o sonho da sua viagem!\n\nEm que posso te ajudar? Escolha:\n\n',
            '! Vamos encontrar a melhor solução para você!\n\nO que você precisa? Escolha uma opção:\n\n',
            '! Preparado(a) para começar essa jornada?\n\nComo posso te ajudar? Escolha:\n\n'
        ]
    }
};

// Função para validar nome
function validarNome(nome) {
    if (!nome || nome.trim().length === 0) return false;
    
    const nomeLimpo = nome.trim();
    
    // Verificar tamanho mínimo e máximo
    if (nomeLimpo.length < 2 || nomeLimpo.length > 100) return false;
    
    // Verificar se contém apenas letras, espaços e acentos
    const regexNome = /^[a-zA-ZÀ-ÿ\s'-]+$/;
    if (!regexNome.test(nomeLimpo)) return false;
    
    // Verificar se tem pelo menos um espaço (nome + sobrenome)
    if (!nomeLimpo.includes(' ')) {
        // Permitir apenas primeiro nome, mas avisar
        return true; // Aceitamos, mas vamos sugerir nome completo
    }
    
    // Verificar se não é só números ou caracteres especiais
    if (/^\d+$/.test(nomeLimpo.replace(/\s/g, ''))) return false;
    
    // Lista de palavras que indicam que não é um nome
    const palavrasInvalidas = ['sim', 'nao', 'ok', 'yes', 'no', 'teste', 'oi', 'ola'];
    if (palavrasInvalidas.includes(nomeLimpo.toLowerCase())) return false;
    
    return true;
}

// Função para formatar nome (primeira letra maiúscula)
function formatarNome(nome) {
    return nome
        .trim()
        .toLowerCase()
        .split(' ')
        .map(palavra => {
            if (palavra.length <= 2) return palavra.toLowerCase(); // da, de, do, etc
            return palavra.charAt(0).toUpperCase() + palavra.slice(1);
        })
        .join(' ');
}

// Função para escolher mensagem aleatória
function getRandomMessage(messageArray) {
    return messageArray[Math.floor(Math.random() * messageArray.length)];
}

// NOVA FUNÇÃO: Processar onboarding
async function processarOnboarding(cleanPhone, messageText, state, body) {
    console.log('=== PROCESSANDO ONBOARDING ===');
    console.log('Passo atual: ' + state.onboardingStep);
    console.log('Mensagem: ' + messageText);
    
    switch (state.onboardingStep) {
        case ONBOARDING_STEPS.SAUDACAO:
            // Enviar saudação e pedir nome
            const saudacao = getRandomMessage(BOAS_VINDAS_MESSAGES.primeira_saudacao);
            const pedirNome = getRandomMessage(BOAS_VINDAS_MESSAGES.solicitar_nome);
            
            await sendReply(cleanPhone, saudacao + '\n\n' + pedirNome);
            
            // Atualizar estado
            state.onboardingStep = ONBOARDING_STEPS.AGUARDANDO_NOME;
            state.lastActivity = Date.now();
            userState.set(cleanPhone, state);
            break;
            
        case ONBOARDING_STEPS.AGUARDANDO_NOME:
            // Validar o nome recebido
            const nomeValidado = validarNome(messageText);
            
            if (!nomeValidado) {
                // Nome inválido, pedir novamente
                const msgInvalido = getRandomMessage(BOAS_VINDAS_MESSAGES.nome_invalido);
                await sendReply(cleanPhone, msgInvalido);
                return;
            }
            
            // Formatar o nome
            const nomeFormatado = formatarNome(messageText);
            
            // Salvar no Supabase
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
                    console.log('Nome salvo no Supabase: ' + nomeFormatado);
                }
            } catch (err) {
                console.error('Erro ao atualizar cliente:', err);
            }
            
            // Salvar nome no estado
            state.nome = nomeFormatado;
            state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
            userState.set(cleanPhone, state);
            
            // Enviar confirmação com menu
            const confirmacao = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte1) + 
                              nomeFormatado.split(' ')[0] + // Primeiro nome
                              getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte2) +
                              await getMenuPrincipal();
            
            await sendReply(cleanPhone, confirmacao);
            
            console.log('Onboarding completo para: ' + nomeFormatado);
            break;
            
        default:
            // Se algo der errado, volta para saudação
            state.onboardingStep = ONBOARDING_STEPS.SAUDACAO;
            userState.set(cleanPhone, state);
            await processarOnboarding(cleanPhone, '', state, body);
    }
}

// CORREÇÃO NA FUNÇÃO processarMenu para incluir onboarding
async function processarMenu(cleanPhone, messageText, body) {
    console.log('=== PROCESSANDO MENU ===');
    console.log('Phone: ' + cleanPhone);
    console.log('Message: "' + messageText + '"');
    
    // GET OU CRIA ESTADO com onboarding
    let state = userState.get(cleanPhone);
    if (!state) {
        state = {
            nivel: 'principal',
            service: null,
            nome: null,
            onboardingStep: ONBOARDING_STEPS.SAUDACAO, // Começa onboarding
            onboardingCompleto: false,
            lastActivity: Date.now()
        };
        userState.set(cleanPhone, state);
    }
    state.lastActivity = Date.now();
    
    console.log('Estado atual:', {
        nivel: state.nivel,
        service: state.service,
        nome: state.nome,
        onboardingStep: state.onboardingStep
    });
    
    // Se onboarding não está completo, processar onboarding primeiro
    if (!state.onboardingCompleto || state.onboardingStep !== ONBOARDING_STEPS.COMPLETO) {
        // Verificar se é uma saudação (começar onboarding)
        const saudacoes = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'hey', 'hi', 'hello', 'teste', 'tudo bem'];
        
        if (saudacoes.includes(messageText.toLowerCase()) || state.onboardingStep !== ONBOARDING_STEPS.SAUDACAO) {
            await processarOnboarding(cleanPhone, messageText, state, body);
            return;
        }
    }
    
    // Se já completou onboarding, marcar como completo
    if (state.onboardingStep === ONBOARDING_STEPS.COMPLETO) {
        state.onboardingCompleto = true;
    }
    
    // COMANDO 0 - SEMPRE VOLTA AO MENU PRINCIPAL
    if (messageText === '0') {
        state.nivel = 'principal';
        state.service = null;
        userState.set(cleanPhone, state);
        const menuPrincipal = await getMenuPrincipal();
        await sendReply(cleanPhone, menuPrincipal);
        console.log('Voltou ao menu principal');
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
    
    // SAUDAÇÕES (quando já completou onboarding)
    if (state.onboardingCompleto) {
        const saudacoes = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'hey', 'hi', 'hello', 'tudo bem'];
        if (saudacoes.includes(messageText.toLowerCase())) {
            const nomeCliente = state.nome ? state.nome.split(' ')[0] : '';
            const saudacaoMsg = nomeCliente ? 
                '👋 Olá ' + nomeCliente + '! Que bom ver você de novo!\n\n' + await getMenuPrincipal() :
                '👋 Olá! Que bom ter você aqui!\n\n' + await getMenuPrincipal();
            
            await sendReply(cleanPhone, saudacaoMsg);
            return;
        }
    }
    
    // LÓGICA PRINCIPAL: Se está em submenu, mantém no submenu
    if (state.nivel === 'submenu' && state.service) {
        console.log('Processando no contexto do submenu: ' + state.service);
        await processarOpcaoNoSubmenu(cleanPhone, messageText, state);
        return;
    }
    
    // Se está no menu principal
    if (state.nivel === 'principal') {
        await processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state);
        return;
    }
    
    // Fallback
    state.nivel = 'principal';
    state.service = null;
    userState.set(cleanPhone, state);
    await sendReply(cleanPhone, await getMenuPrincipal());
}

// ADICIONE estas funções logo após a função processarMenu:

// Função para validar nome
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

// Função para formatar nome
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

// Função para escolher mensagem aleatória
function getRandomMessage(messageArray) {
    return messageArray[Math.floor(Math.random() * messageArray.length)];
}

// Função de onboarding
async function processarOnboarding(cleanPhone, messageText, state, body) {
    console.log('=== PROCESSANDO ONBOARDING ===');
    console.log('Passo atual: ' + state.onboardingStep);
    console.log('Mensagem: ' + messageText);
    
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
                    console.log('Nome salvo no Supabase: ' + nomeFormatado);
                }
            } catch (err) {
                console.error('Erro ao atualizar cliente:', err);
            }
            
            state.nome = nomeFormatado;
            state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
            userState.set(cleanPhone, state);
            
            const confirmacao = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte1) + 
                              nomeFormatado.split(' ')[0] +
                              getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte2) +
                              await getMenuPrincipal();
            
            await sendReply(cleanPhone, confirmacao);
            
            console.log('Onboarding completo para: ' + nomeFormatado);
            break;
            
        default:
            state.onboardingStep = ONBOARDING_STEPS.SAUDACAO;
            userState.set(cleanPhone, state);
            await processarOnboarding(cleanPhone, '', state, body);
    }
}

// ATUALIZAÇÃO: Função processarOpcaoNoSubmenu para usar nome do cliente
async function processarOpcaoNoSubmenu(cleanPhone, messageText, state) {
    const service = state.service;
    const nomeCliente = state.nome ? ', ' + state.nome.split(' ')[0] : '';
    
    console.log('=== SUBMENU ATIVO: ' + service + ' ===');
    console.log('Opção recebida: ' + messageText);
    
    // Mapeamento de opções do submenu
    const opcoesSubmenu = {
        '1': 'preco',
        '2': 'prazo', 
        '3': 'documentos',
        '4': 'processo',
        '5': 'especial',
        '6': 'avaliacao',
        '7': 'especialista'
    };
    
    // Se a opção digitada é uma opção válida do submenu (1-7)
    if (opcoesSubmenu[messageText]) {
        console.log('Processando opção ' + messageText + ' do submenu de ' + service);
        
        switch(messageText) {
            case '1': // Preço
                const respostaPreco = getRespostaSubmenu(service, 'preco');
                await sendReply(cleanPhone, respostaPreco + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '2': // Prazo
                const respostaPrazo = getRespostaSubmenu(service, 'prazo');
                await sendReply(cleanPhone, respostaPrazo + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '3': // Documentos
                const respostaDocs = getRespostaSubmenu(service, 'documentos');
                await sendReply(cleanPhone, respostaDocs + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '4': // Processo
                const respostaProcesso = getRespostaSubmenu(service, 'processo');
                await sendReply(cleanPhone, respostaProcesso + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '5': // Visto Negado / Onde Fazer
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
                
            case '6': // Avaliação Gratuita
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
                
            case '7': // Falar com Especialista
                const msgEsp = '👨‍💼 FALAR COM ESPECIALISTA - ' + getServiceName(service).toUpperCase() + '\n\n' +
                              'Meu nome é Moisés e estou aqui para ajudar' + nomeCliente + '!\n\n' +
                              '📱 WhatsApp: https://wa.me/5521974601812\n\n' +
                              '📧 E-mail: contato@getvisa.com.br\n\n' +
                              '📌 Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                              'Digite outra opção (1-7) ou 0 para menu principal';
                await sendReply(cleanPhone, msgEsp);
                break;
        }
        return;
    }
    
    // Se digitou 9, mostra o menu do serviço atual novamente
    if (messageText === '9') {
        const submenuTexto = getSubmenu(service);
        await sendReply(cleanPhone, submenuTexto);
        return;
    }
    
    // Se não é uma opção válida do submenu
    const erroMsg = '❌ Opção inválida' + nomeCliente + '!\n\n' +
                   'Você está no menu: ' + getServiceName(service).toUpperCase() + '\n\n' +
                   'Opções disponíveis:\n' +
                   getSubmenu(service) + '\n\n' +
                   '💡 Para escolher outro serviço, digite 0 primeiro.';
    await sendReply(cleanPhone, erroMsg);
}

// LOCALIZE a função cadastrarCliente atual e SUBSTITUA:

async function cadastrarCliente(telefone, nome) {
    nome = nome || 'Cliente_' + telefone;
    console.log('Cadastrando/atualizando ' + telefone + ' com nome: ' + nome);
    
    const dadosCliente = {
        telefone: telefone,
        nome: nome,
        data_contato: new Date().toISOString(),
        status: 'novo',
        onboarding_completo: false
    };

    const { data, error } = await supabase
        .from('clientes_novos')
        .upsert(dadosCliente, {
            onConflict: 'telefone',
            ignoreDuplicates: false
        })
        .select()
        .single();

    if (error) {
        console.error('Erro ao cadastrar cliente:', error);
        return null;
    }
    
    console.log('Cliente ' + telefone + ' cadastrado/atualizado como NOVO');
    return { dados: data, tipo: 'novo', tabela: 'clientes_novos' };
}

// ATUALIZAÇÃO: Webhook para incluir onboarding
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

            // Ignorar mensagens de grupo, bot, status (mantido igual)
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

            // Extrair texto (mantido igual)
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

            // Extrair telefone (mantido igual)
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

            // Verificar contato amigo (silenciar)
            var amigo = await supabase
                .from('contatos_amigos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (amigo.data) {
                console.log('👤 Contato AMIGO: ' + cleanPhone + ' - SILÊNCIO TOTAL');
                return;
            }

            // Verificar cliente finalizado
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

            // Verificar cliente ativo
            var ativo = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (ativo.data) {
                console.log('🔄 Cliente ATIVO: ' + cleanPhone);
                
                // Se é ativo, pular onboarding
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
                
                await processarMenu(cleanPhone, messageText, body);
                return;
            }

            // Verificar cliente novo (já cadastrado)
            var novo = await supabase
                .from('clientes_novos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (novo.data) {
                console.log('👤 Cliente NOVO já cadastrado: ' + cleanPhone);
                
                // Se já tem nome, pular onboarding
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
                
                await processarMenu(cleanPhone, messageText, body);
                return;
            }

            // NOVO CLIENTE - Iniciar onboarding
            console.log('🆕 NOVO CLIENTE: ' + cleanPhone);
            
            // Cadastrar cliente básico (sem nome ainda)
            var resultado = await cadastrarCliente(cleanPhone, 'Cliente');
            if (!resultado) {
                await sendReply(cleanPhone, 'Desculpe, estamos com problemas técnicos. Tente novamente em alguns minutos.');
                return;
            }
            
            console.log('✅ Cliente cadastrado, iniciando onboarding');
            
            // Iniciar processo de onboarding
            await processarMenu(cleanPhone, messageText, body);

        } catch (error) {
            console.error('❌ ERRO NO PROCESSAMENTO DO WEBHOOK:');
            console.error('Mensagem:', error.message);
            console.error('Stack:', error.stack);

            try {
                var phone = req.body && (req.body.phone || req.body.from || req.body.chatId) || null;
                if (phone) {
                    var cleanPhone = phone.toString().replace(/\D/g, '');
                    if (cleanPhone.length >= 10) {
                        await sendReply(cleanPhone, '❌ Desculpe, estamos com problemas técnicos.\n\nDigite 0 para tentar novamente.');
                    }
                }
            } catch (e) {
                console.error('Falha ao enviar mensagem de erro:', e);
            }
        }
    })();
});


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

function detectIntent(message) {
    const cleanMessage = message.toLowerCase();
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
        for (const keyword of keywords) {
            if (cleanMessage.includes(keyword)) return intent;
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
    const telefoneLimpo = (telefone || '').toString().replace(/\D/g, '');
    if (telefoneLimpo.length > 0 && telefoneLimpo.length < 10) return true;
    if (telefoneLimpo && /^(\d)\1+$/.test(telefoneLimpo)) return true;
    for (const dominio of SPAM_DOMAINS) {
        if (email.toLowerCase().includes(dominio)) return true;
    }
    if (email && (!email.includes('@') || email.split('@').length !== 2)) return true;
    return false;
}

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

async function buscarCliente(telefone) {
    console.log('Buscando cliente ' + telefone + '...');
    const { data: ativo, error: err1 } = await supabase
        .from('clientes_ativos').select('*').eq('telefone', telefone).maybeSingle();
    if (ativo) {
        console.log('Cliente ATIVO encontrado: ' + telefone);
        return { dados: ativo, tipo: 'ativo', tabela: 'clientes_ativos' };
    }
    const { data: novo, error: err2 } = await supabase
        .from('clientes_novos').select('*').eq('telefone', telefone).maybeSingle();
    if (novo) {
        console.log('Cliente NOVO encontrado: ' + telefone);
        return { dados: novo, tipo: 'novo', tabela: 'clientes_novos' };
    }
    const { data: amigo, error: err3 } = await supabase
        .from('contatos_amigos').select('*').eq('telefone', telefone).maybeSingle();
    if (amigo) {
        console.log('Contato AMIGO encontrado: ' + telefone);
        return { dados: amigo, tipo: 'amigo', tabela: 'contatos_amigos' };
    }
    console.log('Cliente ' + telefone + ' NAO encontrado');
    return null;
}

async function cadastrarCliente(telefone, nome) {
    nome = nome || 'Cliente_' + telefone;
    console.log('Cadastrando/atualizando ' + telefone + '...');
    const dadosCliente = {
        telefone: telefone,
        nome: nome,
        data_contato: new Date().toISOString(),
        status: 'pendente'
    };

    const { data, error } = await supabase
        .from('clientes_novos')
        .upsert(dadosCliente, {
            onConflict: 'telefone',
            ignoreDuplicates: false
        })
        .select()
        .single();

    if (error) {
        console.error('Erro ao cadastrar cliente:', error);
        return null;
    }
    console.log('Cliente ' + telefone + ' cadastrado/atualizado como NOVO');
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

function getRespostaSubmenu(servico, opcao) {
    var respostas = {
        preco: {
            visto_americano: 'INVESTIMENTO - VISTO AMERICANO\n\nTaxa Consular: ~R$ 950\nAssessoria: R$ 350\n\nInclui: DS-160, agendamento, preparacao para entrevista e acompanhamento total.\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: 'INVESTIMENTO - VISTO CANADENSE\n\nTaxa Consular: ~R$ 750\nAssessoria: R$ 400\n\nInclui: Aplicacao online, documentacao, preparacao para biometria e entrevista.\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: 'INVESTIMENTO - VISTO AUSTRALIANO\n\nTaxa Consular: ~R$ 850\nAssessoria: R$ 450\n\nInclui: Analise de perfil, aplicacao online, documentacao especifica.\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: 'INVESTIMENTO - eTA UK (REINO UNIDO)\n\nTaxa: ~R$ 120\nAssessoria: R$ 150\n\nInclui: Aplicacao online, validacao de dados, acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: 'INVESTIMENTO - eTA CANADENSE\n\nTaxa: ~R$ 50\nAssessoria: R$ 100\n\nInclui: Aplicacao online rapida, validacao, entrega por e-mail.\n\nDigite 0 para voltar ao MENU principal',
            passaporte: 'INVESTIMENTO - PASSAPORTE\n\nTaxa PF: ~R$ 257\nAssessoria: R$ 150\n\nInclui: Agendamento, orientacao documental, acompanhamento.\n\nDigite 0 para voltar ao MENU principal'
        },
        prazo: {
            visto_americano: 'PRAZO - VISTO AMERICANO\n\nAgendamento: ate 8 semanas\nAnalise consular: 7 a 10 dias uteis\nRetorno do passaporte: 5 a 7 dias uteis\n\nTotal estimado: 30 a 40 dias\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: 'PRAZO - VISTO CANADENSE\n\nProcessamento: 4 a 8 semanas\nRetorno: 2 a 3 dias uteis\n\nTotal estimado: 30 a 60 dias\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: 'PRAZO - VISTO AUSTRALIANO\n\nProcessamento: 2 a 4 semanas\n\nTotal estimado: 15 a 30 dias\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: 'PRAZO - eTA UK\n\nProcessamento: ate 72 horas\n\nTotal estimado: 1 a 3 dias\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: 'PRAZO - eTA CANADENSE\n\nProcessamento: ate 24 horas\n\nTotal estimado: 1 dia\n\nDigite 0 para voltar ao MENU principal',
            passaporte: 'PRAZO - PASSAPORTE\n\nEmissao: 7 a 15 dias uteis\n\nTotal estimado: 10 a 20 dias\n\nDigite 0 para voltar ao MENU principal'
        },
        documentos: {
            visto_americano: 'DOCUMENTOS - VISTO AMERICANO\n\nOBRIGATORIOS:\n- Passaporte valido (minimo 6 meses)\n- Foto 5x7 recente\n- Comprovante da taxa consular\n- DS-160 preenchido\n\nRECOMENDADOS:\n- Comprovante de renda\n- Extratos bancarios\n- Comprovante de imovel/veiculo\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: 'DOCUMENTOS - VISTO CANADENSE\n\nOBRIGATORIOS:\n- Passaporte valido\n- Foto digital\n- Comprovantes financeiros\n\nRECOMENDADOS:\n- Carta de intencao\n- Historico de viagens\n- Vinculos com o Brasil\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: 'DOCUMENTOS - VISTO AUSTRALIANO\n\nOBRIGATORIOS:\n- Passaporte valido\n- Comprovantes de recursos\n- Seguro saude (recomendado)\n\nRECOMENDADOS:\n- Roteiro de viagem\n- Reservas de hospedagem\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: 'DOCUMENTOS - eTA UK\n\nOBRIGATORIOS:\n- Passaporte valido\n- E-mail valido\n- Dados de viagem\n\nPROCESSO:\n- Aplicacao 100% online\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: 'DOCUMENTOS - eTA CANADENSE\n\nOBRIGATORIOS:\n- Passaporte valido\n- Cartao de credito para taxa\n- E-mail valido\n\nPROCESSO:\n- Aplicacao 100% online\n\nDigite 0 para voltar ao MENU principal',
            passaporte: 'DOCUMENTOS - PASSAPORTE\n\nOBRIGATORIOS:\n- RG original\n- CPF\n- Titulo de eleitor (homens 18-70)\n- Certidao de nascimento/casamento\n- Comprovante de quitacao militar (homens)\n\nDigite 0 para voltar ao MENU principal'
        },
        processo: {
            visto_americano: 'PROCESSO - VISTO AMERICANO\n\n- Analise de perfil\n- Preenchimento do DS-160\n- Pagamento da taxa consular\n- Agendamento da entrevista\n- Coleta biometrica (CASV)\n- Entrevista no Consulado\n- Retirada do passaporte\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: 'PROCESSO - VISTO CANADENSE\n\n- Analise de perfil\n- Aplicacao online GCKey\n- Pagamento das taxas\n- Agendamento da biometria\n- Coleta de dados biometricos\n- Entrevista (se solicitado)\n- Decisao e envio\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: 'PROCESSO - VISTO AUSTRALIANO\n\n- Analise de perfil\n- Aplicacao online ImmiAccount\n- Pagamento das taxas\n- Envio de documentos\n- Acompanhamento\n- Decisao por e-mail\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: 'PROCESSO - eTA UK\n\n- Coleta de dados\n- Aplicacao online\n- Pagamento da taxa\n- Analise automatizada\n- Recebimento por e-mail\n- Vincular ao passaporte\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: 'PROCESSO - eTA CANADENSE\n\n- Coleta de dados\n- Aplicacao online\n- Pagamento da taxa\n- Analise automatizada\n- Recebimento por e-mail\n- Vincular ao passaporte\n\nDigite 0 para voltar ao MENU principal',
            passaporte: 'PROCESSO - PASSAPORTE\n\n- Agendamento no site da PF\n- Separacao dos documentos\n- Pagamento da GRU\n- Comparecimento ao posto\n- Coleta de dados biometricos\n- Aguardar emissao\n- Retirada do passaporte\n\nDigite 0 para voltar ao MENU principal'
        }
    };
    var resposta = respostas[opcao] && respostas[opcao][servico];
    if (!resposta) {
        resposta = 'INFORMACOES EM BREVE\n\nEstamos preparando o conteudo especifico para ' + servico.replace('_', ' ').toUpperCase() + '.\n\nDigite 0 para voltar ao MENU principal';
    }
    return resposta;
}

function getRespostaIntencao(intent, service) {
    var respostas = {
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

async function getMenuPrincipal() {
    return 'GETVISA - ESCOLHA O SERVICO\n\n1 - VISTO AMERICANO\n2 - VISTO CANADENSE\n3 - VISTO AUSTRALIANO\n4 - eTA UK (REINO UNIDO)\n5 - eTA CANADENSE\n6 - PASSAPORTE\n7 - AJUDA / CONTATO\n\nDigite o numero da opcao desejada (1 a 7) ou me pergunte algo!\nDigite 0 para ver este MENU novamente';
}

function getSubmenu(service) {
    const names = {
        'visto_americano': 'VISTO AMERICANO',
        'visto_canadense': 'VISTO CANADENSE',
        'visto_australiano': 'VISTO AUSTRALIANO',
        'eta_uk': 'eTA UK',
        'eta_canadense': 'eTA CANADENSE',
        'passaporte': 'PASSAPORTE'
    };

    const isPassaporte = service === 'passaporte';
    const opcao5 = isPassaporte ? 'ONDE FAZER' : 'VISTO NEGADO';
    const nome = names[service] || 'SERVICO';

    return nome + '\n\n' + 
        '1 - PRECO\n' + 
        '2 - PRAZO\n' + 
        '3 - DOCUMENTOS\n' + 
        '4 - PROCESSO\n' + 
        '5 - ' + opcao5 + '\n' +
        '6 - AVALIACAO GRATUITA\n' + 
        '7 - FALAR COM ESPECIALISTA\n\n' + 
        '0 - VOLTAR AO MENU PRINCIPAL\n\n' +
        'Digite o numero da opcao desejada';
}

// CORREÇÃO COMPLETA - Mantendo o contexto do submenu
async function processarMenu(cleanPhone, messageText, body) {
    console.log('=== PROCESSANDO MENU ===');
    console.log('Phone: ' + cleanPhone);
    console.log('Message: "' + messageText + '"');
    
    // GET OU CRIA ESTADO
    let state = userState.get(cleanPhone);
    if (!state) {
        state = {
            nivel: 'principal',
            service: null,
            lastActivity: Date.now()
        };
        userState.set(cleanPhone, state);
    }
    state.lastActivity = Date.now();
    
    console.log('Estado atual: nivel=' + state.nivel + ', service=' + state.service);
    
    // COMANDO 0 - SEMPRE VOLTA AO MENU PRINCIPAL (única forma de sair do submenu)
    if (messageText === '0') {
        state.nivel = 'principal';
        state.service = null;
        userState.set(cleanPhone, state);
        const menuPrincipal = await getMenuPrincipal();
        await sendReply(cleanPhone, menuPrincipal);
        console.log('Voltou ao menu principal - contexto resetado');
        return;
    }
    
    // COMANDOS DE RESET - voltam ao menu principal
    const resetCommands = ['menu', 'menu principal', 'inicio', 'comecar', 'voltar', 'principal'];
    if (resetCommands.includes(messageText.toLowerCase())) {
        state.nivel = 'principal';
        state.service = null;
        userState.set(cleanPhone, state);
        await sendReply(cleanPhone, await getMenuPrincipal());
        console.log('Reset para menu principal');
        return;
    }
    
    // SAUDAÇÕES - mostram menu principal mas mantêm contexto limpo
    const saudacoes = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'hey', 'hi', 'hello', 'teste', 'tudo bem'];
    if (saudacoes.includes(messageText.toLowerCase())) {
        if (state.nivel === 'submenu' && state.service) {
            // Se está em submenu, pergunta se quer continuar ou voltar
            const msg = '👋 Olá! Você está no menu de ' + getServiceName(state.service).toUpperCase() + '.\n\n' +
                       'Deseja:\n' +
                       '• Continuar neste menu? Digite 9\n' +
                       '• Voltar ao menu principal? Digite 0';
            await sendReply(cleanPhone, msg);
        } else {
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            await sendReply(cleanPhone, await getMenuPrincipal());
        }
        return;
    }
    
    // LÓGICA PRINCIPAL: Se está em submenu, mantém no submenu
    if (state.nivel === 'submenu' && state.service) {
        console.log('Processando no contexto do submenu: ' + state.service);
        await processarOpcaoNoSubmenu(cleanPhone, messageText, state);
        return;
    }
    
    // Se está no menu principal
    if (state.nivel === 'principal') {
        await processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state);
        return;
    }
    
    // Fallback
    state.nivel = 'principal';
    state.service = null;
    userState.set(cleanPhone, state);
    await sendReply(cleanPhone, await getMenuPrincipal());
}

// NOVA FUNÇÃO: Processar opções dentro do submenu (mantém contexto)
async function processarOpcaoNoSubmenu(cleanPhone, messageText, state) {
    const service = state.service;
    console.log('=== SUBMENU ATIVO: ' + service + ' ===');
    console.log('Opção recebida: ' + messageText);
    
    // Mapeamento de opções do submenu
    const opcoesSubmenu = {
        '1': 'preco',
        '2': 'prazo', 
        '3': 'documentos',
        '4': 'processo',
        '5': 'especial', // Visto negado ou Onde fazer
        '6': 'avaliacao',
        '7': 'especialista'
    };
    
    // Se a opção digitada é uma opção válida do submenu (1-7)
    if (opcoesSubmenu[messageText]) {
        console.log('Processando opção ' + messageText + ' do submenu de ' + service);
        
        switch(messageText) {
            case '1': // Preço
                const respostaPreco = getRespostaSubmenu(service, 'preco');
                await sendReply(cleanPhone, respostaPreco + '\n\n' +
                    '📌 Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '2': // Prazo
                const respostaPrazo = getRespostaSubmenu(service, 'prazo');
                await sendReply(cleanPhone, respostaPrazo + '\n\n' +
                    '📌 Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '3': // Documentos
                const respostaDocs = getRespostaSubmenu(service, 'documentos');
                await sendReply(cleanPhone, respostaDocs + '\n\n' +
                    '📌 Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '4': // Processo
                const respostaProcesso = getRespostaSubmenu(service, 'processo');
                await sendReply(cleanPhone, respostaProcesso + '\n\n' +
                    '📌 Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;
                
            case '5': // Visto Negado / Onde Fazer
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
                               '📌 Você está em: PASSAPORTE\n' +
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
                               '📌 Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                               'Digite outra opção (1-7) ou 0 para menu principal';
                    await sendReply(cleanPhone, msg);
                }
                break;
                
            case '6': // Avaliação Gratuita
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
                           '📌 Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                           'Digite outra opção (1-7) ou 0 para menu principal';
                await sendReply(cleanPhone, msg);
                break;
                
            case '7': // Falar com Especialista
                const msgEsp = '👨‍💼 FALAR COM ESPECIALISTA - ' + getServiceName(service).toUpperCase() + '\n\n' +
                              'Meu nome é Moisés e estou aqui para ajudar!\n\n' +
                              '📱 WhatsApp: https://wa.me/5521974601812\n\n' +
                              '📧 E-mail: contato@getvisa.com.br\n\n' +
                              '📌 Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                              'Digite outra opção (1-7) ou 0 para menu principal';
                await sendReply(cleanPhone, msgEsp);
                break;
        }
        return;
    }
    
    // Se digitou 9, mostra o menu do serviço atual novamente
    if (messageText === '9') {
        const submenuTexto = getSubmenu(service);
        await sendReply(cleanPhone, submenuTexto);
        return;
    }
    
    // Se não é uma opção válida do submenu, mostra mensagem de erro
    // mas MANTÉM o contexto do submenu atual
    const erroMsg = '❌ Opção inválida!\n\n' +
                   'Você está no menu: ' + getServiceName(service).toUpperCase() + '\n\n' +
                   'Opções disponíveis:\n' +
                   getSubmenu(service) + '\n\n' +
                   '💡 Para escolher outro serviço, digite 0 primeiro.';
    await sendReply(cleanPhone, erroMsg);
}

// Função para processar menu principal (quando não está em submenu)
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
        
        // Muda para submenu e salva o serviço
        state.nivel = 'submenu';
        state.service = serviceKey;
        userState.set(cleanPhone, state);
        
        // Mostra o submenu do serviço escolhido
        const submenuTexto = getSubmenu(serviceKey);
        await sendReply(cleanPhone, submenuTexto);
        return;
    }
    
    // Opção 7 - Ajuda (menu principal)
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
    
    // Se não reconheceu a opção no menu principal
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

// CONTEÚDO COMPLETO DAS OPÇÕES 3 E 4 DO MENU PRINCIPAL
function getRespostaSubmenu(servico, opcao) {
    var respostas = {
        preco: {
            visto_americano: '💰 INVESTIMENTO - VISTO AMERICANO\n\n' +
                           '💵 Taxa Consular (DS-160): ~R$ 950,00\n' +
                           '💼 Assessoria GetVisa: R$ 350,00\n\n' +
                           '✅ INCLUI NO NOSSO SERVIÇO:\n' +
                           '• Preenchimento completo do DS-160\n' +
                           '• Agendamento da entrevista no CASV\n' +
                           '• Agendamento no Consulado Americano\n' +
                           '• Preparação completa para entrevista\n' +
                           '• Simulado de entrevista\n' +
                           '• Acompanhamento até retirada do passaporte\n' +
                           '• Suporte via WhatsApp durante todo processo\n\n' +
                           '📌 FORMAS DE PAGAMENTO:\n' +
                           '• Pix\n' +
                           '• Cartão de crédito (até 12x)\n' +
                           '• Boleto bancário\n\n' +
                           '💡 A taxa consular é paga diretamente ao consulado.',

            visto_canadense: '💰 INVESTIMENTO - VISTO CANADENSE\n\n' +
                            '💵 Taxa Consular: ~R$ 750,00\n' +
                            '💼 Assessoria GetVisa: R$ 400,00\n\n' +
                            '✅ INCLUI NO NOSSO SERVIÇO:\n' +
                            '• Análise completa do perfil\n' +
                            '• Preenchimento da aplicação GCKey\n' +
                            '• Upload de documentos no sistema IRCC\n' +
                            '• Agendamento da biometria\n' +
                            '• Carta de intenção personalizada\n' +
                            '• Preparação para entrevista (se solicitada)\n' +
                            '• Acompanhamento até decisão final\n' +
                            '• Suporte via WhatsApp\n\n' +
                            '📌 FORMAS DE PAGAMENTO:\n' +
                            '• Pix\n' +
                            '• Cartão de crédito (até 12x)\n' +
                            '• Boleto bancário',

            visto_australiano: '💰 INVESTIMENTO - VISTO AUSTRALIANO\n\n' +
                              '💵 Taxa Consular: ~R$ 850,00\n' +
                              '💼 Assessoria GetVisa: R$ 450,00\n\n' +
                              '✅ INCLUI NO NOSSO SERVIÇO:\n' +
                              '• Análise detalhada do perfil migratório\n' +
                              '• Preenchimento da aplicação ImmiAccount\n' +
                              '• Tradução juramentada de documentos\n' +
                              '• Carta de intenção em inglês\n' +
                              '• Roteiro de viagem personalizado\n' +
                              '• Comprovação financeira adequada\n' +
                              '• Acompanhamento até decisão\n' +
                              '• Suporte via WhatsApp\n\n' +
                              '📌 FORMAS DE PAGAMENTO:\n' +
                              '• Pix\n' +
                              '• Cartão de crédito (até 12x)\n' +
                              '• Boleto bancário',

            eta_uk: '💰 INVESTIMENTO - eTA UK (REINO UNIDO)\n\n' +
                    '💵 Taxa Governamental: ~R$ 120,00\n' +
                    '💼 Assessoria GetVisa: R$ 150,00\n\n' +
                    '✅ INCLUI NO NOSSO SERVIÇO:\n' +
                    '• Preenchimento da aplicação online\n' +
                    '• Validação completa dos dados\n' +
                    '• Verificação de pendências\n' +
                    '• Acompanhamento da aprovação\n' +
                    '• Envio do eTA por e-mail\n' +
                    '• Suporte via WhatsApp\n\n' +
                    '⚡ Processo 100% online e rápido!\n\n' +
                    '📌 FORMAS DE PAGAMENTO:\n' +
                    '• Pix\n' +
                    '• Cartão de crédito',

            eta_canadense: '💰 INVESTIMENTO - eTA CANADENSE\n\n' +
                          '💵 Taxa Governamental: ~R$ 50,00\n' +
                          '💼 Assessoria GetVisa: R$ 100,00\n\n' +
                          '✅ INCLUI NO NOSSO SERVIÇO:\n' +
                          '• Aplicação online rápida\n' +
                          '• Validação de documentos\n' +
                          '• Verificação de elegibilidade\n' +
                          '• Acompanhamento da aprovação\n' +
                          '• Envio do eTA por e-mail\n' +
                          '• Suporte via WhatsApp\n\n' +
                          '⚡ Aprovação em até 24 horas!\n\n' +
                          '📌 FORMAS DE PAGAMENTO:\n' +
                          '• Pix\n' +
                          '• Cartão de crédito',

            passaporte: '💰 INVESTIMENTO - PASSAPORTE\n\n' +
                       '💵 Taxa PF (GRU): ~R$ 257,25\n' +
                       '💼 Assessoria GetVisa: R$ 150,00\n\n' +
                       '✅ INCLUI NO NOSSO SERVIÇO:\n' +
                       '• Agendamento no site da Polícia Federal\n' +
                       '• Conferência de toda documentação\n' +
                       '• Preenchimento do formulário online\n' +
                       '• Emissão da GRU para pagamento\n' +
                       '• Orientações para o dia do atendimento\n' +
                       '• Acompanhamento da emissão\n' +
                       '• Suporte via WhatsApp\n\n' +
                       '📌 FORMAS DE PAGAMENTO:\n' +
                       '• Pix\n' +
                       '• Cartão de crédito\n' +
                       '• Boleto bancário'
        },
        
        prazo: {
            visto_americano: '⏱️ PRAZO - VISTO AMERICANO\n\n' +
                           '📅 ETAPAS E PRAZOS:\n\n' +
                           '1️⃣ Preenchimento DS-160: 1-2 dias\n' +
                           '2️⃣ Agendamento CASV/Consulado: 1-8 semanas\n' +
                           '   (depende da disponibilidade)\n' +
                           '3️⃣ Coleta biométrica (CASV): 1 dia\n' +
                           '4️⃣ Entrevista no Consulado: 1 dia\n' +
                           '5️⃣ Análise consular: 7-10 dias úteis\n' +
                           '6️⃣ Retorno do passaporte: 5-7 dias úteis\n\n' +
                           '⏰ TEMPO TOTAL ESTIMADO:\n' +
                           '• 30 a 40 dias (em média)\n\n' +
                           '⚡ DICA: Agendamos na primeira data disponível!\n' +
                           '🗓️ Melhor época: Evite dezembro e julho (alta temporada)',

            visto_canadense: '⏱️ PRAZO - VISTO CANADENSE\n\n' +
                            '📅 ETAPAS E PRAZOS:\n\n' +
                            '1️⃣ Análise e preparação: 1-2 dias\n' +
                            '2️⃣ Aplicação online (GCKey): 1 dia\n' +
                            '3️⃣ Agendamento biometria: 1-4 semanas\n' +
                            '4️⃣ Coleta biométrica: 1 dia\n' +
                            '5️⃣ Processamento IRCC: 4-8 semanas\n' +
                            '6️⃣ Envio do passaporte: 2-3 dias úteis\n\n' +
                            '⏰ TEMPO TOTAL ESTIMADO:\n' +
                            '• 30 a 60 dias\n\n' +
                            '📊 O processamento varia conforme:\n' +
                            '• País de residência\n' +
                            '• Tipo de visto solicitado\n' +
                            '• Volume de aplicações no período',

            visto_australiano: '⏱️ PRAZO - VISTO AUSTRALIANO\n\n' +
                              '📅 ETAPAS E PRAZOS:\n\n' +
                              '1️⃣ Análise de perfil: 1 dia\n' +
                              '2️⃣ Preparação de documentos: 2-3 dias\n' +
                              '3️⃣ Aplicação ImmiAccount: 1 dia\n' +
                              '4️⃣ Análise do governo australiano:\n' +
                              '   • 75% dos casos: 18 dias\n' +
                              '   • 90% dos casos: 38 dias\n' +
                              '5️⃣ Notificação de decisão: Por e-mail\n\n' +
                              '⏰ TEMPO TOTAL ESTIMADO:\n' +
                              '• 15 a 40 dias\n\n' +
                              '⚡ DICA: Quanto mais completa a documentação,\n' +
                              'mais rápida a análise!',

            eta_uk: '⏱️ PRAZO - eTA UK (REINO UNIDO)\n\n' +
                    '📅 PROCESSO SUPER RÁPIDO:\n\n' +
                    '1️⃣ Coleta de dados: 30 minutos\n' +
                    '2️⃣ Aplicação online: Imediata\n' +
                    '3️⃣ Análise automatizada: Até 72 horas\n' +
                    '4️⃣ Aprovação: Recebe por e-mail\n\n' +
                    '⏰ TEMPO TOTAL ESTIMADO:\n' +
                    '• 1 a 3 dias úteis\n\n' +
                    '✅ Vantagens:\n' +
                    '• Não precisa ir ao consulado\n' +
                    '• Não precisa de entrevista\n' +
                    '• Válido por 2 anos\n' +
                    '• Múltiplas entradas',

            eta_canadense: '⏱️ PRAZO - eTA CANADENSE\n\n' +
                          '📅 PROCESSO EXPRESS:\n\n' +
                          '1️⃣ Coleta de dados: 20 minutos\n' +
                          '2️⃣ Aplicação online: Imediata\n' +
                          '3️⃣ Análise automatizada: Minutos a 24h\n' +
                          '4️⃣ Aprovação: Recebe por e-mail\n\n' +
                          '⏰ TEMPO TOTAL ESTIMADO:\n' +
                          '• 1 dia (muitas aprovações em minutos!)\n\n' +
                          '✅ Vantagens:\n' +
                          '• Totalmente online\n' +
                          '• Sem entrevista\n' +
                          '• Válido por 5 anos\n' +
                          '• Múltiplas entradas',

            passaporte: '⏱️ PRAZO - PASSAPORTE\n\n' +
                       '📅 ETAPAS E PRAZOS:\n\n' +
                       '1️⃣ Agendamento PF: Imediato (sujeito a vagas)\n' +
                       '2️⃣ Atendimento no posto: Data agendada\n' +
                       '3️⃣ Emissão pela PF: 7-15 dias úteis\n' +
                       '4️⃣ Entrega nos Correios: 3-7 dias úteis\n\n' +
                       '⏰ TEMPO TOTAL ESTIMADO:\n' +
                       '• Comum: 10 a 20 dias úteis\n' +
                       '• Urgente: 3-5 dias úteis (taxa extra)\n\n' +
                       '⚠️ ATENÇÃO:\n' +
                       '• Agende com antecedência\n' +
                       '• Verifique a validade do seu passaporte atual\n' +
                       '• Para viagens, passaporte precisa ter\n' +
                       '  no mínimo 6 meses de validade'
        },
        
        // ==================== OPÇÃO 3: DOCUMENTOS ====================
        documentos: {
            visto_americano: '📄 DOCUMENTOS NECESSÁRIOS - VISTO AMERICANO\n\n' +
                           '🔴 DOCUMENTOS OBRIGATÓRIOS:\n\n' +
                           '📋 Documentos Pessoais:\n' +
                           '• Passaporte válido (mínimo 6 meses)\n' +
                           '• Passaportes anteriores (se tiver)\n' +
                           '• Foto 5x7 recente (fundo branco)\n' +
                           '• RG e CPF originais\n' +
                           '• Certidão de nascimento ou casamento\n\n' +
                           '💰 Documentos Financeiros:\n' +
                           '• Comprovante de renda (3 últimos meses)\n' +
                           '• Declaração de Imposto de Renda\n' +
                           '• Extratos bancários (3 meses)\n' +
                           '• Comprovante de investimentos\n\n' +
                           '🏠 Vínculos com o Brasil:\n' +
                           '• Comprovante de residência\n' +
                           '• Contrato de aluguel ou escritura de imóvel\n' +
                           '• Documento de veículo (se tiver)\n' +
                           '• Carteira de trabalho (páginas preenchidas)\n' +
                           '• Contrato social de empresa (se for sócio)\n\n' +
                           '📌 DOCUMENTOS RECOMENDADOS:\n' +
                           '• Carta do empregador (férias ou licença)\n' +
                           '• Histórico de viagens anteriores\n' +
                           '• Fotos de família e vida social no Brasil\n' +
                           '• Diploma de formação acadêmica\n\n' +
                           '💡 DICA IMPORTANTE:\n' +
                           'Quanto mais vínculos comprovar, maiores as chances!',

            visto_canadense: '📄 DOCUMENTOS NECESSÁRIOS - VISTO CANADENSE\n\n' +
                            '🔴 DOCUMENTOS OBRIGATÓRIOS:\n\n' +
                            '📋 Documentos Pessoais:\n' +
                            '• Passaporte válido\n' +
                            '• Foto digital (formato específico)\n' +
                            '• RG e CPF\n' +
                            '• Certidão de nascimento/casamento\n\n' +
                            '💰 Documentos Financeiros:\n' +
                            '• Comprovantes bancários (4 meses)\n' +
                            '• Declaração de IR (último ano)\n' +
                            '• Holerites (3 últimos meses)\n' +
                            '• Comprovante de bens (imóveis, veículos)\n\n' +
                            '🏠 Vínculos:\n' +
                            '• Carta do empregador\n' +
                            '• Comprovante de residência\n' +
                            '• Vínculos familiares no Brasil\n\n' +
                            '📝 Documentos Específicos:\n' +
                            '• Carta de intenção (nós elaboramos)\n' +
                            '• Roteiro de viagem detalhado\n' +
                            '• Reserva de hotel (provisória)\n' +
                            '• Seguro viagem (recomendado)\n\n' +
                            '⚠️ IMPORTANTE:\n' +
                            '• Documentos em português precisam de tradução juramentada\n' +
                            '• Tudo é enviado digitalmente pelo sistema IRCC',

            visto_australiano: '📄 DOCUMENTOS NECESSÁRIOS - VISTO AUSTRALIANO\n\n' +
                              '🔴 DOCUMENTOS OBRIGATÓRIOS:\n\n' +
                              '📋 Documentos Pessoais:\n' +
                              '• Passaporte válido (6 meses mín.)\n' +
                              '• Certidão de nascimento traduzida\n' +
                              '• RG e CPF\n' +
                              '• Fotos recentes\n\n' +
                              '💰 Documentos Financeiros:\n' +
                              '• Extratos bancários (3 meses)\n' +
                              '• Comprovante de renda\n' +
                              '• Declaração de IR\n' +
                              '• Comprovante de poupança/investimentos\n\n' +
                              '📝 Documentos da Viagem:\n' +
                              '• Roteiro detalhado da viagem\n' +
                              '• Carta de intenção em inglês\n' +
                              '• Reserva de hospedagem\n' +
                              '• Passagem aérea (provisória)\n' +
                              '• Seguro saúde internacional\n\n' +
                              '💼 Documentos Profissionais:\n' +
                              '• Carta do empregador (em inglês)\n' +
                              '• Contrato de trabalho\n' +
                              '• Diploma e certificados\n\n' +
                              '⚠️ ATENÇÃO:\n' +
                              '• Todos documentos precisam ser traduzidos\n' +
                              '• Sistema ImmiAccount aceita upload digital',

            eta_uk: '📄 DOCUMENTOS NECESSÁRIOS - eTA UK\n\n' +
                    '🟢 DOCUMENTAÇÃO SIMPLIFICADA:\n\n' +
                    '📋 Obrigatório:\n' +
                    '• Passaporte válido (biométrico)\n' +
                    '• E-mail válido para receber o eTA\n' +
                    '• Cartão de crédito para pagamento\n\n' +
                    '📝 Informações Necessárias:\n' +
                    '• Dados pessoais (igual passaporte)\n' +
                    '• Endereço residencial\n' +
                    '• Histórico de viagens (se tiver)\n' +
                    '• Dados de emprego/ocupação\n\n' +
                    '❌ NÃO PRECISA:\n' +
                    '• Comprovante de renda\n' +
                    '• Passagem aérea\n' +
                    '• Reserva de hotel\n' +
                    '• Seguro viagem\n' +
                    '• Tradução de documentos\n' +
                    '• Ir ao consulado\n\n' +
                    '✅ VANTAGENS:\n' +
                    '• Processo 100% online\n' +
                    '• Sem entrevista\n' +
                    '• Aprovação rápida\n' +
                    '• Válido por 2 anos',

            eta_canadense: '📄 DOCUMENTOS NECESSÁRIOS - eTA CANADENSE\n\n' +
                          '🟢 DOCUMENTAÇÃO MÍNIMA:\n\n' +
                          '📋 Obrigatório:\n' +
                          '• Passaporte válido\n' +
                          '• E-mail válido\n' +
                          '• Cartão de crédito (taxa CAD$ 7)\n\n' +
                          '📝 Informações Necessárias:\n' +
                          '• Dados do passaporte\n' +
                          '• Endereço residencial\n' +
                          '• Ocupação/emprego atual\n' +
                          '• Histórico de viagens (se tiver)\n\n' +
                          '❌ NÃO PRECISA:\n' +
                          '• Foto\n' +
                          '• Documentos financeiros\n' +
                          '• Comprovante de vínculos\n' +
                          '• Passagem ou hotel\n' +
                          '• Seguro viagem\n' +
                          '• Entrevista\n\n' +
                          '✅ VANTAGENS:\n' +
                          '• Super rápido (minutos)\n' +
                          '• Totalmente online\n' +
                          '• Válido por 5 anos\n' +
                          '• Múltiplas entradas',

            passaporte: '📄 DOCUMENTOS NECESSÁRIOS - PASSAPORTE\n\n' +
                       '🔴 DOCUMENTOS OBRIGATÓRIOS:\n\n' +
                       '📋 Para TODOS:\n' +
                       '• Documento de identidade (RG) original\n' +
                       '  (emitido há menos de 10 anos)\n' +
                       '• CPF (número ou documento)\n' +
                       '• Certidão de nascimento ou casamento\n' +
                       '  (original ou cópia autenticada)\n' +
                       '• Foto 5x7 recente (alguns postos tiram na hora)\n' +
                       '• Comprovante de pagamento da GRU\n\n' +
                       '👨 PARA HOMENS (18-45 anos):\n' +
                       '• Certificado de alistamento militar\n' +
                       '• Certificado de dispensa\n' +
                       '• OU comprovante de regularidade militar\n\n' +
                       '🗳️ PARA MAIORES DE 18 ANOS:\n' +
                       '• Título de eleitor\n' +
                       '• Comprovante de votação (última eleição)\n' +
                       '• OU certidão de quitação eleitoral\n\n' +
                       '📌 CASOS ESPECIAIS:\n' +
                       '• Passaporte anterior (se tiver)\n' +
                       '• Autorização para menores de 18 anos\n' +
                       '• Documento de naturalização (naturalizados)\n\n' +
                       '💡 DICA IMPORTANTE:\n' +
                       '• Verifique se o RG está em bom estado\n' +
                       '• RG não pode ser muito antigo (max 10 anos)\n' +
                       '• Leve documentos originais e cópias'
        },
        
        // ==================== OPÇÃO 4: PROCESSO ====================
        processo: {
            visto_americano: '🔄 PROCESSO COMPLETO - VISTO AMERICANO\n\n' +
                           '📋 PASSO A PASSO DETALHADO:\n\n' +
                           '1️⃣ ANÁLISE INICIAL (Dia 1)\n' +
                           '• Avaliamos seu perfil\n' +
                           '• Identificamos pontos fortes e fracos\n' +
                           '• Definimos estratégia personalizada\n\n' +
                           '2️⃣ PREENCHIMENTO DS-160 (Dia 1-2)\n' +
                           '• Coletamos todas suas informações\n' +
                           '• Preenchemos o formulário oficial\n' +
                           '• Revisamos todos os dados\n' +
                           '• Você aprova antes do envio\n\n' +
                           '3️⃣ PAGAMENTO DA TAXA (Dia 2-3)\n' +
                           '• Emitimos boleto da taxa consular\n' +
                           '• Você paga via banco ou cartão\n' +
                           '• Confirmamos o pagamento\n\n' +
                           '4️⃣ AGENDAMENTO CASV (Dia 3-4)\n' +
                           '• Agendamos coleta biométrica\n' +
                           '• Data mais próxima disponível\n' +
                           '• Enviamos confirmação\n\n' +
                           '5️⃣ AGENDAMENTO CONSULAR (Dia 3-4)\n' +
                           '• Agendamos sua entrevista\n' +
                           '• Escolhemos melhor data/horário\n' +
                           '• Enviamos carta de agendamento\n\n' +
                           '6️⃣ COLETA BIOMÉTRICA - CASV\n' +
                           '• Você vai ao CASV na data marcada\n' +
                           '• Coleta de digitais e foto\n' +
                           '• Duração: ~30 minutos\n\n' +
                           '7️⃣ PREPARAÇÃO PARA ENTREVISTA\n' +
                           '• Simulado completo de entrevista\n' +
                           '• Lista de possíveis perguntas\n' +
                           '• Dicas de postura e vestimenta\n' +
                           '• Documentação organizada\n\n' +
                           '8️⃣ ENTREVISTA NO CONSULADO\n' +
                           '• Comparecimento na data marcada\n' +
                           '• Entrevista com oficial consular\n' +
                           '• Duração: 5-15 minutos\n' +
                           '• Resultado imediato (aprovado/negado)\n\n' +
                           '9️⃣ RETIRADA DO PASSAPORTE\n' +
                           '• Após aprovação, passaporte fica retido\n' +
                           '• Retorno em 5-7 dias úteis\n' +
                           '• Retirada no local escolhido\n' +
                           '• Ou entrega via Correios\n\n' +
                           '✅ NOSSO ACOMPANHAMENTO:\n' +
                           '• Suporte WhatsApp em todas etapas\n' +
                           '• Lembretes de datas importantes\n' +
                           '• Auxílio em caso de pendências\n' +
                           '• Comemoração na aprovação! 🎉',

            visto_canadense: '🔄 PROCESSO COMPLETO - VISTO CANADENSE\n\n' +
                            '📋 PASSO A PASSO DETALHADO:\n\n' +
                            '1️⃣ ANÁLISE DE PERFIL (Dia 1)\n' +
                            '• Avaliamos seu perfil migratório\n' +
                            '• Verificamos elegibilidade\n' +
                            '• Definimos melhor estratégia\n\n' +
                            '2️⃣ PREPARAÇÃO DE DOCUMENTOS (Dia 1-3)\n' +
                            '• Listamos documentos necessários\n' +
                            '• Orientamos traduções juramentadas\n' +
                            '• Revisamos toda documentação\n\n' +
                            '3️⃣ CRIAÇÃO GCKey (Dia 2)\n' +
                            '• Criamos sua conta no sistema IRCC\n' +
                            '• Configuramos perfil completo\n' +
                            '• Vinculamos sua aplicação\n\n' +
                            '4️⃣ PREENCHIMENTO DA APLICAÇÃO (Dia 2-3)\n' +
                            '• Preenchemos formulários oficiais\n' +
                            '• Elaboramos carta de intenção\n' +
                            '• Organizamos documentos para upload\n\n' +
                            '5️⃣ PAGAMENTO DAS TAXAS (Dia 3)\n' +
                            '• Taxa de processamento\n' +
                            '• Taxa de biometria\n' +
                            '• Pagamento online via cartão\n\n' +
                            '6️⃣ UPLOAD DE DOCUMENTOS (Dia 3)\n' +
                            '• Enviamos todos documentos digitalizados\n' +
                            '• Sistema IRCC recebe e processa\n' +
                            '• Confirmação de recebimento\n\n' +
                            '7️⃣ AGENDAMENTO BIOMETRIA (Dia 3-4)\n' +
                            '• Agendamos coleta biométrica\n' +
                            '• No centro de solicitação de visto (VAC)\n' +
                            '• Data mais próxima disponível\n\n' +
                            '8️⃣ COLETA BIOMÉTRICA\n' +
                            '• Comparecimento no VAC\n' +
                            '• Coleta de digitais e foto\n' +
                            '• Duração: ~20 minutos\n\n' +
                            '9️⃣ PROCESSAMENTO IRCC (4-8 semanas)\n' +
                            '• Governo canadense analisa o caso\n' +
                            '• Pode solicitar documentos extras\n' +
                            '• Análise de background check\n\n' +
                            '🔟 DECISÃO E ENVIO DO PASSAPORTE\n' +
                            '• Se aprovado, solicitam passaporte\n' +
                            '• Envio para VAC ou consulado\n' +
                            '• Visto é colado no passaporte\n' +
                            '• Retorno em 5-10 dias\n\n' +
                            '✅ NOSSO ACOMPANHAMENTO:\n' +
                            '• Monitoramento constante do status\n' +
                            '• Suporte em todas as fases\n' +
                            '• Auxílio com solicitações adicionais\n' +
                            '• Atualizações por WhatsApp',

            visto_australiano: '🔄 PROCESSO COMPLETO - VISTO AUSTRALIANO\n\n' +
                              '📋 PASSO A PASSO DETALHADO:\n\n' +
                              '1️⃣ ANÁLISE DE PERFIL (Dia 1)\n' +
                              '• Avaliação completa do perfil\n' +
                              '• Verificação de elegibilidade\n' +
                              '• Identificação do visto ideal\n\n' +
                              '2️⃣ PREPARAÇÃO DE DOCUMENTOS (Dia 1-3)\n' +
                              '• Lista personalizada de documentos\n' +
                              '• Tradução juramentada (inglês)\n' +
                              '• Revisão de cada documento\n\n' +
                              '3️⃣ CRIAÇÃO ImmiAccount (Dia 2)\n' +
                              '• Criamos conta no sistema australiano\n' +
                              '• Configuramos perfil completo\n' +
                              '• Iniciamos aplicação online\n\n' +
                              '4️⃣ PREENCHIMENTO DA APLICAÇÃO (Dia 2-3)\n' +
                              '• Preenchemos todos formulários\n' +
                              '• Carta de intenção em inglês\n' +
                              '• Roteiro de viagem detalhado\n\n' +
                              '5️⃣ UPLOAD DE DOCUMENTOS (Dia 3)\n' +
                              '• Digitalização de alta qualidade\n' +
                              '• Upload no sistema ImmiAccount\n' +
                              '• Organização por categorias\n\n' +
                              '6️⃣ PAGAMENTO DA TAXA (Dia 3)\n' +
                              '• Pagamento online no ImmiAccount\n' +
                              '• Via cartão de crédito internacional\n' +
                              '• Confirmação imediata\n\n' +
                              '7️⃣ ANÁLISE DO GOVERNO AUSTRALIANO\n' +
                              '• Departamento de Imigração analisa\n' +
                              '• 75% dos casos: até 18 dias\n' +
                              '• 90% dos casos: até 38 dias\n' +
                              '• Pode solicitar mais documentos\n\n' +
                              '8️⃣ DECISÃO\n' +
                              '• Notificação por e-mail\n' +
                              '• Visto eletrônico (não cola no passaporte)\n' +
                              '• Vinculado ao número do passaporte\n' +
                              '• Confirmação no sistema VEVO\n\n' +
                              '✅ NOSSO ACOMPANHAMENTO:\n' +
                              '• Monitoramento do ImmiAccount\n' +
                              '• Resposta rápida a exigências\n' +
                              '• Verificação do visto aprovado\n' +
                              '• Orientações para viagem',

            eta_uk: '🔄 PROCESSO COMPLETO - eTA UK\n\n' +
                    '📋 PASSO A PASSO SIMPLIFICADO:\n\n' +
                    '1️⃣ COLETA DE INFORMAÇÕES (30 min)\n' +
                    '• Dados pessoais básicos\n' +
                    '• Informações do passaporte\n' +
                    '• Histórico de viagens\n' +
                    '• Dados de contato\n\n' +
                    '2️⃣ APLICAÇÃO ONLINE (Imediato)\n' +
                    '• Preenchemos formulário oficial\n' +
                    '• Sistema do governo britânico\n' +
                    '• Revisão dos dados\n' +
                    '• Envio da aplicação\n\n' +
                    '3️⃣ PAGAMENTO (Imediato)\n' +
                    '• Taxa governamental: ~£10\n' +
                    '• Pagamento com cartão de crédito\n' +
                    '• Confirmação instantânea\n\n' +
                    '4️⃣ ANÁLISE AUTOMATIZADA (Até 72h)\n' +
                    '• Sistema cruza informações\n' +
                    '• Verifica bancos de dados\n' +
                    '• Background check rápido\n' +
                    '• Maioria aprovado em horas\n\n' +
                    '5️⃣ APROVAÇÃO (Por e-mail)\n' +
                    '• Recebe eTA por e-mail\n' +
                    '• Vinculado ao passaporte\n' +
                    '• Não precisa imprimir\n' +
                    '• Companhias aéreas verificam\n\n' +
                    '✅ VANTAGENS:\n' +
                    '• 100% online\n' +
                    '• Sem entrevista\n' +
                    '• Sem envio de documentos físicos\n' +
                    '• Válido por 2 anos\n' +
                    '• Múltiplas entradas (até 6 meses cada)',

            eta_canadense: '🔄 PROCESSO COMPLETO - eTA CANADENSE\n\n' +
                          '📋 PASSO A PASSO EXPRESS:\n\n' +
                          '1️⃣ COLETA DE DADOS (20 min)\n' +
                          '• Informações do passaporte\n' +
                          '• Dados pessoais básicos\n' +
                          '• Endereço e contato\n' +
                          '• Ocupação atual\n\n' +
                          '2️⃣ APLICAÇÃO ONLINE (Imediato)\n' +
                          '• Site oficial do governo canadense\n' +
                          '• Preenchemos formulário\n' +
                          '• Revisão cuidadosa\n' +
                          '• Envio eletrônico\n\n' +
                          '3️⃣ PAGAMENTO (Imediato)\n' +
                          '• Taxa: CAD$ 7 (canadense)\n' +
                          '• Apenas cartão de crédito\n' +
                          '• Processamento instantâneo\n\n' +
                          '4️⃣ ANÁLISE AUTOMATIZADA\n' +
                          '• Sistema IRCC verifica dados\n' +
                          '• Maioria aprovado em minutos\n' +
                          '• Máximo: 24 horas\n' +
                          '• Resposta por e-mail\n\n' +
                          '5️⃣ APROVAÇÃO\n' +
                          '• eTA enviado por e-mail\n' +
                          '• Vinculado eletronicamente\n' +
                          '• Companhias aéreas verificam\n' +
                          '• Não precisa de documento físico\n\n' +
                          '✅ VANTAGENS:\n' +
                          '• Processo mais rápido\n' +
                          '• Totalmente online\n' +
                          '• Válido por 5 anos\n' +
                          '• Múltiplas entradas\n' +
                          '• Permite conexões no Canadá',

            passaporte: '🔄 PROCESSO COMPLETO - PASSAPORTE\n\n' +
                       '📋 PASSO A PASSO DETALHADO:\n\n' +
                       '1️⃣ ANÁLISE DE DOCUMENTOS (Dia 1)\n' +
                       '• Verificamos documentação necessária\n' +
                       '• Conferimos pendências (militar, eleitoral)\n' +
                       '• Orientamos regularizações se preciso\n\n' +
                       '2️⃣ PREENCHIMENTO ONLINE (Dia 1)\n' +
                       '• Acessamos site da Polícia Federal\n' +
                       '• Preenchemos formulário completo\n' +
                       '• Geramos protocolo de solicitação\n\n' +
                       '3️⃣ EMISSÃO DA GRU (Dia 1)\n' +
                       '• Emitimos Guia de Recolhimento da União\n' +
                       '• Valor atual: R$ 257,25\n' +
                       '• Enviamos boleto para pagamento\n\n' +
                       '4️⃣ PAGAMENTO DA GRU (Dia 1-2)\n' +
                       '• Pagamento em qualquer banco\n' +
                       '• Compensação em 24-48h\n' +
                       '• Confirmação no sistema\n\n' +
                       '5️⃣ AGENDAMENTO NA PF (Dia 2-3)\n' +
                       '• Buscamos vagas disponíveis\n' +
                       '• Agendamos no posto mais próximo\n' +
                       '• Melhor data e horário\n' +
                       '• Enviamos confirmação\n\n' +
                       '6️⃣ ATENDIMENTO NA PF (Data agendada)\n' +
                       '• Comparecimento com documentos\n' +
                       '• Coleta de digitais e foto\n' +
                       '• Validação dos documentos\n' +
                       '• Protocolo de acompanhamento\n\n' +
                       '7️⃣ ACOMPANHAMENTO DA EMISSÃO\n' +
                       '• Monitoramento no site da PF\n' +
                       '• Prazo: 7-15 dias úteis\n' +
                       '• Avisamos quando estiver pronto\n\n' +
                       '8️⃣ RETIRADA DO PASSAPORTE\n' +
                       '• No posto da PF (agendar retirada)\n' +
                       '• Ou receber via Correios (taxa extra)\n' +
                       '• Levar documento de identidade\n' +
                       '• Conferir dados do passaporte\n\n' +
                       '⚠️ IMPORTANTE:\n' +
                       '• Não se atrase no dia agendado\n' +
                       '• Leve todos documentos originais\n' +
                       '• Se perder o prazo, precisa reagendar\n' +
                       '• Passaporte válido por 10 anos\n\n' +
                       '💡 DICA URGENTE:\n' +
                       '• Emergência? Temos opção de urgência\n' +
                       '• Emergência: 3-5 dias úteis\n' +
                       '• Consulte-nos sobre o processo!'
        }
    };
    
    var resposta = respostas[opcao] && respostas[opcao][servico];
    if (!resposta) {
        resposta = '📋 INFORMAÇÕES EM BREVE\n\n' +
                  'Estamos preparando conteúdo específico para ' + 
                  getServiceName(servico) + '.\n\n' +
                  'Enquanto isso, que tal falar com um especialista?\n' +
                  'Digite 7 para falar conosco!';
    }
    
    return resposta;
}

// CORREÇÃO: getMenuPrincipal mais claro
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
           'Digite o número da opção (1-7)';
}

// CORREÇÃO: getSubmenu mais claro
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




// CORREÇÃO: Tratamento de mensagens do webhook
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

            // Ignorar mensagens de grupo
            if (body.isGroup === true || body.isGroupMsg === true || 
                (body.chatId && body.chatId.indexOf('@g.us') !== -1)) {
                console.log('👥 Mensagem de grupo ignorada');
                return;
            }
            
            // Ignorar mensagens do próprio bot
            if (body.fromMe === true) {
                console.log('🤖 Mensagem do próprio bot ignorada');
                return;
            }
            
            // Ignorar mensagens de status
            if (body.isStatusReply === true || body.waitingMessage === true) {
                console.log('📊 Mensagem de status/waiting ignorada');
                return;
            }

            var messageText = '';
            var senderPhone = '';

            // Extrair texto da mensagem (múltiplos formatos)
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

            // Extrair número do telefone (múltiplos formatos)
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

            // Limpar número de telefone
            var cleanPhone = senderPhone.toString().replace(/\D/g, '');
            if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);
            if (cleanPhone.length < 10) {
                console.log('❌ Telefone inválido (' + cleanPhone + ')');
                await sendReply(senderPhone, 'Desculpe, não conseguimos identificar seu número. Tente novamente.');
                return;
            }

            console.log('✅ Telefone limpo: ' + cleanPhone);
            console.log('💬 Mensagem: "' + messageText + '"');

            // Verificar se é contato amigo (silenciar)
            var amigo = await supabase
                .from('contatos_amigos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (amigo.data) {
                console.log('👤 Contato AMIGO: ' + cleanPhone + ' - SILÊNCIO TOTAL');
                return;
            }

            // Verificar se é cliente finalizado
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

            // Verificar se é cliente ativo
            var ativo = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (ativo.data) {
                console.log('🔄 Cliente ATIVO: ' + cleanPhone);

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

                const msgAtivo = '👋 Olá ' + (ativo.data.nome || 'Cliente') + '!\n\n' +
                                'Seu processo está em andamento.' + etapaMsg + '\n' +
                                '📊 Status: ' + (ativo.data.status || 'em_processo') + '\n\n' +
                                'Como posso ajudar?\n\n' +
                                'Digite 0 para o MENU principal';
                await sendReply(cleanPhone, msgAtivo);
                
                // Processar a mensagem no menu
                await processarMenu(cleanPhone, messageText, body);
                return;
            }

            // Verificar se é cliente novo
            console.log('🔍 Verificando se é NOVO...');

            var novo = await supabase
                .from('clientes_novos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            var clienteExistente = novo.data;
            if (!clienteExistente) {
                var telefoneFormatado = formatarTelefone(cleanPhone);
                var novoFormatado = await supabase
                    .from('clientes_novos')
                    .select('*')
                    .eq('telefone', telefoneFormatado)
                    .maybeSingle();
                clienteExistente = novoFormatado.data;
            }

            if (clienteExistente) {
                console.log('👤 Cliente NOVO já cadastrado: ' + cleanPhone);
                await processarMenu(cleanPhone, messageText, body);
                return;
            }

            // NOVO CLIENTE - Cadastrar e enviar boas-vindas
            console.log('🆕 NOVO CLIENTE DETECTADO: ' + cleanPhone);
            var nomeCliente = body.name || 
                            (body.sender && body.sender.name) || 
                            body.pushName || 
                            body.contactName || 
                            'Cliente';
            
            var resultado = await cadastrarCliente(cleanPhone, nomeCliente);
            if (!resultado) {
                await sendReply(cleanPhone, 'Desculpe, estamos com problemas técnicos. Tente novamente em alguns minutos.');
                return;
            }
            
            console.log('✅ Cliente ' + cleanPhone + ' cadastrado com sucesso!');
            
            // Enviar mensagem de boas-vindas com menu
            const boasVindas = '🎉 SEJA BEM-VINDO À GETVISA!\n\n' +
                              'Olá ' + nomeCliente + '!\n\n' +
                              'Somos especialistas em assessoria para vistos e passaportes.\n\n' +
                              await getMenuPrincipal();
            
            await sendReply(cleanPhone, boasVindas);

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
app.post('/api/webhook/zapi', function(req, res) {
    console.log('WEBHOOK Z-API RECEBIDO');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    res.status(200).json({
        status: 'ok',
        received: true,
        timestamp: new Date().toISOString()
    });

    (async function() {
        try {
            var body = req.body;

            if (body.isGroup === true || body.isGroupMsg === true || (body.chatId && body.chatId.indexOf('@g.us') !== -1)) {
                console.log('Mensagem de grupo ignorada');
                return;
            }
            if (body.fromMe === true) {
                console.log('Mensagem do proprio bot ignorada');
                return;
            }
            if (body.isStatusReply === true || body.waitingMessage === true) {
                console.log('Mensagem de status/waiting ignorada');
                return;
            }

            var messageText = '';
            var senderPhone = '';

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

            console.log('Mensagem bruta: "' + messageText + '"');
            console.log('Telefone bruto: "' + senderPhone + '"');

            if (!senderPhone || !messageText || messageText.trim().length === 0) {
                console.log('Dados invalidos - ignorando');
                return;
            }

            messageText = messageText.trim();

            var cleanPhone = senderPhone.toString().replace(/\D/g, '');
            if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);
            if (cleanPhone.length < 10) {
                console.log('Telefone invalido (' + cleanPhone + ')');
                await sendReply(senderPhone, 'Desculpe, nao conseguimos identificar seu numero. Tente novamente.');
                return;
            }

            console.log('Telefone limpo: ' + cleanPhone);
            console.log('Mensagem: "' + messageText + '"');

            var amigo = await supabase
                .from('contatos_amigos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (amigo.data) {
                console.log('Contato AMIGO: ' + cleanPhone + ' - SILENCIO TOTAL');
                return;
            }

            var finalizado = await supabase
                .from('clientes_finalizados')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (finalizado.data) {
                console.log('Cliente FINALIZADO: ' + cleanPhone);
                await sendReply(cleanPhone, 'Muito obrigado por confiar na GetVisa!\n\nSeu processo foi concluido com sucesso.\n\nServico: ' + (finalizado.data.servico || 'nao informado') + '\nFinalizado em: ' + new Date(finalizado.data.data_finalizacao).toLocaleDateString('pt-BR') + '\n\nAvalie nosso servico: https://getvisa.com.br/avaliacao\n\nEstamos aqui para voce sempre que precisar!');
                return;
            }

            var ativo = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            if (ativo.data) {
                console.log('Cliente ATIVO: ' + cleanPhone);

                var etapaMsg = '';
                try {
                    var etapa = await supabase
                        .from('etapas_processo')
                        .select('etapa_atual')
                        .eq('cliente_telefone', cleanPhone)
                        .maybeSingle();

                    if (etapa.data) {
                        var etapaInfo = ETAPAS[etapa.data.etapa_atual];
                        etapaMsg = '\nEtapa atual: ' + (etapaInfo && etapaInfo.label || etapa.data.etapa_atual);
                    }
                } catch (err) {
                    console.log('Erro ao buscar etapa:', err);
                }

                await sendReply(cleanPhone, 'Ola!\n\nSeu processo esta em andamento.' + etapaMsg + '\n\nStatus: ' + (ativo.data.status || 'em_processo') + '\n\nDigite 0 para o MENU principal');
                return;
            }

            console.log('Verificando se e NOVO...');

            var novo = await supabase
                .from('clientes_novos')
                .select('*')
                .eq('telefone', cleanPhone)
                .maybeSingle();

            var clienteExistente = novo.data;
            if (!clienteExistente) {
                var telefoneFormatado = formatarTelefone(cleanPhone);
                var novoFormatado = await supabase
                    .from('clientes_novos')
                    .select('*')
                    .eq('telefone', telefoneFormatado)
                    .maybeSingle();
                clienteExistente = novoFormatado.data;
            }

            if (clienteExistente) {
                console.log('Cliente NOVO ja cadastrado: ' + cleanPhone);
                await processarMenu(cleanPhone, messageText, body);
                return;
            }

            console.log('🆕 NOVO CLIENTE: ' + cleanPhone);

var resultado = await cadastrarCliente(cleanPhone, 'Cliente');
if (!resultado) {
    await sendReply(cleanPhone, 'Desculpe, estamos com problemas técnicos. Tente novamente em alguns minutos.');
    return;
}

console.log('✅ Cliente cadastrado, iniciando onboarding');
await processarMenu(cleanPhone, messageText, body);

        } catch (error) {
            console.error('ERRO NO PROCESSAMENTO DO WEBHOOK:');
            console.error('Mensagem:', error.message);
            console.error('Stack:', error.stack);

            try {
                var phone = req.body && (req.body.phone || req.body.from) || null;
                if (phone) {
                    var cleanPhone = phone.toString().replace(/\D/g, '');
                    if (cleanPhone.length >= 10) {
                        await sendReply(cleanPhone, 'Desculpe, estamos com problemas tecnicos. Nossa equipe ja foi notificada e entrara em contato em breve.');
                    }
                }
            } catch (e) {
                console.error('Falha ao enviar mensagem de erro:', e);
            }
        }
    })();
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

app.get('/health', function(req, res) { res.status(200).send('OK'); });
app.get('/ping', function(req, res) { res.status(200).send('ok'); });

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
            try { await criarEtapaInicial(cliente.data.telefone); } catch (err) { console.error('Erro ao criar etapa:', err); }
        } else {
            var insert = await supabase.from('contatos_amigos').insert({
                telefone: cliente.data.telefone,
                nome: cliente.data.nome,
                criado_em: cliente.data.data_contato
            });
            if (insert.error) return res.status(500).json({ success: false, message: insert.error.message });
        }

        await supabase.from('clientes_novos').delete().eq('telefone', telefone);
        res.json({ success: true, message: 'Cliente ' + telefone + ' movido para ' + destino });
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
            erros: erros.length > 0 ? erros : undefined, 
            message: movidos + ' cliente(s) movido(s)' 
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



app.listen(PORT, '0.0.0.0', function() {
    console.log('Servidor rodando na porta ' + PORT);
    console.log('Painel: https://app-vistos.onrender.com/painel.html');
    console.log('Webhook: https://app-vistos.onrender.com/api/webhook/zapi');
});