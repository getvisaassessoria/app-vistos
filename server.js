const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL');
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public')); 

// ==================== SUPABASE CLIENT ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== PROTEÇÃO CONTRA ATAQUE ====================
const requestCounts = new Map();
const emailRateLimits = new Map();
const BLOCKED_IPS = new Set();

function getRealIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',');
        return ips[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

app.use((req, res, next) => {
    const ip = getRealIp(req);
    
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return next();
    }
    
    if (BLOCKED_IPS.has(ip)) {
        console.log(`🚨 BLOQUEADO PERMANENTE: IP ${ip} tentou acessar`);
        return res.status(403).json({ error: 'Acesso bloqueado. Contate o suporte.' });
    }
    
    const now = Date.now();
    const minuteKey = Math.floor(now / 60000);
    const key = `${ip}:${minuteKey}`;
    
    const currentCount = (requestCounts.get(key) || 0) + 1;
    requestCounts.set(key, currentCount);
    
    setTimeout(() => {
        for (const k of requestCounts.keys()) {
            const kMinute = parseInt(k.split(':')[1]);
            if (kMinute < minuteKey - 1) {
                requestCounts.delete(k);
            }
        }
    }, 60000);
    
    if (currentCount > 20) {
        console.log(`🚨 BLOQUEADO TEMPORÁRIO: IP ${ip} fez ${currentCount} req/min`);
        
        const blockKey = `block:${ip}`;
        const blockCount = (requestCounts.get(blockKey) || 0) + 1;
        requestCounts.set(blockKey, blockCount);
        
        if (blockCount >= 3) {
            BLOCKED_IPS.add(ip);
            console.log(`🔥 IP ${ip} foi BANIDO PERMANENTEMENTE por reincidência`);
        }
        
        return res.status(429).json({ 
            error: 'Muitas requisições. Tente novamente em alguns minutos.' 
        });
    }
    
    next();
});

function checkEmailRateLimit(ip, routeName) {
    const now = Date.now();
    const minuteKey = Math.floor(now / 60000);
    const key = `${routeName}:${ip}:${minuteKey}`;
    
    const currentCount = (emailRateLimits.get(key) || 0) + 1;
    emailRateLimits.set(key, currentCount);
    
    setTimeout(() => {
        for (const k of emailRateLimits.keys()) {
            const kMinute = parseInt(k.split(':')[2]);
            if (kMinute < minuteKey - 1) {
                emailRateLimits.delete(k);
            }
        }
    }, 60000);
    
    return currentCount <= 2;
}

const protectedRoutes = [
    '/api/submit-ds160', 
    '/api/submit-passaporte', 
    '/api/submit-avaliacao', 
    '/api/submit-simulador', 
    '/api/submit-visto-negado'
];

app.use((req, res, next) => {
    if (protectedRoutes.includes(req.path)) {
        const ip = getRealIp(req);
        
        if (!checkEmailRateLimit(ip, req.path)) {
            console.log(`🚨 BLOQUEADO ROTA EMAIL: IP ${ip} excedeu limite na ${req.path}`);
            
            const suspectKey = `suspect:${ip}`;
            const suspectCount = (requestCounts.get(suspectKey) || 0) + 1;
            requestCounts.set(suspectKey, suspectCount);
            
            if (suspectCount >= 5) {
                BLOCKED_IPS.add(ip);
                console.log(`🔥 IP ${ip} BANIDO por abuso nas rotas de e-mail`);
            }
            
            return res.status(429).json({ 
                error: 'Limite de envios excedido. Tente novamente em alguns minutos.' 
            });
        }
    }
    next();
});

// ==================== VALIDAÇÃO DE E-MAIL ====================
const DOMINIOS_PERMITIDOS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'hotmail.com.br',
    'uol.com.br', 'bol.com.br', 'ig.com.br', 'terra.com.br', 'getvisa.com.br'
];

function isDominioPermitido(email) {
    if (!email || typeof email !== 'string') return false;
    const dominio = email.split('@')[1]?.toLowerCase();
    return DOMINIOS_PERMITIDOS.includes(dominio);
}

const EMAILS_BLOQUEADOS = [
    'phillipratylor29@gmail.com',
    'davidjonietz@gmail.com',
    'faisal.johnson@hmga.com',
    'faisal.johnson@hmgma.com'
];

const DOMINIOS_BLOQUEADOS = [
    'mailxw.com',
    'hmga.com',
    'hmgma.com'
];

function isEmailClienteValido(email, nomeCliente) {
    if (!email || typeof email !== 'string') {
        console.log(`🚨 E-mail inválido: ${email}`);
        return false;
    }
    
    const emailLower = email.toLowerCase().trim();
    
    if (EMAILS_BLOQUEADOS.includes(emailLower)) {
        console.log(`🚨 E-mail na LISTA NEGRA bloqueado: ${email}`);
        return false;
    }
    
    const dominio = emailLower.split('@')[1];
    if (!dominio) {
        console.log(`🚨 E-mail sem domínio: ${email}`);
        return false;
    }
    
    if (DOMINIOS_BLOQUEADOS.includes(dominio)) {
        console.log(`🚨 Domínio bloqueado: ${email}`);
        return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        console.log(`🚨 Formato de e-mail inválido: ${email}`);
        return false;
    }
    
    const nomeLower = (nomeCliente || '').toLowerCase();
    const nomesSuspeitos = ['test', 'fake', 'invasor', 'hacker', 'admin', 'root', 'spam'];
    
    for (const suspeito of nomesSuspeitos) {
        if (nomeLower.includes(suspeito)) {
            console.log(`🚨 Nome suspeito bloqueado: ${nomeCliente}`);
            return false;
        }
    }
    
    console.log(`✅ E-mail válido: ${email}`);
    return true;
}

// ==================== FUNÇÃO AUXILIAR PARA ENVIAR WHATSAPP ====================
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

// ==================== MAPEAMENTOS E FUNÇÕES AUXILIARES ====================
const radioMapping = {
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
  'falecido-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' }
};

function formatDateToBrazilian(dateString) {
  if (!dateString || dateString === '') return null;
  
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
  
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  
  return dateString;
}

