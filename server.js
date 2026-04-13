const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL');
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Mapeamento de valores de rádio para textos legíveis
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
    // Se for array de strings, aplica mapeamento individual
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

// Função para agrupar arrays paralelos (ex: acompanhantes)
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

// Agrupa viagens (data e duração)
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

// Mapeamento de campos simples (não agrupados)
const simpleFields = [
  { name: 'consulado_cidade', label: 'Cidade do Consulado' },
  { name: 'radio-26', label: 'Indicado por agência/agente?' },
  { name: 'text-1', label: 'Nome da agência/agente' },
  { name: 'text-64', label: 'Idioma usado para preencher' },
  { name: 'full_name', label: 'Nome completo' },
  { name: 'radio-2', label: 'Já teve outro nome?' },
  { name: 'text-87', label: 'Nome anterior' },
  { name: 'radio-3', label: 'Sexo' },
  { name: 'select-4', label: 'Estado civil' },
  { name: 'text-5', label: 'Data de nascimento' },
  { name: 'text-7', label: 'Cidade de nascimento' },
  { name: 'text-6', label: 'Estado/Província' },
  { name: 'text-95', label: 'País de nacionalidade' },
  { name: 'radio-outra-nac', label: 'Possui outra nacionalidade?' },
  { name: 'outra_nacionalidade_text', label: 'Qual outra nacionalidade?' },
  { name: 'radio-residente', label: 'Residente permanente de outro país?' },
  { name: 'text-86', label: 'CPF' },
  { name: 'text-17', label: 'Número do Seguro Social (SSN)' },
  { name: 'text-18', label: 'Número do contribuinte dos EUA (TIN)' },
  { name: 'radio-28', label: 'Propósito da viagem' },
  { name: 'radio-planos', label: 'Planos específicos?' },
  { name: 'text-21', label: 'Data de chegada prevista' },
  { name: 'text-34', label: 'Duração da estadia (dias)' },
  { name: 'text-41', label: 'Endereço nos EUA' },
  { name: 'text-42', label: 'Cidade (EUA)' },
  { name: 'text-43', label: 'Estado (EUA)' },
  { name: 'email-4', label: 'CEP (EUA)' },
  { name: 'radio-6', label: 'Quem vai pagar?' },
  { name: 'text-22', label: 'Nome do pagador' },
  { name: 'text-25', label: 'Relacionamento com pagador' },
  { name: 'phone-1', label: 'Telefone do pagador' },
  { name: 'text-24', label: 'E-mail do pagador' },
  { name: 'text-26', label: 'Endereço do pagador' },
  { name: 'text-27', label: 'Cidade do pagador' },
  { name: 'text-96', label: 'UF do pagador' },
  { name: 'text-29', label: 'CEP do pagador' },
  { name: 'text-30', label: 'País do pagador' },
  { name: 'radio-7', label: 'Há acompanhantes?' },
  { name: 'radio-8', label: 'Já esteve nos EUA?' },
  { name: 'radio-23', label: 'Já teve visto americano?' },
  { name: 'text-35', label: 'Data de emissão do visto' },
  { name: 'text-68', label: 'Número do visto' },
  { name: 'text-69', label: 'Data de expiração' },
  { name: 'radio-33', label: 'Impressões digitais coletadas?' },
  { name: 'radio-29', label: 'Mesmo tipo de visto?' },
  { name: 'radio-30', label: 'Mesmo país de emissão?' },
  { name: 'text-71', label: 'Logradouro' },
  { name: 'text-72', label: 'Complemento' },
  { name: 'text-73', label: 'CEP' },
  { name: 'text-74', label: 'Cidade' },
  { name: 'text-75', label: 'Estado' },
  { name: 'text-76', label: 'País' },
  { name: 'radio-9', label: 'Endereço de correspondência é o mesmo?' },
  { name: 'text-80', label: 'Logradouro (correspondência)' },
  { name: 'text-81', label: 'Complemento (correspondência)' },
  { name: 'text-82', label: 'CEP (correspondência)' },
  { name: 'text-83', label: 'Cidade (correspondência)' },
  { name: 'text-84', label: 'Estado (correspondência)' },
  { name: 'text-85', label: 'País (correspondência)' },
  { name: 'text-77', label: 'Telefone principal' },
  { name: 'text-78', label: 'Telefone comercial' },
  { name: 'radio-10', label: 'Usou outros números?' },
  { name: 'email-1', label: 'E-mail principal' },
  { name: 'radio-11', label: 'Usou outros e-mails?' },
  { name: 'radio-12', label: 'Presença em mídias sociais?' },
  { name: 'text-38', label: 'Número do passaporte' },
  { name: 'text-40', label: 'País que emitiu' },
  { name: 'text-39', label: 'Cidade de emissão' },
  { name: 'text-88', label: 'Estado de emissão' },
  { name: 'text-66', label: 'Data de emissão' },
  { name: 'text-67', label: 'Data de validade' },
  { name: 'radio-13', label: 'Passaporte perdido/roubado?' },
  { name: 'name-2', label: 'Contato nos EUA (nome)' },
  { name: 'text-41_contato', label: 'Endereço (EUA)' },
  { name: 'text-42_contato', label: 'Cidade (EUA)' },
  { name: 'text-43_contato', label: 'Estado (EUA)' },
  { name: 'email-4_contato', label: 'CEP (EUA)' },
  { name: 'checkbox-15[]', label: 'Relacionamento com contato' },
  { name: 'email-5', label: 'Telefone do contato (EUA)' },
  { name: 'email-3', label: 'E-mail do contato (EUA)' },
  { name: 'nome_pai', label: 'Nome do pai' },
  { name: 'text-44', label: 'Data de nascimento do pai' },
  { name: 'radio-14', label: 'Pai nos EUA?' },
  { name: 'checkbox-16[]', label: 'Status do pai' },
  { name: 'nome_mae', label: 'Nome da mãe' },
  { name: 'text-45', label: 'Data de nascimento da mãe' },
  { name: 'radio-15', label: 'Mãe nos EUA?' },
  { name: 'checkbox-17[]', label: 'Status da mãe' },
  { name: 'radio-16', label: 'Parentes imediatos nos EUA?' },
  { name: 'spouse_fullname', label: 'Nome do cônjuge' },
  { name: 'spouse-dob', label: 'Data de nascimento do cônjuge' },
  { name: 'spouse-nationality', label: 'Nacionalidade do cônjuge' },
  { name: 'spouse-city', label: 'Cidade de nascimento do cônjuge' },
  { name: 'spouse-country', label: 'País de nascimento do cônjuge' },
  { name: 'spouse-address-same', label: 'Endereço do cônjuge' },
  { name: 'spouse_endereco', label: 'Endereço (diferente)' },
  { name: 'spouse_cidade', label: 'Cidade' },
  { name: 'spouse_estado', label: 'Estado' },
  { name: 'spouse_cep', label: 'CEP' },
  { name: 'spouse_pais', label: 'País' },
  { name: 'ex_fullname', label: 'Nome do ex‑cônjuge' },
  { name: 'ex_dob', label: 'Data de nascimento' },
  { name: 'ex_nationality', label: 'Nacionalidade' },
  { name: 'ex_city', label: 'Cidade de nascimento' },
  { name: 'ex_country', label: 'País de nascimento' },
  { name: 'data_casamento_div', label: 'Data do Casamento' },
  { name: 'data_divorcio', label: 'Data do Divórcio' },
  { name: 'cidade_divorcio', label: 'Cidade do Divórcio' },
  { name: 'como_divorcio', label: 'Como se deu o Divórcio' },
  { name: 'falecido_fullname', label: 'Nome do cônjuge falecido' },
  { name: 'falecido_dob', label: 'Data de nascimento' },
  { name: 'falecido_nationality', label: 'Nacionalidade' },
  { name: 'falecido_city', label: 'Cidade de nascimento' },
  { name: 'falecido_country', label: 'País de nascimento' },
  { name: 'data_casamento_viuvo', label: 'Data do Casamento' },
  { name: 'data_falecimento', label: 'Data do Falecimento' },
  { name: 'radio-27', label: 'Ocupação principal' },
  { name: 'text-49', label: 'Empregador / escola' },
  { name: 'text-101', label: 'Endereço' },
  { name: 'text-102', label: 'Cidade' },
  { name: 'text-104', label: 'Estado' },
  { name: 'text-103', label: 'CEP' },
  { name: 'phone-8', label: 'Telefone' },
  { name: 'text-50', label: 'Data início' },
  { name: 'text-51', label: 'Renda mensal (R$)' },
  { name: 'text-52', label: 'Descrição das funções' },
  { name: 'radio-17', label: 'Teve empregos anteriores?' },
  { name: 'radio-18', label: 'Escolaridade secundário/superior?' },
  { name: 'text-59', label: 'Instituição de ensino' },
  { name: 'text-60', label: 'Curso' },
  { name: 'text-111', label: 'Endereço da instituição' },
  { name: 'text-112', label: 'Cidade' },
  { name: 'text-114', label: 'Estado' },
  { name: 'text-113', label: 'CEP' },
  { name: 'text-61', label: 'Data início' },
  { name: 'text-62', label: 'Data conclusão' },
  { name: 'radio-19', label: 'Fala outros idiomas?' },
  { name: 'radio-20', label: 'Viajou para outros países?' }
];

