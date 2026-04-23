const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY || 're_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL');
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== SUPABASE CLIENT ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== FUNÇÃO UTIL: NORMALIZAR TELEFONE ====================
function normalizarPhone(phoneBruto) {
  if (!phoneBruto) return null;
  return phoneBruto.replace(/\D/g, ''); // remove tudo que não é número
}

// ==================== MAPEAMENTOS E FUNÇÕES AUXILIARES (DS-160) ====================
const radioMapping = { /* (mantenha exatamente o mesmo do seu backup) */ };
function formatValue(fieldName, value) { /* (mantenha) */ }
function groupParallelArrays(data, nameField, relField) { /* (mantenha) */ }
function groupTravels(data) { /* (mantenha) */ }
function drawSeparator(doc) { /* (mantenha) */ }
const simpleFields = [ /* (mantenha o array completo do seu backup) */ ];

// ==================== FUNÇÃO: BUSCAR PERFIL DO LEAD NO SUPABASE ====================
async function buscarPerfilDoLead(phone) {
  if (!phone) return null;

  try {
    const { data, error } = await supabase
      .from('lead_perfil_visto')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('❌ Erro ao buscar perfil do lead:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0]; // registro mais recente
  } catch (err) {
    console.error('❌ Erro inesperado ao buscar perfil do lead:', err);
    return null;
  }
}

// ==================== FUNÇÃO: RESPOSTA PERSONALIZADA DO PERFIL (OPCIONAL) ====================
function montarRespostaPerfil(perfilLead) {
  if (!perfilLead || !perfilLead.dados_teste) return null;

  const dados = perfilLead.dados_teste;
  const nome = perfilLead.nome || 'Cliente';
  const classificacao = dados.classificacao || dados.risco || 'não informado';
  const perfilProf = (dados.perfil_profissional || '').toLowerCase();
  const faixaRenda = dados.faixa_renda || '';
  const historico = (dados.historico_viagens || '').toLowerCase();
  const motivo = (dados.motivo_viagem || '').toLowerCase();

  let alertaPrincipal = '';
  if (perfilProf.includes('desempregado')) {
    alertaPrincipal =
      'O ponto de maior atenção é sua situação atual de desempregado, que exige uma estratégia precisa ' +
      'para justificar sua renda e o propósito da viagem.';
  } else if (perfilProf.includes('autônomo') || perfilProf.includes('autonomo')) {
    alertaPrincipal =
      'Um ponto importante é comprovar bem sua atividade como autônomo, mostrando origem e estabilidade da sua renda.';
  } else if (perfilProf.includes('clt') || perfilProf.includes('registrado')) {
    alertaPrincipal =
      'Seu vínculo empregatício formal é um ponto positivo, e vamos usar isso a seu favor na estratégia do visto.';
  } else {
    alertaPrincipal =
      'Vamos olhar com cuidado seus vínculos e sua situação atual para montar uma estratégia coerente com sua realidade.';
  }

  let destaqueHistorico = '';
  if (historico.includes('europa') || historico.includes('canad')) {
    destaqueHistorico =
      'O grande diferencial a seu favor é seu excelente histórico de viagens (como Europa/Canadá), ' +
      'que mostra que você respeita as normas imigratórias internacionais.';
  } else if (historico.includes('nenhuma') || historico.includes('nunca viajei')) {
    destaqueHistorico =
      'Mesmo sem histórico de viagens internacionais, é possível estruturar um pedido forte focando em vínculos e planejamento.';
  } else if (historico) {
    destaqueHistorico =
      'Seu histórico de viagens também entra na análise e pode ajudar a reforçar sua credibilidade como turista/visitante.';
  }

  let focoMotivo = '';
  if (motivo.includes('negócio') || motivo.includes('negocio')) {
    focoMotivo =
      'Nossa assessoria vai focar em organizar sua documentação de suporte para as reuniões/congressos ' +
      'e em como apresentar sua disponibilidade financeira atual de forma sólida, alinhada ao objetivo de negócios.';
  } else if (motivo.includes('turismo')) {
    focoMotivo =
      'Nossa assessoria vai focar em mostrar um plano de viagem coerente, sua capacidade financeira ' +
      'e seus vínculos com o Brasil, pra que o consulado veja clareza na sua intenção de turismo.';
  } else if (motivo) {
    focoMotivo =
      'Nossa assessoria vai focar em alinhar sua documentação com o objetivo real da sua viagem, ' +
      'mostrando consistência entre perfil, renda e planos nos EUA.';
  } else {
    focoMotivo =
      'Nossa assessoria vai focar em alinhar sua documentação com o objetivo real da sua viagem, ' +
      'mostrando consistência entre perfil, renda e planos nos EUA.';
  }

  const resposta =
    `Olá, ${nome}! Analisamos seu perfil classificado como ${classificacao}.\n\n` +
    `${alertaPrincipal} ${destaqueHistorico}\n\n` +
    (faixaRenda ? `Faixa de renda informada: ${faixaRenda}.\n\n` : '') +
    'Investimento aproximado:\n' +
    '- Taxa Consular (MRV): aprox. US$ 185 (~R$ 950).\n' +
    '- Assessoria: R$ 350 (50% na entrega do rascunho do DS-160 e 50% no agendamento).\n\n' +
    `${focoMotivo}\n\n` +
    'O objetivo é transformar seu perfil em uma proposta clara e profissional para o cônsul, ' +
    'reduzindo ao máximo os riscos do seu caso.\n\n' +
    'Podemos iniciar a montagem do seu processo e preparar essa estratégia?';

  return resposta;
}

// ==================== ROTA DS-160 (RESPOSTA IMEDIATA + BACKGROUND) ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos (DS-160)');

  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      // --- 1. Salvar no Supabase ---
      let solicitacaoId = null;
      try {
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert(
            {
              email: data['email-1'] || null,
              nome_completo: data['full_name'] || null,
              telefone: data['text-77'] || null
            },
            { onConflict: 'email' }
          )
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

      // --- 2. Geração do PDF (seu código) ---
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

        const telefones = data['telefones_anteriores[]'] || [];
        if (telefones.length > 0) {
          if (lastGroup !== null && lastGroup !== 'telefones') drawSeparator(doc);
          doc.font('Helvetica-Bold').text('Telefones anteriores: ', { continued: true });
          doc.font('Helvetica').text(telefones.join(', '));
          doc.moveDown(0.6);
          lastGroup = 'telefones';
        }

        const emails = data['emails_anteriores[]'] || [];
        if (emails.length > 0) {
          if (lastGroup !== null && lastGroup !== 'emails') drawSeparator(doc);
          doc.font('Helvetica-Bold').text('E-mails anteriores: ', { continued: true });
          doc.font('Helvetica').text(emails.join(', '));
          doc.moveDown(0.6);
          lastGroup = 'emails';
        }

        const plataformas = data['midia_plataforma[]'] || [];
        const identificadores = data['midia_identificador[]'] || [];
        const midias = [];
        for (let i = 0; i < Math.max(plataformas.length, identificadores.length); i++) {
          if (plataformas[i] || identificadores[i]) {
            midias.push(
              `${plataformas[i] || ''}${
                plataformas[i] && identificadores[i] ? ': ' : ''
              }${identificadores[i] || ''}`
            );
          }
        }
        if (midias.length > 0) {
          if (lastGroup !== null && lastGroup !== 'midias') drawSeparator(doc);
          doc.font('Helvetica-Bold').text('Mídias sociais: ', { continued: true });
          doc.font('Helvetica').text(midias.join('; '));
          doc.moveDown(0.6);
          lastGroup = 'midias';
        }

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

        const idiomas = data['idiomas[]'] || [];
        if (idiomas.length > 0) {
          if (lastGroup !== null && lastGroup !== 'idiomas') drawSeparator(doc);
          doc.font('Helvetica-Bold').text('Outros idiomas: ', { continued: true });
          doc.font('Helvetica').text(idiomas.join(', '));
          doc.moveDown(0.6);
          lastGroup = 'idiomas';
        }

        const paises = data['paises_visitados[]'] || [];
        if (paises.length > 0) {
          if (lastGroup !== null && lastGroup !== 'paises') drawSeparator(doc);
          doc.font('Helvetica-Bold').text('Países visitados (últimos 5 anos): ', { continued: true });
          doc.font('Helvetica').text(paises.join(', '));
          doc.moveDown(0.6);
          lastGroup = 'paises';
        }

        const empregos = [];
        const empNomes = data['emprego_anterior_nome[]'] || [];
        const empCargos = data['emprego_anterior_cargo[]'] || [];
        const empInicios = data['emprego_anterior_inicio[]'] || [];
        const empFins = data['emprego_anterior_fim[]'] || [];
        const maxEmp = Math.max(
          empNomes.length,
          empCargos.length,
          empInicios.length,
          empFins.length
        );
        for (let i = 0; i < maxEmp; i++) {
          if (empNomes[i] || empCargos[i]) {
            let linha = `${empNomes[i] || ''}${
              empNomes[i] && empCargos[i] ? ' - ' : ''
            }${empCargos[i] || ''}`;
            if (empInicios[i] || empFins[i])
              linha += ` (${empInicios[i] || '?'} a ${empFins[i] || '?'})`;
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
        doc
          .fontSize(8)
          .fillColor('#999999')
          .text('Documento gerado automaticamente pelo sistema GetVisa.', {
            align: 'center'
          });
        doc.end();
      });

      console.log(`📄 PDF gerado para ${nome}, tamanho: ${pdfBuffer.length} bytes`);

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `🇺🇸 DS-160: ${nome}`,
        html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
        attachments: [
          {
            filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
            content: pdfBuffer.toString('base64')
          }
        ]
      });
      console.log('✅ E-mail enviado para a equipe');

      if (emailCliente && emailCliente.trim() !== '') {
        await resend.emails.send({
          from: 'GetVisa <contato@getvisa.com.br>',
          to: [emailCliente],
          subject: `Seu formulário DS-160 foi recebido - ${nome}`,
          html: `<strong>Olá ${nome},</strong><br><p>Recebemos seu formulário. Segue em anexo uma cópia.</p><p>Em breve nossa equipe entrará em contato.</p>`,
          attachments: [
            {
              filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
              content: pdfBuffer.toString('base64')
            }
          ]
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
          .upsert(
            {
              email: data['passaporte_email'] || null,
              nome_completo: data['passaporte_nome'] || null,
              telefone: data['passaporte_telefone'] || null
            },
            { onConflict: 'email' }
          )
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
            if (lastGroup !== null) {
              doc.moveDown(0.3);
              doc.strokeColor('#e0e0e0').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
              doc.moveDown(0.3);
            }
            doc.font('Helvetica-Bold').fontSize(10).text(`${field.label}: `, {
              continued: true
            });
            doc.font('Helvetica').text(value);
            doc.moveDown(0.6);
            lastGroup = field.name;
          }
        }

        doc.moveDown(2);
        doc
          .fontSize(8)
          .fillColor('#999999')
          .text('Documento gerado automaticamente pelo sistema GetVisa.', {
            align: 'center'
          });
        doc.end();
      });

      console.log(`📄 PDF gerado para passaporte de ${nome}, tamanho: ${pdfBuffer.length} bytes`);

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `📘 Passaporte: ${nome}`,
        html: `<strong>Solicitação de passaporte recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo.</p>`,
        attachments: [
          {
            filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
            content: pdfBuffer.toString('base64')
          }
        ]
      });
      console.log('✅ E-mail enviado para a equipe (passaporte)');

      if (emailCliente && emailCliente.trim() !== '') {
        await resend.emails.send({
          from: 'GetVisa <contato@getvisa.com.br>',
          to: [emailCliente],
          subject: `Sua solicitação de passaporte foi recebida - ${nome}`,
          html: `<strong>Olá ${nome},</strong><br><p>Recebemos sua solicitação. Em breve nossa equipe entrará em contato.</p><p>Segue em anexo uma cópia.</p>`,
          attachments: [
            {
              filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
              content: pdfBuffer.toString('base64')
            }
          ]
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

        doc.fillColor('#003366').fontSize(22).text('AVALIAÇÃO DE VISTO NEGADO', {
          align: 'center'
        });
        doc
          .fontSize(12)
          .fillColor('#666666')
          .text('Assessoria GetVisa - Análise Estratégica', { align: 'center' });
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
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(`${q.label}: `, { continued: true });
          doc.font('Helvetica').text(resposta);
          doc.moveDown(0.8);
        }

        if (score !== null) {
          doc.moveDown(1);
          doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
          doc.moveDown(0.5);
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor('#003366')
            .text('RESULTADO DA AVALIAÇÃO');
          doc.moveDown(0.5);
          doc.font('Helvetica').fontSize(10).fillColor('#000000');
          doc.text(`Pontuação: ${score}/100`);
          let classificacaoTexto = '';
          if (classificacaoTipo === 'urgent') classificacaoTexto = '🔴 Requer Atenção Urgente';
          else if (classificacaoTipo === 'moderate')
            classificacaoTexto = '🟠 Potencial Moderado';
          else classificacaoTexto = '🟢 Forte Potencial';
          doc.text(`Classificação: ${classificacaoTexto}`);
          doc.text(`Mensagem: ${classificacaoMensagem}`);
        }

        doc.moveDown(2);
        doc
          .fontSize(8)
          .fillColor('#999999')
          .text('Documento gerado automaticamente pelo sistema GetVisa.', {
            align: 'center'
          });
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
               <p><strong>Pontuação:</strong> ${
                 score !== null ? score + '/100' : 'não calculada'
               }</p>
               <p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
        attachments: [
          {
            filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
            content: pdfBuffer.toString('base64')
          }
        ]
      });
      console.log('✅ E-mail enviado para a equipe (visto negado)');

      if (emailCliente && emailCliente.trim() !== '') {
        let resultadoHtml = '';
        if (score !== null) {
          let cor =
            classificacaoTipo === 'urgent'
              ? '#dc2626'
              : classificacaoTipo === 'moderate'
              ? '#ff6b35'
              : '#0066cc';
          resultadoHtml = `
            <div style="background: #f0f9ff; border-left: 5px solid ${cor}; padding: 15px; margin: 20px 0; border-radius: 12px;">
              <h3 style="margin: 0 0 10px; color: ${cor};">📊 Resultado da sua avaliação</h3>
              <p><strong>Pontuação:</strong> ${score}/100</p>
              <p><strong>Classificação:</strong> ${
                classificacaoTipo === 'urgent'
                  ? '🔴 Requer Atenção Urgente'
                  : classificacaoTipo === 'moderate'
                  ? '🟠 Potencial Moderado'
                  : '🟢 Forte Potencial'
              }</p>
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
          attachments: [
            {
              filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
              content: pdfBuffer.toString('base64')
            }
          ]
        });
        console.log(`✅ E-mail enviado para o cliente (visto negado) com resultado: ${emailCliente}`);
      }
    } catch (err) {
      console.error('❌ Erro no processamento do visto negado (background):', err);
    }
  })();
});

// ==================== ROTA TESTE DE PERFIL (NOVO) ====================
// Ajuste o path '/api/submit-teste-perfil' para o mesmo que o HTML do seu formulário usa
app.post('/api/submit-teste-perfil', async (req, res) => {
  try {
    const {
      nome,
      whatsapp,
      tipo_visto,
      risco,
      classificacao,
      perfil_profissional,
      faixa_renda,
      historico_viagens,
      motivo_viagem,
      observacao_lead
    } = req.body;

    const phoneNormalizado = normalizarPhone(whatsapp);

    const dadosTeste = {
      classificacao: classificacao || risco,
      perfil_profissional,
      faixa_renda,
      historico_viagens,
      motivo_viagem,
      observacao_lead
    };

    const { data, error } = await supabase
      .from('lead_perfil_visto')
      .insert({
        phone: phoneNormalizado,
        nome,
        tipo_visto,
        risco,
        dados_teste: dadosTeste
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao salvar teste de perfil no Supabase:', error);
      return res.status(500).json({ error: 'Erro ao salvar teste de perfil' });
    }

    console.log('✅ Lead salvo em lead_perfil_visto:', data);

    // (Opcional) Enviar mensagem inicial no WhatsApp via Z-API
    const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
    const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
    const ZAPI_SECURITY_TOKEN = process.env.ZAPI_SECURITY_TOKEN;

    if (ZAPI_INSTANCE && ZAPI_TOKEN && phoneNormalizado) {
      const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
      const mensagemInicial =
        `Olá, ${nome || ''}! Recebi aqui o resultado do seu teste de perfil para visto americano.\n\n` +
        'Se quiser, pode mandar suas dúvidas por aqui que eu te ajudo com os próximos passos.';

      const payloadZap = {
        phone: phoneNormalizado,
        message: mensagemInicial
      };

      try {
        const respZap = await fetch(zapiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': ZAPI_SECURITY_TOKEN
          },
          body: JSON.stringify(payloadZap)
        });

        if (!respZap.ok) {
          const txt = await respZap.text().catch(() => '');
          console.error(
            '❌ Erro ao enviar WhatsApp inicial via Z-API:',
            respZap.status,
            txt
          );
        } else {
          console.log(`✅ Mensagem inicial enviada para ${phoneNormalizado}`);
        }
      } catch (err) {
        console.error('❌ Erro de rede ao enviar WhatsApp inicial:', err);
      }
    }

    // Resposta rápida para o front (mantém seu HTML funcionando)
    res.status(200).json({ ok: true, lead: data });
  } catch (err) {
    console.error('❌ Erro inesperado no submit-teste-perfil:', err);
    res.status(500).json({ error: 'Erro inesperado' });
  }
});

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
    return res
      .status(400)
      .json({ error: 'Campos obrigatórios: solicitacao_id, tipo, data_hora' });
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
  const { data, error } = await supabase
    .from('compromissos')
    .select('*')
    .order('data', { ascending: true })
    .order('hora', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/compromissos', validateApiKey, async (req, res) => {
  const { cliente, atividade, data, hora, local, concluido } = req.body;
  if (!cliente || !atividade || !data || !hora) {
    return res
      .status(400)
      .json({ error: 'Cliente, atividade, data e hora são obrigatórios' });
  }
  const { data: inserted, error } = await supabase
    .from('compromissos')
    .insert({
      cliente,
      atividade,
      data,
      hora,
      local,
      concluido: concluido || 0
    })
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
  const { error } = await supabase
    .from('compromissos')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ==================== ROTA DE PING (MANTER SERVIDOR ACORDADO) ====================
app.get('/ping', (req, res) => {
  res.status(200).send('ok');
});

// ==================== RESPOSTAS AUTOMÁTICAS PARA WHATSAPP (ZAPI) ====================
function responderPerguntaObjetiva(mensagem, perfilLead) {
  if (!mensagem) return null;
  const txt = mensagem.toLowerCase();

  // 0) Se perguntar diretamente sobre "perfil moderado / chances / resultado", usa análise personalizada
  if (
    perfilLead &&
    (
      txt.includes('perfil moderado') ||
      txt.includes('perfil alto') ||
      txt.includes('perfil baixo') ||
      txt.includes('resultado do teste') ||
      txt.includes('minhas chances') ||
      txt.includes('resultado da avaliação') ||
      txt.includes('resultado da avaliacao')
    )
  ) {
    const respPerfil = montarRespostaPerfil(perfilLead);
    if (respPerfil) return respPerfil;
  }

  // 1) Preço / valor / investimento
  if (
    txt.includes('consultoria') ||
    txt.includes('honorário') ||
    txt.includes('honorario') ||
    txt.includes('preço') ||
    txt.includes('preco') ||
    txt.includes('valor') ||
    txt.includes('quanto custa') ||
    txt.includes('investimento')
  ) {
    return (
      'Hoje a consultoria da GetVisa para visto americano de turismo/negócios (B1/B2) ' +
      'começa em torno de R$ 490, podendo variar conforme o perfil e o nível de acompanhamento que você precisa.\n\n' +
      'No valor da consultoria costuma estar incluído: análise estratégica do seu caso, ' +
      'preenchimento assistido do DS-160, organização dos documentos, preparação para entrevista ' +
      'e acompanhamento até a conclusão do processo.\n\n' +
      'O ideal é entender rapidinho o seu perfil pra te passar um valor mais preciso, sem chute.'
    );
  }

  // 2) Taxa consular
  if (
    txt.includes('taxa') &&
    (txt.includes('consular') || txt.includes('embaixada') || txt.includes('visto'))
  ) {
    return (
      'A taxa consular para o visto americano de turismo/negócios (B1/B2) hoje é de aproximadamente US$ 185, ' +
      'paga diretamente ao consulado, normalmente no cartão de crédito (em dólar).\n\n' +
      'Essa taxa é separada da consultoria da GetVisa, que é o serviço de acompanhamento especializado. ' +
      'Ou seja: tem o valor da taxa do consulado e o valor da nossa consultoria.\n\n' +
      'Se quiser, eu te explico certinho a diferença entre as duas coisas.'
    );
  }

  // 3) Prazos
  if (
    txt.includes('prazo') ||
    txt.includes('quanto tempo') ||
    txt.includes('demora') ||
    txt.includes('leva quanto') ||
    txt.includes('tempo de espera') ||
    txt.includes('fila')
  ) {
    // Se tiver mês/ano de viagem no perfil, pode personalizar (se você salvar isso em dados_teste)
    if (perfilLead && perfilLead.dados_teste && perfilLead.dados_teste.mes_viagem) {
      const mes = perfilLead.dados_teste.mes_viagem;
      const ano = perfilLead.dados_teste.ano_viagem;
      return (
        `Vi aqui no seu teste que você pretende viajar em ${mes}/${ano}.\n\n` +
        'Os prazos do visto americano variam conforme a cidade e a agenda do consulado.\n\n' +
        'Em geral, entre taxa, agendamento e entrevista, costuma ficar numa média de 2 a 6 meses. ' +
        'No seu caso, é importante começar o quanto antes pra não apertar demais as datas.'
      );
    }

    return (
      'Os prazos do visto americano mudam bastante conforme a cidade e a época do ano, por causa da agenda do consulado.\n\n' +
      'De forma geral, entre pagamento da taxa, agendamento e entrevista, costuma ficar numa média de 2 a 6 meses, ' +
      'mas isso pode ser mais rápido ou mais demorado dependendo da região.\n\n' +
      'Por isso, quanto antes você começar, melhor pra ter mais opções de datas.'
    );
  }

  // 4) Como funciona a consultoria / o que inclui
  if (
    txt.includes('como funciona') ||
    txt.includes('o que inclui') ||
    txt.includes('o que está incluso') ||
    txt.includes('o que esta incluso') ||
    txt.includes('serviço') ||
    txt.includes('servico') ||
    txt.includes('assessoria') ||
    txt.includes('vocês ajudam') ||
    txt.includes('voces ajudam')
  ) {
    return (
      'Na consultoria da GetVisa nós te acompanhamos em praticamente todas as etapas do visto americano:\n\n' +
      '• Análise rápida do seu perfil e do objetivo da viagem\n' +
      '• Estratégia de apresentação do seu caso (o que faz sentido destacar e o que cuidar)\n' +
      '• Preenchimento assistido do formulário DS-160\n' +
      '• Orientação sobre documentos mais importantes pro seu perfil\n' +
      '• Preparação para entrevista (perguntas comuns, postura, pontos de atenção)\n' +
      '• Acompanhamento até a conclusão do processo\n\n' +
      'A ideia é você não ficar perdido nem correr risco por falta de informação.'
    );
  }

  // 5) Locais / consulado / entrevista
  if (
    txt.includes('onde') &&
    (txt.includes('consulado') || txt.includes('casv') || txt.includes('entrevista') || txt.includes('posto'))
  ) {
    return (
      'Os consulados americanos no Brasil que realizam entrevistas para visto ficam em São Paulo, ' +
      'Rio de Janeiro, Brasília, Recife e Porto Alegre (quando em operação).\n\n' +
      'Muita gente viaja para outra cidade só para fazer o processo, não precisa ser necessariamente no seu estado.\n\n' +
      'A escolha do local pode depender da agenda e de onde fica mais prático pra você.'
    );
  }

  // 6) Documentos necessários
  if (
    txt.includes('documento') ||
    txt.includes('documentos') ||
    txt.includes('o que precisa') ||
    txt.includes('preciso levar') ||
    txt.includes('levar o que') ||
    txt.includes('preciso ter')
  ) {
    return (
      'Os documentos ideais para o visto americano variam bastante de pessoa pra pessoa, ' +
      'mas em geral envolvem comprovação de renda, vínculos com o Brasil e informações da viagem.\n\n' +
      'Não existe uma “lista oficial” única; o consulado avalia o conjunto do seu perfil e da sua entrevista.\n\n' +
      'Na consultoria a gente monta uma lista personalizada com base na sua realidade, ' +
      'pra você não pecar nem por falta nem por exagero de papel.'
    );
  }

  // 7) Visto negado / risco
  if (
    txt.includes('visto negado') ||
    txt.includes('já tive visto negado') ||
    txt.includes('ja tive visto negado') ||
    txt.includes('reprova') ||
    txt.includes('negam') ||
    txt.includes('chance de') ||
    txt.includes('probabilidade') ||
    txt.includes('risco')
  ) {
    return (
      'Cada caso de visto negado tem um motivo específico, mesmo quando o consulado não explica claramente na hora.\n\n' +
      'O mais importante é entender o que pode ter pesado contra você e ajustar a estratégia antes de tentar de novo, ' +
      'porque repetir o mesmo pedido da mesma forma costuma dar o mesmo resultado.\n\n' +
      'Na GetVisa a gente olha com cuidado seu histórico e monta um plano pra nova tentativa com mais segurança.'
    );
  }

  // 8) Família / crianças
  if (
    txt.includes('filho') ||
    txt.includes('filha') ||
    txt.includes('criança') ||
    txt.includes('crianca') ||
    txt.includes('família') ||
    txt.includes('familia') ||
    txt.includes('esposa') ||
    txt.includes('marido')
  ) {
    return (
      'É super comum fazer o visto em família, incluindo crianças.\n\n' +
      'Em muitos casos, crianças pequenas nem precisam ir na entrevista, mas isso depende da idade e de como estão os vistos dos pais.\n\n' +
      'Na consultoria a gente organiza tudo pra família inteira: formulários, taxas, agendamentos e orientações específicas pra cada um.'
    );
  }

  // 9) Outros tipos de visto (estudo / trabalho)
  if (
    txt.includes('estudante') ||
    txt.includes('estudo') ||
    txt.includes('trabalho') ||
    txt.includes('intercâmbio') ||
    txt.includes('intercambio') ||
    txt.includes('visto f1') ||
    txt.includes('visto j1') ||
    txt.includes('j-1') ||
    txt.includes('f-1')
  ) {
    return (
      'Vistos de estudo e trabalho (como F1, J1, etc.) têm regras um pouco diferentes do turismo, ' +
      'principalmente em relação a documentos da escola/empregador e comprovação financeira.\n\n' +
      'Nós também atendemos esse tipo de visto, mas a análise precisa ser um pouco mais detalhada, ' +
      'porque cada programa tem suas exigências.\n\n' +
      'O melhor caminho é olhar seu caso com calma pra te orientar com segurança.'
    );
  }

  // 10) Como começar / agendar
  if (
    txt.includes('começar') ||
    txt.includes('iniciar') ||
    txt.includes('agendar') ||
    txt.includes('marcar') ||
    txt.includes('quero fazer') ||
    txt.includes('fechar consultoria') ||
    txt.includes('vamos fazer') ||
    txt.includes('como faço') ||
    txt.includes('como faço para')
  ) {
    return (
      'Ótimo, vamos organizar isso do jeito certo 😊\n\n' +
      'O próximo passo é fazer uma análise rápida do seu perfil, pra entender seu objetivo de viagem e o melhor caminho no visto.\n\n' +
      'A partir dessa análise, a gente já consegue te passar valor exato, prazos e próximos passos bem certinhos.'
    );
  }

  // 11) Saudações básicas
  if (
    txt === 'oi' ||
    txt === 'olá' ||
    txt === 'ola' ||
    txt.startsWith('bom dia') ||
    txt.startsWith('boa tarde') ||
    txt.startsWith('boa noite')
  ) {
    return (
      'Olá! 😊 Eu sou o atendimento automatizado da GetVisa e te ajudo com dúvidas rápidas sobre visto americano.\n\n' +
      'Você pode me perguntar sobre valores, taxa consular, prazos, documentos ou como funciona a consultoria. ' +
      'E, se precisar de uma análise mais detalhada, eu te direciono pra um especialista.'
    );
  }

  return null;
}

// ==================== WEBHOOK Z-API ====================
// fetch dinâmico para Z-API
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

app.post('/api/webhook/zapi', async (req, res) => {
  console.log('📥 Webhook Z-API recebido (bruto):');
  console.dir(req.body, { depth: null });

  const body = req.body || {};

  // 0) Garantir que só a instância de teste responda
  const connectedPhone = body.connectedPhone || null;
  const NUMERO_TESTE = '5521985234917'; // número do WhatsApp conectado à instância

  if (connectedPhone && connectedPhone !== NUMERO_TESTE) {
    console.log(
      `⚠️ Ignorando mensagem porque veio do número conectado ${connectedPhone}, e não do número de teste ${NUMERO_TESTE}.`
    );
    return res.status(200).json({ ignored: true, reason: 'different connectedPhone' });
  }

  // 1) Extrair telefone do cliente
  const phone =
    body.phone ||
    body.from ||
    body.remoteJid ||
    null;

  const NUMEROS_BLOQUEADOS = [
    // '5521974601812', // se quiser bloquear seu próprio número
  ];

  if (phone && NUMEROS_BLOQUEADOS.includes(phone)) {
    console.log(`⚠️ Ignorando mensagem de número bloqueado: ${phone}`);
    return res.status(200).json({ ignored: true, reason: 'blocked phone' });
  }

  // 1.1) Buscar perfil do lead no Supabase
  const perfilLead = await buscarPerfilDoLead(phone);
  console.log('🧩 Perfil do lead encontrado:', perfilLead);

  // 2) Extrair mensagem de texto ou áudio
  let message =
    (body.text && body.text.message) ||
    body.message ||
    (body.text && body.text.body) ||
    body.body ||
    '';

  let isAudio = false;

  if (!message && body.audio && body.audio.audioUrl) {
    isAudio = true;
    message = '[mensagem de áudio recebida]';
    console.log(`🎧 Mensagem de áudio detectada de ${phone}: ${body.audio.audioUrl}`);
  }

  if (!phone || !message) {
    console.log('⚠️ Webhook sem phone ou message no formato esperado.');
    return res.status(200).json({ received: true, warning: 'missing phone or message' });
  }

  console.log(`📩 Mensagem de ${phone}: ${message}`);

  // 3) Montar resposta
  let resposta;

  if (isAudio) {
    resposta =
      'Recebi seu áudio aqui 🙌\n\n' +
      'Neste canal automatizado eu consigo entender melhor mensagens de texto. ' +
      'Você consegue me enviar sua dúvida por escrito? Assim te ajudo mais rápido.';
  } else {
    resposta = responderPerguntaObjetiva(message, perfilLead);

    if (!resposta) {
      resposta =
        'Essa é uma pergunta que normalmente analisamos caso a caso, olhando o seu perfil completo. ' +
        'Um especialista pode te orientar com mais segurança.';
    }
  }

  // 4) Enviar resposta via Z-API
  const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
  const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
  const ZAPI_SECURITY_TOKEN = process.env.ZAPI_SECURITY_TOKEN;

  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
    console.error('❌ Variáveis ZAPI_INSTANCE ou ZAPI_TOKEN não configuradas');
    return res.status(500).json({ error: 'Z-API não configurado no servidor' });
  }

  const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
  const payload = { phone, message: resposta };

  try {
    const response = await fetch(zapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_SECURITY_TOKEN
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      console.error('❌ Erro da API Z-API:', response.status, txt);
    } else {
      console.log(`✅ Resposta enviada para ${phone}`);
    }
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem Z-API:', err);
  }

  res.status(200).json({ received: true });
});

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));