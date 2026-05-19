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
  process.env.SUPABASE_ANON_KEY
);

// ==================== ANTI-SPAM REFORÇADO ====================
function isSpamValue(valor) {
  if (!valor) return true;
  const str = valor.toString().toLowerCase();
  const spamPatterns = [
    /^[a-z]{10,}$/,           // letras aleatórias
    /[bcdfghjklmnpqrstvwxyz]{4,}/, // muitas consoantes
    /^(\d)\1+$/,              // números repetidos
    /^(teste|spam|fake|bot)+$/i // palavras comuns de spam
  ];
  return spamPatterns.some(pattern => pattern.test(str));
}

function isSpamData(dados) {
  const nome = dados.nome || dados.nome_cliente || dados.full_name || '';
  const telefone = dados.telefone || dados.whatsapp || dados.telefone_whatsapp || '';
  const email = dados.email || '';
  
  // 1. Nome com 10+ letras sem espaço (spam)
  if (/^[a-z]{10,}$/i.test(nome)) {
    console.log('🚫 Spam bloqueado: nome aleatório', nome);
    return true;
  }
  
  // 2. Nome com 4+ consoantes seguidas
  if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(nome)) {
    console.log('🚫 Spam bloqueado: muitas consoantes', nome);
    return true;
  }
  
  // 3. Nome muito curto (menos de 3 letras)
  if (nome.length > 0 && nome.length < 3) {
    console.log('🚫 Spam bloqueado: nome muito curto', nome);
    return true;
  }
  
  // 4. Telefone com letras
  if (telefone && /[a-zA-Z]/.test(telefone)) {
    console.log('🚫 Spam bloqueado: telefone com letras', telefone);
    return true;
  }
  
  // 5. Telefone muito curto (menos de 10 dígitos)
  const telefoneLimpo = telefone?.toString().replace(/\D/g, '') || '';
  if (telefoneLimpo.length > 0 && telefoneLimpo.length < 10) {
    console.log('🚫 Spam bloqueado: telefone curto', telefone);
    return true;
  }
  
  // 6. Telefone com padrão repetido (ex: 1111111111)
  if (telefoneLimpo && /^(\d)\1+$/.test(telefoneLimpo)) {
    console.log('🚫 Spam bloqueado: telefone repetido', telefone);
    return true;
  }
  
  // 7. Email de domínio temporário
  const dominiosSpam = ['tempmail', 'mailinator', '10minutemail', 'guerrillamail', 'throwaway', 'fake', 'spam'];
  for (const dominio of dominiosSpam) {
    if (email.toLowerCase().includes(dominio)) {
      console.log('🚫 Spam bloqueado: email temporário', email);
      return true;
    }
  }
  
  // 8. Email sem @ ou inválido
  if (email && (!email.includes('@') || email.split('@').length !== 2)) {
    console.log('🚫 Spam bloqueado: email inválido', email);
    return true;
  }
  
  // 9. Verificar se tem pelo menos um campo válido
  const camposRelevantes = ['nome', 'nome_cliente', 'full_name', 'telefone', 'whatsapp', 'email', 'telefone_whatsapp'];
  const temDadoValido = camposRelevantes.some(campo => {
    const valor = dados[campo];
    return valor && valor.toString().trim().length > 0 && !isSpamValue(valor);
  });
  
  if (!temDadoValido) {
    console.log('🚫 Spam bloqueado: nenhum dado válido');
    return true;
  }
  
  return false;
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

// ==================== ROTA DE SAÚDE PARA KEEP-ALIVE ====================
app.get('/health', (req, res) => {
  console.log('🏓 Ping recebido em', new Date().toLocaleString('pt-BR'));
  res.status(200).send('OK');
});

// ==================== ROTA DE PING ====================
app.get('/ping', (req, res) => {
  res.status(200).send('ok');
});

