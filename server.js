// ============================================================
//  SERVER.JS - GETVISA ASSESSORIA
//  VERSÃO ORGANIZADA COM SISTEMA DE ETAPAS
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
      headers: { 'Content-Type': 'application/json', 'Client-Token': securityToken || '' },
      body: JSON.stringify({ phone: cleanPhone, message: mensagem })
    });
    console.log(`📱 WhatsApp enviado para ${cleanPhone}: ${response.status}`);
    return response.status === 200;
  } catch (error) {
    console.error('❌ Erro ao enviar WhatsApp:', error.message);
    return false;
  }
}

async function sendReply(phone, message) {
  return enviarWhatsApp(phone, message);
}

// ============================================================
//  FUNÇÕES DE CLIENTES
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
  console.log(`📝 Cadastrando ${telefone} como NOVO...`);
  const dadosCliente = {
    telefone: telefone,
    nome: nome || `Cliente_${telefone}`,
    data_contato: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('clientes_novos').insert(dadosCliente).select().single();
  if (error) {
    console.error('❌ Erro ao cadastrar cliente:', error);
    return null;
  }
  console.log(`✅ Cliente ${telefone} cadastrado como NOVO`);
  return { dados: data, tipo: 'novo', tabela: 'clientes_novos' };
}
// ============================================================
//  SISTEMA DE ETAPAS - FUNÇÕES
// ============================================================
async function criarEtapaInicial(telefone) {
  try {
    const { data: cliente, error: clienteError } = await supabase
      .from('clientes_ativos').select('telefone, nome, criado_em').eq('telefone', telefone).single();
    if (clienteError) throw clienteError;
    const novaEtapa = {
      cliente_telefone: telefone,
      etapa_atual: 'formulario_enviado',
      data_inicio: cliente.criado_em || new Date().toISOString(),
      data_atualizacao: new Date().toISOString(),
      data_formulario_enviado: new Date().toISOString(),
      historico: [{ etapa: 'formulario_enviado', data: new Date().toISOString(), nota: 'Início do processo', observacao: 'Cliente movido para clientes_ativos' }]
    };
    const { data, error } = await supabase.from('etapas_processo').insert(novaEtapa).select().single();
    if (error) throw error;
    console.log(`✅ Etapa inicial criada para: ${telefone}`);
    return data;
  } catch (error) {
    console.error('Erro ao criar etapa inicial:', error);
    return null;
  }
}

