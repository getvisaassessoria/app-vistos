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

// ==================== SUPABASE CLIENT ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// Função para formatar data do padrão americano (YYYY-MM-DD) para brasileiro (DD/MM/YYYY)
function formatDateToBrazilian(dateString) {
  if (!dateString || dateString === '') return null;
  
  // Se já estiver no formato DD/MM/YYYY, retorna como está
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
  
  // Tenta converter YYYY-MM-DD para DD/MM/YYYY
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  
  // Tenta converter outros formatos comuns
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  
  // Se não conseguiu converter, retorna o valor original
  return dateString;
}

function formatValue(fieldName, value) {
  if (value === undefined || value === null || value === '') return null;
  
  // Verifica se é um campo de data e aplica formatação
  const dateFields = ['text-5', 'text-21', 'text-35', 'text-66', 'text-67', 'text-61', 'text-62', 'spouse-dob', 'data_casamento_div', 'data_divorcio', 'data_falecimento', 'text-50', 'text-44', 'text-45'];
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
    // Formatar a data da viagem
    if (d) d = formatDateToBrazilian(d);
    if (d || dur) result.push(`${d}${d && dur ? ' - ' : ''}${dur} dias`);
  }
  return result;
}

function drawSeparator(doc) {
  doc.moveDown(0.5);
  doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);
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
  { name: 'radio-20', label: 'Viajou para outros países?', group: 'paises' }
];