function formatValue(fieldName, value) {
  if (value === undefined || value === null || value === '') return null;
  
  const dateFields = ['text-5', 'text-21', 'text-35', 'text-66', 'text-67', 'text-69', 'text-61', 'text-62', 'spouse-dob', 'data_casamento_div', 'data_divorcio', 'data_falecimento', 'text-50', 'text-44', 'text-45', 'military_date_from', 'military_date_to', 'antecedentes_data'];
  if (dateFields.includes(fieldName)) {
    const formattedDate = formatDateToBrazilian(value);
    if (formattedDate) return formattedDate;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const mapped = value.map(v => {
      if (radioMapping[fieldName] && radioMapping[fieldName][v]) return radioMapping[fieldName][v];
      if (radioMapping[v]) return radioMapping[v];
      return v;
    });
    return mapped.join(', ');
  }
  if (radioMapping[fieldName] && radioMapping[fieldName][value]) return radioMapping[fieldName][value];
  if (radioMapping[value]) return radioMapping[value];
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

// ==================== ROTA DS-160 ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos (DS-160):', JSON.stringify({
    nome: data['full_name'],
    email: data['email-1'],
    telefone: data['text-77']
  }));
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      let solicitacaoId = null;
      
      // ==================== SALVAR NO SUPABASE (CORRIGIDO) ====================
      try {
        const emailCliente = data['email-1'] || null;
        const nomeCliente = data['full_name'] || null;
        const telefoneCliente = data['text-77'] || null;
        
        console.log('💾 Tentando salvar no Supabase:', { emailCliente, nomeCliente, telefoneCliente });
        
        // Primeiro, busca ou cria o cliente usando upsert
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: emailCliente,
            nome_completo: nomeCliente,
            telefone: telefoneCliente
          }, { 
            onConflict: 'email',
            ignoreDuplicates: false
          })
          .select()
          .single();
        
        if (clienteError) {
          console.error('❌ Erro ao salvar cliente:', clienteError.message);
        } else if (cliente) {
          console.log(`✅ Cliente salvo/encontrado. ID: ${cliente.id}`);
          
          // Agora cria a solicitação
          const { data: solicitacao, error: solError } = await supabase
            .from('solicitacoes')
            .insert({
              cliente_id: cliente.id,
              tipo: 'ds160',
              dados: data,
              status: 'pendente',
              created_at: new Date()
            })
            .select()
            .single();
          
          if (solError) {
            console.error('❌ Erro ao salvar solicitação:', solError.message);
          } else {
            solicitacaoId = solicitacao.id;
            console.log(`✅ DS-160 salvo com sucesso! ID: ${solicitacaoId}`);
          }
        }
      } catch (supabaseErr) {
        console.error('⚠️ Erro geral no Supabase:', supabaseErr.message);
      }

      const nome = data['full_name'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email-1'] || null;

      const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fillColor('#003366').fontSize(22).text('SOLICITAÇÃO DE VISTO DS-160', { align: 'center' });
        doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentação Consular', { align: 'center' });
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

        startSection('INFORMAÇÕES INICIAIS');
        renderField('consulado_cidade', 'Cidade do Consulado');
        if (renderField('radio-26', 'Indicado por agência/agente?') && data['radio-26'] === 'one') {
          renderField('text-1', 'Nome da agência/agente');
        }
        renderField('text-64', 'Idioma usado para preencher');
        hasContentInSection = true;

        startSection('INFORMAÇÕES PESSOAIS');
        renderField('full_name', 'Nome completo');
        if (renderField('radio-2', 'Já teve outro nome?') && data['radio-2'] === 'one') {
          renderField('text-87', 'Nome anterior');
        }
        renderField('radio-3', 'Sexo');
        renderField('select-4', 'Estado civil');
        renderField('text-5', 'Data de nascimento');
        renderField('text-7', 'Cidade de nascimento');
        renderField('text-6', 'Estado/Província');
        renderField('text-95', 'País de nacionalidade');
        if (renderField('radio-outra-nac', 'Possui outra nacionalidade?') && data['radio-outra-nac'] === 'one') {
          renderField('outra_nacionalidade_text', 'Qual outra nacionalidade?');
        }
        renderField('radio-residente', 'Residente permanente de outro país?');
        renderField('text-86', 'CPF');
        renderField('text-17', 'Número do Seguro Social (SSN)');
        renderField('text-18', 'Número do contribuinte dos EUA (TIN)');
        hasContentInSection = true;

        startSection('INFORMAÇÕES DA VIAGEM');
        renderField('radio-28', 'Propósito da viagem');
        renderField('radio-planos', 'Planos específicos?');
        renderField('text-21', 'Data de chegada prevista');
        renderField('text-34', 'Duração da estadia (dias)');
        renderField('text-41', 'Endereço nos EUA');
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
        renderField('text-26', 'Endereço do pagador');
        renderField('text-27', 'Cidade do pagador');
        renderField('text-96', 'UF do pagador');
        renderField('text-29', 'CEP do pagador');
        renderField('text-30', 'País do pagador');
        hasContentInSection = true;

        if (data['radio-7'] === 'one') {
          startSection('ACOMPANHANTES');
          renderField('radio-7', 'Há acompanhantes?');
          const acompanhantes = groupParallelArrays(data, 'acompanhante_nome[]', 'acompanhante_rel[]');
          if (acompanhantes.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Acompanhantes:');
            acompanhantes.forEach(acc => doc.font('Helvetica').text(`  - ${acc}`));
            doc.moveDown(0.6);
          }
          hasContentInSection = true;
        }

        if (data['radio-8'] === 'one') {
          startSection('HISTÓRICO DE VIAGENS AOS EUA');
          renderField('radio-8', 'Já esteve nos EUA?');
          const viagens = groupTravels(data);
          if (viagens.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Viagens anteriores aos EUA:');
            viagens.forEach(viagem => doc.font('Helvetica').text(`  - ${viagem}`));
            doc.moveDown(0.6);
          }
          hasContentInSection = true;
        }

        if (data['radio-23'] === 'one') {
          startSection('INFORMAÇÕES DO VISTO');
          renderField('radio-23', 'Já teve visto americano?');
          renderField('text-35', 'Data de emissão do visto');
          renderField('text-68', 'Número do visto');
          renderField('text-69', 'Data de expiração');
          renderField('radio-33', 'Impressões digitais coletadas?');
          renderField('radio-29', 'Mesmo tipo de visto?');
          renderField('radio-30', 'Mesmo país de emissão?');
          hasContentInSection = true;
        }

        // ==================== SEÇÃO AMIGÁVEL - INFORMAÇÕES COMPLEMENTARES ====================
        startSection('INFORMAÇÕES COMPLEMENTARES');
        
        doc.fillColor('#2c7da0').fontSize(9).font('Helvetica').text('Estas informações fazem parte do formulário DS-160 oficial.', { align: 'center' });
        doc.fillColor('#61a5c2').fontSize(8).font('Helvetica').text('Responder com transparência é sempre o melhor caminho para o seu processo.', { align: 'center' });
        doc.moveDown(0.5);
        doc.fillColor('#000000').fontSize(10);

        // Pergunta 1: Visto Negado
        let vistoNegado = data['radio-visto-negado'];
        if (vistoNegado === 'one') vistoNegado = 'Sim';
        else if (vistoNegado === 'two') vistoNegado = 'Não';

        doc.font('Helvetica-Bold').text('1. Você já teve um visto americano negado anteriormente?');
        doc.font('Helvetica').text(`   Resposta: ${vistoNegado || 'Não informado'}`);
        doc.moveDown(0.3);

        if (data['radio-visto-negado'] === 'one') {
            doc.font('Helvetica').fontSize(9).fillColor('#555555').text(`   • Ano: ${data['text-visto-negado-ano'] || 'Não informado'}`);
            doc.text(`   • Consulado: ${data['text-visto-negado-consulado'] || 'Não informado'}`);
            doc.text(`   • Tipo de visto: ${data['select-visto-negado-tipo'] || 'Não informado'}`);
            doc.fillColor('#000000');
        }

        doc.moveDown(0.3);

        // Pergunta 2: Entrada Negada
        let entradaNegada = data['radio-entrada-negada'];
        if (entradaNegada === 'one') entradaNegada = 'Sim';
        else if (entradaNegada === 'two') entradaNegada = 'Não';

        doc.font('Helvetica-Bold').text('2. Você já teve a entrada negada nos EUA pelo oficial de imigração?');
        doc.font('Helvetica').text(`   Resposta: ${entradaNegada || 'Não informado'}`);
        doc.moveDown(0.3);

        if (data['radio-entrada-negada'] === 'one') {
            doc.font('Helvetica').fontSize(9).fillColor('#555555').text(`   • Ano: ${data['text-entrada-negada-ano'] || 'Não informado'}`);
            doc.text(`   • Local: ${data['text-entrada-negada-local'] || 'Não informado'}`);
            doc.text(`   • Motivo: ${data['textarea-entrada-negada-motivo'] || 'Não informado'}`);
            doc.fillColor('#000000');
        }

        doc.moveDown(0.3);

        // Pergunta 3: Deportação
        let deportado = data['radio-deportado'];
        if (deportado === 'one') deportado = 'Sim';
        else if (deportado === 'two') deportado = 'Não';

        doc.font('Helvetica-Bold').text('3. Você já foi deportado ou removido dos Estados Unidos?');
        doc.font('Helvetica').text(`   Resposta: ${deportado || 'Não informado'}`);
        doc.moveDown(0.3);

        if (data['radio-deportado'] === 'one') {
            doc.font('Helvetica').fontSize(9).fillColor('#555555').text(`   • Ano: ${data['text-deportado-ano'] || 'Não informado'}`);
            let duracao = data['select-deportado-duracao'] || '';
            if (duracao === 'menos_5_anos') duracao = 'Menos de 5 anos';
            else if (duracao === '5_a_10_anos') duracao = 'Entre 5 e 10 anos';
            else if (duracao === 'mais_10_anos') duracao = 'Mais de 10 anos';
            else if (duracao === 'banimento_permanente') duracao = 'Banimento permanente';
            doc.text(`   • Período: ${duracao || 'Não informado'}`);
            doc.fillColor('#000000');
        }

        doc.moveDown(0.5);

        // Detalhes adicionais
        if (data['textarea-detalhes-negativa']) {
            doc.fillColor('#2c7da0').fontSize(9).font('Helvetica-Bold').text('📝 Informações adicionais:');
            doc.fillColor('#555555').fontSize(9).font('Helvetica').text(data['textarea-detalhes-negativa']);
            doc.fillColor('#000000');
            doc.moveDown(0.3);
        }

        doc.fillColor('#2d6a4f').fontSize(9).font('Helvetica-Bold').text('✅ A transparência fortalece o seu processo!', { align: 'center' });
        doc.fillColor('#666666').fontSize(8).font('Helvetica').text('Estas informações são exigidas pelo formulário oficial do governo dos EUA', { align: 'center' });

        hasContentInSection = true;

        // Linha separadora suave
        doc.moveDown(0.3);
        doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.3);

        startSection('ENDEREÇO RESIDENCIAL');
        renderField('text-71', 'Logradouro');
        renderField('text-72', 'Complemento');
        renderField('text-73', 'CEP');
        renderField('text-74', 'Cidade');
        renderField('text-75', 'Estado');
        renderField('text-76', 'País');
        hasContentInSection = true;

        startSection('ENDEREÇO DE CORRESPONDÊNCIA');
        renderField('radio-9', 'Endereço de correspondência é o mesmo?');
        if (data['radio-9'] === 'Não, é diferente') {
          doc.font('Helvetica-Bold').fontSize(10).text('Endereço de correspondência (diferente):');
          doc.moveDown(0.3);
          renderField('text-80', '  Logradouro');
          renderField('text-81', '  Complemento');
          renderField('text-82', '  CEP');
          renderField('text-83', '  Cidade');
          renderField('text-84', '  Estado');
          renderField('text-85', '  País');
        }
        hasContentInSection = true;

        startSection('TELEFONES');
        renderField('text-77', 'Telefone principal');
        renderField('text-78', 'Telefone comercial');
        if (renderField('radio-10', 'Usou outros números?') && data['radio-10'] === 'one') {
          const telefones = data['telefones_anteriores[]'] || [];
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
          const emails = data['emails_anteriores[]'] || [];
          if (emails.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('E-mails anteriores: ', { continued: true });
            doc.font('Helvetica').text(emails.join(', '));
            doc.moveDown(0.6);
          }
        }
        hasContentInSection = true;

        startSection('MÍDIAS SOCIAIS');
        if (renderField('radio-12', 'Presença em mídias sociais?') && data['radio-12'] === 'one') {
          const plataformas = data['midia_plataforma[]'] || [];
          const identificadores = data['midia_identificador[]'] || [];
          const midias = [];
          for (let i = 0; i < Math.max(plataformas.length, identificadores.length); i++) {
            if (plataformas[i] || identificadores[i]) {
              midias.push(`${plataformas[i] || ''}${plataformas[i] && identificadores[i] ? ': ' : ''}${identificadores[i] || ''}`);
            }
          }
          if (midias.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Mídias sociais: ', { continued: true });
            doc.font('Helvetica').text(midias.join('; '));
            doc.moveDown(0.6);
          }
        }
        hasContentInSection = true;

        startSection('PASSAPORTE');
        renderField('text-38', 'Número do passaporte');
        renderField('text-40', 'País que emitiu');
        renderField('text-39', 'Cidade de emissão');
        renderField('text-88', 'Estado de emissão');
        renderField('text-66', 'Data de emissão');
        renderField('text-67', 'Data de validade');
        renderField('radio-13', 'Passaporte perdido/roubado?');
        hasContentInSection = true;

        startSection('CONTATO NOS EUA');
        renderField('name-2', 'Contato nos EUA (nome)');
        renderField('text-41_contato', 'Endereço (EUA)');
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
        renderField('nome_mae', 'Nome da mãe');
        renderField('text-45', 'Data de nascimento da mãe');
        if (renderField('radio-15', 'Mãe nos EUA?') && data['radio-15'] === 'one') {
          renderField('checkbox-17[]', 'Status da mãe');
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

        if (data['spouse_fullname']) {
          startSection('CÔNJUGE');
          renderField('spouse_fullname', 'Nome do cônjuge');
          renderField('spouse-dob', 'Data de nascimento do cônjuge');
          renderField('spouse-nationality', 'Nacionalidade do cônjuge');
          renderField('spouse-city', 'Cidade de nascimento do cônjuge');
          renderField('spouse-country', 'País de nascimento do cônjuge');
          if (renderField('spouse-address-same', 'Endereço do cônjuge') && data['spouse-address-same'] === 'Diferente') {
            renderField('spouse_endereco', 'Endereço (diferente)');
            renderField('spouse_cidade', 'Cidade');
            renderField('spouse_estado', 'Estado');
            renderField('spouse_cep', 'CEP');
            renderField('spouse_pais', 'País');
          }
          hasContentInSection = true;
        }

        if (data['ex_fullname']) {
          startSection('EX-CÔNJUGE');
          renderField('ex_fullname', 'Nome do ex-cônjuge');
          renderField('ex_dob', 'Data de nascimento');
          renderField('ex_nationality', 'Nacionalidade');
          renderField('ex_city', 'Cidade de nascimento');
          renderField('ex_country', 'País de nascimento');
          renderField('data_casamento_div', 'Data do Casamento');
          renderField('data_divorcio', 'Data do Divórcio');
          renderField('cidade_divorcio', 'Cidade do Divórcio');
          renderField('como_divorcio', 'Como se deu o Divórcio');
          hasContentInSection = true;
        }

        if (data['falecido_fullname']) {
          startSection('CÔNJUGE FALECIDO');
          renderField('falecido_fullname', 'Nome do cônjuge falecido');
          renderField('falecido_dob', 'Data de nascimento');
          renderField('falecido_nationality', 'Nacionalidade');
          renderField('falecido_city', 'Cidade de nascimento');
          renderField('falecido_country', 'País de nascimento');
          renderField('data_falecimento', 'Data do Falecimento');
          hasContentInSection = true;
        }

        startSection('OCUPAÇÃO ATUAL');
        renderField('radio-27', 'Ocupação principal');
        renderField('text-49', 'Empregador / escola');
        renderField('text-101', 'Endereço');
        renderField('text-102', 'Cidade');
        renderField('text-104', 'Estado');
        renderField('text-103', 'CEP');
        renderField('phone-8', 'Telefone');
        renderField('text-50', 'Data início');
        renderField('text-51', 'Renda mensal (R$)');
        renderField('text-52', 'Descrição das funções');
        hasContentInSection = true;

        const extra_descricoes = data['extra_descricao[]'] || [];
        if (extra_descricoes.length > 0) {
          startSection('OUTRAS OCUPAÇÕES / FONTES DE RENDA');
          const extra_rendas = data['extra_renda[]'] || [];
          const extra_empregadores = data['extra_empregador[]'] || [];
          const extra_inicios = data['extra_data_inicio[]'] || [];
          const extra_enderecos = data['extra_endereco[]'] || [];
          const extra_cidades = data['extra_cidade[]'] || [];
          const extra_estados = data['extra_estado[]'] || [];
          const extra_telefones = data['extra_telefone[]'] || [];
          const extra_ceps = data['extra_cep[]'] || [];
          
          for (let i = 0; i < extra_descricoes.length; i++) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(`Ocupação adicional ${i+1}: ${extra_descricoes[i] || '(não informado)'}`);
            if (extra_empregadores[i]) doc.font('Helvetica').text(`  Empregador: ${extra_empregadores[i]}`);
            if (extra_rendas[i]) doc.font('Helvetica').text(`  Renda mensal: ${extra_rendas[i]}`);
            if (extra_inicios[i]) {
              const dataInicioFormatada = formatDateToBrazilian(extra_inicios[i]);
              doc.font('Helvetica').text(`  Data início: ${dataInicioFormatada}`);
            }
            if (extra_enderecos[i]) doc.font('Helvetica').text(`  Endereço: ${extra_enderecos[i]}`);
            if (extra_cidades[i] && extra_estados[i]) doc.font('Helvetica').text(`  Cidade/UF: ${extra_cidades[i]} / ${extra_estados[i]}`);
            if (extra_ceps[i]) doc.font('Helvetica').text(`  CEP: ${extra_ceps[i]}`);
            if (extra_telefones[i]) doc.font('Helvetica').text(`  Telefone: ${extra_telefones[i]}`);
            doc.moveDown(0.6);
          }
          hasContentInSection = true;
        }

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
                if (empInicios[i] || empFins[i]) doc.font('Helvetica').text(`  Período: ${inicio} a ${fim}`);
                doc.moveDown(0.4);
              }
            }
            hasContentInSection = true;
          }
        }

        if (data['radio-18'] === 'one') {
          startSection('ESCOLARIDADE');
          renderField('text-59', 'Instituição de ensino');
          renderField('text-60', 'Curso');
          renderField('text-111', 'Endereço da instituição');
          renderField('text-112', 'Cidade');
          renderField('text-114', 'Estado');
          renderField('text-113', 'CEP');
          renderField('text-61', 'Data início');
          renderField('text-62', 'Data conclusão');
          hasContentInSection = true;
        }

        startSection('SERVIÇO MILITAR');
        if (data['servico_militar'] === 'Sim') {
          doc.font('Helvetica-Bold').fontSize(10).text('Você já serviu nas forças armadas?: ', { continued: true });
          doc.font('Helvetica').text('Sim');
          doc.moveDown(0.6);
          renderField('military_country', 'País');
          renderField('military_branch', 'Ramo das Forças Armadas');
          renderField('military_rank', 'Patente / Posição');
          renderField('military_specialty', 'Especialidade Militar');
          renderField('military_date_from', 'Data de início');
          renderField('military_date_to', 'Data de término');
        } else {
          doc.font('Helvetica-Bold').fontSize(10).text('Você já serviu nas forças armadas?: ', { continued: true });
          doc.font('Helvetica').text('Não');
          doc.moveDown(0.6);
        }
        hasContentInSection = true;

        startSection('TREINAMENTO ESPECIALIZADO');
        if (data['treinamento_especializado'] === 'Sim') {
          doc.font('Helvetica-Bold').fontSize(10).text('Você tem alguma habilidade ou treinamento especializado? (armas de fogo, explosivos, nuclear, biológica ou química): ', { continued: true });
          doc.font('Helvetica').text('Sim');
          doc.moveDown(0.6);
          renderField('treinamento_descricao', 'Descrição do treinamento');
        } else {
          doc.font('Helvetica-Bold').fontSize(10).text('Você tem alguma habilidade ou treinamento especializado? (armas de fogo, explosivos, nuclear, biológica ou química): ', { continued: true });
          doc.font('Helvetica').text('Não');
          doc.moveDown(0.6);
        }
        hasContentInSection = true;

        startSection('SEGURANÇA');
        if (data['antecedentes_criminais'] === 'Sim') {
          doc.font('Helvetica-Bold').fontSize(10).text('Você já foi preso ou condenado por qualquer crime, mesmo que tenha sido perdoado ou anistiado?: ', { continued: true });
          doc.font('Helvetica').text('Sim');
          doc.moveDown(0.6);
          renderField('antecedentes_descricao', 'Descrição dos antecedentes');
          renderField('antecedentes_data', 'Data do ocorrido');
          renderField('antecedentes_local', 'Local');
          renderField('antecedentes_resolucao', 'Resolução do caso');
        } else {
          doc.font('Helvetica-Bold').fontSize(10).text('Você já foi preso ou condenado por qualquer crime, mesmo que tenha sido perdoado ou anistiado?: ', { continued: true });
          doc.font('Helvetica').text('Não');
          doc.moveDown(0.6);
        }
        hasContentInSection = true;

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

        startSection('VIAGENS INTERNACIONAIS');
        if (data['radio-20'] === 'one') {
          const paises = data['paises_visitados[]'] || [];
          if (paises.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Países visitados (últimos 5 anos): ', { continued: true });
            doc.font('Helvetica').text(paises.join(', '));
            doc.moveDown(0.6);
          }
        }
        hasContentInSection = true;

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
      });

      console.log(`📄 PDF gerado para ${nome}, tamanho: ${pdfBuffer.length} bytes`);

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `🇺🇸 DS-160: ${nome}`,
        html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
        attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe');

      if (emailCliente && emailCliente.trim() !== '') {
          if (isEmailClienteValido(emailCliente, nome)) {
              try {
                  await resend.emails.send({
                      from: 'GetVisa <contato@getvisa.com.br>',
                      to: [emailCliente],
                      subject: `Seu formulário DS-160 foi recebido - ${nome}`,
                      html: `<strong>Olá ${nome},</strong><br><p>Recebemos seu formulário. Segue em anexo uma cópia.</p><p>Em breve nossa equipe entrará em contato.</p>`,
                      attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                  });
                  console.log(`✅ E-mail enviado para cliente VÁLIDO: ${emailCliente}`);
              } catch (emailErr) {
                  console.error(`❌ Erro ao enviar e-mail para ${emailCliente}:`, emailErr.message);
              }
          } else {
              console.log(`🚨 BLOQUEADO: Tentativa de enviar e-mail para domínio não autorizado ou suspeito: ${emailCliente}`);
          }
      } else {
          console.log(`⚠️ Cliente sem e-mail: ${nome}`);
      }
    } catch (err) {
      console.error('❌ Erro no processamento DS-160 (background):', err);
    }
  })();
});

