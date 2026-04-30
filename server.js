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

const simpleFields = [
  { name: 'consulado_cidade', label: 'Cidade do Consulado', group: 'iniciais' },
  { name: 'radio-26', label: 'Indicado por agência/agente?', group: 'iniciais' },
  { name: 'text-1', label: 'Nome da agência/agente', group: 'iniciais' },
  { name: 'text-64', label: 'Idioma usado para preencher', group: 'iniciais' },
  { name: 'full_name', label: 'Nome completo', group: 'pessoais' },
  { name: 'radio-2', label: 'Já teve outro nome?', group: 'pessoais' },
  { name: 'text-87', label: 'Nome anterior', group: 'pessoais' },
  { name: 'radio-3', label: 'Sexo', group: 'pessoais' },
  { name: 'select-4', label: 'Estado civil', group: 'pessoais' },
  { name: 'text-5', label: 'Data de nascimento', group: 'pessoais' },
  { name: 'text-7', label: 'Cidade de nascimento', group: 'pessoais' },
  { name: 'text-6', label: 'Estado/Província', group: 'pessoais' },
  { name: 'text-95', label: 'País de nacionalidade', group: 'pessoais' },
  { name: 'radio-outra-nac', label: 'Possui outra nacionalidade?', group: 'pessoais' },
  { name: 'outra_nacionalidade_text', label: 'Qual outra nacionalidade?', group: 'pessoais' },
  { name: 'radio-residente', label: 'Residente permanente de outro país?', group: 'pessoais' },
  { name: 'text-86', label: 'CPF', group: 'pessoais' },
  { name: 'text-17', label: 'Número do Seguro Social (SSN)', group: 'pessoais' },
  { name: 'text-18', label: 'Número do contribuinte dos EUA (TIN)', group: 'pessoais' },
  { name: 'radio-28', label: 'Propósito da viagem', group: 'viagem' },
  { name: 'radio-planos', label: 'Planos específicos?', group: 'viagem' },
  { name: 'text-21', label: 'Data de chegada prevista', group: 'viagem' },
  { name: 'text-34', label: 'Duração da estadia (dias)', group: 'viagem' },
  { name: 'text-41', label: 'Endereço nos EUA', group: 'viagem' },
  { name: 'text-42', label: 'Cidade (EUA)', group: 'viagem' },
  { name: 'text-43', label: 'Estado (EUA)', group: 'viagem' },
  { name: 'email-4', label: 'CEP (EUA)', group: 'viagem' },
  { name: 'radio-6', label: 'Quem vai pagar?', group: 'viagem' },
  { name: 'text-22', label: 'Nome do pagador', group: 'viagem' },
  { name: 'text-25', label: 'Relacionamento com pagador', group: 'viagem' },
  { name: 'phone-1', label: 'Telefone do pagador', group: 'viagem' },
  { name: 'text-24', label: 'E-mail do pagador', group: 'viagem' },
  { name: 'text-26', label: 'Endereço do pagador', group: 'viagem' },
  { name: 'text-27', label: 'Cidade do pagador', group: 'viagem' },
  { name: 'text-96', label: 'UF do pagador', group: 'viagem' },
  { name: 'text-29', label: 'CEP do pagador', group: 'viagem' },
  { name: 'text-30', label: 'País do pagador', group: 'viagem' },
  { name: 'radio-7', label: 'Há acompanhantes?', group: 'acompanhantes' },
  { name: 'radio-8', label: 'Já esteve nos EUA?', group: 'previousTravel' },
  { name: 'radio-23', label: 'Já teve visto americano?', group: 'previousTravel' },
  { name: 'text-35', label: 'Data de emissão do visto', group: 'previousTravel' },
  { name: 'text-68', label: 'Número do visto', group: 'previousTravel' },
  { name: 'text-69', label: 'Data de expiração', group: 'previousTravel' },
  { name: 'radio-33', label: 'Impressões digitais coletadas?', group: 'previousTravel' },
  { name: 'radio-29', label: 'Mesmo tipo de visto?', group: 'previousTravel' },
  { name: 'radio-30', label: 'Mesmo país de emissão?', group: 'previousTravel' },
  { name: 'text-71', label: 'Logradouro', group: 'endereco' },
  { name: 'text-72', label: 'Complemento', group: 'endereco' },
  { name: 'text-73', label: 'CEP', group: 'endereco' },
  { name: 'text-74', label: 'Cidade', group: 'endereco' },
  { name: 'text-75', label: 'Estado', group: 'endereco' },
  { name: 'text-76', label: 'País', group: 'endereco' },
  { name: 'radio-9', label: 'Endereço de correspondência é o mesmo?', group: 'endereco' },
  { name: 'text-80', label: 'Logradouro (correspondência)', group: 'endereco' },
  { name: 'text-81', label: 'Complemento (correspondência)', group: 'endereco' },
  { name: 'text-82', label: 'CEP (correspondência)', group: 'endereco' },
  { name: 'text-83', label: 'Cidade (correspondência)', group: 'endereco' },
  { name: 'text-84', label: 'Estado (correspondência)', group: 'endereco' },
  { name: 'text-85', label: 'País (correspondência)', group: 'endereco' },
  { name: 'text-77', label: 'Telefone principal', group: 'telefones' },
  { name: 'text-78', label: 'Telefone comercial', group: 'telefones' },
  { name: 'radio-10', label: 'Usou outros números?', group: 'telefones' },
  { name: 'email-1', label: 'E-mail principal', group: 'emails' },
  { name: 'radio-11', label: 'Usou outros e-mails?', group: 'emails' },
  { name: 'radio-12', label: 'Presença em mídias sociais?', group: 'midias' },
  { name: 'text-38', label: 'Número do passaporte', group: 'passaporte' },
  { name: 'text-40', label: 'País que emitiu', group: 'passaporte' },
  { name: 'text-39', label: 'Cidade de emissão', group: 'passaporte' },
  { name: 'text-88', label: 'Estado de emissão', group: 'passaporte' },
  { name: 'text-66', label: 'Data de emissão', group: 'passaporte' },
  { name: 'text-67', label: 'Data de validade', group: 'passaporte' },
  { name: 'radio-13', label: 'Passaporte perdido/roubado?', group: 'passaporte' },
  { name: 'name-2', label: 'Contato nos EUA (nome)', group: 'contato' },
  { name: 'text-41_contato', label: 'Endereço (EUA)', group: 'contato' },
  { name: 'text-42_contato', label: 'Cidade (EUA)', group: 'contato' },
  { name: 'text-43_contato', label: 'Estado (EUA)', group: 'contato' },
  { name: 'email-4_contato', label: 'CEP (EUA)', group: 'contato' },
  { name: 'checkbox-15[]', label: 'Relacionamento com contato', group: 'contato' },
  { name: 'email-5', label: 'Telefone do contato (EUA)', group: 'contato' },
  { name: 'email-3', label: 'E-mail do contato (EUA)', group: 'contato' },
  { name: 'nome_pai', label: 'Nome do pai', group: 'familiares' },
  { name: 'text-44', label: 'Data de nascimento do pai', group: 'familiares' },
  { name: 'radio-14', label: 'Pai nos EUA?', group: 'familiares' },
  { name: 'checkbox-16[]', label: 'Status do pai', group: 'familiares' },
  { name: 'nome_mae', label: 'Nome da mãe', group: 'familiares' },
  { name: 'text-45', label: 'Data de nascimento da mãe', group: 'familiares' },
  { name: 'radio-15', label: 'Mãe nos EUA?', group: 'familiares' },
  { name: 'checkbox-17[]', label: 'Status da mãe', group: 'familiares' },
  { name: 'radio-16', label: 'Parentes imediatos nos EUA?', group: 'familiares' },
  { name: 'spouse_fullname', label: 'Nome do cônjuge', group: 'conjuge' },
  { name: 'spouse-dob', label: 'Data de nascimento do cônjuge', group: 'conjuge' },
  { name: 'spouse-nationality', label: 'Nacionalidade do cônjuge', group: 'conjuge' },
  { name: 'spouse-city', label: 'Cidade de nascimento do cônjuge', group: 'conjuge' },
  { name: 'spouse-country', label: 'País de nascimento do cônjuge', group: 'conjuge' },
  { name: 'spouse-address-same', label: 'Endereço do cônjuge', group: 'conjuge' },
  { name: 'spouse_endereco', label: 'Endereço (diferente)', group: 'conjuge' },
  { name: 'spouse_cidade', label: 'Cidade', group: 'conjuge' },
  { name: 'spouse_estado', label: 'Estado', group: 'conjuge' },
  { name: 'spouse_cep', label: 'CEP', group: 'conjuge' },
  { name: 'spouse_pais', label: 'País', group: 'conjuge' },
  { name: 'ex_fullname', label: 'Nome do ex‑cônjuge', group: 'exConjuge' },
  { name: 'ex_dob', label: 'Data de nascimento', group: 'exConjuge' },
  { name: 'ex_nationality', label: 'Nacionalidade', group: 'exConjuge' },
  { name: 'ex_city', label: 'Cidade de nascimento', group: 'exConjuge' },
  { name: 'ex_country', label: 'País de nascimento', group: 'exConjuge' },
  { name: 'data_casamento_div', label: 'Data do Casamento', group: 'exConjuge' },
  { name: 'data_divorcio', label: 'Data do Divórcio', group: 'exConjuge' },
  { name: 'cidade_divorcio', label: 'Cidade do Divórcio', group: 'exConjuge' },
  { name: 'como_divorcio', label: 'Como se deu o Divórcio', group: 'exConjuge' },
  { name: 'falecido_fullname', label: 'Nome do cônjuge falecido', group: 'viuvo' },
  { name: 'falecido_dob', label: 'Data de nascimento', group: 'viuvo' },
  { name: 'falecido_nationality', label: 'Nacionalidade', group: 'viuvo' },
  { name: 'falecido_city', label: 'Cidade de nascimento', group: 'viuvo' },
  { name: 'falecido_country', label: 'País de nascimento', group: 'viuvo' },
  { name: 'data_falecimento', label: 'Data do Falecimento', group: 'viuvo' },
  { name: 'radio-27', label: 'Ocupação principal', group: 'trabalhoAtual' },
  { name: 'text-49', label: 'Empregador / escola', group: 'trabalhoAtual' },
  { name: 'text-101', label: 'Endereço', group: 'trabalhoAtual' },
  { name: 'text-102', label: 'Cidade', group: 'trabalhoAtual' },
  { name: 'text-104', label: 'Estado', group: 'trabalhoAtual' },
  { name: 'text-103', label: 'CEP', group: 'trabalhoAtual' },
  { name: 'phone-8', label: 'Telefone', group: 'trabalhoAtual' },
  { name: 'text-50', label: 'Data início', group: 'trabalhoAtual' },
  { name: 'text-51', label: 'Renda mensal (R$)', group: 'trabalhoAtual' },
  { name: 'text-52', label: 'Descrição das funções', group: 'trabalhoAtual' },
  { name: 'radio-17', label: 'Teve empregos anteriores?', group: 'empregosAnteriores' },
  { name: 'radio-18', label: 'Escolaridade secundário/superior?', group: 'escolaridade' },
  { name: 'text-59', label: 'Instituição de ensino', group: 'escolaridade' },
  { name: 'text-60', label: 'Curso', group: 'escolaridade' },
  { name: 'text-111', label: 'Endereço da instituição', group: 'escolaridade' },
  { name: 'text-112', label: 'Cidade', group: 'escolaridade' },
  { name: 'text-114', label: 'Estado', group: 'escolaridade' },
  { name: 'text-113', label: 'CEP', group: 'escolaridade' },
  { name: 'text-61', label: 'Data início', group: 'escolaridade' },
  { name: 'text-62', label: 'Data conclusão', group: 'escolaridade' },
  { name: 'radio-19', label: 'Fala outros idiomas?', group: 'idiomas' },
  { name: 'radio-20', label: 'Viajou para outros países?', group: 'paises' },
  { name: 'servico_militar', label: 'Serviu nas forcas armadas?', group: 'military' },
  { name: 'military_country', label: 'Pais', group: 'military' },
  { name: 'military_branch', label: 'Ramo das Forcas Armadas', group: 'military' },
  { name: 'military_rank', label: 'Patente / Posicao', group: 'military' },
  { name: 'military_specialty', label: 'Especialidade Militar', group: 'military' },
  { name: 'military_date_from', label: 'Data de inicio', group: 'military' },
  { name: 'military_date_to', label: 'Data de termino', group: 'military' },
  { name: 'treinamento_especializado', label: 'Treinamento especializado?', group: 'training' },
  { name: 'treinamento_descricao', label: 'Descricao do treinamento', group: 'training' },
  { name: 'antecedentes_criminais', label: 'Antecedentes criminais?', group: 'security' },
  { name: 'antecedentes_descricao', label: 'Descricao dos antecedentes', group: 'security' },
  { name: 'antecedentes_data', label: 'Data do ocorrido', group: 'security' },
  { name: 'antecedentes_local', label: 'Local', group: 'security' },
  { name: 'antecedentes_resolucao', label: 'Resolucao do caso', group: 'security' }
];

