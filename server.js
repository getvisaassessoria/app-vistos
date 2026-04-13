const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); // sua chave
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Mapeamento completo (compatível com o functions.php atual)
const fieldMapping = [
  // INFORMAÇÕES INICIAIS
  { name: 'consulado_cidade', label: 'Cidade do Consulado' },
  { name: 'radio-26', label: 'Indicado por agência/agente?' },
  { name: 'text-1', label: 'Nome da agência/agente' },
  { name: 'text-64', label: 'Idioma usado para preencher' },

  // DADOS PESSOAIS
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

  // VIAGEM
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

  // ACOMPANHANTES
  { name: 'radio-7', label: 'Acompanhantes?' },
  { name: 'acompanhante_nome[]', label: 'Nome do acompanhante' },
  { name: 'acompanhante_rel[]', label: 'Parentesco' },

  // VIAGENS ANTERIORES AOS EUA
  { name: 'radio-8', label: 'Já esteve nos EUA?' },
  { name: 'viagem_data[]', label: 'Data da viagem (EUA)' },
  { name: 'viagem_duracao[]', label: 'Duração (dias)' },
  { name: 'radio-23', label: 'Já teve visto americano?' },
  { name: 'text-35', label: 'Data de emissão do visto' },
  { name: 'text-68', label: 'Número do visto' },
  { name: 'text-69', label: 'Data de expiração' },
  { name: 'radio-33', label: 'Impressões digitais coletadas?' },
  { name: 'radio-29', label: 'Mesmo tipo de visto?' },
  { name: 'radio-30', label: 'Mesmo país de emissão?' },

  // ENDEREÇO E TELEFONE
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
  { name: 'telefones_anteriores[]', label: 'Telefones anteriores' },
  { name: 'email-1', label: 'E-mail principal' },
  { name: 'radio-11', label: 'Usou outros e-mails?' },
  { name: 'emails_anteriores[]', label: 'E-mails anteriores' },
  { name: 'radio-12', label: 'Presença em mídias sociais?' },
  { name: 'midia_plataforma[]', label: 'Plataforma' },
  { name: 'midia_identificador[]', label: 'Identificador' },

  // PASSAPORTE
  { name: 'text-38', label: 'Número do passaporte' },
  { name: 'text-40', label: 'País que emitiu' },
  { name: 'text-39', label: 'Cidade de emissão' },
  { name: 'text-88', label: 'Estado de emissão' },
  { name: 'text-66', label: 'Data de emissão' },
  { name: 'text-67', label: 'Data de validade' },
  { name: 'radio-13', label: 'Passaporte perdido/roubado?' },

  // CONTATO NOS EUA
  { name: 'name-2', label: 'Contato nos EUA (nome)' },
  { name: 'text-41_contato', label: 'Endereço (EUA)' },
  { name: 'text-42_contato', label: 'Cidade (EUA)' },
  { name: 'text-43_contato', label: 'Estado (EUA)' },
  { name: 'email-4_contato', label: 'CEP (EUA)' },
  { name: 'checkbox-15[]', label: 'Relacionamento com contato' },
  { name: 'email-5', label: 'Telefone do contato (EUA)' },
  { name: 'email-3', label: 'E-mail do contato (EUA)' },

  // FAMILIARES
  { name: 'nome_pai', label: 'Nome do pai' },
  { name: 'text-44', label: 'Data de nascimento do pai' },
  { name: 'radio-14', label: 'Pai nos EUA?' },
  { name: 'checkbox-16[]', label: 'Status do pai' },
  { name: 'nome_mae', label: 'Nome da mãe' },
  { name: 'text-45', label: 'Data de nascimento da mãe' },
  { name: 'radio-15', label: 'Mãe nos EUA?' },
  { name: 'checkbox-17[]', label: 'Status da mãe' },
  { name: 'radio-16', label: 'Parentes imediatos nos EUA?' },
  { name: 'parente_nome[]', label: 'Nome do parente' },
  { name: 'parente_relacao[]', label: 'Parentesco' },
  { name: 'parente_status[]', label: 'Status do parente' },

  // CÔNJUGE (casado)
  { name: 'spouse_fullname', label: 'Nome do cônjuge' },
  { name: 'spouse-dob', label: 'Data de nascimento do cônjuge' },
  { name: 'spouse-nationality', label: 'Nacionalidade do cônjuge' },
  { name: 'spouse-city', label: 'Cidade de nascimento do cônjuge' },
  { name: 'spouse-country', label: 'País de nascimento do cônjuge' },
  { name: 'spouse-address-same', label: 'Endereço do cônjuge (mesmo que o meu?)' },
  { name: 'spouse_endereco', label: 'Endereço do cônjuge (diferente)' },
  { name: 'spouse_cidade', label: 'Cidade do cônjuge' },
  { name: 'spouse_estado', label: 'Estado do cônjuge' },
  { name: 'spouse_cep', label: 'CEP do cônjuge' },
  { name: 'spouse_pais', label: 'País do cônjuge' },

  // DIVORCIADO
  { name: 'ex_fullname', label: 'Nome do ex‑cônjuge' },
  { name: 'ex_dob', label: 'Data de nascimento' },
  { name: 'ex_nationality', label: 'Nacionalidade' },
  { name: 'ex_city', label: 'Cidade de nascimento' },
  { name: 'ex_country', label: 'País de nascimento' },
  { name: 'data_casamento_div', label: 'Data do Casamento' },
  { name: 'data_divorcio', label: 'Data do Divórcio' },
  { name: 'cidade_divorcio', label: 'Cidade do Divórcio' },
  { name: 'como_divorcio', label: 'Como se deu o Divórcio' },

  // VIÚVO
  { name: 'falecido_fullname', label: 'Nome do cônjuge falecido' },
  { name: 'falecido_dob', label: 'Data de nascimento' },
  { name: 'falecido_nationality', label: 'Nacionalidade' },
  { name: 'falecido_city', label: 'Cidade de nascimento' },
  { name: 'falecido_country', label: 'País de nascimento' },
  { name: 'data_casamento_viuvo', label: 'Data do Casamento' },
  { name: 'data_falecimento', label: 'Data do Falecimento' },

  // TRABALHO/EDUCAÇÃO
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
  { name: 'emprego_anterior_nome[]', label: 'Empregador anterior' },
  { name: 'emprego_anterior_cargo[]', label: 'Cargo anterior' },
  { name: 'emprego_anterior_inicio[]', label: 'Data início (emprego anterior)' },
  { name: 'emprego_anterior_fim[]', label: 'Data saída' },
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
  { name: 'idiomas[]', label: 'Outros idiomas' },
  { name: 'radio-20', label: 'Viajou para outros países?' },
  { name: 'paises_visitados[]', label: 'Países visitados' }
];

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(nenhum)';
  return value || '(não informado)';
}

