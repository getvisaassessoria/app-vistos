const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); // Substitua se necessário
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
  'text-17': 'Número do Seguro Social (SSN)',
  'text-18': 'Número do contribuinte dos EUA (TIN)',
  'text-71': 'Logradouro (residencial)',
  'text-72': 'Complemento (residencial)',
  'text-73': 'CEP (residencial)',
  'text-74': 'Cidade (residencial)',
  'text-75': 'Estado (residencial)',
  'text-76': 'País (residencial)',
  'radio-9': 'Endereço de correspondência é o mesmo?',
  'text-80': 'Logradouro (correspondência)',
  'text-81': 'Complemento (correspondência)',
  'text-82': 'CEP (correspondência)',
  'text-83': 'Cidade (correspondência)',
  'text-84': 'Estado (correspondência)',
  'text-85': 'País (correspondência)',
  'text-77': 'Telefone principal',
  'text-78': 'Telefone comercial',
  'radio-10': 'Usou outros números nos últimos 5 anos?',
  'telefones_anteriores[]': 'Telefones anteriores',
  'email-1': 'E-mail principal',
  'radio-11': 'Usou outros e-mails nos últimos 5 anos?',
  'emails_anteriores[]': 'E-mails anteriores',
  'radio-12': 'Possui presença em mídias sociais?',
  'midia_plataforma[]': 'Plataforma de mídia social',
  'midia_identificador[]': 'Identificador na mídia social',
  'text-38': 'Número do passaporte',
  'text-40': 'País que emitiu o passaporte',
  'text-39': 'Cidade de emissão',
  'text-88': 'Estado de emissão',
  'text-66': 'Data de emissão do passaporte',
  'text-67': 'Data de validade do passaporte',
  'radio-13': 'Já teve passaporte perdido ou roubado?',

  // INFORMAÇÕES DA VIAGEM
  'radio-28': 'Propósito da viagem',
  'text-21': 'Data de chegada prevista (EUA)',
  'text-34': 'Duração da estadia (dias)',
  'text-41': 'Endereço nos EUA',
  'text-42': 'Cidade (EUA)',
  'text-43': 'Estado (EUA)',
  'email-4': 'CEP (EUA)',
  'radio-6': 'Quem vai pagar a viagem?',
  'text-22': 'Nome do pagador',
  'text-25': 'Relacionamento com o pagador',
  'phone-1': 'Telefone do pagador',
  'text-24': 'E-mail do pagador',
  'text-26': 'Endereço do pagador',
  'text-27': 'Cidade do pagador',
  'text-96': 'UF do pagador',
  'text-29': 'CEP do pagador',
  'text-30': 'País do pagador',
  'radio-7': 'Há outras pessoas viajando com você?',
  'acompanhante_nome[]': 'Nome do acompanhante',
  'acompanhante_rel[]': 'Parentesco do acompanhante',
  'radio-8': 'Já viajou para os EUA?',
  'viagem_data[]': 'Data da viagem anterior (EUA)',
  'viagem_duracao[]': 'Duração da viagem anterior',
  'viagem_periodo[]': 'Período (dias/meses/anos)',
  'radio-23': 'Já teve visto americano?',
  'text-35': 'Data de emissão do visto anterior',
  'text-68': 'Número do visto anterior',
  'text-69': 'Data de expiração do visto anterior',
  'radio-33': 'Impressões digitais coletadas?',
  'radio-29': 'Mesmo tipo de visto?',
  'radio-30': 'Mesmo país de emissão?',

  // CONTATO NOS EUA
  'name-2': 'Nome do contato nos EUA',
  'text-41_contato': 'Endereço do contato (EUA)',
  'text-42_contato': 'Cidade do contato (EUA)',
  'text-43_contato': 'Estado do contato (EUA)',
  'email-4_contato': 'CEP do contato (EUA)',
  'checkbox-15[]': 'Relacionamento com o contato',
  'email-5': 'Telefone do contato (EUA)',
  'email-3': 'E-mail do contato (EUA)',

  // INFORMAÇÕES FAMILIARES
  'name-3': 'Nome do pai',
  'text-44': 'Data de nascimento do pai',
  'radio-14': 'Pai está nos EUA?',
  'checkbox-16[]': 'Status do pai nos EUA',
  'name-4': 'Nome da mãe',
  'text-45': 'Data de nascimento da mãe',
  'radio-15': 'Mãe está nos EUA?',
  'checkbox-17[]': 'Status da mãe nos EUA',
  'radio-16': 'Parentes imediatos nos EUA (exceto pais)?',
  'parente_nome[]': 'Nome do parente nos EUA',
  'parente_relacao[]': 'Parentesco',
  'parente_status[]': 'Status do parente',

  // TRABALHO, EDUCAÇÃO, IDIOMAS
  'radio-27': 'Ocupação principal',
  'text-49': 'Empregador / escola',
  'text-101': 'Endereço do trabalho/escola',
  'text-102': 'Cidade do trabalho/escola',
  'text-104': 'Estado do trabalho/escola',
  'text-103': 'CEP do trabalho/escola',
  'phone-8': 'Telefone do trabalho/escola',
  'text-50': 'Data de início',
  'text-51': 'Renda mensal (R$)',
  'text-52': 'Descrição das funções',
  'radio-17': 'Teve empregos anteriores?',
  'emprego_anterior_nome[]': 'Empregador anterior',
  'emprego_anterior_cargo[]': 'Cargo anterior',
  'emprego_anterior_inicio[]': 'Data início (emprego anterior)',
  'emprego_anterior_fim[]': 'Data fim (emprego anterior)',
  'radio-18': 'Escolaridade secundário/superior?',
  'text-59': 'Instituição de ensino',
  'text-60': 'Curso',
  'text-111': 'Endereço da instituição',
  'text-112': 'Cidade da instituição',
  'text-114': 'Estado da instituição',
  'text-113': 'CEP da instituição',
  'text-61': 'Data início (ensino)',
  'text-62': 'Data conclusão',
  'radio-19': 'Fala outros idiomas?',
  'idiomas[]': 'Outros idiomas',
  'radio-20': 'Viajou para outros países (últimos 5 anos)?',
  'paises_visitados[]': 'Países visitados',

  // SEGURANÇA
  'radio-31': 'Visto cancelado ou revogado?',
  'text-97': 'Detalhes (cancelado/revogado)',
  'radio-32': 'Visto perdido ou roubado?',
  'text-98': 'Detalhes (perdido/roubado)',
  'radio-34': 'Visto recusado ou entrada negada?',
  'text-100': 'Detalhes (recusado/negado)',
  'radio-35': 'Petição de imigração em seu nome?',
  'text-99': 'Detalhes (petição de imigração)'
};