// ==================== ROTA DS-160 ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos (DS-160)');
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

        // ==================== HISTÓRICO DE NEGATIVAS (OBRIGATÓRIO) ====================
startSection('⚠️ HISTÓRICO DE NEGATIVAS - ATENÇÃO');
doc.fillColor('#dc2626').fontSize(9).text('Estas perguntas são obrigatórias no formulário DS-160 oficial. Responder falsamente constitui fraude.', { align: 'center' });
doc.moveDown(0.5);
doc.fillColor('#000000').fontSize(10);

// Pergunta 1: Visto Negado
let vistoNegado = data['radio-visto-negado'];
if (vistoNegado === 'one') vistoNegado = 'Sim';
else if (vistoNegado === 'two') vistoNegado = 'Não';
doc.font('Helvetica-Bold').text('1. Já teve visto americano NEGADO anteriormente?: ', { continued: true });
doc.font('Helvetica').text(vistoNegado || 'Não informado');
doc.moveDown(0.3);

if (data['radio-visto-negado'] === 'one') {
    doc.font('Helvetica').text(`   • Ano da negativa: ${data['text-visto-negado-ano'] || 'Não informado'}`);
    doc.font('Helvetica').text(`   • Consulado: ${data['text-visto-negado-consulado'] || 'Não informado'}`);
    doc.font('Helvetica').text(`   • Tipo de visto: ${data['select-visto-negado-tipo'] || 'Não informado'}`);
    doc.moveDown(0.3);
}