async function notificarClienteEtapa(telefone, novaEtapa) {
  try {
    const { data: cliente } = await supabase.from('clientes_ativos').select('nome').eq('telefone', telefone).single();
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

function validateDS160(data) {
  const errors = [];
  const requiredQuestions = [
    { field: 'radio-visto-negado', message: 'Responda se já teve visto americano negado' },
    { field: 'radio-entrada-negada', message: 'Responda se já teve entrada negada nos EUA' },
    { field: 'radio-deportado', message: 'Responda se já foi deportado dos EUA' }
  ];
  for (const q of requiredQuestions) {
    if (!data[q.field] || data[q.field] === '') errors.push(q.message);
  }
  if (data['radio-visto-negado'] === 'one') {
    if (!data['text-visto-negado-ano'] || data['text-visto-negado-ano'] === '') {
      errors.push('Ano da negativa do visto é obrigatório');
    } else {
      const ano = parseInt(data['text-visto-negado-ano']);
      if (ano < 1900 || ano > 2026) errors.push('Ano da negativa do visto inválido (use entre 1900 e 2026)');
    }
  }
  if (data['radio-entrada-negada'] === 'one') {
    if (!data['text-entrada-negada-ano'] || data['text-entrada-negada-ano'] === '') {
      errors.push('Ano da negativa de entrada é obrigatório');
    } else {
      const ano = parseInt(data['text-entrada-negada-ano']);
      if (ano < 1900 || ano > 2026) errors.push('Ano da negativa de entrada inválido (use entre 1900 e 2026)');
    }
  }
  if (data['radio-deportado'] === 'one') {
    if (!data['text-deportado-ano'] || data['text-deportado-ano'] === '') {
      errors.push('Ano da deportação é obrigatório');
    } else {
      const ano = parseInt(data['text-deportado-ano']);
      if (ano < 1900 || ano > 2026) errors.push('Ano da deportação inválido (use entre 1900 e 2026)');
    }
    if (!data['select-deportado-duracao'] || data['select-deportado-duracao'] === '') {
      errors.push('Duração da deportação é obrigatória');
    }
  }
  return { isValid: errors.length === 0, errors: errors };
}
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
      .select('telefone, nome')  // ✅ removido status
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
    const { data, error } = await supabase
      .from('etapas_processo').select('*').eq('cliente_telefone', telefoneLimpo).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) {
      const novaEtapa = await criarEtapaInicial(telefoneLimpo);
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
    if (!FEATURES.SISTEMA_ETAPAS.ativo) {
      return res.status(503).json({ erro: 'Sistema de etapas está temporariamente desativado' });
    }
    const { data: etapaAtual, error: buscaError } = await supabase
      .from('etapas_processo').select('*').eq('cliente_telefone', telefoneLimpo).single();
    if (buscaError) {
      if (buscaError.code === 'PGRST116') {
        const novaEtapa = await criarEtapaInicial(telefoneLimpo);
        if (novaEtapa) return res.json({ sucesso: true, mensagem: 'Etapa inicial criada', etapa_atual: novaEtapa.etapa_atual });
      }
      throw buscaError;
    }
    const etapaId = etapaAtual.etapa_atual;
    const proximaEtapa = ETAPAS[etapaId]?.next;
    if (!proximaEtapa) return res.status(400).json({ erro: 'Cliente já está na última etapa' });
    const historicoAtualizado = [
      ...(etapaAtual.historico || []),
      { etapa: etapaId, data: new Date().toISOString(), nota: nota || 'Avanço manual', observacao: observacao || 'Avançado pelo painel administrativo' }
    ];
    const dadosAtualizacao = {
      etapa_atual: proximaEtapa,
      data_atualizacao: new Date().toISOString(),
      historico: historicoAtualizado,
      [`data_${proximaEtapa}`]: new Date().toISOString()
    };
    const { data: updated, error: updateError } = await supabase
      .from('etapas_processo').update(dadosAtualizacao).eq('cliente_telefone', telefoneLimpo).select().single();
    if (updateError) throw updateError;
    if (FEATURES.SISTEMA_ETAPAS.notificar_cliente) {
      await notificarClienteEtapa(telefoneLimpo, proximaEtapa);
    }
    console.log(`📊 Cliente ${telefoneLimpo} avançou para: ${proximaEtapa}`);
    res.json({ sucesso: true, etapa_anterior: etapaId, etapa_atual: proximaEtapa, dados: updated });
  } catch (error) {
    console.error('Erro ao avançar etapa:', error);
    res.status(500).json({ erro: 'Erro ao avançar etapa', detalhe: error.message });
  }
});