app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos');
  res.status(200).json({ success: true });

  try {
    const nome = data['full_name'] || 'Cliente_Sem_Nome';
    const emailCliente = data['email-1'] || null;

    // Gerar PDF
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

      // 1. Campos simples
      for (const field of simpleFields) {
        let value = data[field.name];
        if (value !== undefined && value !== null && value !== '') {
          const formatted = formatValue(field.name, value);
          if (formatted && formatted !== '(não informado)') {
            doc.font('Helvetica-Bold').fontSize(10).text(`${field.label}: `, { continued: true });
            doc.font('Helvetica').text(formatted);
            doc.moveDown(0.6);
          }
        }
      }

      // 2. Telefones anteriores
      const telefones = data['telefones_anteriores[]'] || [];
      if (telefones.length > 0) {
        doc.font('Helvetica-Bold').text('Telefones anteriores: ', { continued: true });
        doc.font('Helvetica').text(telefones.join(', '));
        doc.moveDown(0.6);
      }

      // 3. E-mails anteriores
      const emails = data['emails_anteriores[]'] || [];
      if (emails.length > 0) {
        doc.font('Helvetica-Bold').text('E-mails anteriores: ', { continued: true });
        doc.font('Helvetica').text(emails.join(', '));
        doc.moveDown(0.6);
      }

      // 4. Mídias sociais
      const plataformas = data['midia_plataforma[]'] || [];
      const identificadores = data['midia_identificador[]'] || [];
      const midias = [];
      for (let i = 0; i < Math.max(plataformas.length, identificadores.length); i++) {
        if (plataformas[i] || identificadores[i]) {
          midias.push(`${plataformas[i] || ''}${plataformas[i] && identificadores[i] ? ': ' : ''}${identificadores[i] || ''}`);
        }
      }
      if (midias.length > 0) {
        doc.font('Helvetica-Bold').text('Mídias sociais: ', { continued: true });
        doc.font('Helvetica').text(midias.join('; '));
        doc.moveDown(0.6);
      }

      // 5. Acompanhantes (agrupados)
      const acompanhantes = groupParallelArrays(data, 'acompanhante_nome[]', 'acompanhante_rel[]');
      if (acompanhantes.length > 0) {
        doc.font('Helvetica-Bold').text('Acompanhantes:');
        acompanhantes.forEach(acc => {
          doc.font('Helvetica').text(`  - ${acc}`);
        });
        doc.moveDown(0.6);
      }

      // 6. Viagens anteriores aos EUA
      const viagens = groupTravels(data);
      if (viagens.length > 0) {
        doc.font('Helvetica-Bold').text('Viagens anteriores aos EUA:');
        viagens.forEach(viagem => {
          doc.font('Helvetica').text(`  - ${viagem}`);
        });
        doc.moveDown(0.6);
      }

      // 7. Parentes nos EUA
      const parentes = groupParallelArrays(data, 'parente_nome[]', 'parente_relacao[]');
      if (parentes.length > 0) {
        doc.font('Helvetica-Bold').text('Parentes nos EUA:');
        parentes.forEach(p => {
          doc.font('Helvetica').text(`  - ${p}`);
        });
        doc.moveDown(0.6);
      }

      // 8. Idiomas adicionais
      const idiomas = data['idiomas[]'] || [];
      if (idiomas.length > 0) {
        doc.font('Helvetica-Bold').text('Outros idiomas: ', { continued: true });
        doc.font('Helvetica').text(idiomas.join(', '));
        doc.moveDown(0.6);
      }

      // 9. Países visitados
      const paises = data['paises_visitados[]'] || [];
      if (paises.length > 0) {
        doc.font('Helvetica-Bold').text('Países visitados (últimos 5 anos): ', { continued: true });
        doc.font('Helvetica').text(paises.join(', '));
        doc.moveDown(0.6);
      }

      // 10. Empregos anteriores (detalhados)
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

    // Enviar e-mail para a equipe
    const { error: errorEquipe } = await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `🇺🇸 DS-160: ${nome}`,
      html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo.</p>`,
      attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
    });
    if (errorEquipe) console.error('❌ Erro no envio para equipe:', errorEquipe);
    else console.log('✅ E-mail enviado para a equipe');

    // Enviar e-mail para o cliente
    if (emailCliente && emailCliente.trim() !== '') {
      const { error: errorCliente } = await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: [emailCliente],
        subject: `Seu formulário DS-160 foi recebido - ${nome}`,
        html: `<strong>Olá ${nome},</strong><br><p>Recebemos seu formulário DS-160. Em breve nossa equipe entrará em contato.</p><p>Segue em anexo uma cópia do seu pré-cadastro para sua conferência.</p><p>Atenciosamente,<br>Equipe GetVisa</p>`,
        attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
      });
      if (errorCliente) console.error('❌ Erro no envio para o cliente:', errorCliente);
      else console.log(`✅ E-mail enviado para o cliente: ${emailCliente}`);
    }

  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));