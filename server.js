const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL');
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ==================== MAPEAMENTO COMPLETO DOS CAMPOS ====================
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
  
  // ACOMPANHANTES E VIAGENS ANTERIORES
  'radio-7': 'Há outras pessoas viajando com você?',
  'acompanhante_nome[]': 'Nome do acompanhante',
  'acompanhante_rel[]': 'Parentesco do acompanhante',
  'radio-8': 'Já viajou para os EUA?',
  'viagem_data[]': 'Data da viagem anterior (EUA)',
  'viagem_duracao[]': 'Duração da viagem anterior',
  
  // CONTATO NOS EUA
  'name-2': 'Nome do contato nos EUA',
  'email-5': 'Telefone do contato (EUA)',
  'email-3': 'E-mail do contato (EUA)',

  // INFORMAÇÕES FAMILIARES
  'name-3': 'Nome do pai',
  'text-44': 'Data de nascimento do pai',
  'name-4': 'Nome da mãe',
  'text-45': 'Data de nascimento da mãe',

  // TRABALHO E EDUCAÇÃO
  'radio-27': 'Ocupação principal',
  'text-49': 'Empregador / escola',
  'text-51': 'Renda mensal (R$)',
  'text-52': 'Descrição das funções',
  'radio-17': 'Teve empregos anteriores?',
  'emprego_anterior_nome[]': 'Empregador anterior',
  'emprego_anterior_cargo[]': 'Cargo anterior',
  
  // SEGURANÇA
  'radio-31': 'Visto cancelado ou revogado?',
  'radio-34': 'Visto recusado ou entrada negada?',
  'text-100': 'Detalhes (recusado/negado)',
  'radio-35': 'Petição de imigração em seu nome?'
};

// Função para formatar e TRADUZIR os valores técnicos do formulário
function formatValue(value) {
  if (Array.isArray(value)) {
    // Filtra valores vazios e junta com vírgula
    const filtered = value.filter(v => v && v.trim() !== '');
    return filtered.length ? filtered.join(', ') : '(nenhum)';
  }
  
  const translations = {
    'one': 'Sim',
    'two': 'Não',
    'male': 'Masculino',
    'female': 'Feminino',
    'single': 'Solteiro(a)',
    'married': 'Casado(a)',
    'divorced': 'Divorciado(a)',
    'widowed': 'Viúvo(a)',
    'other': 'Outro'
  };

  return translations[value] || value || '(não informado)';
}

// ==================== ENDPOINT ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log("📥 Dados recebidos do formulário!");

  // Responde rápido ao WordPress para evitar timeout
  res.status(200).json({ success: true });

  try {
    const nome = data['name-1'] || 'Cliente_Sem_Nome';

    const pdfBuffer = await new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // --- CABEÇALHO ---
      doc.fillColor('#003366').fontSize(22).font('Helvetica-Bold').text('SOLICITAÇÃO DE VISTO DS-160', { align: 'center' });
      doc.fontSize(12).fillColor('#666666').font('Helvetica').text('Assessoria GetVisa - Documentação Consular', { align: 'center' });
      doc.moveDown(1.5);
      doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      // --- LOOP DE IMPRESSÃO ---
      for (const [fieldName, label] of Object.entries(fieldMapping)) {
        let value = data[fieldName];
        
        // Lógica para capturar campos de array (como os que terminam em [])
        if (fieldName.includes('[]')) {
          const baseName = fieldName.replace('[]', '');
          value = data[fieldName] || data[baseName] || null;
        }
        
        // Só imprime se houver valor
        if (value !== undefined && value !== null && value !== '' && value !== ' ') {
          const formattedValue = formatValue(value);
          if (formattedValue === '(não informado)' || formattedValue === '(nenhum)') continue;

          // Estética: Se for um "Título de Seção", dá um espaço maior
          if (['name-1', 'radio-28', 'name-2', 'name-3', 'radio-27', 'radio-31'].includes(fieldName)) {
            doc.moveDown(1);
            doc.strokeColor('#eeeeee').moveTo(50, doc.y).lineTo(200, doc.y).stroke();
            doc.moveDown(0.5);
          }

          // Rótulo (Label)
          doc.fillColor('#003366').fontSize(10).font('Helvetica-Bold').text(`${label}:`);

          // Valor (Texto preenchido)
          doc.fillColor('#333333').font('Helvetica').text(formattedValue, {
            width: 450,
            align: 'left'
          });

          // Espaço entre linhas
          doc.moveDown(0.6);
        }
      }

      // Rodapé com data
      doc.fontSize(8).fillColor('#999999').text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 50, 750, { align: 'center' });

      doc.end();
    });

    // --- ENVIO DO E-MAIL ---
    const { error } = await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `🇺🇸 DS-160: ${nome}`,
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2 style="color: #003366;">Novo Formulário Recebido</h2>
          <p><strong>Cliente:</strong> ${nome}</p>
          <p>Os dados completos foram processados e estão anexados em formato PDF.</p>
          <hr style="border: 0; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #999;">Sistema Automático GetVisa</p>
        </div>
      `,
      attachments: [
        {
          filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (error) {
      console.error("❌ Erro no Resend:", error);
    } else {
      console.log(`✅ E-mail enviado com sucesso para GetVisa (Cliente: ${nome})`);
    }

  } catch (err) {
    console.error("❌ Erro geral no processamento:", err);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor GetVisa rodando na porta ${PORT}`);
});