app.get('/api/etapas/historico/:telefone', async (req, res) => {
  try {
    const telefoneLimpo = req.params.telefone.replace(/\D/g, '');
    const { data, error } = await supabase
      .from('etapas_processo').select('historico, etapa_atual, data_inicio, data_atualizacao')
      .eq('cliente_telefone', telefoneLimpo).single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ erro: 'Cliente não encontrado' });
      throw error;
    }
    res.json({ etapa_atual: data.etapa_atual, data_inicio: data.data_inicio, data_atualizacao: data.data_atualizacao, historico: data.historico || [] });
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
    data.forEach(item => { if (!estatisticas[item.etapa_atual]) estatisticas[item.etapa_atual] = 0; estatisticas[item.etapa_atual]++; });
    const resultado = Object.keys(estatisticas).map(etapa => ({
      etapa, label: ETAPAS[etapa]?.label || etapa,
      quantidade: estatisticas[etapa],
      porcentagem: total > 0 ? ((estatisticas[etapa] / total) * 100).toFixed(2) : 0
    }));
    res.json({ total_clientes_ativos: total, distribuicao: resultado, ultima_atualizacao: new Date().toISOString() });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ erro: 'Erro ao buscar estatísticas' });
  }
});
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
//  WEBHOOK Z-API
// ============================================================
app.post('/api/webhook/zapi', async (req, res) => {
  console.log('📥 Webhook Z-API recebido');
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;
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

    let messageText = '', senderPhone = '';
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
    if (!senderPhone) { console.log('⚠️ Sem telefone do remetente'); return; }
    if (!messageText || messageText.trim().length === 0) { console.log('⚠️ Mensagem vazia'); return; }

    messageText = messageText.trim();
    console.log(`📩 Mensagem de ${senderPhone}: ${messageText}`);

    let cleanPhone = senderPhone.toString().replace(/\D/g, '');
    if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);
    if (cleanPhone.length < 10) { console.log(`⚠️ Telefone inválido: ${cleanPhone}`); return; }
    console.log(`📱 Telefone limpo: ${cleanPhone}`);

    let cliente = await buscarCliente(cleanPhone);
    if (!cliente) cliente = await cadastrarCliente(cleanPhone);
    if (!cliente) {
      console.error(`❌ Falha ao cadastrar cliente ${cleanPhone}`);
      await sendReply(cleanPhone, '⚠️ Desculpe, estamos com problemas técnicos. Tente novamente em alguns minutos.');
      return;
    }

    // Cliente FINALIZADO
    if (cliente.tipo === 'finalizado') {
      console.log(`🏁 Cliente FINALIZADO - Mensagem de agradecimento`);
      await sendReply(cleanPhone, `🙏 *Muito obrigado por confiar na GetVisa!*\n\nSeu processo foi concluído com sucesso.\n\n📋 *Serviço:* ${cliente.dados.servico || 'não informado'}\n📅 *Finalizado em:* ${new Date(cliente.dados.data_finalizacao).toLocaleDateString('pt-BR')}\n\n⭐ *Avalie nosso serviço:*\nhttps://getvisa.com.br/avaliacao\n\n💬 *Estamos aqui para você sempre que precisar!* 🙏`);
      return;
    }

    // Cliente AMIGO - SILÊNCIO
    if (cliente.tipo === 'amigo') {
      console.log(`🤝 Cliente ${cleanPhone} é AMIGO - SILÊNCIO TOTAL`);
      return;
    }

    // Cliente ATIVO - Mostra etapa
    if (cliente.tipo === 'ativo') {
      console.log(`🟢 Cliente ${cleanPhone} EM PROCESSO - SEM MENU`);
      let etapaMsg = '';
      try {
        const { data: etapa } = await supabase.from('etapas_processo').select('etapa_atual').eq('cliente_telefone', cleanPhone).single();
        if (etapa) {
          const etapaInfo = ETAPAS[etapa.etapa_atual];
          etapaMsg = `\n📌 *Etapa atual:* ${etapaInfo?.label || etapa.etapa_atual}`;
        }
      } catch (err) { console.error('Erro ao buscar etapa:', err); }
      await sendReply(cleanPhone, `👋 *Olá!*\n\n📋 *Seu processo está em andamento.*${etapaMsg}\n\n✅ *Status:* ${cliente.dados.status || 'em_processo'}\n\n📌 *Digite 0 para o MENU principal* 🚀`);
      return;
    }

    // CLIENTE NOVO - Mostra menu
    console.log(`🟡 Cliente ${cleanPhone} NOVO - Mostrando menu`);
    let state = userState.get(cleanPhone) || { nivel: 'principal', service: null, lastActivity: Date.now() };
    state.lastActivity = Date.now();
    userState.set(cleanPhone, state);

    // Comando 0 - Volta ao menu
    if (messageText === '0') {
      state.nivel = 'principal';
      state.service = null;
      userState.set(cleanPhone, state);
      await sendReply(cleanPhone, await getMenuPrincipal());
      return;
    }

    // Saudações
    const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e aí', 'hey', 'hi', 'hello'];
    if (saudacoes.includes(messageText.toLowerCase())) {
      await sendReply(cleanPhone, await getMenuPrincipal());
      return;
    }

    // SUBMENU
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
        await sendReply(cleanPhone, `📊 *AVALIAÇÃO GRATUITA - ${nomes[service] || 'SERVIÇO'}*\n\n🔗 ${links[service] || 'https://getvisa.com.br/simulador-visto-americano'}\n\n⏱️ Leva menos de 2 minutos!\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
        return;
      }
      if (messageText === '5') {
        if (service === 'passaporte') {
          await sendReply(cleanPhone, `📍 *ONDE FAZER O PASSAPORTE*\n\n• Polícia Federal (agendar no site da PF)\n• Postos de atendimento em todo Brasil\n• Agendamento online obrigatório\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
        } else {
          await sendReply(cleanPhone, `⚠️ *VISTO NEGADO - ${getServiceName(service).toUpperCase()}*\n\n📊 *Faça uma análise gratuita:*\n🔗 https://getvisa.com.br/visto-americano-negado\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`);
        }
        return;
      }
      if (['1', '2', '3', '4'].includes(messageText)) {
        const opcoesMap = { '1': 'preco', '2': 'prazo', '3': 'documentos', '4': 'processo' };
        let resposta = getRespostaSubmenu(service, opcoesMap[messageText]);
        resposta += `\n\n📌 *Digite 0 para voltar ao MENU principal* 🚀`;
        await sendReply(cleanPhone, resposta);
        return;
      }
      await sendReply(cleanPhone, await getSubmenu(service));
      return;
    }

    // MENU PRINCIPAL
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
          await sendReply(cleanPhone, await getMenuPrincipal());
          return;
      }
      if (serviceKey) {
        state.nivel = 'submenu';
        state.service = serviceKey;
        userState.set(cleanPhone, state);
        await sendReply(cleanPhone, await getSubmenu(serviceKey));
      }
    }
  } catch (error) {
    console.error('❌ Erro no webhook:', error.message);
  }
});
// ============================================================
//  ENDPOINTS ADMIN - AGENDAMENTOS E COMPROMISSOS
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
  const { data, error } = await supabase.from('agendamentos').update({ ...updates, updated_at: new Date() }).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/agendamentos/:id', validateApiKey, async (req, res) => {
  const { error } = await supabase.from('agendamentos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

app.get('/api/solicitacoes', validateApiKey, async (req, res) => {
  const { data, error } = await supabase.from('solicitacoes').select('id, tipo, clientes_ativos(nome_completo, email)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

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
  const { data: inserted, error } = await supabase.from('compromissos').insert({
    cliente, cliente_id, atividade, data, hora, local, concluido: concluido || 0
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(inserted);
});

app.put('/api/compromissos/:id', validateApiKey, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const { data, error } = await supabase.from('compromissos').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/compromissos/:id', validateApiKey, async (req, res) => {
  const { error } = await supabase.from('compromissos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ============================================================
// ROTAS DO DASHBOARD
// ============================================================

// GET - Estatísticas do Dashboard
app.get('/api/dashboard/estatisticas', async (req, res) => {
    try {
        // Total de clientes
        const { count: total_clientes, error: err1 } = await supabase
            .from('clientes')
            .select('*', { count: 'exact', head: true });

        // Total de ativos
        const { count: total_ativos, error: err2 } = await supabase
            .from('clientes_ativos')
            .select('*', { count: 'exact', head: true });

        // Total de agendamentos
        const { count: total_agendamentos, error: err3 } = await supabase
            .from('agendamentos')
            .select('*', { count: 'exact', head: true });

        // Total de etapas
        const { count: total_etapas, error: err4 } = await supabase
            .from('etapas_processo')
            .select('*', { count: 'exact', head: true });

        // Agendamentos por status
        const { data: agendamentosData, error: err5 } = await supabase
            .from('agendamentos')
            .select('status');

        const agendamentos_por_status = {};
        if (agendamentosData) {
            agendamentosData.forEach(a => {
                agendamentos_por_status[a.status] = (agendamentos_por_status[a.status] || 0) + 1;
            });
        }

        // Etapas por status
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

// GET - Próximos agendamentos
// GET - Próximos agendamentos (versão simples)
app.get('/api/dashboard/proximos-agendamentos', async (req, res) => {
    try {
        // Buscar agendamentos com status 'agendado'
        const { data: agendamentos, error } = await supabase
            .from('agendamentos')
            .select('*')
            .eq('status', 'agendado')
            .order('data_hora', { ascending: true })
            .limit(10);

        if (error) throw error;

        // Adicionar nome do cliente (buscar de forma separada)
        const agendamentosComCliente = await Promise.all(
            agendamentos.map(async (item) => {
                let cliente_nome = 'N/A';
                
                if (item.solicitacao_id) {
                    // Buscar a solicitação
                    const { data: solicitacao } = await supabase
                        .from('solicitacoes')
                        .select('dados, cliente_id')
                        .eq('id', item.solicitacao_id)
                        .single();
                    
                    if (solicitacao) {
                        // Buscar o cliente
                        if (solicitacao.cliente_id) {
                            const { data: cliente } = await supabase
                                .from('clientes')
                                .select('nome_completo')
                                .eq('id', solicitacao.cliente_id)
                                .single();
                            
                            if (cliente) {
                                cliente_nome = cliente.nome_completo;
                            }
                        }
                        
                        // Fallback: usar dados da solicitação
                        if (cliente_nome === 'N/A' && solicitacao.dados && solicitacao.dados.cliente) {
                            cliente_nome = solicitacao.dados.cliente;
                        }
                    }
                }
                
                return {
                    id: item.id,
                    tipo: item.tipo,
                    data_hora: item.data_hora,
                    local: item.local,
                    status: item.status,
                    cliente_nome: cliente_nome
                };
            })
        );

        res.json({ success: true, agendamentos: agendamentosComCliente });

    } catch (error) {
        console.error('❌ Erro ao buscar próximos agendamentos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));