// ==================== ROTA AVALIAÇÃO NORMAL (SIMULADOR) ====================
app.post('/api/submit-avaliacao', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados da Avaliação Normal recebidos:', JSON.stringify(data, null, 2));
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      const nome = data['nome'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email'] || null;
      
      let telefoneCliente = data['telefone'] || data['whatsapp'] || null;
      if (telefoneCliente) {
        telefoneCliente = telefoneCliente.toString().replace(/\D/g, '');
        if (telefoneCliente.startsWith('55')) {
          telefoneCliente = telefoneCliente.substring(2);
        }
        if (telefoneCliente.length === 12) {
          telefoneCliente = telefoneCliente.substring(1);
        }
        console.log(`📞 Telefone original: ${data['telefone']} → normalizado: ${telefoneCliente}`);
      }
      
      const score = data['score'] || data['pontuacao'] || 0;
      const classificacao = data['classificacao'] || data['classificacao_perfil'] || 
                           (score < 50 ? 'Requer Atenção' : (score < 70 ? 'Potencial Moderado' : 'Forte Potencial'));
      
      if (telefoneCliente) {
        const { data: inserted, error: insertError } = await supabase
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
          })
          .select();
        
        if (insertError) {
          console.error('❌ Erro ao salvar lead:', insertError);
        } else {
          console.log(`✅ Lead salvo com sucesso! ID: ${inserted?.[0]?.id}, Telefone: ${telefoneCliente}`);
          
          const primeiroNome = nome.split(' ')[0];
          let mensagemWhats = `Olá, ${primeiroNome}! Recebemos sua avaliação. Seu perfil foi classificado como *${classificacao}* (${score}/100).\n\n`;
          mensagemWhats += `✅ *Podemos dar início ao seu processo?*\n• Digite *SIM* para o link do DS-160\n• Digite *NÃO* para tirar dúvidas\n\nComo posso ajudar? 🚀`;
          
          await enviarWhatsApp(telefoneCliente, mensagemWhats);
        }
      }
    } catch (err) {
      console.error('❌ Erro:', err);
    }
  })();
});