app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos');
  res.status(200).json({ success: true });

  try {
    const nome = data['full_name'] || 'Cliente_Sem_Nome';

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
      doc.moveDown(1); // Espaço após a linha

      // Percorre os campos
      for (const field of fieldMapping) {
        let value = data[field.name];
        if (field.name.includes('[]')) {
          const base = field.name.replace('[]', '');
          value = data[field.name] || data[base] || null;
        }
        if (value !== undefined && value !== null && value !== '') {
          const formatted = formatValue(value);
          if (formatted !== '(não informado)') {
            // Label em negrito, valor normal, ambos na mesma linha
            doc.font('Helvetica-Bold').fontSize(10).text(`${field.label}: `, { continued: true });
            doc.font('Helvetica').text(formatted);
            doc.moveDown(0.6); // Espaçamento vertical adequado (antes era 0.4)
          }
        }
      }

      // Rodapé simples (opcional)
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999999').text('Documento gerado automaticamente pelo sistema GetVisa.', { align: 'center' });

      doc.end();
    });

    const { error } = await resend.emails.send({
      from: 'GetVisa <contato@getvisa.com.br>',
      to: ['getvisa.assessoria@gmail.com'],
      subject: `🇺🇸 DS-160: ${nome}`,
      html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>PDF em anexo.</p>`,
      attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer }]
    });

    if (error) console.error('❌ Erro no Resend:', error);
    else console.log('✅ E-mail enviado com sucesso!');
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));