// Pergunta 2: Entrada Negada
let entradaNegada = data['radio-entrada-negada'];
if (entradaNegada === 'one') entradaNegada = 'Sim';
else if (entradaNegada === 'two') entradaNegada = 'Não';
doc.font('Helvetica-Bold').text('2. Já teve a entrada NEGADA nos EUA pelo oficial de imigração?: ', { continued: true });
doc.font('Helvetica').text(entradaNegada || 'Não informado');
doc.moveDown(0.3);

if (data['radio-entrada-negada'] === 'one') {
    doc.font('Helvetica').text(`   • Ano da negativa: ${data['text-entrada-negada-ano'] || 'Não informado'}`);
    doc.font('Helvetica').text(`   • Porto de entrada: ${data['text-entrada-negada-local'] || 'Não informado'}`);
    doc.font('Helvetica').text(`   • Motivo: ${data['textarea-entrada-negada-motivo'] || 'Não informado'}`);
    doc.moveDown(0.3);
}

// Pergunta 3: Deportação
let deportado = data['radio-deportado'];
if (deportado === 'one') deportado = 'Sim';
else if (deportado === 'two') deportado = 'Não';
doc.font('Helvetica-Bold').text('3. Já foi deportado ou removido dos Estados Unidos?: ', { continued: true });
doc.font('Helvetica').text(deportado || 'Não informado');
doc.moveDown(0.3);