// ==================== ROTA DS-160 (RESPOSTA IMEDIATA + BACKGROUND) ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos (DS-160)');
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      // --- Salvar no Supabase ---
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

      // --- Geração do PDF (com ordem corrigida, datas brasileiras e títulos de seção) ---
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

        // ==================== ORDEM CORRETA DOS CAMPOS COM TÍTULOS DE SEÇÃO ====================
        // Mapa de labels para acesso rápido
        const fieldLabelMap = {};
        for (const f of simpleFields) {
          fieldLabelMap[f.name] = f.label;
        }

        let currentSection = null;
        let hasContentInSection = false;

        // Função para renderizar um campo
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

        // Função para iniciar uma nova seção
        function startSection(sectionTitle) {
          if (currentSection !== null && hasContentInSection) {
            doc.moveDown(0.8);
          }
          drawSectionTitle(doc, sectionTitle);
          currentSection = sectionTitle;
          hasContentInSection = false;
        }

        // ==================== SEÇÃO 1: INFORMAÇÕES INICIAIS ====================
        startSection('📋 INFORMAÇÕES INICIAIS');
        const hasConsulado = renderField('consulado_cidade', 'Cidade do Consulado');
        const hasIndicacao = renderField('radio-26', 'Indicado por agência/agente?');
        if (data['radio-26'] === 'one') {
          renderField('text-1', 'Nome da agência/agente');
        }
        renderField('text-64', 'Idioma usado para preencher');
        if (hasConsulado || hasIndicacao) hasContentInSection = true;

        // ==================== SEÇÃO 2: INFORMAÇÕES PESSOAIS ====================
        startSection('👤 INFORMAÇÕES PESSOAIS');
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
        if (renderField('radio-residente', 'Residente permanente de outro país?') && data['radio-residente'] === 'one') {
          // campo adicional se necessário
        }
        renderField('text-86', 'CPF');
        renderField('text-17', 'Número do Seguro Social (SSN)');
        renderField('text-18', 'Número do contribuinte dos EUA (TIN)');
        hasContentInSection = true;

        // ==================== SEÇÃO 3: INFORMAÇÕES DA VIAGEM ====================
        startSection('✈️ INFORMAÇÕES DA VIAGEM');
        renderField('radio-28', 'Propósito da viagem');
        if (renderField('radio-planos', 'Planos específicos?') && data['radio-planos'] === 'one') {
          // campo adicional se necessário
        }
        renderField('text-21', 'Data de chegada prevista');
        renderField('text-34', 'Duração da estadia (dias)');
        renderField('text-41', 'Endereço nos EUA');
        renderField('text-42', 'Cidade (EUA)');
        renderField('text-43', 'Estado (EUA)');
        renderField('email-4', 'CEP (EUA)');
        hasContentInSection = true;

        // ==================== SEÇÃO 4: PAGADOR DA VIAGEM ====================
        startSection('💰 PAGADOR DA VIAGEM');
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

        // ==================== SEÇÃO 5: ACOMPANHANTES ====================
        if (data['radio-7'] === 'one') {
          startSection('👥 ACOMPANHANTES');
          renderField('radio-7', 'Há acompanhantes?');
          const acompanhantes = groupParallelArrays(data, 'acompanhante_nome[]', 'acompanhante_rel[]');
          if (acompanhantes.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Acompanhantes:');
            acompanhantes.forEach(acc => doc.font('Helvetica').text(`  - ${acc}`));
            doc.moveDown(0.6);
          }
          hasContentInSection = true;
        }

        // ==================== SEÇÃO 6: HISTÓRICO DE VIAGENS AOS EUA ====================
        if (data['radio-8'] === 'one') {
          startSection('🛂 HISTÓRICO DE VIAGENS AOS EUA');
          renderField('radio-8', 'Já esteve nos EUA?');
          const viagens = groupTravels(data);
          if (viagens.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Viagens anteriores aos EUA:');
            viagens.forEach(viagem => doc.font('Helvetica').text(`  - ${viagem}`));
            doc.moveDown(0.6);
          }
          hasContentInSection = true;
        }

        // ==================== SEÇÃO 7: INFORMAÇÕES DO VISTO ====================
        if (data['radio-23'] === 'one') {
          startSection('🪪 INFORMAÇÕES DO VISTO');
          renderField('radio-23', 'Já teve visto americano?');
          renderField('text-35', 'Data de emissão do visto');
          renderField('text-68', 'Número do visto');
          renderField('text-69', 'Data de expiração');
          renderField('radio-33', 'Impressões digitais coletadas?');
          renderField('radio-29', 'Mesmo tipo de visto?');
          renderField('radio-30', 'Mesmo país de emissão?');
          hasContentInSection = true;
        }

        // ==================== SEÇÃO 8: ENDEREÇO RESIDENCIAL ====================
        startSection('🏠 ENDEREÇO RESIDENCIAL');
        renderField('text-71', 'Logradouro');
        renderField('text-72', 'Complemento');
        renderField('text-73', 'CEP');
        renderField('text-74', 'Cidade');
        renderField('text-75', 'Estado');
        renderField('text-76', 'País');
        hasContentInSection = true;

        // ==================== SEÇÃO 9: ENDEREÇO DE CORRESPONDÊNCIA ====================
        startSection('📬 ENDEREÇO DE CORRESPONDÊNCIA');
        if (renderField('radio-9', 'Endereço de correspondência é o mesmo?') && data['radio-9'] === 'Não, é diferente') {
          renderField('text-80', 'Logradouro (correspondência)');
          renderField('text-81', 'Complemento (correspondência)');
          renderField('text-82', 'CEP (correspondência)');
          renderField('text-83', 'Cidade (correspondência)');
          renderField('text-84', 'Estado (correspondência)');
          renderField('text-85', 'País (correspondência)');
        }
        hasContentInSection = true;

        // ==================== SEÇÃO 10: TELEFONES ====================
        startSection('📞 TELEFONES');
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

        // ==================== SEÇÃO 11: E-MAILS ====================
        startSection('📧 E-MAILS');
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

        // ==================== SEÇÃO 12: MÍDIAS SOCIAIS ====================
        startSection('🌐 MÍDIAS SOCIAIS');
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

        // ==================== SEÇÃO 13: PASSAPORTE ====================
        startSection('🛂 PASSAPORTE');
        renderField('text-38', 'Número do passaporte');
        renderField('text-40', 'País que emitiu');
        renderField('text-39', 'Cidade de emissão');
        renderField('text-88', 'Estado de emissão');
        renderField('text-66', 'Data de emissão');
        renderField('text-67', 'Data de validade');
        renderField('radio-13', 'Passaporte perdido/roubado?');
        hasContentInSection = true;

        // ==================== SEÇÃO 14: CONTATO NOS EUA ====================
        startSection('🇺🇸 CONTATO NOS EUA');
        renderField('name-2', 'Contato nos EUA (nome)');
        renderField('text-41_contato', 'Endereço (EUA)');
        renderField('text-42_contato', 'Cidade (EUA)');
        renderField('text-43_contato', 'Estado (EUA)');
        renderField('email-4_contato', 'CEP (EUA)');
        renderField('checkbox-15[]', 'Relacionamento com contato');
        renderField('email-5', 'Telefone do contato (EUA)');
        renderField('email-3', 'E-mail do contato (EUA)');
        hasContentInSection = true;

        // ==================== SEÇÃO 15: FAMILIARES ====================
        startSection('👨‍👩‍👧 FAMILIARES');
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

        // ==================== SEÇÃO 16: CÔNJUGE ====================
        if (data['spouse_fullname']) {
          startSection('💍 CÔNJUGE');
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

        // ==================== SEÇÃO 17: EX-CÔNJUGE ====================
        if (data['ex_fullname']) {
          startSection('💔 EX-CÔNJUGE');
          renderField('ex_fullname', 'Nome do ex‑cônjuge');
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

        // ==================== SEÇÃO 18: CÔNJUGE FALECIDO ====================
        if (data['falecido_fullname']) {
          startSection('🕊️ CÔNJUGE FALECIDO');
          renderField('falecido_fullname', 'Nome do cônjuge falecido');
          renderField('falecido_dob', 'Data de nascimento');
          renderField('falecido_nationality', 'Nacionalidade');
          renderField('falecido_city', 'Cidade de nascimento');
          renderField('falecido_country', 'País de nascimento');
          renderField('data_falecimento', 'Data do Falecimento');
          hasContentInSection = true;
        }

        // ==================== SEÇÃO 19: OCUPAÇÃO ATUAL ====================
        startSection('💼 OCUPAÇÃO ATUAL');
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

        // ==================== SEÇÃO 20: EMPREGOS ANTERIORES ====================
        if (renderField('radio-17', 'Teve empregos anteriores?') && data['radio-17'] === 'one') {
          const empregos = [];
          const empNomes = data['emprego_anterior_nome[]'] || [];
          const empCargos = data['emprego_anterior_cargo[]'] || [];
          const empInicios = data['emprego_anterior_inicio[]'] || [];
          const empFins = data['emprego_anterior_fim[]'] || [];
          const maxEmp = Math.max(empNomes.length, empCargos.length, empInicios.length, empFins.length);
          for (let i = 0; i < maxEmp; i++) {
            if (empNomes[i] || empCargos[i]) {
              let inicio = empInicios[i] ? formatDateToBrazilian(empInicios[i]) : '?';
              let fim = empFins[i] ? formatDateToBrazilian(empFins[i]) : '?';
              let linha = `${empNomes[i] || ''}${empNomes[i] && empCargos[i] ? ' - ' : ''}${empCargos[i] || ''}`;
              if (empInicios[i] || empFins[i]) linha += ` (${inicio} a ${fim})`;
              empregos.push(linha);
            }
          }
          if (empregos.length > 0) {
            startSection('📋 EMPREGOS ANTERIORES');
            doc.font('Helvetica-Bold').fontSize(10).text('Empregos anteriores:');
            empregos.forEach(emp => doc.font('Helvetica').text(`  - ${emp}`));
            doc.moveDown(0.6);
          }
        }

        // ==================== SEÇÃO 21: ESCOLARIDADE ====================
        if (renderField('radio-18', 'Escolaridade secundário/superior?') && data['radio-18'] === 'one') {
          startSection('🎓 ESCOLARIDADE');
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

        // ==================== SEÇÃO 22: IDIOMAS ====================
        startSection('🗣️ IDIOMAS');
        if (renderField('radio-19', 'Fala outros idiomas?') && data['radio-19'] === 'one') {
          const idiomas = data['idiomas[]'] || [];
          if (idiomas.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Outros idiomas: ', { continued: true });
            doc.font('Helvetica').text(idiomas.join(', '));
            doc.moveDown(0.6);
          }
        }
        hasContentInSection = true;

        // ==================== SEÇÃO 23: VIAGENS INTERNACIONAIS ====================
        startSection('🌍 VIAGENS INTERNACIONAIS');
        if (renderField('radio-20', 'Viajou para outros países?') && data['radio-20'] === 'one') {
          const paises = data['paises_visitados[]'] || [];
          if (paises.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10).text('Países visitados (últimos 5 anos): ', { continued: true });
            doc.font('Helvetica').text(paises.join(', '));
            doc.moveDown(0.6);
          }
        }
        hasContentInSection = true;

        // ==================== OUTRAS OCUPAÇÕES / FONTES DE RENDA ====================
        const extra_descricoes = data['extra_descricao[]'] || [];
        if (extra_descricoes.length > 0) {
          drawSectionTitle(doc, '💰 OUTRAS OCUPAÇÕES / FONTES DE RENDA');
          
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
            if (extra_empregadores[i]) doc.font('Helvetica').text(`Empregador: ${extra_empregadores[i]}`);
            if (extra_rendas[i]) doc.font('Helvetica').text(`Renda mensal: ${extra_rendas[i]}`);
            if (extra_inicios[i]) {
              const dataInicioFormatada = formatDateToBrazilian(extra_inicios[i]);
              doc.font('Helvetica').text(`Data início: ${dataInicioFormatada}`);
            }
            if (extra_enderecos[i]) doc.font('Helvetica').text(`Endereço: ${extra_enderecos[i]}`);
            if (extra_cidades[i] && extra_estados[i]) doc.font('Helvetica').text(`Cidade/UF: ${extra_cidades[i]} / ${extra_estados[i]}`);
            if (extra_ceps[i]) doc.font('Helvetica').text(`CEP: ${extra_ceps[i]}`);
            if (extra_telefones[i]) doc.font('Helvetica').text(`Telefone: ${extra_telefones[i]}`);
            doc.moveDown(0.6);
          }
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
        doc.end();
      });

      console.log(`📄 PDF gerado para ${nome}, tamanho: ${pdfBuffer.length} bytes`);

      // --- Envio de e-mails ---
      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `🇺🇸 DS-160: ${nome}`,
        html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
        attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe');

      if (emailCliente && emailCliente.trim() !== '') {
        await resend.emails.send({
          from: 'GetVisa <contato@getvisa.com.br>',
          to: [emailCliente],
          subject: `Seu formulário DS-160 foi recebido - ${nome}`,
          html: `<strong>Olá ${nome},</strong><br><p>Recebemos seu formulário. Segue em anexo uma cópia.</p><p>Em breve nossa equipe entrará em contato.</p>`,
          attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
        });
        console.log(`✅ E-mail enviado para o cliente: ${emailCliente}`);
      }
    } catch (err) {
      console.error('❌ Erro no processamento DS-160 (background):', err);
    }
  })();
});