// ==================== ROTA PASSAPORTE ====================
app.post('/api/submit-passaporte', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados de passaporte recebidos:', JSON.stringify({
    nome: data['passaporte_nome'],
    email: data['passaporte_email'],
    telefone: data['passaporte_telefone']
  }));
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      let solicitacaoId = null;
      
      // ==================== SALVAR NO SUPABASE ====================
      try {
        const emailCliente = data['passaporte_email'] || null;
        const nomeCliente = data['passaporte_nome'] || null;
        const telefoneCliente = data['passaporte_telefone'] || null;
        
        console.log('💾 Salvando passaporte no Supabase:', { emailCliente, nomeCliente, telefoneCliente });
        
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: emailCliente,
            nome_completo: nomeCliente,
            telefone: telefoneCliente
          }, { onConflict: 'email' })
          .select()
          .single();
        
        if (clienteError) {
          console.error('❌ Erro ao salvar cliente:', clienteError.message);
        } else if (cliente) {
          console.log(`✅ Cliente salvo/encontrado. ID: ${cliente.id}`);
          
          const { data: solicitacao, error: solError } = await supabase
            .from('solicitacoes')
            .insert({
              cliente_id: cliente.id,
              tipo: 'passaporte',
              dados: data,
              status: 'pendente',
              created_at: new Date()
            })
            .select()
            .single();
          
          if (solError) {
            console.error('❌ Erro ao salvar solicitação:', solError.message);
          } else {
            solicitacaoId = solicitacao.id;
            console.log(`✅ Passaporte salvo! ID: ${solicitacaoId}`);
          }
        }
      } catch (supabaseErr) {
        console.error('⚠️ Erro no Supabase:', supabaseErr.message);
      }

      const nome = data['passaporte_nome'] || 'Cliente_Sem_Nome';
      const emailCliente = data['passaporte_email'] || null;

      // ==================== GERAR PDF ====================
      const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fillColor('#003366').fontSize(22).text('SOLICITAÇÃO DE PASSAPORTE', { align: 'center' });
        doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentação Consular', { align: 'center' });
        doc.moveDown(2);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        const fields = [
          { label: 'Nome completo', name: 'passaporte_nome' },
          { label: 'Sexo', name: 'passaporte_sexo' },
          { label: 'Data de nascimento', name: 'passaporte_data_nasc' },
          { label: 'Raça/Cor', name: 'passaporte_raca' },
          { label: 'Estado civil', name: 'passaporte_estado_civil' },
          { label: 'País de nascimento', name: 'passaporte_pais_nasc' },
          { label: 'UF de nascimento', name: 'passaporte_uf_nasc' },
          { label: 'Cidade de nascimento', name: 'passaporte_cidade_nasc' },
          { label: 'Alteração de nome?', name: 'passaporte_alterou_nome' },
          { label: 'Nome(s) anterior(es)', name: 'passaporte_nome_anterior' },
          { label: 'Tipo de documento', name: 'passaporte_tipo_doc' },
          { label: 'Número do documento', name: 'passaporte_numero_doc' },
          { label: 'Data de emissão do documento', name: 'passaporte_data_emissao_doc' },
          { label: 'Órgão emissor e UF', name: 'passaporte_orgao_emissor' },
          { label: 'CPF', name: 'passaporte_cpf' },
          { label: 'Possui certidão?', name: 'passaporte_certidao' },
          { label: 'Certidão - Número da matrícula', name: 'passaporte_certidao_numero' },
          { label: 'Certidão - Cartório', name: 'passaporte_certidao_cartorio' },
          { label: 'Certidão - Livro', name: 'passaporte_certidao_livro' },
          { label: 'Certidão - Folha', name: 'passaporte_certidao_folha' },
          { label: 'Profissão', name: 'passaporte_profissao' },
          { label: 'E-mail', name: 'passaporte_email' },
          { label: 'Telefone de contato', name: 'passaporte_telefone' },
          { label: 'Endereço residencial', name: 'passaporte_endereco' },
          { label: 'Cidade', name: 'passaporte_cidade' },
          { label: 'UF', name: 'passaporte_uf' },
          { label: 'CEP', name: 'passaporte_cep' },
          { label: 'Possui título de eleitor?', name: 'passaporte_titulo_eleitor' },
          { label: 'Título - Número', name: 'passaporte_titulo_numero' },
          { label: 'Título - Zona', name: 'passaporte_titulo_zona' },
          { label: 'Título - Seção', name: 'passaporte_titulo_secao' },
          { label: 'Situação militar', name: 'passaporte_situacao_militar' },
          { label: 'Certificado de reservista', name: 'passaporte_reservista_numero' },
          { label: 'Situação do passaporte anterior', name: 'passaporte_situacao' },
          { label: 'Número do passaporte anterior', name: 'passaporte_anterior_numero' },
          { label: 'Data de expedição anterior', name: 'passaporte_anterior_data_exp' },
          { label: 'Data de validade anterior', name: 'passaporte_anterior_validade' }
        ];

        let lastGroup = null;
        for (const field of fields) {
          let value = data[field.name];
          if (value && value !== '') {
            if (field.name.includes('data') || field.name.includes('nasc')) {
              value = formatDateToBrazilian(value);
            }
            if (lastGroup !== null) {
              doc.moveDown(0.3);
              doc.strokeColor('#e0e0e0').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
              doc.moveDown(0.3);
            }
            doc.font('Helvetica-Bold').fontSize(10).text(`${field.label}: `, { continued: true });
            doc.font('Helvetica').text(value);
            doc.moveDown(0.6);
            lastGroup = field.name;
          }
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
      });

      console.log(`📄 PDF gerado para passaporte de ${nome}, tamanho: ${pdfBuffer.length} bytes`);

      // ==================== ENVIAR E-MAIL PARA EQUIPE ====================
      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `📘 Passaporte: ${nome}`,
        html: `<strong>Solicitação de passaporte recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>E-mail: ${emailCliente || 'não informado'}</p><p>Telefone: ${data['passaporte_telefone'] || 'não informado'}</p><p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
        attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe (passaporte)');

      // ==================== ENVIAR E-MAIL PARA CLIENTE COM VALIDAÇÃO ====================
      if (emailCliente && emailCliente.trim() !== '') {
          console.log(`📧 Verificando e-mail do cliente: ${emailCliente}`);
          
          // 🔥 CHAMA A VALIDAÇÃO (igual ao DS-160)
          const emailValido = isEmailClienteValido(emailCliente, nome);
          console.log(`📧 Resultado da validação: ${emailValido ? 'VÁLIDO' : 'BLOQUEADO'}`);
          
          if (emailValido) {
              try {
                  await resend.emails.send({
                      from: 'GetVisa <contato@getvisa.com.br>',
                      to: [emailCliente],
                      subject: `Sua solicitação de passaporte foi recebida - ${nome}`,
                      html: `<strong>Olá ${nome},</strong><br><p>Recebemos sua solicitação de passaporte. Em breve nossa equipe entrará em contato.</p><p>Segue em anexo uma cópia do seu pré-cadastro.</p><br><p>Atenciosamente,<br>Equipe GetVisa</p>`,
                      attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                  });
                  console.log(`✅ E-mail enviado para o cliente: ${emailCliente}`);
              } catch (emailErr) {
                  console.error(`❌ Erro ao enviar e-mail para ${emailCliente}:`, emailErr.message);
              }
          } else {
              console.log(`🚨 BLOQUEADO: E-mail não passou na validação: ${emailCliente}`);
          }
      } else {
          console.log(`⚠️ Cliente sem e-mail: ${nome}`);
      }
      
    } catch (err) {
      console.error('❌ Erro no processamento do passaporte (background):', err);
    }
  })();
});

// ==================== ROTA VISTO NEGADO ====================
app.post('/api/submit-visto-negado', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados de Visto Negado recebidos:', JSON.stringify({
    nome: data['nome'],
    email: data['email'],
    telefone: data['telefone']
  }));
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

      // ==================== SALVAR NO SUPABASE ====================
      let solicitacaoId = null;
      try {
        console.log('💾 Salvando visto negado no Supabase:', { emailCliente, nome, telefoneCliente });
        
        // Primeiro, busca ou cria o cliente
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: emailCliente,
            nome_completo: nome,
            telefone: telefoneCliente
          }, { onConflict: 'email' })
          .select()
          .single();
        
        if (clienteError) {
          console.error('❌ Erro ao salvar cliente (visto negado):', clienteError.message);
        } else if (cliente) {
          console.log(`✅ Cliente salvo/encontrado. ID: ${cliente.id}`);
          
          // Agora cria a solicitação de visto negado
          const { data: solicitacao, error: solError } = await supabase
            .from('solicitacoes')
            .insert({
              cliente_id: cliente.id,
              tipo: 'visto_negado',
              dados: data,
              status: 'pendente',
              created_at: new Date()
            })
            .select()
            .single();
          
          if (solError) {
            console.error('❌ Erro ao salvar solicitação de visto negado:', solError.message);
          } else {
            solicitacaoId = solicitacao.id;
            console.log(`✅ Visto Negado salvo com sucesso! ID: ${solicitacaoId}`);
          }
        }
      } catch (supabaseErr) {
        console.error('⚠️ Erro geral no Supabase (visto negado):', supabaseErr.message);
      }

      // ==================== ENVIAR WHATSAPP ====================
      if (telefoneCliente && score !== null) {
        const primeiroNome = nome.split(' ')[0];
        const classificacaoTexto = classificacaoTipo === 'urgent' ? 'que Requer Atenção Urgente' 
                                 : classificacaoTipo === 'moderate' ? 'com Potencial Moderado' 
                                 : 'com Forte Potencial';
        
        let mensagemWhats = `Olá, ${primeiroNome}! Tudo bem? Meu nome é Moisés, faço parte da equipe GETVISA e vou te acompanhar por todo o processo.\n\n`;
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
        mensagemWhats += `*Falar com especialista:* https://wa.me/5521974601812`;
        
        await enviarWhatsApp(telefoneCliente, mensagemWhats);
      }

      // ==================== GERAR PDF ====================
      const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fillColor('#003366').fontSize(22).text('AVALIAÇÃO DE VISTO NEGADO', { align: 'center' });
        doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Análise Estratégica', { align: 'center' });
        doc.moveDown(2);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('DADOS DO CLIENTE');
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(10).fillColor('#000000');
        doc.text(`Nome completo: ${nome}`);
        doc.text(`E-mail: ${emailCliente || 'Não informado'}`);
        doc.text(`Telefone/WhatsApp: ${telefoneCliente || 'Não informado'}`);
        doc.moveDown(1);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('QUESTIONÁRIO DE AVALIAÇÃO');
        doc.moveDown(0.5);

        const perguntas = [
          { label: '1. Quando seu visto foi negado pela última vez?', field: 'quando_negado' },
          { label: '2. Motivo da negativa informado pelo oficial', field: 'motivo_negativa' },
          { label: '3. Mudança na situação profissional/financeira?', field: 'mudanca_profissional' },
          { label: '4. Fortaleceu seus vínculos com o Brasil?', field: 'fortaleceu_vinculos' },
          { label: '5. Acredita que houve falha no preenchimento do DS-160?', field: 'falha_ds160' },
          { label: '6. Já teve problemas com imigração?', field: 'problemas_imigracao' }
        ];
        for (const q of perguntas) {
          let resposta = data[q.field];
          if (!resposta) resposta = '(não informado)';
          doc.font('Helvetica-Bold').fontSize(10).text(`${q.label}: `, { continued: true });
          doc.font('Helvetica').text(resposta);
          doc.moveDown(0.8);
        }

        if (score !== null) {
          doc.moveDown(1);
          doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
          doc.moveDown(0.5);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('RESULTADO DA AVALIAÇÃO');
          doc.moveDown(0.5);
          doc.font('Helvetica').fontSize(10).fillColor('#000000');
          doc.text(`Pontuação: ${score}/100`);
          let classificacaoTexto = '';
          if (classificacaoTipo === 'urgent') classificacaoTexto = 'Requer Atenção Urgente';
          else if (classificacaoTipo === 'moderate') classificacaoTexto = 'Potencial Moderado';
          else classificacaoTexto = 'Forte Potencial';
          doc.text(`Classificação: ${classificacaoTexto}`);
          doc.text(`Mensagem: ${classificacaoMensagem}`);
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
      });

      console.log(`📄 PDF gerado para visto negado (${nome}), tamanho: ${pdfBuffer.length} bytes`);

      // ==================== ENVIAR E-MAIL PARA EQUIPE ====================
      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `⚠️ Visto Negado: ${nome}`,
        html: `<strong>Avaliação de visto negado recebida.</strong><br>
               <p><strong>Cliente:</strong> ${nome}</p>
               <p><strong>E-mail:</strong> ${emailCliente || 'não informado'}</p>
               <p><strong>Telefone:</strong> ${telefoneCliente || 'não informado'}</p>
               <p><strong>Pontuação:</strong> ${score !== null ? score + '/100' : 'não calculada'}</p>
               <p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
        attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe (visto negado)');

      // ==================== ENVIAR E-MAIL PARA CLIENTE COM VALIDAÇÃO ====================
      if (emailCliente && emailCliente.trim() !== '') {
          console.log(`📧 Verificando e-mail do cliente (visto negado): ${emailCliente}`);
          
          const emailValido = isEmailClienteValido(emailCliente, nome);
          console.log(`📧 Resultado da validação: ${emailValido ? 'VÁLIDO' : 'BLOQUEADO'}`);
          
          if (emailValido) {
              let resultadoHtml = '';
              if (score !== null) {
                  let cor = classificacaoTipo === 'urgent' ? '#dc2626' : (classificacaoTipo === 'moderate' ? '#ff6b35' : '#0066cc');
                  resultadoHtml = `
                    <div style="background: #f0f9ff; border-left: 5px solid ${cor}; padding: 15px; margin: 20px 0; border-radius: 12px;">
                      <h3 style="margin: 0 0 10px; color: ${cor};">📊 Resultado da sua avaliação</h3>
                      <p><strong>Pontuação:</strong> ${score}/100</p>
                      <p><strong>Classificação:</strong> ${classificacaoTipo === 'urgent' ? 'Requer Atenção Urgente' : classificacaoTipo === 'moderate' ? 'Potencial Moderado' : 'Forte Potencial'}</p>
                      <p><strong>${classificacaoTitulo}</strong></p>
                      <p>${classificacaoMensagem}</p>
                    </div>
                  `;
              }
              try {
                  await resend.emails.send({
                      from: 'GetVisa <contato@getvisa.com.br>',
                      to: [emailCliente],
                      subject: `Resultado da sua avaliação de visto negado - ${nome}`,
                      html: `<strong>Olá ${nome},</strong><br>
                             <p>Recebemos sua solicitação de análise para reversão de visto negado. Em breve um de nossos especialistas entrará em contato.</p>
                             ${resultadoHtml}
                             <p>Segue em anexo o PDF completo com todas as suas respostas e o resultado da avaliação.</p>
                             <p>Atenciosamente,<br>Equipe GetVisa</p>`,
                      attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                  });
                  console.log(`✅ E-mail enviado para cliente (visto negado): ${emailCliente}`);
              } catch (emailErr) {
                  console.error(`❌ Erro ao enviar e-mail para ${emailCliente}:`, emailErr.message);
              }
          } else {
              console.log(`🚨 BLOQUEADO: E-mail não passou na validação: ${emailCliente}`);
          }
      } else {
          console.log(`⚠️ Cliente sem e-mail: ${nome}`);
      }
      
    } catch (err) {
      console.error('❌ Erro no processamento do visto negado (background):', err);
    }
  })();
});

// ==================== AUTENTICAÇÃO PARA ENDPOINTS ADMIN ====================
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'minha-chave-secreta-123';
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) return res.status(403).json({ error: 'Acesso negado' });
  next();
}

// ==================== ENDPOINTS DE AGENDA (PROTEGIDOS) ====================
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
    return res.status(400).json({ error: 'Campos obrigatórios: solicitacao_id, tipo, data_hora' });
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
    .select('id, tipo, clientes(nome_completo, email)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ==================== ENDPOINTS DE COMPROMISSOS ====================
app.get('/api/compromissos', validateApiKey, async (req, res) => {
  const { data, error } = await supabase.from('compromissos').select('*').order('data', { ascending: true }).order('hora', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/compromissos', validateApiKey, async (req, res) => {
  const { cliente, atividade, data, hora, local, concluido } = req.body;
  if (!cliente || !atividade || !data || !hora) {
    return res.status(400).json({ error: 'Cliente, atividade, data e hora são obrigatórios' });
  }
  const { data: inserted, error } = await supabase
    .from('compromissos')
    .insert({ cliente, atividade, data, hora, local, concluido: concluido || 0 })
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

// ==================== ROTA DE PING ====================
app.get('/ping', (req, res) => {
  res.status(200).send('ok');
});

// ==================== WEBHOOK Z-API ====================
app.post('/api/webhook/zapi', async (req, res) => {
  res.status(200).json({ status: 'ok' });

  const body = req.body;
  
  if (body.fromMe === true) return;
  const connectedPhone = body.connectedPhone;
  const senderPhone = body.phone || body.from;
  if (senderPhone === connectedPhone) return;
  if (body.isStatusReply === true || body.waitingMessage === true) return;

  try {
    const messageText = (body.text?.message || body.message?.text || body.message || '').toLowerCase().trim();
    if (!messageText) return;

    let cleanPhone = senderPhone.toString().replace(/\D/g, '');
    if (cleanPhone.startsWith('55')) {
      cleanPhone = cleanPhone.substring(2);
    }
    console.log(`📞 Telefone: ${cleanPhone} | Mensagem: "${messageText}"`);

    let lead = null;
    const { data: leads } = await supabase
      .from('leads_simulador')
      .select('*')
      .eq('telefone_whatsapp', cleanPhone)
      .order('data_simulacao', { ascending: false });
    
    if (leads && leads.length > 0) {
      lead = leads[0];
      console.log(`✅ Lead encontrado: ${lead.nome_cliente}`);
    } else {
      console.log(`❌ Lead NÃO encontrado para ${cleanPhone}`);
    }
    
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    const securityToken = process.env.ZAPI_SECURITY_TOKEN;
    
    const sendReply = async (phone, message) => {
      if (!instance || !token) return;
      const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': securityToken || '' },
        body: JSON.stringify({ phone, message })
      });
      console.log(`📱 Resposta enviada para ${phone}: ${response.status}`);
    };
    
    // ==================== RESPOSTAS DO WEBHOOK ====================
    if (lead && (messageText === 'sim' || messageText === 'sim!' || messageText === 'quero' || messageText === '7' || messageText === '7️⃣')) {
      const primeiroNome = (lead.nome_cliente || 'Cliente').split(' ')[0];
      const resposta = `🎉 *Perfeito, ${primeiroNome}!* 🎉\n\n` +
                       `📋 *Acesse o rascunho do formulário DS-160:*\n` +
                       `🌐 https://getvisa.com.br/formulario-ds160\n\n` +
                       `⚠️ Preencha com atenção. Após o envio, nossa equipe fará a análise.\n\n` +
                       `Aguardamos seu formulário! 🇺🇸✨`;
      await sendReply(cleanPhone, resposta);
      return;
    }
    
    if (lead && (messageText === 'não' || messageText === 'nao' || messageText === 'n')) {
      const primeiroNome = (lead.nome_cliente || 'Cliente').split(' ')[0];
      const resposta = `😊 *Tudo bem, ${primeiroNome}! Posso te ajudar com mais informações.*\n\n` +
                       `🔍 *O que você gostaria de saber?*\n\n` +
                       `1️⃣💰 *PREÇO* - Valores do processo\n` +
                       `2️⃣⏰ *PRAZO* - Tempos estimados\n` +
                       `3️⃣📄 *DOCUMENTOS* - O que é necessário\n` +
                       `4️⃣📋 *PROCESSO* - Passo a passo\n` +
                       `5️⃣⚠️ *VISTO NEGADO* - Casos de negativa\n` +
                       `6️⃣📞 *AJUDA* - Falar com especialista\n` +
                       `8️⃣📅 *MEUS AGENDAMENTOS* - Consultar compromissos\n\n` +
                       `Digite o número da opção (1 a 6 ou 8) ou *SIM* para começar! 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }
    
    if (lead && (messageText === 'oi' || messageText === 'olá' || messageText === 'ola' || 
                 messageText === 'bom dia' || messageText === 'boa tarde' || messageText === 'boa noite')) {
      const primeiroNome = (lead.nome_cliente || 'Cliente').split(' ')[0];
      const resposta = `🇺🇸 *Olá, ${primeiroNome}! Seja bem-vindo(a) à GetVisa!* 🇺🇸\n\n` +
                       `📋 *Como podemos ajudar você hoje?*\n\n` +
                       `🔍 *Opções disponíveis:*\n` +
                       `1️⃣  💰 *PREÇO* - Valores do processo\n` +
                       `2️⃣  ⏰ *PRAZO* - Tempos estimados\n` +
                       `3️⃣  📄 *DOCUMENTOS* - O que é necessário\n` +
                       `4️⃣  📋 *PROCESSO* - Passo a passo\n` +
                       `5️⃣  ⚠️ *VISTO NEGADO* - Casos de negativa\n` +
                       `6️⃣  📞 *AJUDA* - Falar com especialista\n` +
                       `7️⃣  ✅ *SIM* - Iniciar meu processo\n` +
                       `8️⃣  📅 *MEUS AGENDAMENTOS* - Consultar compromissos\n\n` +
                       `*Digite o número da opção desejada (1 a 8):* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log(`📝 Menu principal enviado para ${primeiroNome}`);
      return;
    }
    
    // ==================== CONSULTAR AGENDAMENTOS ====================
    if (lead && (messageText === '8' || messageText === '8️⃣' || 
                 messageText === 'meus agendamentos' || messageText === 'meus compromissos' || 
                 messageText === 'minha entrevista' || messageText === 'quando' || 
                 messageText === 'datas' || messageText === '📅' || messageText === 'agendamentos')) {
      
      const primeiroNome = (lead.nome_cliente || 'Cliente').split(' ')[0];
      const nomeCompleto = lead.nome_cliente || '';
      
      console.log(`📅 Cliente ${primeiroNome} solicitou consulta de agendamentos`);
      
      const { data: agendamentos, error } = await supabase
        .from('compromissos')
        .select('*')
        .ilike('cliente', `%${nomeCompleto}%`)
        .order('data', { ascending: true });
      
      if (error) {
        console.error('Erro ao buscar agendamentos:', error);
        const resposta = `❌ *Desculpe, ${primeiroNome}!*\n\nTivemos um problema ao buscar seus agendamentos. Por favor, fale com um especialista: https://wa.me/5521974601812`;
        await sendReply(cleanPhone, resposta);
        return;
      }
      
      if (agendamentos && agendamentos.length > 0) {
        const hoje = new Date().toISOString().split('T')[0];
        const futuros = agendamentos.filter(a => a.data >= hoje && a.concluido === 0);
        const passados = agendamentos.filter(a => a.data < hoje || a.concluido === 1);
        
        let resposta = `📅 *Olá, ${primeiroNome}!* 📅\n\n`;
        
        if (futuros.length > 0) {
          resposta += `*🔜 PRÓXIMOS COMPROMISSOS:*\n\n`;
          for (const ag of futuros) {
            const dataFormatada = formatarDataBR(ag.data);
            const emoji = ag.atividade === 'ENTREVISTA' ? '🗣️' : 
                          ag.atividade === 'CASV' ? '👆' : 
                          ag.atividade.includes('TREINAMENTO') ? '💻' : 
                          ag.atividade === 'RETIRADA PASSAPORTE' ? '📬' : '📌';
            
            resposta += `${emoji} *${ag.atividade}*\n`;
            resposta += `   📆 ${dataFormatada}\n`;
            resposta += `   ⏰ ${ag.hora}\n`;
            if (ag.local) resposta += `   📍 ${ag.local}\n`;
            
            const diasRestantes = Math.ceil((new Date(ag.data) - new Date()) / (1000 * 60 * 60 * 24));
            if (diasRestantes === 0) {
              resposta += `   ⚠️ *É HOJE!* ⚠️\n`;
            } else if (diasRestantes === 1) {
              resposta += `   ⚠️ *É AMANHÃ!* ⚠️\n`;
            } else if (diasRestantes > 0) {
              resposta += `   📊 Em ${diasRestantes} dias\n`;
            }
            resposta += `\n`;
          }
        } else {
          resposta += `✅ *Você não tem compromissos futuros no momento.*\n\n`;
        }
        
        if (passados.length > 0) {
          resposta += `*✅ ÚLTIMOS COMPROMISSOS REALIZADOS:*\n\n`;
          const ultimos = passados.slice(-3);
          for (const ag of ultimos) {
            const dataFormatada = formatarDataBR(ag.data);
            const status = ag.concluido === 1 ? '✅' : '📅';
            resposta += `${status} ${ag.atividade} - ${dataFormatada}\n`;
          }
          if (passados.length > 3) {
            resposta += `\n_+ ${passados.length - 3} outros compromissos_\n`;
          }
        }
        
        resposta += `\n🔔 *Você receberá lembretes 3 dias e 1 dia antes de cada compromisso!*\n\n`;
        resposta += `Digite *MENU* para voltar ou *SIM* para iniciar seu processo! 🚀`;
        
        await sendReply(cleanPhone, resposta);
      } else {
        const resposta = `📅 *Olá, ${primeiroNome}!*\n\n` +
                         `Você não possui compromissos agendados no momento.\n\n` +
                         `Gostaria de agendar uma consultoria gratuita?\n` +
                         `👉 https://calendly.com/getvisa/consultoria\n\n` +
                         `Digite *MENU* para ver outras opções! 🚀`;
        await sendReply(cleanPhone, resposta);
      }
      return;
    }
    
    // ==================== RESPOSTAS POR NÚMERO ====================
    if (lead && (messageText === '1' || messageText === '1️⃣' || messageText === 'preço' || messageText === 'preco' || messageText === '💰')) {
      const resposta = `💰 *INVESTIMENTO*\n\n` +
                       `🇺🇸 *Taxa Consular:* ~R$ 950\n` +
                       `📋 *Assessoria:* R$ 350,00\n\n` +
                       `*O que a assessoria inclui:*\n` +
                       `✅ Análise completa do perfil\n` +
                       `✅ Preenchimento do DS-160\n` +
                       `✅ Agendamento da entrevista\n` +
                       `✅ Preparação para entrevista (simulado)\n` +
                       `✅ Acompanhamento até o final do processo\n\n` +
                       `📌 Plano especial para família \n\n` +
                       `Digite *7* ou *SIM* para começar seu processo! 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (lead && (messageText === '2' || messageText === '2️⃣' || messageText === 'prazo' || messageText === '⏰')) {
      const resposta = `⏰ *PRAZOS ESTIMADOS*\n\n` +
                       `📅 *Agendamento da entrevista:*\n` +
                       `   • Por conta própria: até 8 semanas\n` +
                       `   • Com nossa assessoria: trabalhamos com antecipação de prazos ⚡\n\n` +
                       `🔍 *Análise consular:* 7 a 10 dias úteis\n\n` +
                       `📬 *Retorno do passaporte:* 5 a 7 dias úteis\n\n` +
                       `🕒 *TOTAL estimado:* 30 a 40 dias\n\n` +
                       `Digite *7* ou *SIM* para acelerar seu processo! 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (lead && (messageText === '3' || messageText === '3️⃣' || messageText === 'documentos' || messageText === '📄')) {
      const resposta = `📄 *DOCUMENTOS NECESSÁRIOS*\n\n` +
                       `📌 *OBRIGATÓRIOS:*\n` +
                       `• Passaporte válido (mínimo 6 meses de validade)\n` +
                       `• Foto 5x7 recente (fundo branco)\n` +
                       `• Comprovante da taxa consular MRV paga\n` +
                       `• DS-160 preenchido (nós ajudamos!)\n\n` +
                       `📌 *RECOMENDADOS (comprovar vínculos):*\n` +
                       `• 💰 Comprovante de renda (3 últimos holerites)\n` +
                       `• 🏦 Extratos bancários (3-6 meses)\n` +
                       `• 🏠 Comprovante de imóvel ou contrato de aluguel\n` +
                       `• 🚗 Documento do veículo\n` +
                       `• 📒 Carteira de trabalho\n` +
                       `• 👨‍👩‍👧 Certidão de nascimento dos filhos\n\n` +
                       `Digite *7* ou *SIM* e te ajudo com a documentação! 📋`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (lead && (messageText === '4' || messageText === '4️⃣' || messageText === 'processo' || messageText === 'passo a passo' || messageText === '📋')) {
      const resposta = `📋 *PASSO A PASSO DO PROCESSO*\n\n` +
                       `1️⃣ *Análise de perfil* (você já fez ✅)\n` +
                       `   → Avaliamos suas chances de aprovação\n\n` +
                       `2️⃣ *Preenchimento do DS-160* (nós te enviamos o link)\n` +
                       `   → Revisamos antes do envio\n\n` +
                       `3️⃣ *Pagamento da taxa consular*\n` +
                       `   → ~R$ 950 (taxa oficial do governo dos EUA)\n\n` +
                       `4️⃣ *Agendamento da entrevista*\n` +
                       `   → Conseguimos datas mais rápidas ⚡\n\n` +
                       `5️⃣ *Preparação para entrevista*\n` +
                       `   → Simulado completo + dicas exclusivas\n\n` +
                       `6️⃣ *Acompanhamento*\n` +
                       `   → Até o final do processo!\n\n` +
                       `⏰ *Prazo médio total:* 30 a 40 dias\n\n` +
                       `Digite *7* ou *SIM* para iniciar agora! 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (lead && (messageText === '5' || messageText === '5️⃣' || messageText === 'visto negado' || messageText === 'negado' || messageText === 'rejeitado' || messageText === '⚠️')) {
      const resposta = `⚠️ *VISTO NEGADO? Não desanime!*\n\n` +
                       `*O que fazer após uma negativa:*\n\n` +
                       `1️⃣ Entender o motivo da negativa (artigo 214b - falta de vínculos)\n\n` +
                       `2️⃣ Reforçar seus vínculos com o Brasil\n` +
                       `   • Emprego estável, família, bens\n\n` +
                       `3️⃣ Corrigir o DS-160 com atenção redobrada\n` +
                       `4️⃣ Nova documentação de suporte\n` +
                       `5️⃣ Preparação intensiva para entrevista\n\n` +
                       `*🔄 Nossa assessoria especializada em REVERSÃO:*\n` +
                       `✅ Revisão completa do caso anterior\n` +
                       `✅ Estratégia personalizada para sua situação\n` +
                       `✅ Acompanhamento até o final do processo\n\n` +
                       `💰 *Investimento especial:* Taxa Consular + Assessoria R$ 380\n\n` +
                       `Digite *7* ou *SIM* para agendar uma análise do seu caso! 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (lead && (messageText === '6' || messageText === '6️⃣' || messageText === 'ajuda' || messageText === 'especialista' || messageText === 'contato' || messageText === 'falar' || messageText === '📞')) {
      const resposta = `📞 *FALAR COM UM ESPECIALISTA*\n\n` +
                       `Meu nome é *Moisés* e estou aqui para te ajudar pessoalmente!\n\n` +
                       `*Contato direto:*\n` +
                       `🐱‍👤 *WhatsApp:* https://wa.me/5521974601812\n\n` +
                       `*📅 Agende uma consultoria gratuita:*\n` +
                       `https://calendly.com/getvisa/consultoria\n\n` +
                       `*Horário de atendimento:*\n` +
                       `Segunda a Sexta, 9h às 18h\n\n` +
                       `Te aguardo para tirar todas as suas dúvidas! 💬`;
      await sendReply(cleanPhone, resposta);
      return;
    }
    
    if (lead) {
      const primeiroNome = (lead.nome_cliente || 'Cliente').split(' ')[0];
      const classificacao = lead.classificacao_perfil || 'Analisado';
      const pontuacao = lead.pontuacao_total || 0;
      const respostas = lead.respostas_simulador || {};
      const perfil = respostas.situacao_profissional || 'não informado';
      const renda = respostas.renda_mensal || 'não informada';
      const historico = respostas.historico_viagens || 'não informado';
      const motivo = respostas.proposito_viagem || 'não informado';
      
      let resposta = `Olá, ${primeiroNome}! Seu perfil foi classificado como *${classificacao}* (${pontuacao}/100).\n\n`;
      resposta += `📊 *Seus dados:*\n• Perfil: ${perfil}\n• Renda: ${renda}\n• Histórico: ${historico}\n• Motivo: ${motivo}\n\n`;
      resposta += `💰 *Investimento:* Taxa Consular (~R$ 950) + Assessoria (R$ 400)\n\n`;
      resposta += `📋 *Opções disponíveis:*\n`;
      resposta += `1️⃣ PREÇO | 2️⃣ PRAZO | 3️⃣ DOCUMENTOS | 4️⃣ PROCESSO | 5️⃣ VISTO NEGADO | 6️⃣ AJUDA | 7️⃣ SIM | 8️⃣ MEUS AGENDAMENTOS\n\n`;
      resposta += `Digite o número da opção desejada! 🚀`;
      
      await sendReply(cleanPhone, resposta);
      return;
    }
    
        if (!lead) {
      const resposta = `🇺🇸 *GetVisa Assessoria Consular*\n\n` +
                       `Olá! 👋 Faça sua avaliação gratuita de perfil:\n` +
                       `https://getvisa.com.br/simulador-visto-americano-4917\n\n` +
                       `Em 2 minutos você descobre suas chances de aprovação! 🚀`;
      await sendReply(cleanPhone, resposta);
    }
    
  } catch (error) {
    console.error('❌ Erro no webhook:', error.message);
  }
});