if (data['radio-deportado'] === 'one') {
    doc.font('Helvetica').text(`   • Ano da deportação: ${data['text-deportado-ano'] || 'Não informado'}`);
    let duracao = data['select-deportado-duracao'] || '';
    if (duracao === 'menos_5_anos') duracao = 'Menos de 5 anos';
    else if (duracao === '5_a_10_anos') duracao = 'Entre 5 e 10 anos';
    else if (duracao === 'mais_10_anos') duracao = 'Mais de 10 anos';
    else if (duracao === 'banimento_permanente') duracao = 'Banimento permanente';
    doc.font('Helvetica').text(`   • Duração: ${duracao || 'Não informado'}`);
    doc.moveDown(0.3);
}

// Detalhes adicionais
if (data['textarea-detalhes-negativa']) {
    doc.font('Helvetica-Bold').text('Detalhes adicionais sobre negativas:');
    doc.font('Helvetica').text(`   ${data['textarea-detalhes-negativa']}`);
    doc.moveDown(0.3);
}

doc.moveDown(0.5);
doc.strokeColor('#dc2626').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
doc.lineWidth(0.5);
doc.moveDown(0.8);
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
  console.log('📥 Dados da Avaliação Normal recebidos:', JSON.stringify(data, null, 2));
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      const nome = data['nome'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email'] || null;
      
      // 🔥 CORREÇÃO: Normalizar telefone
      let telefoneCliente = data['telefone'] || data['whatsapp'] || null;
      if (telefoneCliente) {
        telefoneCliente = telefoneCliente.toString().replace(/\D/g, '');
        // Remove 55 do início se existir
        if (telefoneCliente.startsWith('55')) {
          telefoneCliente = telefoneCliente.substring(2);
        }
        // Se ainda tiver 12 dígitos (com 9 extra), ajusta
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
        mensagemWhats += `*Falar com especialista:* https://wa.me/5521974601812`;
        
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
    
    // ==================== 1. RESPOSTA "SIM" ====================
    if (lead && (messageText === 'sim' || messageText === 'sim!' || messageText === 'quero' || messageText === '7' || messageText === '7️⃣')) {
      const primeiroNome = (lead.nome_cliente || 'Cliente').split(' ')[0];
      const resposta = `🎉 *Perfeito, ${primeiroNome}!* 🎉\n\n` +
                       `📋 *Acesse o rascunho do formulário DS-160:*\n` +
                       `🌐 https://getvisa.com.br/formulario-ds160\n\n` +
                       `⚠️ Preencha com atenção. Após o envio, nossa equipe fará a análise.\n\n` +
                       `Aguardamos seu formulario! 🇺🇸✨`;
      await sendReply(cleanPhone, resposta);
      return;
    }
    
    // ==================== 2. RESPOSTA "NÃO" ====================
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
    
    // ==================== 3. SAUDAÇÃO (oi, olá, bom dia, boa tarde, boa noite) ====================
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
    
    // ==================== 4. CONSULTAR AGENDAMENTOS ====================
    if (lead && (messageText === '8' || messageText === '8️⃣' || 
                 messageText === 'meus agendamentos' || messageText === 'meus compromissos' || 
                 messageText === 'minha entrevista' || messageText === 'quando' || 
                 messageText === 'datas' || messageText === '📅' || messageText === 'agendamentos')) {
      
      const primeiroNome = (lead.nome_cliente || 'Cliente').split(' ')[0];
      const nomeCompleto = lead.nome_cliente || '';
      
      console.log(`📅 Cliente ${primeiroNome} solicitou consulta de agendamentos`);
      
      // Buscar agendamentos do cliente pelo nome
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
        // Separar passados e futuros
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
            
            // Dias restantes
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
    
    // ==================== 5. RESPOSTAS POR NÚMERO (1 a 6) ====================

    // Opção 1 - PREÇO
    if (lead && (messageText === '1' || messageText === '1️⃣' || 
                 messageText === 'preço' || messageText === 'preco' || messageText === '💰')) {
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

    // Opção 2 - PRAZO
    if (lead && (messageText === '2' || messageText === '2️⃣' || 
                 messageText === 'prazo' || messageText === '⏰')) {
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

    // Opção 3 - DOCUMENTOS
    if (lead && (messageText === '3' || messageText === '3️⃣' || 
                 messageText === 'documentos' || messageText === '📄')) {
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

    // Opção 4 - PROCESSO
    if (lead && (messageText === '4' || messageText === '4️⃣' || 
                 messageText === 'processo' || messageText === 'passo a passo' || messageText === '📋')) {
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

    // Opção 5 - VISTO NEGADO
    if (lead && (messageText === '5' || messageText === '5️⃣' || 
                 messageText === 'visto negado' || messageText === 'negado' || 
                 messageText === 'rejeitado' || messageText === '⚠️')) {
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

    // Opção 6 - AJUDA / ESPECIALISTA
    if (lead && (messageText === '6' || messageText === '6️⃣' || 
                 messageText === 'ajuda' || messageText === 'especialista' || 
                 messageText === 'contato' || messageText === 'falar' || messageText === '📞')) {
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
    
    // ==================== 6. LEAD EXISTE (mensagem padrão) ====================
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
    
    // ==================== 7. LEAD NÃO EXISTE ====================
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

// Função para formatar data brasileira
function formatarDataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Função para buscar telefone do cliente pelo nome ou cliente_id
async function buscarTelefoneCliente(clienteNome, clienteId) {
  // Primeiro tenta buscar pelo cliente_id na tabela clientes
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
  
  // Se não achou, tenta pelo nome na tabela leads_simulador
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

// Função para enviar lembrete via WhatsApp
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
  
  // Dicas específicas por tipo de atividade
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
  
  // Remove o 55 do início se existir
  let telefoneLimpo = telefone.toString().replace(/\D/g, '');
  if (telefoneLimpo.startsWith('55')) {
    telefoneLimpo = telefoneLimpo.substring(2);
  }
  
  await enviarWhatsApp(telefoneLimpo, mensagem);
  console.log(`📨 Lembrete ${diasTexto} enviado para ${nomeCliente}: ${agendamento.atividade} em ${agendamento.data}`);
}

// Função principal para verificar e enviar lembretes
async function verificarLembretes() {
  console.log(`🔍 Verificando lembretes - ${new Date().toLocaleString('pt-BR')}`);
  
  try {
    // Buscar agendamentos NÃO CONCLUÍDOS (concluido = 0) e futuros
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
      
      // Buscar telefone do cliente
      const telefone = await buscarTelefoneCliente(ag.cliente, ag.cliente_id);
      
      if (!telefone) {
        console.log(`⚠️ Telefone não encontrado para ${ag.cliente}`);
        continue;
      }
      
      // Lembrete de 3 dias
      if (diffDays === 3 && !ag.lembrete_3d_enviado) {
        await enviarLembreteAgendamento(telefone, ag.cliente, ag, 3);
        
        // Marcar como enviado
        await supabase
          .from('compromissos')
          .update({ lembrete_3d_enviado: true })
          .eq('id', ag.id);
          
        console.log(`✅ Lembrete 3 dias enviado para ${ag.cliente}`);
      }
      
      // Lembrete de 1 dia
      if (diffDays === 1 && !ag.lembrete_1d_enviado) {
        await enviarLembreteAgendamento(telefone, ag.cliente, ag, 1);
        
        // Marcar como enviado
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

// Executar verificação a cada 6 horas (ou ajuste conforme necessidade)
setInterval(verificarLembretes, 6 * 60 * 60 * 1000);

// Executar uma vez ao iniciar
verificarLembretes();

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