// ==================== VALIDAÇÃO DS-160 OFICIAL ====================
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
  'falecido-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
  'radio-visto-negado': { 'one': 'Sim', 'two': 'Não' },
  'radio-entrada-negada': { 'one': 'Sim', 'two': 'Não' },
  'radio-deportado': { 'one': 'Sim', 'two': 'Não' }
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
  
  // ANTI-SPAM
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
      let solicitacaoId = null;
      try {
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: data['email-1'] || null,
            nome_completo: data['full_name'] || null,
            telefone: data['text-77'] || null
          }, { onConflict: 'email' })
          .select()
          .single();
        if (!clienteError) {
          const { data: solicitacao, error: solError } = await supabase
            .from('solicitacoes')
            .insert({
              cliente_id: cliente.id,
              tipo: 'ds160',
              dados: data,
              status: 'pendente'
            })
            .select()
            .single();
          if (!solError) solicitacaoId = solicitacao.id;
          console.log(`✅ DS-160 salvo. ID: ${solicitacaoId}`);
        }
      } catch (supabaseErr) {
        console.error('⚠️ Erro ao salvar no Supabase:', supabaseErr.message);
      }

      const nome = data['full_name'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email-1'] || null;

      const pdfBuffer = await new Promise((resolve, reject) => {
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
          const acompanhantes = groupParallelArrays(data, 'acompanhante_nome[]', 'acompanhante_rel[]');
          if (acompanhantes.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Acompanhantes:');
            acompanhantes.forEach(acc => doc.font('Helvetica').text(`  - ${acc}`));
            doc.moveDown(0.6);
          }
          hasContentInSection = true;
        }

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
          const parentes = groupParallelArrays(data, 'parente_nome[]', 'parente_relacao[]');
          if (parentes.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Parentes nos EUA:');
            parentes.forEach(p => doc.font('Helvetica').text(`  - ${p}`));
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
            doc.font('Helvetica-Bold').fontSize(10).text('Paises visitados (ultimos 5 anos): ', { continued: true });
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

// ==================== ROTA AVALIAÇÃO NORMAL (SIMULADOR) ====================
app.post('/api/submit-avaliacao', async (req, res) => {
  const data = req.body;
  
  // ANTI-SPAM
  if (isSpamData(data)) {
    console.log('🚫 SPAM Avaliação - Dados rejeitados');
    return res.status(200).json({ success: true, message: 'Recebido' });
  }
  
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
          mensagemWhats += `✅ *Podemos dar início ao seu processo?*\n• Digite *SIM* para o link do DS-160\n• Digite *NÃO* para tirar dúvidas\n\n📌 *Digite MENU para voltar ao início* 🚀`;
          
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
  
  // ANTI-SPAM
  if (isSpamData(data)) {
    console.log('🚫 SPAM Passaporte - Dados rejeitados');
    return res.status(200).json({ success: true, message: 'Recebido' });
  }
  
  console.log('📥 Dados de passaporte recebidos');
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      let solicitacaoId = null;
      try {
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: data['passaporte_email'] || null,
            nome_completo: data['passaporte_nome'] || null,
            telefone: data['passaporte_telefone'] || null
          }, { onConflict: 'email' })
          .select()
          .single();
        if (!clienteError) {
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

      const nome = data['passaporte_nome'] || 'Cliente_Sem_Nome';
      const emailCliente = data['passaporte_email'] || null;

      const pdfBuffer = await new Promise((resolve, reject) => {
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
          { label: 'Nome completo', name: 'passaporte_nome' },
          { label: 'Sexo', name: 'passaporte_sexo' },
          { label: 'Data de nascimento', name: 'passaporte_data_nasc' },
          { label: 'Raca/Cor', name: 'passaporte_raca' },
          { label: 'Estado civil', name: 'passaporte_estado_civil' },
          { label: 'Pais de nascimento', name: 'passaporte_pais_nasc' },
          { label: 'UF de nascimento', name: 'passaporte_uf_nasc' },
          { label: 'Cidade de nascimento', name: 'passaporte_cidade_nasc' },
          { label: 'Alteracao de nome?', name: 'passaporte_alterou_nome' },
          { label: 'Nome(s) anterior(es)', name: 'passaporte_nome_anterior' },
          { label: 'Tipo de documento', name: 'passaporte_tipo_doc' },
          { label: 'Numero do documento', name: 'passaporte_numero_doc' },
          { label: 'Data de emissao do documento', name: 'passaporte_data_emissao_doc' },
          { label: 'Orgao emissor e UF', name: 'passaporte_orgao_emissor' },
          { label: 'CPF', name: 'passaporte_cpf' },
          { label: 'Possui certidao?', name: 'passaporte_certidao' },
          { label: 'Certidao - Numero da matricula', name: 'passaporte_certidao_numero' },
          { label: 'Certidao - Cartorio', name: 'passaporte_certidao_cartorio' },
          { label: 'Certidao - Livro', name: 'passaporte_certidao_livro' },
          { label: 'Certidao - Folha', name: 'passaporte_certidao_folha' },
          { label: 'Profissao', name: 'passaporte_profissao' },
          { label: 'E-mail', name: 'passaporte_email' },
          { label: 'Telefone de contato', name: 'passaporte_telefone' },
          { label: 'Endereco residencial', name: 'passaporte_endereco' },
          { label: 'Cidade', name: 'passaporte_cidade' },
          { label: 'UF', name: 'passaporte_uf' },
          { label: 'CEP', name: 'passaporte_cep' },
          { label: 'Possui titulo de eleitor?', name: 'passaporte_titulo_eleitor' },
          { label: 'Titulo - Numero', name: 'passaporte_titulo_numero' },
          { label: 'Titulo - Zona', name: 'passaporte_titulo_zona' },
          { label: 'Titulo - Secao', name: 'passaporte_titulo_secao' },
          { label: 'Situacao militar', name: 'passaporte_situacao_militar' },
          { label: 'Certificado de reservista', name: 'passaporte_reservista_numero' },
          { label: 'Situacao do passaporte anterior', name: 'passaporte_situacao' },
          { label: 'Numero do passaporte anterior', name: 'passaporte_anterior_numero' },
          { label: 'Data de expedicao anterior', name: 'passaporte_anterior_data_exp' },
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

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `📘 Passaporte: ${nome}`,
        html: `<strong>Solicitacao de passaporte recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo.</p>`,
        attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe (passaporte)');

      if (emailCliente && emailCliente.trim() !== '') {
        await resend.emails.send({
          from: 'GetVisa <contato@getvisa.com.br>',
          to: [emailCliente],
          subject: `Sua solicitacao de passaporte foi recebida - ${nome}`,
          html: `<strong>Ola ${nome},</strong><br><p>Recebemos sua solicitacao. Em breve nossa equipe entrara em contato.</p><p>Segue em anexo uma copia.</p>`,
          attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
        });
        console.log(`✅ E-mail enviado para o cliente (passaporte): ${emailCliente}`);
      }
    } catch (err) {
      console.error('❌ Erro no processamento do passaporte (background):', err);
    }
  })();
});

// ==================== ROTA VISTO NEGADO ====================
app.post('/api/submit-visto-negado', async (req, res) => {
  const data = req.body;
  
  // ANTI-SPAM
  if (isSpamData(data)) {
    console.log('🚫 SPAM Visto Negado - Dados rejeitados');
    return res.status(200).json({ success: true, message: 'Recebido' });
  }
  
  console.log('📥 Dados de Visto Negado recebidos:', data);
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
        mensagemWhats += `📌 *Digite MENU para voltar ao início* 🚀`;
        
        await enviarWhatsApp(telefoneCliente, mensagemWhats);
      }

      const pdfBuffer = await new Promise((resolve, reject) => {
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
          let resposta = data[q.field];
          if (!resposta) resposta = '(nao informado)';
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

      console.log(`📄 PDF gerado para visto negado (${nome}), tamanho: ${pdfBuffer.length} bytes`);

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `⚠️ Visto Negado: ${nome}`,
        html: `<strong>Avaliacao de visto negado recebida.</strong><br>
               <p><strong>Cliente:</strong> ${nome}</p>
               <p><strong>E-mail:</strong> ${data['email'] || 'nao informado'}</p>
               <p><strong>Telefone:</strong> ${data['telefone'] || 'nao informado'}</p>
               <p><strong>Pontuacao:</strong> ${score !== null ? score + '/100' : 'nao calculada'}</p>
               <p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
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
          html: `<strong>Ola ${nome},</strong><br>
                 <p>Recebemos sua solicitacao de analise para reversao de visto negado. Em breve um de nossos especialistas entrara em contato.</p>
                 ${resultadoHtml}
                 <p>Segue em anexo o PDF completo com todas as suas respostas e o resultado da avaliacao.</p>
                 <p>Atenciosamente,<br>Equipe GetVisa</p>`,
          attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
        });
        console.log(`✅ E-mail enviado para o cliente (visto negado) com resultado: ${emailCliente}`);
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
    return res.status(400).json({ error: 'Cliente, atividade, data e hora sao obrigatorios' });
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

// ==================== WEBHOOK Z-API CORRIGIDO ====================
app.post('/api/webhook/zapi', async (req, res) => {
  console.log('📥 Webhook Z-API recebido:', JSON.stringify(req.body, null, 2));
  
  // Responde 200 IMEDIATAMENTE
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;
    
    // Ignora mensagens próprias e de status
    if (body.fromMe === true) {
      console.log('📤 Mensagem própria, ignorando');
      return;
    }
    
    if (body.isStatusReply === true || body.waitingMessage === true) {
      console.log('⏳ Status/waiting, ignorando');
      return;
    }

    const senderPhone = body.phone || body.from;
    if (!senderPhone) {
      console.log('⚠️ Sem telefone remetente');
      return;
    }

    // Extrai o texto da mensagem
    let messageText = body.text?.message || body.message?.text || body.message || '';
    if (typeof messageText !== 'string') messageText = String(messageText);
    messageText = messageText.trim().toLowerCase();
    
    if (!messageText) {
      console.log('📭 Mensagem sem texto');
      return;
    }

    console.log(`📩 Mensagem de ${senderPhone}: ${messageText}`);
    
    // Normaliza telefone
    let cleanPhone = senderPhone.toString().replace(/\D/g, '');
    if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);
    
    // Função para enviar WhatsApp
    const sendReply = async (phone, mensagem) => {
      const instance = process.env.ZAPI_INSTANCE;
      const token = process.env.ZAPI_TOKEN;
      const securityToken = process.env.ZAPI_SECURITY_TOKEN;
      
      if (!instance || !token) {
        console.log('⚠️ Z-API não configurada');
        return false;
      }
      
      const phoneFormatted = '55' + phone;
      const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(securityToken && { 'Client-Token': securityToken })
        },
        body: JSON.stringify({ phone: phoneFormatted, message: mensagem })
      });
      
      const result = await response.json();
      console.log('✅ Resposta Z-API:', result);
      return response.status === 200;
    };

    // ==========================================================
    // FLUXO: RESPOSTAS POR COMANDO
    // TODAS incluem opção de voltar ao MENU
    // ==========================================================
    
    // COMANDO: 0 ou MENU (voltar ao menu principal)
    if (messageText === '0' || messageText === 'menu' || messageText === 'voltar' || messageText === 'início' || messageText === 'inicio') {
      const resposta = 
        `🇺🇸 *GETVISA - MENU PRINCIPAL* 🇺🇸\n\n` +
        `1️⃣ 💰 PREÇO\n` +
        `2️⃣ ⏰ PRAZO\n` +
        `3️⃣ 📄 DOCUMENTOS\n` +
        `4️⃣ 📋 PROCESSO\n` +
        `5️⃣ ⚠️ VISTO NEGADO\n` +
        `6️⃣ 📞 AJUDA\n` +
        `7️⃣ 📊 AVALIAÇÃO GRATUITA\n\n` +
        `*Digite o número da opção (1 a 7) ou 0 para MENU:* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log('✅ MENU enviado');
      return;
    }
    
    // COMANDO: PREÇO (1)
    if (messageText === '1' || messageText === 'preço' || messageText === 'preco' || messageText.includes('quanto custa')) {
      const resposta = 
        `💰 *INVESTIMENTO*\n\n` +
        `🇺🇸 *Taxa Consular:* ~R$ 950\n` +
        `📋 *Assessoria GetVisa:* R$ 350\n\n` +
        `*O que a assessoria inclui:*\n` +
        `✅ Análise completa do perfil\n` +
        `✅ Preenchimento do DS-160\n` +
        `✅ Agendamento da entrevista\n` +
        `✅ Preparação para entrevista\n` +
        `✅ Acompanhamento total\n\n` +
        `📌 *Digite 0 para voltar ao MENU principal* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log('✅ Resposta de PREÇO enviada');
      return;
    }
    
    // COMANDO: PRAZO (2)
    if (messageText === '2' || messageText === 'prazo' || messageText.includes('quanto tempo') || messageText.includes('demora')) {
      const resposta = 
        `⏰ *PRAZOS ESTIMADOS*\n\n` +
        `📅 *Agendamento da entrevista:* até 8 semanas\n` +
        `🔍 *Análise consular:* 7 a 10 dias úteis\n` +
        `📬 *Retorno do passaporte:* 5 a 7 dias úteis\n\n` +
        `🕒 *Total estimado:* 30 a 40 dias\n\n` +
        `📌 *Digite 0 para voltar ao MENU principal* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log('✅ Resposta de PRAZO enviada');
      return;
    }
    
    // COMANDO: DOCUMENTOS (3)
    if (messageText === '3' || messageText === 'documentos' || messageText.includes('documento')) {
      const resposta = 
        `📄 *DOCUMENTOS NECESSÁRIOS*\n\n` +
        `📌 *OBRIGATÓRIOS:*\n` +
        `• Passaporte válido (mínimo 6 meses)\n` +
        `• Foto 5x7 recente\n` +
        `• Comprovante da taxa consular\n` +
        `• DS-160 preenchido\n\n` +
        `📌 *RECOMENDADOS:*\n` +
        `• Comprovante de renda\n` +
        `• Extratos bancários (3 meses)\n` +
        `• Comprovante de imóvel/veículo\n\n` +
        `📌 *Digite 0 para voltar ao MENU principal* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log('✅ Resposta de DOCUMENTOS enviada');
      return;
    }
    
    // COMANDO: PROCESSO (4)
    if (messageText === '4' || messageText === 'processo' || messageText.includes('passo a passo')) {
      const resposta = 
        `📋 *PASSO A PASSO*\n\n` +
        `1️⃣ Análise de perfil\n` +
        `2️⃣ Preenchimento do DS-160\n` +
        `3️⃣ Pagamento da taxa consular\n` +
        `4️⃣ Agendamento da entrevista\n` +
        `5️⃣ Coleta biométrica (CASV)\n` +
        `6️⃣ Entrevista no Consulado\n` +
        `7️⃣ Retirada do passaporte\n\n` +
        `📌 *Digite 0 para voltar ao MENU principal* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log('✅ Resposta de PROCESSO enviada');
      return;
    }
    
    // COMANDO: VISTO NEGADO (5)
    if (messageText === '5' || messageText === 'negado' || messageText.includes('visto negado')) {
      const resposta = 
        `⚠️ *VISTO NEGADO?*\n\n` +
        `Não desanime! Muitos casos são revertidos.\n\n` +
        `📊 *Faça uma análise gratuita do seu caso:*\n` +
        `🔗 https://getvisa.com.br/visto-americano-negado\n\n` +
        `*O que fazemos:*\n` +
        `✅ Análise do motivo da negativa\n` +
        `✅ Correção do DS-160\n` +
        `✅ Documentação reforçada\n` +
        `✅ Preparação intensiva\n\n` +
        `💰 *Assessoria especializada:* R$ 380\n\n` +
        `📌 *Digite 0 para voltar ao MENU principal* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log('✅ Resposta de VISTO NEGADO enviada');
      return;
    }
    
    // COMANDO: AJUDA / ESPECIALISTA (6)
    if (messageText === '6' || messageText === 'ajuda' || messageText === 'especialista' || messageText.includes('falar')) {
      const resposta = 
        `📞 *FALAR COM ESPECIALISTA*\n\n` +
        `Meu nome é *Moisés* e estou aqui para te ajudar!\n\n` +
        `*Contato direto:*\n` +
        `🐱‍👤 *WhatsApp:* https://wa.me/5521974601812\n\n` +
        `🕘 *Horário:* Segunda a Sexta, 9h às 18h\n\n` +
        `📌 *Digite 0 para voltar ao MENU principal* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log('✅ Resposta de AJUDA enviada');
      return;
    }
    
    // COMANDO: AVALIAÇÃO GRATUITA (7)
    if (messageText === '7' || messageText === 'avaliação' || messageText === 'avaliacao' || messageText === 'simulador') {
      const resposta = 
        `📊 *ANÁLISE GRATUITA DE PERFIL*\n\n` +
        `Descubra suas chances de aprovação!\n\n` +
        `🔗 https://getvisa.com.br/simulador-visto-americano-4917\n\n` +
        `⏱️ Menos de 2 minutos!\n\n` +
        `Após o simulador, seus resultados chegarão aqui! 🚀\n\n` +
        `📌 *Digite 0 para voltar ao MENU principal* 🚀`;
      await sendReply(cleanPhone, resposta);
      console.log('✅ Resposta de AVALIAÇÃO enviada');
      return;
    }
    
    // FALLBACK: Se nada acima funcionar, mostra o MENU
    const menuMessage = 
      `🇺🇸 *GETVISA - Assessoria Consular* 🇺🇸\n\n` +
      `Olá! 👋 Seja bem-vindo(a)!\n\n` +
      `📋 *Como podemos ajudar você hoje?*\n\n` +
      `1️⃣ 💰 PREÇO\n` +
      `2️⃣ ⏰ PRAZO\n` +
      `3️⃣ 📄 DOCUMENTOS\n` +
      `4️⃣ 📋 PROCESSO\n` +
      `5️⃣ ⚠️ VISTO NEGADO\n` +
      `6️⃣ 📞 AJUDA\n` +
      `7️⃣ 📊 AVALIAÇÃO GRATUITA\n\n` +
      `*Digite o número da opção (1 a 7) ou 0 para repetir este MENU:* 🚀`;
    
    await sendReply(cleanPhone, menuMessage);
    console.log('✅ MENU (fallback) enviado');

  } catch (error) {
    console.error('❌ Erro no webhook:', error.message);
    console.error('❌ Stack:', error.stack);
  }
});

// ==================== ROTA ESPECÍFICA PARA O SIMULADOR DE 5 ETAPAS ====================
app.post('/api/submit-simulador', async (req, res) => {
  const data = req.body;
  
  // ANTI-SPAM
  if (isSpamData(data)) {
    console.log('🚫 SPAM Simulador - Dados rejeitados');
    return res.status(200).json({ success: true, message: 'Recebido' });
  }
  
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
          mensagem += `Se sua resposta for *SIM*, te envio o link do DS-160.\n\n`;
          mensagem += `📌 *Digite MENU para voltar ao início* 🚀`;
          
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
  mensagem += `📌 *Digite MENU para voltar ao início* 🚀`;
  
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