// ==================== ROTA ESPECÍFICA PARA O SIMULADOR DE 5 ETAPAS ====================
app.post('/api/submit-simulador', async (req, res) => {
  const data = req.body;
  console.log('📥 Simulador 5 etapas recebido:', data);
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
          mensagem += `Se sua resposta for *SIM*, te envio o link do DS-160. 🚀`;
          
          await enviarWhatsApp(telefoneCliente, mensagem);
        }
      }
      
    } catch (err) {
      console.error('❌ Erro:', err);
    }
  })();
});

// ==================== SISTEMA DE LEMBRETES AUTOMÁTICOS ====================

function formatarDataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

async function buscarTelefoneCliente(clienteNome, clienteId) {
  if (clienteId) {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('telefone')
      .eq('id', clienteId)
      .single();
    
    if (cliente?.telefone) {
      return cliente.telefone.replace(/\D/g, '');
    }
  }
  
  const { data: lead } = await supabase
    .from('leads_simulador')
    .select('telefone_whatsapp')
    .ilike('nome_cliente', `%${clienteNome}%`)
    .order('data_simulacao', { ascending: false })
    .limit(1)
    .single();
  
  if (lead?.telefone_whatsapp) {
    return lead.telefone_whatsapp.replace(/\D/g, '');
  }
  
  return null;
}

