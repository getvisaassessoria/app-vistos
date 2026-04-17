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

// ==================== MAPEAMENTOS E FUNÇÕES AUXILIARES (DS-160) ====================
const radioMapping = { /* ... mantido igual ao seu original ... */ };
function formatValue(fieldName, value) { /* ... */ }
function groupParallelArrays(data, nameField, relField) { /* ... */ }
function groupTravels(data) { /* ... */ }
function drawSeparator(doc) { /* ... */ }

const simpleFields = [ /* ... array completo do seu código ... */ ];

// ==================== ROTAS DE FORMULÁRIOS (DS-160, PASSAPORTE, VISTO NEGADO) ====================
// (mantenha exatamente como você já tem, não vou repetir para economizar espaço)
// Elas estão funcionando e não precisam de alteração.
app.post('/api/submit-ds160', async (req, res) => { /* seu código */ });
app.post('/api/submit-passaporte', async (req, res) => { /* seu código */ });
app.post('/api/submit-visto-negado', async (req, res) => { /* seu código */ });

// ==================== AUTENTICAÇÃO PARA ENDPOINTS ADMIN ====================
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'minha-chave-secreta-123';
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

// ==================== ENDPOINTS DE AGENDA (PROTEGIDOS) ====================
// GET /api/agendamentos
app.get('/api/agendamentos', validateApiKey, async (req, res) => {
  const { solicitacao_id } = req.query;
  let query = supabase.from('agendamentos').select('*');
  if (solicitacao_id) query = query.eq('solicitacao_id', solicitacao_id);
  const { data, error } = await query.order('data_hora', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/agendamentos
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

// PUT /api/agendamentos/:id
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

// DELETE /api/agendamentos/:id
app.delete('/api/agendamentos/:id', validateApiKey, async (req, res) => {
  const { error } = await supabase.from('agendamentos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// GET /api/solicitacoes (apenas uma vez)
app.get('/api/solicitacoes', validateApiKey, async (req, res) => {
  const { data, error } = await supabase
    .from('solicitacoes')
    .select('id, tipo, clientes(nome_completo, email)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ==================== ENDPOINTS DE COMPROMISSOS (PROTEGIDOS PARA LISTAGEM/EDIÇÃO) ====================
// GET /api/compromissos - listar todos (protegido)
app.get('/api/compromissos', validateApiKey, async (req, res) => {
  const { data, error } = await supabase
    .from('compromissos')
    .select('*')
    .order('data', { ascending: true })
    .order('hora', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/compromissos/:id - atualizar (protegido)
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

// DELETE /api/compromissos/:id - excluir (protegido)
app.delete('/api/compromissos/:id', validateApiKey, async (req, res) => {
  const { error } = await supabase.from('compromissos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ==================== CRIAÇÃO DE COMPROMISSO COM VÍNCULO AUTOMÁTICO (SEM AUTENTICAÇÃO) ====================
app.post('/api/compromissos', async (req, res) => {
  const { nome, email, telefone, atividade, data, hora, local, concluido } = req.body;

  if (!email || !atividade || !data || !hora) {
    return res.status(400).json({ error: 'Campos obrigatórios: email, atividade, data, hora' });
  }

  try {
    // Busca ou cria o cliente
    let cliente = await supabase
      .from('clientes')
      .select('id, nome_completo, email, telefone')
      .eq('email', email)
      .maybeSingle();

    if (!cliente) {
      const { data: novoCliente, error: insertError } = await supabase
        .from('clientes')
        .insert({
          nome_completo: nome || 'Cliente sem nome',
          email: email,
          telefone: telefone || null
        })
        .select()
        .single();
      if (insertError) throw insertError;
      cliente = novoCliente;
      console.log(`✅ Cliente criado: ${cliente.id} - ${cliente.email}`);
    } else {
      // Atualiza dados se necessário
      const updates = {};
      if (nome && nome !== cliente.nome_completo) updates.nome_completo = nome;
      if (telefone && telefone !== cliente.telefone) updates.telefone = telefone;
      if (Object.keys(updates).length > 0) {
        await supabase.from('clientes').update(updates).eq('id', cliente.id);
        console.log(`🔄 Cliente atualizado: ${cliente.id}`);
      }
    }

    // Cria o compromisso vinculado
    const { data: compromisso, error: compError } = await supabase
      .from('compromissos')
      .insert({
        cliente_id: cliente.id,
        cliente: `${cliente.nome_completo} (${cliente.telefone || 'sem telefone'})`,
        atividade: atividade,
        data: data,
        hora: hora,
        local: local || null,
        concluido: concluido || 0
      })
      .select()
      .single();

    if (compError) throw compError;

    res.status(201).json({
      success: true,
      compromisso: compromisso,
      cliente: cliente
    });
  } catch (err) {
    console.error('❌ Erro ao criar compromisso:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== ENDPOINT DE LEMBRETES (PÚBLICO, CHAMADO POR CRON) ====================
app.get('/api/enviar-lembretes', async (req, res) => {
  console.log('🔔 Iniciando verificação de lembretes...');
  res.status(200).send('Processando lembretes... (ver logs)');

  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const daqui3 = new Date(hoje);
    daqui3.setDate(hoje.getDate() + 3);

    const amanhaStr = amanha.toISOString().split('T')[0];
    const daqui3Str = daqui3.toISOString().split('T')[0];

    console.log(`Buscando compromissos para ${amanhaStr} e ${daqui3Str}`);

    const { data: compromissos, error } = await supabase
      .from('compromissos')
      .select(`
        id, cliente, atividade, data, hora, local,
        clientes (email, telefone, nome_completo)
      `)
      .in('data', [amanhaStr, daqui3Str])
      .eq('concluido', 0);

    if (error) throw error;

    if (!compromissos || compromissos.length === 0) {
      console.log('Nenhum compromisso encontrado.');
      return;
    }

    for (const comp of compromissos) {
      const clienteInfo = comp.clientes || {};
      const email = clienteInfo.email;
      const nomeCliente = clienteInfo.nome_completo || comp.cliente?.split(' (')[0] || 'Cliente';
      const dataComp = comp.data;
      const horaComp = comp.hora;
      const atividade = comp.atividade;
      const local = comp.local || 'A definir';

      const dataCompDate = new Date(dataComp);
      const diffDays = Math.ceil((dataCompDate - hoje) / (1000 * 60 * 60 * 24));

      let titulo = '';
      if (diffDays === 1) titulo = '🔔 Lembrete: seu compromisso é amanhã!';
      else if (diffDays === 3) titulo = '📅 Lembrete: você tem um compromisso em 3 dias';
      else continue;

      const corpoEmail = `
        <h2>Olá ${nomeCliente},</h2>
        <p>Você tem um compromisso agendado:</p>
        <ul>
          <li><strong>Atividade:</strong> ${atividade}</li>
          <li><strong>Data:</strong> ${dataComp}</li>
          <li><strong>Horário:</strong> ${horaComp}</li>
          <li><strong>Local:</strong> ${local}</li>
        </ul>
        <p>Não se esqueça dos documentos necessários.</p>
        <p>Atenciosamente,<br>Equipe GetVisa</p>
      `;

      if (email) {
        await resend.emails.send({
          from: 'GetVisa <contato@getvisa.com.br>',
          to: [email],
          subject: titulo,
          html: corpoEmail
        });
        console.log(`✅ E-mail enviado para ${email} (${atividade})`);
      } else {
        console.log(`⚠️ Compromisso ID ${comp.id} sem e-mail associado.`);
      }
    }
  } catch (err) {
    console.error('❌ Erro ao processar lembretes:', err);
  }
});

// ==================== ROTA DE PING (MANTER SERVIDOR ACORDADO) ====================
app.get('/ping', (req, res) => {
  res.status(200).send('ok');
});

// ==================== CRIAÇÃO DE COMPROMISSO (SEM AUTENTICAÇÃO) ====================
app.post('/api/compromissos', async (req, res) => {
  const { nome, email, telefone, atividade, data, hora, local, concluido } = req.body;

  if (!email || !atividade || !data || !hora) {
    return res.status(400).json({ error: 'Campos obrigatórios: email, atividade, data, hora' });
  }

  try {
    // 1. Buscar cliente pelo e-mail
    let cliente = await supabase
      .from('clientes')
      .select('id, nome_completo, email, telefone')
      .eq('email', email)
      .maybeSingle();

    // 2. Se não existir, criar cliente
    if (!cliente) {
      const { data: novoCliente, error: insertError } = await supabase
        .from('clientes')
        .insert({
          nome_completo: nome || 'Cliente sem nome',
          email: email,
          telefone: telefone || null
        })
        .select()
        .single();
      if (insertError) throw insertError;
      cliente = novoCliente;
      console.log(`✅ Cliente criado: ${cliente.id}`);
    } else {
      // Atualiza dados se necessário
      const updates = {};
      if (nome && nome !== cliente.nome_completo) updates.nome_completo = nome;
      if (telefone && telefone !== cliente.telefone) updates.telefone = telefone;
      if (Object.keys(updates).length > 0) {
        await supabase.from('clientes').update(updates).eq('id', cliente.id);
        console.log(`🔄 Cliente atualizado: ${cliente.id}`);
      }
    }

    // 3. Criar compromisso vinculado
    const { data: compromisso, error: compError } = await supabase
      .from('compromissos')
      .insert({
        cliente_id: cliente.id,
        cliente: `${cliente.nome_completo} (${cliente.telefone || ''})`,
        atividade: atividade,
        data: data,
        hora: hora,
        local: local || null,
        concluido: concluido || 0
      })
      .select()
      .single();

    if (compError) throw compError;

    res.status(201).json({ success: true, compromisso, cliente });
  } catch (err) {
    console.error('❌ Erro ao criar compromisso:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));