// ==================== ROTA PASSAPORTE (RESPOSTA IMEDIATA + BACKGROUND) ====================
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
            // Formatar data se necessário
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
        html: `<strong>Solicitação de passaporte recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo.</p>`,
        attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe (passaporte)');

      if (emailCliente && emailCliente.trim() !== '') {
        await resend.emails.send({
          from: 'GetVisa <contato@getvisa.com.br>',
          to: [emailCliente],
          subject: `Sua solicitação de passaporte foi recebida - ${nome}`,
          html: `<strong>Olá ${nome},</strong><br><p>Recebemos sua solicitação. Em breve nossa equipe entrará em contato.</p><p>Segue em anexo uma cópia.</p>`,
          attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
        });
        console.log(`✅ E-mail enviado para o cliente (passaporte): ${emailCliente}`);
      }
    } catch (err) {
      console.error('❌ Erro no processamento do passaporte (background):', err);
    }
  })();
});

// ==================== ROTA VISTO NEGADO (RESPOSTA IMEDIATA + BACKGROUND) ====================
app.post('/api/submit-visto-negado', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados de Visto Negado recebidos:', data);
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      const nome = data['nome'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email'] || null;
      const score = data['score'] || null;
      const classificacaoTipo = data['classificacao_tipo'] || '';
      const classificacaoTitulo = data['classificacao_titulo'] || '';
      const classificacaoMensagem = data['classificacao_mensagem'] || '';

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

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('📋 DADOS DO CLIENTE');
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(10).fillColor('#000000');
        doc.text(`Nome completo: ${nome}`);
        doc.text(`E-mail: ${emailCliente || 'Não informado'}`);
        doc.text(`Telefone/WhatsApp: ${data['telefone'] || 'Não informado'}`);
        doc.moveDown(1);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('📝 QUESTIONÁRIO DE AVALIAÇÃO');
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
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('📊 RESULTADO DA AVALIAÇÃO');
          doc.moveDown(0.5);
          doc.font('Helvetica').fontSize(10).fillColor('#000000');
          doc.text(`Pontuação: ${score}/100`);
          let classificacaoTexto = '';
          if (classificacaoTipo === 'urgent') classificacaoTexto = '🔴 Requer Atenção Urgente';
          else if (classificacaoTipo === 'moderate') classificacaoTexto = '🟠 Potencial Moderado';
          else classificacaoTexto = '🟢 Forte Potencial';
          doc.text(`Classificação: ${classificacaoTexto}`);
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
        html: `<strong>Avaliação de visto negado recebida.</strong><br>
               <p><strong>Cliente:</strong> ${nome}</p>
               <p><strong>E-mail:</strong> ${data['email'] || 'não informado'}</p>
               <p><strong>Telefone:</strong> ${data['telefone'] || 'não informado'}</p>
               <p><strong>Pontuação:</strong> ${score !== null ? score + '/100' : 'não calculada'}</p>
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
              <h3 style="margin: 0 0 10px; color: ${cor};">📊 Resultado da sua avaliação</h3>
              <p><strong>Pontuação:</strong> ${score}/100</p>
              <p><strong>Classificação:</strong> ${classificacaoTipo === 'urgent' ? '🔴 Requer Atenção Urgente' : classificacaoTipo === 'moderate' ? '🟠 Potencial Moderado' : '🟢 Forte Potencial'}</p>
              <p><strong>${classificacaoTitulo}</strong></p>
              <p>${classificacaoMensagem}</p>
            </div>
          `;
        }
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

// ==================== WEBHOOK Z-API (WHATSAPP) ====================
app.post('/api/webhook/zapi', async (req, res) => {
  console.log('📥 Webhook Z-API recebido:', req.body);
  const body = req.body || {};

  const phone = body.phone || body.from || body.remoteJid || null;
  let message = body.text?.message || body.message || body.body || '';

  if (!phone || !message) {
    return res.status(200).json({ received: true, warning: 'missing phone or message' });
  }

  console.log(`📩 Mensagem de ${phone}: ${message}`);

  let resposta = 'Olá! Obrigado por entrar em contato. Em breve um especialista te atenderá.';
  const msg = message.toLowerCase();
  if (msg.includes('oi') || msg.includes('olá') || msg.includes('bom dia')) {
    resposta = 'Olá! 😊 Eu sou o atendimento automatizado da GetVisa. Como posso ajudar?';
  } else if (msg.includes('visto negado')) {
    resposta = 'Sobre visto americano negado, podemos ajudar! Preencha nosso formulário: https://getvisa.com.br/visto-negado';
  } else if (msg.includes('preço') || msg.includes('valor')) {
    resposta = 'Os valores variam conforme o perfil. Preencha nosso formulário para orçamento.';
  } else if (msg.includes('prazo') || msg.includes('demora')) {
    resposta = 'Os prazos dependem da agenda do consulado. Recomendamos iniciar o quanto antes.';
  }

  const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
  const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
  const ZAPI_SECURITY_TOKEN = process.env.ZAPI_SECURITY_TOKEN;

  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
    console.warn('⚠️ Z-API não configurada (variáveis em falta)');
    return res.status(200).json({ received: true, warning: 'Z-API not configured' });
  }

  const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;

  try {
    const response = await fetch(zapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ZAPI_SECURITY_TOKEN && { 'Client-Token': ZAPI_SECURITY_TOKEN })
      },
      body: JSON.stringify({ phone, message: resposta })
    });
    if (response.ok) {
      console.log(`✅ Resposta enviada para ${phone}`);
    } else {
      const errText = await response.text();
      console.error(`❌ Erro Z-API (${response.status}): ${errText}`);
    }
  } catch (err) {
    console.error('❌ Erro ao enviar resposta Z-API:', err);
  }

  res.status(200).json({ received: true });
});

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));