async function enviarLembreteAgendamento(telefone, nomeCliente, agendamento, diasAntecedencia) {
  const dataFormatada = formatarDataBR(agendamento.data);
  const emoji = agendamento.atividade === 'ENTREVISTA' ? '🗣️' : 
                agendamento.atividade === 'CASV' ? '👆' : 
                agendamento.atividade.includes('TREINAMENTO') ? '💻' : 
                agendamento.atividade === 'RETIRADA PASSAPORTE' ? '📬' : '📌';
  
  const diasTexto = diasAntecedencia === 3 ? '3 dias' : '1 dia';
  
  let mensagem = `🔔 *LEMBRETE - GetVisa* 🔔\n\n`;
  mensagem += `Olá, ${nomeCliente.split(' ')[0]}! 👋\n\n`;
  mensagem += `Faltam *${diasTexto}* para seu compromisso:\n\n`;
  mensagem += `${emoji} *${agendamento.atividade}*\n`;
  mensagem += `📆 Data: ${dataFormatada}\n`;
  mensagem += `⏰ Horário: ${agendamento.hora}\n`;
  
  if (agendamento.local) {
    mensagem += `📍 Local: ${agendamento.local}\n`;
  }
  
  if (agendamento.atividade === 'ENTREVISTA') {
    mensagem += `\n📋 *Dicas importantes:*\n`;
    mensagem += `• Chegue com 30 minutos de antecedência\n`;
    mensagem += `• Leve: passaporte, DS-160, foto 5x7\n`;
    mensagem += `• Documentos comprobatórios (renda, vínculos)\n`;
    mensagem += `• Esteja bem vestido(a) e confiante!\n`;
  } else if (agendamento.atividade === 'CASV') {
    mensagem += `\n📋 *Para a Coleta CASV:*\n`;
    mensagem += `• Leve o passaporte original\n`;
    mensagem += `• Confirme o local exato no dia\n`;
    mensagem += `• Não precisa levar documentos comprobatórios\n`;
  } else if (agendamento.atividade === 'RETIRADA PASSAPORTE') {
    mensagem += `\n📋 *Retirada do passaporte:*\n`;
    mensagem += `• Leve o comprovante de agendamento\n`;
    mensagem += `• Documento de identificação original\n`;
  }
  
  mensagem += `\nBoa sorte! 🍀🇺🇸\n\n`;
  mensagem += `Digite *MEUS AGENDAMENTOS* para ver todos os seus compromissos.`;
  
  let telefoneLimpo = telefone.toString().replace(/\D/g, '');
  if (telefoneLimpo.startsWith('55')) {
    telefoneLimpo = telefoneLimpo.substring(2);
  }
  
  await enviarWhatsApp(telefoneLimpo, mensagem);
  console.log(`📨 Lembrete ${diasTexto} enviado para ${nomeCliente}: ${agendamento.atividade} em ${agendamento.data}`);
}