// Função para formatar valores (especialmente arrays)
function formatValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '(nenhum)';
  }
  return value || '(não informado)';
}

// ==================== ENDPOINT ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log("📥 Dados recebidos do formulário!");

  // Resposta imediata para não travar o front-end
  res.status(200).json({ success: true });

  try {
    const nome = data['name-1'] || 'Cliente_Sem_Nome';

    // 1. Gerar PDF estruturado
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

      // Percorre o mapeamento na ordem definida
      for (const [fieldName, label] of Object.entries(fieldMapping)) {
        let value = data[fieldName];
        
        // Trata campos com arrays (ex: telefones_anteriores[])
        if (fieldName.includes('[]')) {
          const baseName = fieldName.replace('[]', '');
          // Tenta pegar o array diretamente ou via baseName + []
          value = data[fieldName] || data[baseName] || null;
        }
        
        if (value !== undefined && value !== null && value !== '') {
          const formattedValue = formatValue(value);
          // Pula se for "Não" ou vazio sem importância (opcional)
          if (formattedValue === '(não informado)') continue;
          
          doc.fillColor('#003366').fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true });
          doc.fillColor('#333333').font('Helvetica').text(formattedValue);
          doc.moveDown(0.4);
        }
      }

      doc.end();
    });

    // 2. Enviar e-mail com Resend
    const { error } = await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `🇺🇸 DS-160: ${nome}`,
      html: `<strong>Formulário DS-160 recebido.</strong><br>
             <p><strong>Cliente:</strong> ${nome}</p>
             <p>O PDF completo está em anexo.</p>`,
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
      console.log("✅ E-mail enviado com sucesso para getvisa.assessoria@gmail.com");
    }

  } catch (err) {
    console.error("❌ Erro geral no processamento:", err);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});