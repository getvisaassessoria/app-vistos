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
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== SUPABASE CLIENT ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== MAPEAMENTOS E FUNÇÕES AUXILIARES ====================
const radioMapping = { /* (mantenha exatamente o mesmo do seu backup) */ };
function formatValue(fieldName, value) { /* (mantenha) */ }
function groupParallelArrays(data, nameField, relField) { /* (mantenha) */ }
function groupTravels(data) { /* (mantenha) */ }
function drawSeparator(doc) { /* (mantenha) */ }
const simpleFields = [ /* (mantenha o array completo do seu backup) */ ];

// ==================== ROTA DS-160 (RESPOSTA IMEDIATA + BACKGROUND) ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos (DS-160)');

  // 🔥 RESPOSTA IMEDIATA – evita timeout no navegador
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  // Processamento em segundo plano (não bloqueia a resposta)
  (async () => {
    try {
      // --- 1. Salvar no Supabase (opcional, mas mantido) ---
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

      // --- 2. Geração do PDF (código original completo) ---
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
            if (empInicios[i] || empFins[i]) linha += ` (${empInicios[i] || '?'} a ${empFins[i] || '?'})`;
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

      console.log(`📄 PDF gerado para ${nome}, tamanho: ${pdfBuffer.length} bytes`);

      // --- 3. Envio de e-mails (com anexo em base64) ---
      // E-mail para a equipe
      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `🇺🇸 DS-160: ${nome}`,
        html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo (${pdfBuffer.length} bytes).</p>`,
        attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe');

      // E-mail para o cliente (se houver)
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

      // Geração do PDF (mesmo código original)
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

      // Geração do PDF
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

      console.log(`📄 PDF gerado para visto negado (${nome}), tamanho: ${pdfBuffer.length} bytes`);

      // E-mail para equipe
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

      // E-mail para o cliente com resultado
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

// ==================== ROTA DE PING (MANTER SERVIDOR ACORDADO) ====================
app.get('/ping', (req, res) => {
  res.status(200).send('ok');
});

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));