async function verificarLembretes() {
  console.log(`🔍 Verificando lembretes - ${new Date().toLocaleString('pt-BR')}`);
  
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    const { data: agendamentos, error } = await supabase
      .from('compromissos')
      .select('*')
      .eq('concluido', 0)
      .gte('data', hoje);
    
    if (error) {
      console.error('❌ Erro ao buscar agendamentos:', error);
      return;
    }
    
    const dataAtual = new Date();
    dataAtual.setHours(0, 0, 0, 0);
    
    for (const ag of agendamentos) {
      const dataAgenda = new Date(ag.data);
      dataAgenda.setHours(0, 0, 0, 0);
      
      const diffDays = Math.ceil((dataAgenda - dataAtual) / (1000 * 60 * 60 * 24));
      
      const telefone = await buscarTelefoneCliente(ag.cliente, ag.cliente_id);
      
      if (!telefone) {
        console.log(`⚠️ Telefone não encontrado para ${ag.cliente}`);
        continue;
      }
      
      if (diffDays === 3 && !ag.lembrete_3d_enviado) {
        await enviarLembreteAgendamento(telefone, ag.cliente, ag, 3);
        
        await supabase
          .from('compromissos')
          .update({ lembrete_3d_enviado: true })
          .eq('id', ag.id);
          
        console.log(`✅ Lembrete 3 dias enviado para ${ag.cliente}`);
      }
      
      if (diffDays === 1 && !ag.lembrete_1d_enviado) {
        await enviarLembreteAgendamento(telefone, ag.cliente, ag, 1);
        
        await supabase
          .from('compromissos')
          .update({ lembrete_1d_enviado: true })
          .eq('id', ag.id);
          
        console.log(`✅ Lembrete 1 dia enviado para ${ag.cliente}`);
      }
    }
    
  } catch (err) {
    console.error('❌ Erro no sistema de lembretes:', err);
  }
}

setInterval(verificarLembretes, 6 * 60 * 60 * 1000);
verificarLembretes();

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));