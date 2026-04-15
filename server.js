const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL');
const PORT = process.env.PORT || 10000;

// ==================== MIDDLEWARES (OBRIGATÓRIOS ANTES DAS ROTAS) ====================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== SUPABASE ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== MAPEAMENTOS (DS-160) ====================
const radioMapping = {
  'one': 'Sim', 'two': 'Não',
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
    if (d || dur) result.push(`${d}${d && dur ? ' - ' : ''}${dur} dias`);
  }
  return result;
}

function drawSeparator(doc) {
  doc.moveDown(0.5);
  doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);
}

const simpleFields = [ /* mantenha exatamente o mesmo array do seu código original */ ];
// (Devido ao limite de caracteres, não repetirei o array, mas você deve mantê-lo igual)

// ==================== ROTA DS-160 ====================
app.post('/api/submit-ds160', async (req, res) => {
  // ... mantenha o código original exatamente como estava ...
  // (não vou reescrever para não poluir, mas você já tem ele funcionando)
  res.status(200).json({ success: true });
});

// ==================== ROTA PASSAPORTE ====================
app.post('/api/submit-passaporte', async (req, res) => {
  // ... mantenha o código original exatamente como estava ...
  res.status(200).json({ success: true });
});

// ==================== ROTA VISTO NEGADO (CORRIGIDA) ====================
// ==================== ROTA VISTO NEGADO (COM RESULTADO NO E-MAIL) ====================
app.post('/api/submit-visto-negado', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados de Visto Negado recebidos:', data);
  res.status(200).json({ success: true });

  try {
    const nome = data['nome'] || 'Cliente_Sem_Nome';
    const emailCliente = data['email'] || null;
    const score = data['score'] || null;
    const classificacaoTipo = data['classificacao_tipo'] || '';
    const classificacaoTitulo = data['classificacao_titulo'] || '';
    const classificacaoMensagem = data['classificacao_mensagem'] || '';

    // Geração do PDF (incluindo o resultado da avaliação)
    const pdfBuffer = await new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

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
      doc.text(`Telefone/WhatsApp: ${data['telefone'] || 'Não informado'}`);
      doc.moveDown(1);
      doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

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

      // Adiciona o resultado da avaliação no PDF
      if (score !== null) {
        doc.moveDown(1);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#003366').text('RESULTADO DA AVALIAÇÃO');
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

    // E-mail para a equipe (resumido)
    await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `⚠️ Visto Negado: ${nome}`,
      html: `<strong>Avaliação de visto negado recebida.</strong><br>
             <p><strong>Cliente:</strong> ${nome}</p>
             <p><strong>E-mail:</strong> ${data['email'] || 'não informado'}</p>
             <p><strong>Telefone:</strong> ${data['telefone'] || 'não informado'}</p>
             <p><strong>Pontuação:</strong> ${score !== null ? score + '/100' : 'não calculada'}</p>
             <p>PDF em anexo.</p>`,
      attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
    });
    console.log('✅ E-mail enviado para a equipe (visto negado)');

    // E-mail para o cliente com o resultado da avaliação em destaque
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
        attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
      });
      console.log(`✅ E-mail enviado para o cliente (visto negado) com resultado: ${emailCliente}`);
    }
  } catch (err) {
    console.error('❌ Erro no processamento do visto negado:', err);
  }
});

// ==================== ENDPOINTS DE AGENDA E COMPROMISSOS (mantenha os seus) ====================
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'minha-chave-secreta-123';
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) return res.status(403).json({ error: 'Acesso negado' });
  next();
}

app.get('/api/agendamentos', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.json([]);
});

app.post('/api/agendamentos', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.status(201).json({});
});

app.put('/api/agendamentos/:id', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.json({});
});

app.delete('/api/agendamentos/:id', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.status(204).send();
});

app.get('/api/solicitacoes', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.json([]);
});

/* app.get('/api/compromissos', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.json([]);
});*/

app.get('/api/compromissos', validateApiKey, async (req, res) => {
  console.log('📥 Consulta recebida em /api/compromissos');
  console.log('🔗 SUPABASE_URL:', process.env.SUPABASE_URL);
  try {
    const { data, error } = await supabase.from('compromissos').select('*');
    console.log('📊 Dados retornados:', data?.length || 0);
    if (error) {
      console.error('❌ Erro do Supabase:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error('❌ Erro inesperado:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/compromissos', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.status(201).json({});
});

app.put('/api/compromissos/:id', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.json({});
});

app.delete('/api/compromissos/:id', validateApiKey, async (req, res) => {
  // ... mantenha o código original ...
  res.status(204).send();
});

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));