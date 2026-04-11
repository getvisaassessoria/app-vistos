const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); // sua chave
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Mapeamento completo na ordem oficial do DS-160 (sem Security & Background)
const fieldMapping = [
  // INFORMAÇÕES INICIAIS (extras)
  { name: 'consulado_cidade', label: 'Cidade do Consulado' },
  { name: 'radio-26', label: 'Indicado por agência/agente?' },
  { name: 'text-1', label: 'Nome da agência/agente' },
  { name: 'text-64', label: 'Idioma usado para preencher' },

  // PERSONAL INFORMATION
  { name: 'name-1', label: 'Sobrenome (Surname)' },
  { name: 'name-1_given', label: 'Nomes dados (Given Names)' },
  { name: 'text-native', label: 'Nome completo em alfabeto nativo' },
  { name: 'radio-2', label: 'Já teve outro nome?' },
  { name: 'text-87', label: 'Nome anterior' },
  { name: 'radio-3', label: 'Sexo' },
  { name: 'text-5', label: 'Data de nascimento' },
  { name: 'text-7', label: 'Cidade de nascimento' },
  { name: 'text-6', label: 'Estado/Província de nascimento' },
  { name: 'text-95', label: 'País de nacionalidade' },
  { name: 'radio-outra-nac', label: 'Possui outra nacionalidade?' },
  { name: 'radio-residente', label: 'É residente permanente de outro país?' },
  { name: 'text-86', label: 'CPF' },
  { name: 'text-17', label: 'Número do Seguro Social (SSN)' },
  { name: 'text-18', label: 'Número do contribuinte dos EUA (TIN)' },

  // ADDRESS, PHONE, EMAIL
  { name: 'text-71', label: 'Logradouro (residencial)' },
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
  { name: 'radio-10', label: 'Usou outros números nos últimos 5 anos?' },
  { name: 'telefones_anteriores[]', label: 'Telefones anteriores' },
  { name: 'email-1', label: 'E-mail principal' },
  { name: 'radio-11', label: 'Usou outros e-mails nos últimos 5 anos?' },
  { name: 'emails_anteriores[]', label: 'E-mails anteriores' },
  { name: 'radio-12', label: 'Possui presença em mídias sociais?' },
  { name: 'midia_plataforma[]', label: 'Plataforma de mídia social' },
  { name: 'midia_identificador[]', label: 'Identificador' },

  // PASSPORT INFORMATION
  { name: 'text-38', label: 'Número do passaporte' },
  { name: 'text-40', label: 'País que emitiu' },
  { name: 'text-39', label: 'Cidade de emissão' },
  { name: 'text-88', label: 'Estado de emissão' },
  { name: 'text-66', label: 'Data de emissão' },
  { name: 'text-67', label: 'Data de validade' },
  { name: 'radio-13', label: 'Já teve passaporte perdido ou roubado?' },

  // TRAVEL INFORMATION
  { name: 'radio-28', label: 'Propósito da viagem' },
  { name: 'radio-planos', label: 'Tem planos específicos de viagem?' },
  { name: 'text-21', label: 'Data de chegada prevista' },
  { name: 'text-34', label: 'Duração da estadia (dias)' },
  { name: 'text-41', label: 'Endereço nos EUA' },
  { name: 'text-42', label: 'Cidade (EUA)' },
  { name: 'text-43', label: 'Estado (EUA)' },
  { name: 'email-4', label: 'CEP (EUA)' },
  { name: 'radio-6', label: 'Quem vai pagar a viagem?' },
  { name: 'text-22', label: 'Nome do pagador' },
  { name: 'text-25', label: 'Relacionamento com o pagador' },
  { name: 'phone-1', label: 'Telefone do pagador' },
  { name: 'text-24', label: 'E-mail do pagador' },
  { name: 'text-26', label: 'Endereço do pagador' },
  { name: 'text-27', label: 'Cidade do pagador' },
  { name: 'text-96', label: 'UF do pagador' },
  { name: 'text-29', label: 'CEP do pagador' },
  { name: 'text-30', label: 'País do pagador' },

  // TRAVEL COMPANIONS
  { name: 'radio-7', label: 'Há outras pessoas viajando com você?' },
  { name: 'acompanhante_nome[]', label: 'Nome do acompanhante' },
  { name: 'acompanhante_rel[]', label: 'Parentesco do acompanhante' },

  // PREVIOUS U.S. TRAVEL
  { name: 'radio-8', label: 'Já esteve nos EUA?' },
  { name: 'viagem_data[]', label: 'Data da viagem anterior (EUA)' },
  { name: 'viagem_duracao[]', label: 'Duração' },
  { name: 'viagem_periodo[]', label: 'Período' },
  { name: 'radio-23', label: 'Já teve visto americano?' },
  { name: 'text-35', label: 'Data de emissão do visto anterior' },
  { name: 'text-68', label: 'Número do visto anterior' },
  { name: 'text-69', label: 'Data de expiração' },
  { name: 'radio-33', label: 'Impressões digitais coletadas?' },
  { name: 'radio-29', label: 'Mesmo tipo de visto?' },
  { name: 'radio-30', label: 'Mesmo país de emissão?' },

  // U.S. POINT OF CONTACT
  { name: 'name-2', label: 'Nome do contato nos EUA' },
  { name: 'text-41_contato', label: 'Endereço do contato' },
  { name: 'text-42_contato', label: 'Cidade do contato' },
  { name: 'text-43_contato', label: 'Estado do contato' },
  { name: 'email-4_contato', label: 'CEP do contato' },
  { name: 'checkbox-15[]', label: 'Relacionamento com o contato' },
  { name: 'email-5', label: 'Telefone do contato' },
  { name: 'email-3', label: 'E-mail do contato' },

  // FAMILY INFORMATION
  { name: 'name-3', label: 'Sobrenome do pai' },
  { name: 'name-3_given', label: 'Nomes dados do pai' },
  { name: 'text-44', label: 'Data de nascimento do pai' },
  { name: 'radio-14', label: 'Pai está nos EUA?' },
  { name: 'checkbox-16[]', label: 'Status do pai' },
  { name: 'name-4', label: 'Sobrenome da mãe' },
  { name: 'name-4_given', label: 'Nomes dados da mãe' },
  { name: 'text-45', label: 'Data de nascimento da mãe' },
  { name: 'radio-15', label: 'Mãe está nos EUA?' },
  { name: 'checkbox-17[]', label: 'Status da mãe' },
  { name: 'radio-16', label: 'Parentes imediatos nos EUA (exceto pais)?' },
  { name: 'parente_nome[]', label: 'Nome do parente' },
  { name: 'parente_relacao[]', label: 'Parentesco' },
  { name: 'parente_status[]', label: 'Status do parente' },

  // SPOUSE
  { name: 'spouse-surname', label: 'Sobrenome do cônjuge' },
  { name: 'spouse-given', label: 'Nomes dados do cônjuge' },
  { name: 'spouse-dob', label: 'Data de nascimento do cônjuge' },
  { name: 'spouse-nationality', label: 'Nacionalidade do cônjuge' },
  { name: 'spouse-city', label: 'Cidade de nascimento do cônjuge' },
  { name: 'spouse-country', label: 'País de nascimento do cônjuge' },
  { name: 'spouse-address-same', label: 'Endereço do cônjuge (mesmo que o meu?)' },

  // PRESENT WORK/EDUCATION
  { name: 'radio-27', label: 'Ocupação principal' },
  { name: 'text-49', label: 'Empregador / escola' },
  { name: 'text-101', label: 'Endereço do trabalho/escola' },
  { name: 'text-102', label: 'Cidade' },
  { name: 'text-104', label: 'Estado' },
  { name: 'text-103', label: 'CEP' },
  { name: 'phone-8', label: 'Telefone' },
  { name: 'text-50', label: 'Data início' },
  { name: 'text-51', label: 'Renda mensal (R$)' },
  { name: 'text-52', label: 'Descrição das funções' },

  // PREVIOUS WORK/EDUCATION
  { name: 'radio-17', label: 'Teve empregos anteriores?' },
  { name: 'emprego_anterior_nome[]', label: 'Empregador anterior' },
  { name: 'emprego_anterior_cargo[]', label: 'Cargo anterior' },
  { name: 'emprego_anterior_inicio[]', label: 'Data início' },
  { name: 'emprego_anterior_fim[]', label: 'Data fim' },
  { name: 'radio-18', label: 'Escolaridade secundário/superior?' },
  { name: 'text-59', label: 'Instituição de ensino' },
  { name: 'text-60', label: 'Curso' },
  { name: 'text-111', label: 'Endereço da instituição' },
  { name: 'text-112', label: 'Cidade' },
  { name: 'text-114', label: 'Estado' },
  { name: 'text-113', label: 'CEP' },
  { name: 'text-61', label: 'Data início' },
  { name: 'text-62', label: 'Data conclusão' },

  // ADDITIONAL
  { name: 'radio-19', label: 'Fala outros idiomas?' },
  { name: 'idiomas[]', label: 'Outros idiomas' },
  { name: 'radio-20', label: 'Viajou para outros países (últimos 5 anos)?' },
  { name: 'paises_visitados[]', label: 'Países visitados' }
];

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(nenhum)';
  return value || '(não informado)';
}

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

      doc.fillColor('#003366').fontSize(22).text('SOLICITAÇÃO DE VISTO DS-160', { align: 'center' });
      doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentação Consular', { align: 'center' });
      doc.moveDown(2);
      doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      for (const field of fieldMapping) {
        let value = data[field.name];
        if (field.name.includes('[]')) {
          const base = field.name.replace('[]', '');
          value = data[field.name] || data[base] || null;
        }
        if (value !== undefined && value !== null && value !== '') {
          const formatted = formatValue(value);
          if (formatted !== '(não informado)') {
            doc.fillColor('#003366').fontSize(10).font('Helvetica-Bold').text(`${field.label}: `, { continued: true });
            doc.fillColor('#333333').font('Helvetica').text(formatted);
            doc.moveDown(0.4);
          }
        }
      }
      doc.end();
    });

    const { error } = await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `🇺🇸 DS-160: ${nome}`,
      html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo.</p>`,
      attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
    });

    if (error) console.error("❌ Erro no Resend:", error);
    else console.log("✅ E-mail enviado com sucesso!");

  } catch (err) {
    console.error("❌ Erro geral:", err);
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));