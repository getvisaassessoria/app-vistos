const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); // sua chave
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Inicializa cliente Supabase
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
  'radio-27': { 'Profissional': 'Profissional', 'Estudante': 'Estudante', 'Aposentado': 'Aposentado' },
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

function formatValue(fieldName, value) {
  if (value === undefined || value === null || value === '') return null;
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
    if (nome || rel) {
      result.push(`${nome}${nome && rel ? ' - ' : ''}${rel}`);
    }
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
    if (d || dur) {
      result.push(`${d}${d && dur ? ' - ' : ''}${dur} dias`);
    }
  }
  return result;
}

function drawSeparator(doc) {
  doc.moveDown(0.5);
  doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);
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

// ==================== ROTA DS-160 ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos (DS-160)');
  res.status(200).json({ success: true });

  try {
    // Persistência Supabase
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
      if (clienteError) throw clienteError;

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
      if (solError) throw solError;
      solicitacaoId = solicitacao.id;
      console.log(`✅ DS-160 salvo. ID: ${solicitacaoId}`);
    } catch (supabaseErr) {
      console.error('⚠️ Erro ao salvar no Supabase:', supabaseErr.message);
    }

    const nome = data['full_name'] || 'Cliente_Sem_Nome';
    const emailCliente = data['email-1'] || null;

    // Geração do PDF
    const pdfBuffer = await new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.fillColor('#003366').fontSize(22).text('SOLICITAÇÃO DE VISTO DS-160', { align: 'center' });
      doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentação Consular', { align: 'center' });
      doc.moveDown(2);
      doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      let lastGroup = null;
      for (const field of simpleFields) {
        let value = data[field.name];
        if (value !== undefined && value !== null && value !== '') {
          const formatted = formatValue(field.name, value);
          if (formatted && formatted !== '(não informado)') {
            if (lastGroup !== null && lastGroup !== field.group) drawSeparator(doc);
            doc.font('Helvetica-Bold').fontSize(10).text(`${field.label}: `, { continued: true });
            doc.font('Helvetica').text(formatted);
            doc.moveDown(0.6);
            lastGroup = field.group;
          }
        }
      }

      // Telefones anteriores
      const telefones = data['telefones_anteriores[]'] || [];
      if (telefones.length > 0) {
        if (lastGroup !== null && lastGroup !== 'telefones') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('Telefones anteriores: ', { continued: true });
        doc.font('Helvetica').text(telefones.join(', '));
        doc.moveDown(0.6);
        lastGroup = 'telefones';
      }

      // E-mails anteriores
      const emails = data['emails_anteriores[]'] || [];
      if (emails.length > 0) {
        if (lastGroup !== null && lastGroup !== 'emails') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('E-mails anteriores: ', { continued: true });
        doc.font('Helvetica').text(emails.join(', '));
        doc.moveDown(0.6);
        lastGroup = 'emails';
      }

      // Mídias sociais
      const plataformas = data['midia_plataforma[]'] || [];
      const identificadores = data['midia_identificador[]'] || [];
      const midias = [];
      for (let i = 0; i < Math.max(plataformas.length, identificadores.length); i++) {
        if (plataformas[i] || identificadores[i]) {
          midias.push(`${plataformas[i] || ''}${plataformas[i] && identificadores[i] ? ': ' : ''}${identificadores[i] || ''}`);
        }
      }
      if (midias.length > 0) {
        if (lastGroup !== null && lastGroup !== 'midias') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('Mídias sociais: ', { continued: true });
        doc.font('Helvetica').text(midias.join('; '));
        doc.moveDown(0.6);
        lastGroup = 'midias';
      }

      // Acompanhantes
      const acompanhantes = groupParallelArrays(data, 'acompanhante_nome[]', 'acompanhante_rel[]');
      if (acompanhantes.length > 0) {
        if (lastGroup !== null && lastGroup !== 'acompanhantes') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('Acompanhantes:');
        acompanhantes.forEach(acc => {
          doc.font('Helvetica').text(`  - ${acc}`);
        });
        doc.moveDown(0.6);
        lastGroup = 'acompanhantes';
      }

      // Viagens anteriores aos EUA
      const viagens = groupTravels(data);
      if (viagens.length > 0) {
        if (lastGroup !== null && lastGroup !== 'previousTravel') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('Viagens anteriores aos EUA:');
        viagens.forEach(viagem => {
          doc.font('Helvetica').text(`  - ${viagem}`);
        });
        doc.moveDown(0.6);
        lastGroup = 'previousTravel';
      }

      // Parentes nos EUA
      const parentes = groupParallelArrays(data, 'parente_nome[]', 'parente_relacao[]');
      if (parentes.length > 0) {
        if (lastGroup !== null && lastGroup !== 'familiares') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('Parentes nos EUA:');
        parentes.forEach(p => {
          doc.font('Helvetica').text(`  - ${p}`);
        });
        doc.moveDown(0.6);
        lastGroup = 'familiares';
      }

      // Idiomas adicionais
      const idiomas = data['idiomas[]'] || [];
      if (idiomas.length > 0) {
        if (lastGroup !== null && lastGroup !== 'idiomas') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('Outros idiomas: ', { continued: true });
        doc.font('Helvetica').text(idiomas.join(', '));
        doc.moveDown(0.6);
        lastGroup = 'idiomas';
      }

      // Países visitados
      const paises = data['paises_visitados[]'] || [];
      if (paises.length > 0) {
        if (lastGroup !== null && lastGroup !== 'paises') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('Países visitados (últimos 5 anos): ', { continued: true });
        doc.font('Helvetica').text(paises.join(', '));
        doc.moveDown(0.6);
        lastGroup = 'paises';
      }

      // Empregos anteriores
      const empregos = [];
      const empNomes = data['emprego_anterior_nome[]'] || [];
      const empCargos = data['emprego_anterior_cargo[]'] || [];
      const empInicios = data['emprego_anterior_inicio[]'] || [];
      const empFins = data['emprego_anterior_fim[]'] || [];
      const maxEmp = Math.max(empNomes.length, empCargos.length, empInicios.length, empFins.length);
      for (let i = 0; i < maxEmp; i++) {
        if (empNomes[i] || empCargos[i]) {
          let linha = `${empNomes[i] || ''}${empNomes[i] && empCargos[i] ? ' - ' : ''}${empCargos[i] || ''}`;
          if (empInicios[i] || empFins[i]) {
            linha += ` (${empInicios[i] || '?'} a ${empFins[i] || '?'})`;
          }
          empregos.push(linha);
        }
      }
      if (empregos.length > 0) {
        if (lastGroup !== null && lastGroup !== 'empregosAnteriores') drawSeparator(doc);
        doc.font('Helvetica-Bold').text('Empregos anteriores:');
        empregos.forEach(emp => {
          doc.font('Helvetica').text(`  - ${emp}`);
        });
        doc.moveDown(0.6);
      }

      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });
      doc.end();
    });

    // Envio de e-mails
    await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `🇺🇸 DS-160: ${nome}`,
      html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo.</p>`,
      attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
    });
    console.log('✅ E-mail enviado para a equipe');

    if (emailCliente && emailCliente.trim() !== '') {
      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: [emailCliente],
        subject: `Seu formulário DS-160 foi recebido - ${nome}`,
        html: `<strong>Olá ${nome},</strong><br><p>Recebemos seu formulário DS-160. Em breve nossa equipe entrará em contato.</p><p>Segue em anexo uma cópia do seu pré-cadastro para sua conferência.</p><p>Atenciosamente,<br>Equipe GetVisa</p>`,
        attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
      });
      console.log(`✅ E-mail enviado para o cliente: ${emailCliente}`);
    }
  } catch (err) {
    console.error('❌ Erro geral no DS-160:', err);
  }
});

// ==================== ROTA PASSAPORTE ====================
app.post('/api/submit-passaporte', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados de passaporte recebidos');
  res.status(200).json({ success: true });

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
      if (clienteError) throw clienteError;

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
      if (solError) throw solError;
      solicitacaoId = solicitacao.id;
      console.log(`✅ Passaporte salvo. ID: ${solicitacaoId}`);
    } catch (supabaseErr) {
      console.error('⚠️ Erro ao salvar passaporte:', supabaseErr.message);
    }

    const nome = data['passaporte_nome'] || 'Cliente_Sem_Nome';
    const emailCliente = data['passaporte_email'] || null;

    const pdfBuffer = await new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
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

    await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `📘 Passaporte: ${nome}`,
      html: `<strong>Solicitação de passaporte recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo.</p>`,
      attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
    });
    console.log('✅ E-mail enviado para a equipe (passaporte)');

    if (emailCliente && emailCliente.trim() !== '') {
      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: [emailCliente],
        subject: `Sua solicitação de passaporte foi recebida - ${nome}`,
        html: `<strong>Olá ${nome},</strong><br><p>Recebemos sua solicitação de passaporte. Em breve nossa equipe entrará em contato.</p><p>Segue em anexo uma cópia do seu pré-cadastro.</p><p>Atenciosamente,<br>Equipe GetVisa</p>`,
        attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
      });
      console.log(`✅ E-mail enviado para o cliente (passaporte): ${emailCliente}`);
    }
  } catch (err) {
    console.error('❌ Erro no processamento do passaporte:', err);
  }
});

// ==================== PROTEÇÃO DA AGENDA ====================
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'minha-chave-secreta-123';

function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
}

// ==================== ENDPOINTS DE AGENDA (PROTEGIDOS) ====================

// Listar agendamentos
app.get('/api/agendamentos', validateApiKey, async (req, res) => {
    const { solicitacao_id } = req.query;
    let query = supabase.from('agendamentos').select('*');
    if (solicitacao_id) query = query.eq('solicitacao_id', solicitacao_id);
    const { data, error } = await query.order('data_hora', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Criar novo agendamento
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

// Atualizar agendamento
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

// Deletar agendamento
app.delete('/api/agendamentos/:id', validateApiKey, async (req, res) => {
    const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
});

// Listar solicitações (para dropdown)
app.get('/api/solicitacoes', validateApiKey, async (req, res) => {
    const { data, error } = await supabase
        .from('solicitacoes')
        .select('id, tipo, clientes(nome_completo, email)')
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Listar solicitações (para dropdown)
app.get('/api/solicitacoes', validateApiKey, async (req, res) => {
    const { data, error } = await supabase
        .from('solicitacoes')
        .select('id, tipo, clientes(nome_completo, email)')
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Listar solicitações (para dropdown)
app.get('/api/solicitacoes', validateApiKey, async (req, res) => {
  const { data, error } = await supabase
    .from('solicitacoes')
    .select('id, tipo, clientes(nome_completo, email)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));