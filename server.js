// ============================================================
//  SERVER.JS - GETVISA ASSESSORIA
//  VERSÃO COM PAINEL DE CONTROLE
// ============================================================

const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ============================================================
//  CONFIGURAÇÕES
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
//  CONSTANTES E MAPEAMENTOS
// ============================================================
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

const DATE_FIELDS = [
  'text-5', 'text-21', 'text-35', 'text-66', 'text-67', 'text-69',
  'text-61', 'text-62', 'spouse-dob', 'data_casamento_div',
  'data_divorcio', 'data_falecimento', 'text-50', 'text-44',
  'text-45', 'military_date_from', 'military_date_to', 'antecedentes_data'
];

const SPAM_DOMAINS = ['tempmail', 'mailinator', '10minutemail', 'guerrillamail', 'throwaway', 'fake', 'spam'];

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
//  RESPOSTAS PARA INTENÇÕES
// ============================================================
function getRespostaIntencao(intent, service = null) {
  const respostas = {
    'visto_americano': {
      default: `🇺🇸 *VISTO AMERICANO*\n\n✅ *Processo completo:*\n• Preenchimento DS-160\n• Agendamento da entrevista\n• Preparação para entrevista\n• Acompanhamento total\n\n💰 *Investimento:* Taxa ~R$ 950 + Assessoria R$ 350\n\n📋 *Quer saber mais?*\n• Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'visto_canadense': {
      default: `🇨🇦 *VISTO CANADENSE*\n\n✅ *Processo completo:*\n• Aplicação online GCKey\n• Biometria\n• Preparação de documentos\n• Acompanhamento total\n\n💰 *Investimento:* Taxa ~R$ 750 + Assessoria R$ 400\n\n📋 *Quer saber mais?*\n• Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'visto_australiano': {
      default: `🇦🇺 *VISTO AUSTRALIANO*\n\n✅ *Processo completo:*\n• Análise de perfil\n• Aplicação online ImmiAccount\n• Envio de documentos\n• Acompanhamento total\n\n💰 *Investimento:* Taxa ~R$ 850 + Assessoria R$ 450\n\n📋 *Quer saber mais?*\n• Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'eta_uk': {
      default: `🇬🇧 *eTA UK (REINO UNIDO)*\n\n✅ *Processo completo:*\n• Aplicação 100% online\n• Validação de dados\n• Acompanhamento\n\n💰 *Investimento:* Taxa ~R$ 120 + Assessoria R$ 150\n\n📋 *Quer saber mais?*\n• Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'passaporte': {
      default: `📘 *PASSAPORTE*\n\n✅ *Processo completo:*\n• Agendamento na PF\n• Orientação documental\n• Acompanhamento total\n\n💰 *Investimento:* Taxa PF ~R$ 257 + Assessoria R$ 150\n\n📋 *Quer saber mais?*\n• Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *5* para ONDE FAZER\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'preco': {
      default: `💰 *INVESTIMENTO DOS SERVIÇOS*\n\n🇺🇸 Visto Americano: Taxa ~R$ 950 + Assessoria R$ 350\n🇨🇦 Visto Canadense: Taxa ~R$ 750 + Assessoria R$ 400\n🇦🇺 Visto Australiano: Taxa ~R$ 850 + Assessoria R$ 450\n🇬🇧 eTA UK: ~R$ 120 + Assessoria R$ 150\n🇨🇦 eTA Canadense: ~R$ 50 + Assessoria R$ 100\n📘 Passaporte: Taxa ~R$ 257 + Assessoria R$ 150\n\n📋 *Qual serviço te interessa?*\n• Digite *1* 🇺🇸 Visto Americano\n• Digite *2* 🇨🇦 Visto Canadense\n• Digite *3* 🇦🇺 Visto Australiano\n• Digite *4* 🇬🇧 eTA UK\n• Digite *5* 🇨🇦 eTA Canadense\n• Digite *6* 📘 Passaporte\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'prazo': {
      default: `⏰ *PRAZOS DOS SERVIÇOS*\n\n🇺🇸 Visto Americano: 30-40 dias\n🇨🇦 Visto Canadense: 30-60 dias\n🇦🇺 Visto Australiano: 15-30 dias\n🇬🇧 eTA UK: 1-3 dias\n🇨🇦 eTA Canadense: 1 dia\n📘 Passaporte: 10-20 dias\n\n📋 *Qual serviço te interessa?*\n• Digite *1* 🇺🇸 Visto Americano\n• Digite *2* 🇨🇦 Visto Canadense\n• Digite *3* 🇦🇺 Visto Australiano\n• Digite *4* 🇬🇧 eTA UK\n• Digite *5* 🇨🇦 eTA Canadense\n• Digite *6* 📘 Passaporte\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'documentos': {
      default: `📄 *DOCUMENTOS NECESSÁRIOS*\n\n📌 *Gerais:*\n• Passaporte válido (mínimo 6 meses)\n• Foto 5x7 recente\n• Comprovante de renda\n• Extratos bancários\n\n📌 *Específicos:*\n• EUA: DS-160 preenchido\n• Canadá: Carta de intenção\n• Passaporte: RG, CPF, Título de Eleitor\n\n📋 *Para qual serviço você quer a lista completa?*\n• Digite *1* 🇺🇸 Visto Americano\n• Digite *2* 🇨🇦 Visto Canadense\n• Digite *6* 📘 Passaporte\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'visto_negado': {
      default: `⚠️ *VISTO NEGADO - RECUPERAÇÃO*\n\n📊 *Faça uma análise gratuita do seu caso:*\n🔗 https://getvisa.com.br/visto-americano-negado\n\n*O que fazemos:*\n✅ Análise do motivo da negativa\n✅ Correção do formulário\n✅ Documentação reforçada\n✅ Preparação para entrevista\n\n💰 *Assessoria especializada:* R$ 380\n\n📋 *Quer saber mais sobre o processo?*\n• Digite *4* para PROCESSO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    'iniciar_processo': {
      default: `✅ *Ótimo! Vamos iniciar seu processo!*\n\n📋 *Escolha o serviço:*\n\n1️⃣ 🇺🇸 Visto Americano\n2️⃣ 🇨🇦 Visto Canadense\n3️⃣ 🇦🇺 Visto Australiano\n4️⃣ 🇬🇧 eTA UK\n5️⃣ 🇨🇦 eTA Canadense\n6️⃣ 📘 Passaporte\n\n💬 *Digite o número ou me pergunte algo!*`
    }
  };

  return respostas[intent]?.default || '💬 *Desculpe, não entendi sua pergunta. Pode reformular?*';
}

// ============================================================
//  FUNÇÃO PARA DETECTAR INTENÇÃO
// ============================================================
function detectIntent(message) {
  const cleanMessage = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      const cleanKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (cleanMessage.includes(cleanKeyword)) {
        return intent;
      }
    }
  }
  return null;
}

// ============================================================
//  UTILITÁRIOS
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

function formatarDataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
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

// ============================================================
//  ANTI-SPAM
// ============================================================
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
//  ENVIO WHATSAPP
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
    
    console.log(`📱 WhatsApp enviado para ${cleanPhone}: ${response.status}`);
    return response.status === 200;
  } catch (error) {
    console.error('❌ Erro ao enviar WhatsApp:', error.message);
    return false;
  }
}

// ============================================================
//  ⭐ FUNÇÕES PARA AS 3 TABELAS
// ============================================================

// 1. BUSCAR CLIENTE NAS 3 TABELAS
async function buscarCliente(telefone) {
    console.log(`🔍 Buscando cliente ${telefone}...`);
    
    // 1️⃣ Busca em clientes_ativos
    const { data: ativo, error: err1 } = await supabase
        .from('clientes_ativos')
        .select('*')
        .eq('telefone', telefone)
        .maybeSingle();
    
    if (ativo) {
        console.log(`🟢 Cliente ATIVO encontrado: ${telefone}`);
        return { 
            dados: ativo, 
            tipo: 'ativo',
            tabela: 'clientes_ativos'
        };
    }
    
    // 2️⃣ Busca em clientes_novos
    const { data: novo, error: err2 } = await supabase
        .from('clientes_novos')
        .select('*')
        .eq('telefone', telefone)
        .maybeSingle();
    
    if (novo) {
        console.log(`🟡 Cliente NOVO encontrado: ${telefone}`);
        return { 
            dados: novo, 
            tipo: 'novo',
            tabela: 'clientes_novos'
        };
    }
    
    // 3️⃣ Busca em contatos_amigos
    const { data: amigo, error: err3 } = await supabase
        .from('contatos_amigos')
        .select('*')
        .eq('telefone', telefone)
        .maybeSingle();
    
    if (amigo) {
        console.log(`🤝 Contato AMIGO encontrado: ${telefone}`);
        return { 
            dados: amigo, 
            tipo: 'amigo',
            tabela: 'contatos_amigos'
        };
    }
    
    console.log(`📝 Cliente ${telefone} NÃO encontrado`);
    return null;
}

// 2. CADASTRAR NOVO CLIENTE
async function cadastrarCliente(telefone, nome = null) {
    console.log(`📝 Cadastrando ${telefone} como NOVO...`);
    
    const dadosCliente = {
        telefone: telefone,
        nome: nome || `Cliente_${telefone}`,
        data_contato: new Date().toISOString()
    };
    
    const { data, error } = await supabase
        .from('clientes_novos')
        .insert(dadosCliente)
        .select()
        .single();
    
    if (error) {
        console.error('❌ Erro ao cadastrar cliente:', error);
        return null;
    }
    
    console.log(`✅ Cliente ${telefone} cadastrado como NOVO`);
    return { dados: data, tipo: 'novo', tabela: 'clientes_novos' };
}

// ============================================================
//  VALIDAÇÃO DS-160
// ============================================================
function validateDS160(data) {
  const errors = [];
  
  const requiredQuestions = [
    { field: 'radio-visto-negado', message: 'Responda se já teve visto americano negado' },
    { field: 'radio-entrada-negada', message: 'Responda se já teve entrada negada nos EUA' },
    { field: 'radio-deportado', message: 'Responda se já foi deportado dos EUA' }
  ];
  
  for (const q of requiredQuestions) {
    if (!data[q.field] || data[q.field] === '') {
      errors.push(q.message);
    }
  }
  
  if (data['radio-visto-negado'] === 'one') {
    if (!data['text-visto-negado-ano'] || data['text-visto-negado-ano'] === '') {
      errors.push('Ano da negativa do visto é obrigatório');
    } else {
      const ano = parseInt(data['text-visto-negado-ano']);
      if (ano < 1900 || ano > 2026) {
        errors.push('Ano da negativa do visto inválido (use entre 1900 e 2026)');
      }
    }
  }
  
  if (data['radio-entrada-negada'] === 'one') {
    if (!data['text-entrada-negada-ano'] || data['text-entrada-negada-ano'] === '') {
      errors.push('Ano da negativa de entrada é obrigatório');
    } else {
      const ano = parseInt(data['text-entrada-negada-ano']);
      if (ano < 1900 || ano > 2026) {
        errors.push('Ano da negativa de entrada inválido (use entre 1900 e 2026)');
      }
    }
  }
  
  if (data['radio-deportado'] === 'one') {
    if (!data['text-deportado-ano'] || data['text-deportado-ano'] === '') {
      errors.push('Ano da deportação é obrigatório');
    } else {
      const ano = parseInt(data['text-deportado-ano']);
      if (ano < 1900 || ano > 2026) {
        errors.push('Ano da deportação inválido (use entre 1900 e 2026)');
      }
    }
    
    if (!data['select-deportado-duracao'] || data['select-deportado-duracao'] === '') {
      errors.push('Duração da deportação é obrigatória');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// ============================================================
//  ROTAS DE SAÚDE
// ============================================================
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/ping', (req, res) => {
  res.status(200).send('ok');
});

// ============================================================
//  ROTAS PARA O PAINEL
//  ============================================================

// Buscar pendentes
app.get('/api/painel/pendentes', async (req, res) => {
    try {
        const { data: pendentes, error: err1 } = await supabase
            .from('clientes_novos')
            .select('*')
            .order('data_contato', { ascending: false });

        if (err1) {
            console.error('❌ Erro ao buscar pendentes:', err1);
            return res.status(500).json({ success: false, message: err1.message });
        }

        const { count: total_ativos, error: err2 } = await supabase
            .from('clientes_ativos')
            .select('*', { count: 'exact', head: true });

        const { count: total_amigos, error: err3 } = await supabase
            .from('contatos_amigos')
            .select('*', { count: 'exact', head: true });

        res.json({
            success: true,
            pendentes: pendentes || [],
            total_ativos: total_ativos || 0,
            total_amigos: total_amigos || 0
        });

    } catch (error) {
        console.error('❌ Erro ao buscar pendentes:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mover 1 cliente
app.post('/api/painel/mover', async (req, res) => {
    try {
        const { telefone, destino } = req.body;

        if (!telefone || !destino) {
            return res.status(400).json({ success: false, message: 'Telefone e destino são obrigatórios' });
        }

        if (!['ativo', 'amigo'].includes(destino)) {
            return res.status(400).json({ success: false, message: 'Destino deve ser "ativo" ou "amigo"' });
        }

        const { data: cliente, error: buscaError } = await supabase
            .from('clientes_novos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();

        if (buscaError) {
            console.error('❌ Erro ao buscar cliente:', buscaError);
            return res.status(500).json({ success: false, message: buscaError.message });
        }

        if (!cliente) {
            return res.status(404).json({ success: false, message: 'Cliente não encontrado em clientes_novos' });
        }

        if (destino === 'ativo') {
            const { error: insertError } = await supabase
                .from('clientes_ativos')
                .insert({
                    telefone: cliente.telefone,
                    nome: cliente.nome,
                    criado_em: cliente.data_contato,
                    atualizado_em: new Date().toISOString()
                });

            if (insertError) {
                console.error('❌ Erro ao inserir em ativos:', insertError);
                return res.status(500).json({ success: false, message: insertError.message });
            }
        } else {
            const { error: insertError } = await supabase
                .from('contatos_amigos')
                .insert({
                    telefone: cliente.telefone,
                    nome: cliente.nome,
                    criado_em: cliente.data_contato
                });

            if (insertError) {
                console.error('❌ Erro ao inserir em amigos:', insertError);
                return res.status(500).json({ success: false, message: insertError.message });
            }
        }

        const { error: deleteError } = await supabase
            .from('clientes_novos')
            .delete()
            .eq('telefone', telefone);

        if (deleteError) {
            console.error('❌ Erro ao deletar de novos:', deleteError);
            return res.status(500).json({ success: false, message: deleteError.message });
        }

        res.json({ success: true, message: `Cliente ${telefone} movido para ${destino}` });

    } catch (error) {
        console.error('❌ Erro ao mover cliente:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mover vários clientes
app.post('/api/painel/mover-varios', async (req, res) => {
    try {
        const { telefones, destino } = req.body;

        if (!telefones || !Array.isArray(telefones) || telefones.length === 0) {
            return res.status(400).json({ success: false, message: 'Lista de telefones é obrigatória' });
        }

        if (!['ativo', 'amigo'].includes(destino)) {
            return res.status(400).json({ success: false, message: 'Destino deve ser "ativo" ou "amigo"' });
        }

        let movidos = 0;
        let erros = [];

        for (const telefone of telefones) {
            try {
                const { data: cliente } = await supabase
                    .from('clientes_novos')
                    .select('*')
                    .eq('telefone', telefone)
                    .maybeSingle();

                if (!cliente) {
                    erros.push(`${telefone}: não encontrado`);
                    continue;
                }

                if (destino === 'ativo') {
                    await supabase
                        .from('clientes_ativos')
                        .insert({
                            telefone: cliente.telefone,
                            nome: cliente.nome,
                            criado_em: cliente.data_contato,
                            atualizado_em: new Date().toISOString()
                        });
                } else {
                    await supabase
                        .from('contatos_amigos')
                        .insert({
                            telefone: cliente.telefone,
                            nome: cliente.nome,
                            criado_em: cliente.data_contato
                        });
                }

                await supabase
                    .from('clientes_novos')
                    .delete()
                    .eq('telefone', telefone);

                movidos++;
            } catch (err) {
                erros.push(`${telefone}: ${err.message}`);
            }
        }

        res.json({
            success: true,
            movidos,
            erros: erros.length > 0 ? erros : undefined,
            message: `${movidos} cliente(s) movido(s)`
        });

    } catch (error) {
        console.error('❌ Erro ao mover clientes:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
//  RESPOSTAS DOS SUBMENUS
// ============================================================
function getRespostaSubmenu(servico, opcao) {
  const respostas = {
    preco: {
      visto_americano: `💰 *INVESTIMENTO - VISTO AMERICANO*\n\n🇺🇸 *Taxa Consular:* ~R$ 950\n📋 *Assessoria:* R$ 350\n\n✅ Inclui: DS-160, agendamento, preparação para entrevista e acompanhamento total.\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      visto_canadense: `💰 *INVESTIMENTO - VISTO CANADENSE*\n\n🇨🇦 *Taxa Consular:* ~R$ 750\n📋 *Assessoria:* R$ 400\n\n✅ Inclui: Aplicação online, documentação, preparação para biometria e entrevista.\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      visto_australiano: `💰 *INVESTIMENTO - VISTO AUSTRALIANO*\n\n🇦🇺 *Taxa Consular:* ~R$ 850\n📋 *Assessoria:* R$ 450\n\n✅ Inclui: Análise de perfil, aplicação online, documentação específica.\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      eta_uk: `💰 *INVESTIMENTO - eTA UK (REINO UNIDO)*\n\n🇬🇧 *Taxa:* ~R$ 120\n📋 *Assessoria:* R$ 150\n\n✅ Inclui: Aplicação online, validação de dados, acompanhamento.\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      eta_canadense: `💰 *INVESTIMENTO - eTA CANADENSE*\n\n🇨🇦 *Taxa:* ~R$ 50\n📋 *Assessoria:* R$ 100\n\n✅ Inclui: Aplicação online rápida, validação, entrega por e-mail.\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      passaporte: `💰 *INVESTIMENTO - PASSAPORTE*\n\n📘 *Taxa PF:* ~R$ 257\n📋 *Assessoria:* R$ 150\n\n✅ Inclui: Agendamento, orientação documental, acompanhamento.\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *5* para ONDE FAZER\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    prazo: {
      visto_americano: `⏰ *PRAZO - VISTO AMERICANO*\n\n📅 *Agendamento:* até 8 semanas\n🔍 *Análise consular:* 7 a 10 dias úteis\n📬 *Retorno do passaporte:* 5 a 7 dias úteis\n\n🕒 *Total estimado:* 30 a 40 dias\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      visto_canadense: `⏰ *PRAZO - VISTO CANADENSE*\n\n📅 *Processamento:* 4 a 8 semanas\n📬 *Retorno:* 2 a 3 dias úteis\n\n🕒 *Total estimado:* 30 a 60 dias\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      visto_australiano: `⏰ *PRAZO - VISTO AUSTRALIANO*\n\n📅 *Processamento:* 2 a 4 semanas\n\n🕒 *Total estimado:* 15 a 30 dias\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      eta_uk: `⏰ *PRAZO - eTA UK*\n\n📅 *Processamento:* até 72 horas\n\n🕒 *Total estimado:* 1 a 3 dias\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      eta_canadense: `⏰ *PRAZO - eTA CANADENSE*\n\n📅 *Processamento:* até 24 horas\n\n🕒 *Total estimado:* 1 dia\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      passaporte: `⏰ *PRAZO - PASSAPORTE*\n\n📅 *Emissão:* 7 a 15 dias úteis\n\n🕒 *Total estimado:* 10 a 20 dias\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *5* para ONDE FAZER\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    documentos: {
      visto_americano: `📄 *DOCUMENTOS - VISTO AMERICANO*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido (mínimo 6 meses)\n• Foto 5x7 recente\n• Comprovante da taxa consular\n• DS-160 preenchido\n\n📌 *RECOMENDADOS:*\n• Comprovante de renda\n• Extratos bancários\n• Comprovante de imóvel/veículo\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      visto_canadense: `📄 *DOCUMENTOS - VISTO CANADENSE*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido\n• Foto digital\n• Comprovantes financeiros\n\n📌 *RECOMENDADOS:*\n• Carta de intenção\n• Histórico de viagens\n• Vínculos com o Brasil\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      visto_australiano: `📄 *DOCUMENTOS - VISTO AUSTRALIANO*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido\n• Comprovantes de recursos\n• Seguro saúde (recomendado)\n\n📌 *RECOMENDADOS:*\n• Roteiro de viagem\n• Reservas de hospedagem\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      eta_uk: `📄 *DOCUMENTOS - eTA UK*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido\n• E-mail válido\n• Dados de viagem\n\n📌 *PROCESSO:*\n• Aplicação 100% online\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      eta_canadense: `📄 *DOCUMENTOS - eTA CANADENSE*\n\n📌 *OBRIGATÓRIOS:*\n• Passaporte válido\n• Cartão de crédito para taxa\n• E-mail válido\n\n📌 *PROCESSO:*\n• Aplicação 100% online\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`,
      passaporte: `📄 *DOCUMENTOS - PASSAPORTE*\n\n📌 *OBRIGATÓRIOS:*\n• RG original\n• CPF\n• Título de eleitor (homens 18-70)\n• Certidão de nascimento/casamento\n• Comprovante de quitação militar (homens)\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *5* para ONDE FAZER\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`
    },
    processo: {
      visto_americano: `📋 *PROCESSO - VISTO AMERICANO*\n\n• Análise de perfil\n• Preenchimento do DS-160\n• Pagamento da taxa consular\n• Agendamento da entrevista\n• Coleta biométrica (CASV)\n• Entrevista no Consulado\n• Retirada do passaporte\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Qual etapa você quer saber mais?*`,
      visto_canadense: `📋 *PROCESSO - VISTO CANADENSE*\n\n• Análise de perfil\n• Aplicação online GCKey\n• Pagamento das taxas\n• Agendamento da biometria\n• Coleta de dados biométricos\n• Entrevista (se solicitado)\n• Decisão e envio\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Qual etapa você quer saber mais?*`,
      visto_australiano: `📋 *PROCESSO - VISTO AUSTRALIANO*\n\n• Análise de perfil\n• Aplicação online ImmiAccount\n• Pagamento das taxas\n• Envio de documentos\n• Acompanhamento\n• Decisão por e-mail\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Qual etapa você quer saber mais?*`,
      eta_uk: `📋 *PROCESSO - eTA UK*\n\n• Coleta de dados\n• Aplicação online\n• Pagamento da taxa\n• Análise automatizada\n• Recebimento por e-mail\n• Vincular ao passaporte\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Qual etapa você quer saber mais?*`,
      eta_canadense: `📋 *PROCESSO - eTA CANADENSE*\n\n• Coleta de dados\n• Aplicação online\n• Pagamento da taxa\n• Análise automatizada\n• Recebimento por e-mail\n• Vincular ao passaporte\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Qual etapa você quer saber mais?*`,
      passaporte: `📋 *PROCESSO - PASSAPORTE*\n\n• Agendamento no site da PF\n• Separação dos documentos\n• Pagamento da GRU\n• Comparecimento ao posto\n• Coleta de dados biométricos\n• Aguardar emissão\n• Retirada do passaporte\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *5* para ONDE FAZER\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Qual etapa você quer saber mais?*`
    }
  };
  
  let resposta = respostas[opcao]?.[servico];
  if (!resposta) {
    resposta = `ℹ️ *INFORMAÇÕES EM BREVE*\n\nEstamos preparando o conteúdo específico para ${servico.replace('_', ' ').toUpperCase()}.\n\n📋 *Quer falar com um especialista?*\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`;
  }
  
  return resposta;
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
      const telefoneCliente = data['text-77'] || null;

      // ============================================================
      //  📝 SALVAR NA TABELA formulario_ds160
      //  ============================================================
      let formularioId = null;
      try {
        const { data: formulario, error: insertError } = await supabase
          .from('formulario_ds160')
          .insert({
            nome_completo: nome,
            email: emailCliente,
            telefone: telefoneCliente,
            dados_completos: data,
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

      // ============================================================
      //  🔄 ATUALIZAR CLIENTE (se existir)
      //  ============================================================
      if (telefoneCliente) {
        try {
          // Busca se o cliente existe em clientes_novos
          const { data: clienteNovo } = await supabase
            .from('clientes_novos')
            .select('*')
            .eq('telefone', telefoneCliente)
            .maybeSingle();

          if (clienteNovo) {
            // Move para clientes_ativos (já enviou DS-160, está em processo)
            await supabase
              .from('clientes_ativos')
              .insert({
                telefone: clienteNovo.telefone,
                nome: clienteNovo.nome || nome,
                email: emailCliente,
                status: 'em_processo',
                criado_em: clienteNovo.data_contato,
                atualizado_em: new Date().toISOString()
              });

            await supabase
              .from('clientes_novos')
              .delete()
              .eq('telefone', telefoneCliente);

            console.log(`✅ Cliente ${telefoneCliente} movido para ATIVOS (enviou DS-160)`);
          } else {
            // Verifica se já está em clientes_ativos
            const { data: clienteAtivo } = await supabase
              .from('clientes_ativos')
              .select('*')
              .eq('telefone', telefoneCliente)
              .maybeSingle();

            if (!clienteAtivo) {
              // Cria direto em clientes_ativos
              await supabase
                .from('clientes_ativos')
                .insert({
                  telefone: telefoneCliente,
                  nome: nome,
                  email: emailCliente,
                  status: 'em_processo',
                  criado_em: new Date().toISOString(),
                  atualizado_em: new Date().toISOString()
                });
              console.log(`✅ Cliente ${telefoneCliente} criado em ATIVOS (enviou DS-160)`);
            }
          }
        } catch (err) {
          console.error('⚠️ Erro ao atualizar cliente:', err.message);
        }
      }

      // ============================================================
      //  📧 ENVIAR E-MAIL
      //  ============================================================
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
//  FUNÇÃO GERAR PDF DS-160 (resumida)
// ============================================================
async function gerarPDF_DS160(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    
    doc.fillColor('#003366').fontSize(22).text('SOLICITACAO DE VISTO DS-160', { align: 'center' });
    doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentacao Consular', { align: 'center' });
    doc.moveDown(2);
    doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);
    
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

    let count = 0;
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
        count++;
      }
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
    doc.end();
  });
}

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
//  ENDPOINTS ADMIN (AGENDAMENTOS)
// ============================================================
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
  const { data, error } = await supabase
    .from('agendamentos')
    .insert({ solicitacao_id, tipo, data_hora, local, observacoes, status: 'agendado' })
    .select()
    .single();
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
  const { error } = await supabase
    .from('agendamentos')
    .delete()
    .eq('id', req.params.id);
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

// ============================================================
//  ENDPOINTS COMPROMISSOS
// ============================================================
app.get('/api/compromissos', validateApiKey, async (req, res) => {
  const { data, error } = await supabase.from('compromissos').select('*').order('data', { ascending: true }).order('hora', { ascending: true });
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
    .insert({ cliente, cliente_id, atividade, data, hora, local, concluido: concluido || 0 })
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
//  FUNÇÃO PARA ENVIAR RESPOSTA (versão simplificada para o webhook)
// ============================================================
async function sendReply(phone, message) {
  try {
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    const securityToken = process.env.ZAPI_SECURITY_TOKEN;
    
    if (!instance || !token) {
      console.log('⚠️ Z-API não configurada');
      return false;
    }
    
    const cleanPhone = phone.toString().replace(/\D/g, '');
    const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': securityToken || ''
      },
      body: JSON.stringify({ phone: cleanPhone, message: message })
    });
    
    console.log(`📱 Resposta enviada para ${cleanPhone}: ${response.status}`);
    return response.status === 200;
  } catch (error) {
    console.error('❌ Erro ao enviar resposta:', error.message);
    return false;
  }
}

// ============================================================
//  FUNÇÕES AUXILIARES PARA MENUS
//  ============================================================

async function getMenuPrincipal() {
  return (
    `🇺🇸 *GETVISA - ESCOLHA O SERVIÇO* 🇺🇸\n\n` +
    `1️⃣ 🇺🇸 VISTO AMERICANO\n` +
    `2️⃣ 🇨🇦 VISTO CANADENSE\n` +
    `3️⃣ 🇦🇺 VISTO AUSTRALIANO\n` +
    `4️⃣ 🇬🇧 eTA UK (REINO UNIDO)\n` +
    `5️⃣ 🇨🇦 eTA CANADENSE\n` +
    `6️⃣ 📘 PASSAPORTE\n` +
    `7️⃣ 📞 AJUDA / CONTATO\n\n` +
    `💬 *Digite o número da opção desejada (1 a 7) ou me pergunte algo!*\n` +
    `• Digite *0* para ver este MENU novamente 🚀`
  );
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
  return (
    `${names[service] || 'SERVIÇO'}\n\n` +
    `1️⃣ 💰 PREÇO\n` +
    `2️⃣ ⏰ PRAZO\n` +
    `3️⃣ 📄 DOCUMENTOS\n` +
    `4️⃣ 📋 PROCESSO\n` +
    `5️⃣ ${isPassaporte ? '📍 ONDE FAZER' : '⚠️ VISTO NEGADO'}\n` +
    `6️⃣ 📊 AVALIAÇÃO GRATUITA\n` +
    `7️⃣ 📞 FALAR COM ESPECIALISTA\n` +
    `0️⃣ 🔙 VOLTAR AO MENU PRINCIPAL\n\n` +
    `💬 *Digite o número da opção desejada ou me pergunte algo!* 🚀`
  );
}

// ============================================================
//  WEBHOOK Z-API - VERSÃO COMPLETA (4 TABELAS)
// ============================================================
app.post('/api/webhook/zapi', async (req, res) => {
  console.log('📥 Webhook Z-API recebido');
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;
    
    // IGNORAR MENSAGENS DE GRUPO
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

    // EXTRAI MENSAGEM
    let messageText = '';
    let senderPhone = '';
    
    if (body.text) {
      if (typeof body.text === 'string') messageText = body.text;
      else if (body.text.message) messageText = body.text.message;
    }
    if (!messageText && body.message) {
      if (typeof body.message === 'string') messageText = body.message;
      else if (body.message.text) messageText = body.message.text;
    }
    if (!messageText && body.content) messageText = body.content;
    if (!messageText && body.body) messageText = body.body;
    
    if (body.phone) senderPhone = body.phone;
    else if (body.from) senderPhone = body.from;
    else if (body.sender) senderPhone = body.sender;
    
    if (!senderPhone) {
      console.log('⚠️ Sem telefone do remetente');
      return;
    }

    if (!messageText || messageText.trim().length === 0) {
      console.log('⚠️ Mensagem vazia');
      return;
    }
    
    messageText = messageText.trim();
    console.log(`📩 Mensagem de ${senderPhone}: ${messageText}`);

    // LIMPA TELEFONE
    let cleanPhone = senderPhone.toString().replace(/\D/g, '');
    if (cleanPhone.startsWith('55')) {
      cleanPhone = cleanPhone.substring(2);
    }
    
    if (cleanPhone.length < 10) {
      console.log(`⚠️ Telefone inválido: ${cleanPhone}`);
      return;
    }

    console.log(`📱 Telefone limpo: ${cleanPhone}`);

    // ============================================================
    //  🔍 BUSCA CLIENTE NAS 4 TABELAS (ordem: finalizado → ativo → amigo → novo)
    //  ============================================================
    let cliente = await buscarCliente(cleanPhone);
    
    // Se não existe, cadastra como NOVO
    if (!cliente) {
      cliente = await cadastrarCliente(cleanPhone);
    }
    
    // ✅ VERIFICA SE O CLIENTE FOI CADASTRADO COM SUCESSO
    if (!cliente) {
      console.error(`❌ Falha ao cadastrar cliente ${cleanPhone}`);
      await sendReply(cleanPhone, '⚠️ Desculpe, estamos com problemas técnicos. Tente novamente em alguns minutos.');
      return;
    }
    
    // ============================================================
    //  🎯 DECIDE O QUE FAZER BASEADO NO TIPO
    //  ============================================================
    
    // 🏁 SE FOR "finalizado" - MENSAGEM DE AGRADECIMENTO
    if (cliente.tipo === 'finalizado') {
      console.log(`🏁 Cliente FINALIZADO - Mensagem de agradecimento`);
      await sendReply(cleanPhone, 
        `🙏 *Muito obrigado por confiar na GetVisa!*\n\n` +
        `Seu processo foi concluído com sucesso.\n\n` +
        `📋 *Serviço:* ${cliente.dados.servico || 'não informado'}\n` +
        `📅 *Finalizado em:* ${new Date(cliente.dados.data_finalizacao).toLocaleDateString('pt-BR')}\n\n` +
        `⭐ *Avalie nosso serviço:*\n` +
        `https://getvisa.com.br/avaliacao\n\n` +
        `💬 *Estamos aqui para você sempre que precisar!* 🙏`
      );
      return;
    }
    
    // 🤝 SE FOR "amigo" - SILÊNCIO TOTAL
    if (cliente.tipo === 'amigo') {
      console.log(`🤝 Cliente ${cleanPhone} é AMIGO - SILÊNCIO TOTAL`);
      return; // 👈 NÃO RESPONDE NADA
    }
    
    // 🟢 SE FOR "ativo" - RESPOSTA CONTEXTUAL (SEM MENU)
    if (cliente.tipo === 'ativo') {
      console.log(`🟢 Cliente ${cleanPhone} EM PROCESSO - SEM MENU`);
      await sendReply(cleanPhone, 
        `👋 *Olá!*\n\n📋 *Seu processo está em andamento.*\n\n✅ *Status:* ${cliente.dados.status || 'em_processo'}\n\n📌 *Digite 0 para o MENU principal* 🚀`
      );
      return;
    }
    
    // ============================================================
    //  🟡 CLIENTE NOVO - MOSTRA MENU
    //  ============================================================
    console.log(`🟡 Cliente ${cleanPhone} NOVO - Mostrando menu`);
    
    // ESTADO DO USUÁRIO
    let state = userState.get(cleanPhone) || { 
      nivel: 'principal', 
      service: null,
      lastActivity: Date.now() 
    };
    state.lastActivity = Date.now();
    userState.set(cleanPhone, state);

    // COMANDO: 0 - VOLTA AO MENU
    if (messageText === '0') {
      state.nivel = 'principal';
      state.service = null;
      userState.set(cleanPhone, state);
      const menuPrincipal = await getMenuPrincipal();
      await sendReply(cleanPhone, menuPrincipal);
      return;
    }

    // SAUDAÇÕES
    const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e aí', 'hey', 'hi', 'hello'];
    
    if (saudacoes.includes(messageText.toLowerCase())) {
      const menuPrincipal = await getMenuPrincipal();
      await sendReply(cleanPhone, menuPrincipal);
      return;
    }

    // ============================================================
    //  🟢 SE ESTIVER NO SUBMENU
    //  ============================================================
    if (state.nivel === 'submenu') {
      const service = state.service;
      
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
        const nomes = {
          'visto_americano': 'VISTO AMERICANO',
          'visto_canadense': 'VISTO CANADENSE',
          'visto_australiano': 'VISTO AUSTRALIANO',
          'eta_uk': 'eTA UK',
          'eta_canadense': 'eTA CANADENSE',
          'passaporte': 'PASSAPORTE'
        };
        const link = links[service] || 'https://getvisa.com.br/simulador-visto-americano';
        const nomeServico = nomes[service] || 'SERVIÇO';
        await sendReply(cleanPhone, `📊 *AVALIAÇÃO GRATUITA - ${nomeServico}*\n\n🔗 ${link}\n\n⏱️ Leva menos de 2 minutos!\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
        return;
      }
      
      if (messageText === '5') {
        let resposta = '';
        if (service === 'passaporte') {
          resposta = `📍 *ONDE FAZER O PASSAPORTE*\n\n• Polícia Federal (agendar no site da PF)\n• Postos de atendimento em todo Brasil\n• Agendamento online obrigatório\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`;
        } else {
          resposta = `⚠️ *VISTO NEGADO - ${getServiceName(service).toUpperCase()}*\n\n📊 *Faça uma análise gratuita:*\n🔗 https://getvisa.com.br/visto-americano-negado\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`;
        }
        await sendReply(cleanPhone, resposta);
        return;
      }
      
      if (['1', '2', '3', '4'].includes(messageText)) {
        const opcoesMap = { '1': 'preco', '2': 'prazo', '3': 'documentos', '4': 'processo' };
        const opcao = opcoesMap[messageText];
        let resposta = getRespostaSubmenu(service, opcao);
        resposta += `\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`;
        await sendReply(cleanPhone, resposta);
        return;
      }
      
      const submenu = await getSubmenu(service);
      await sendReply(cleanPhone, submenu);
      return;
    }

    // ============================================================
    //  🟢 MENU PRINCIPAL
    //  ============================================================
    if (state.nivel === 'principal') {
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
          const menuPrincipal = await getMenuPrincipal();
          await sendReply(cleanPhone, menuPrincipal);
          return;
      }
      
      if (serviceKey) {
        state.nivel = 'submenu';
        state.service = serviceKey;
        userState.set(cleanPhone, state);
        const submenu = await getSubmenu(serviceKey);
        await sendReply(cleanPhone, submenu);
        return;
      }
    }

  } catch (error) {
    console.error('❌ Erro no webhook:', error.message);
    console.error('❌ Stack:', error.stack);
  }
});

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));