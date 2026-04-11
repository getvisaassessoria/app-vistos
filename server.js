const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL');
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ==================== MAPEAMENTO DOS CAMPOS ====================
const fieldMapping = {
  // INFORMAÇÕES INICIAIS
  'consulado_cidade': 'Cidade do Consulado',
  'radio-26': 'Indicado por agência/agente?',
  'text-1': 'Nome da agência/agente',
  'text-64': 'Idioma usado para preencher',
  // DADOS PESSOAIS
  'name-1': 'Nome completo',
  'radio-2': 'Já teve outro nome?',
  'text-87': 'Nome anterior',
  'radio-3': 'Sexo',
  'select-4': 'Estado civil',
  'text-5': 'Data de nascimento',
  'text-7': 'Cidade de nascimento',
  'text-6': 'Estado/Província de nascimento',
  'text-95': 'País de nacionalidade',
  'text-86': 'CPF',
  'text-71': 'Logradouro (residencial)',
  'text-77': 'Telefone principal',
  'email-1': 'E-mail principal',
  'text-38': 'Número do passaporte',
  // INFORMAÇÕES DA VIAGEM
  'radio-28': 'Propósito da viagem',
  'text-21': 'Data de chegada prevista (EUA)',
  'text-34': 'Duração da estadia (dias)',
  'radio-6': 'Quem vai pagar a viagem?',
  // TRABALHO E EDUCAÇÃO
  'radio-27': 'Ocupação principal',
  'text-49': 'Empregador / escola',
  'text-51': 'Renda mensal (R$)',
  'text-52': 'Descrição das funções',
  'radio-17': 'Teve empregos anteriores?',
  'emprego_anterior_nome[]': 'Empregador anterior',
  'emprego_anterior_cargo[]': 'Cargo anterior',
  // SEGURANÇA
  'radio-34': 'Visto recusado ou entrada negada?',
  'text-100': 'Detalhes (recusado/negado)'
};

// Função para formatar e TRADUZIR os valores
function formatValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '(nenhum)';
  }
  
  const translations = {
    'one': 'Sim',
    'two': 'Não',
    'male': 'Masculino',
    'female': 'Feminino',
    'single': 'Solteiro(a)',
    'married': 'Casado(a)',
    'other': 'Outro'
  };

  return translations[value] || value || '(não informado)';
}

// ==================== ENDPOINT ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log("📥 Dados recebidos do formulário!");

  res.status(200).json({ success: true });

  try {
    const nome = data['name-1'] || 'Cliente_Sem_Nome';

    const pdfBuffer = await new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Cabeçalho
      doc.fillColor('#003366').fontSize(22).text('SOLICITAÇÃO DE VISTO DS-160', { align: 'center' });
      doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentação Consular', { align: 'center' });
      doc.moveDown(2);
      doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      // Loop de Impressão Corrigido
      for (const [fieldName, label] of Object.entries(fieldMapping)) {
        let value = data[fieldName];
        
        if (fieldName.includes('[]')) {
          const baseName = fieldName.replace('[]', '');
          value = data[fieldName] || data[baseName] || null;
        }
        
        if (value !== undefined && value !== null && value !== '') {
          const formattedValue = formatValue(value);
          if (formattedValue === '(não informado)') continue;

          // Rótulo - SEM continued: true para evitar sobreposição
          doc.fillColor('#003366').fontSize(10).font('Helvetica-Bold').text(`${label}:`);

          // Valor - Com largura definida para quebrar linha automaticamente
          doc.fillColor('#333333').font('Helvetica').text(formattedValue, {
            width: 450,
            align: 'left'
          });

          // Espaço entre campos
          doc.moveDown(0.5);
        }
      }

      doc.end();
    });

    // 2. Enviar e-mail com Resend
    const { error } = await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `🇺🇸 DS-160: ${nome}`,
      html: `<p><strong>Formulário DS-160 recebido do cliente:</strong> ${nome}</p>`,
      attachments: [
        {
          filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (error) console.error("❌ Erro no Resend:", error);
    else console.log("✅ E-mail enviado com sucesso!");

  } catch (err) {
    console.error("❌ Erro geral:", err);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});