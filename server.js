const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 10000;

// ⚠️ NUNCA coloque a chave diretamente no código. Use variável de ambiente.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
    console.error('❌ ERRO: Variável de ambiente RESEND_API_KEY não definida.');
    process.exit(1);
}
const resend = new Resend(RESEND_API_KEY);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Endpoint de saúde para evitar spin down (opcional)
app.get('/health', (req, res) => res.status(200).send('OK'));

// Endpoint principal
app.post('/api/submit-ds160', async (req, res) => {
    const data = req.body;
    console.log(`📥 Requisição recebida de: ${data['name-1'] || 'anônimo'}`);

    // Primeiro, responder imediatamente para não travar o WordPress
    // Mas o WordPress precisa saber se deu certo? Vamos responder após processar, porém com timeout curto.
    // Como a geração do PDF pode levar alguns segundos, vamos processar de forma síncrona mas com resposta rápida.
    // Para não perder a conexão, fazemos tudo e depois respondemos.
    
    try {
        // 1. Gerar PDF
        const pdfBuffer = await gerarPDF(data);
        console.log(`✅ PDF gerado (${pdfBuffer.length} bytes)`);

        // 2. Definir destinatários
        const nomeCliente = data['name-1'] || 'Cliente';
        const emailCliente = data['email-1'] || null;
        const destinatarios = ['getvisa.assessoria@gmail.com'];
        if (emailCliente && emailCliente.includes('@')) {
            destinatarios.push(emailCliente);
        }
        console.log(`📧 Enviando e-mail para: ${destinatarios.join(', ')}`);

        // 3. Enviar e-mail via Resend
        const emailResult = await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>',
            to: destinatarios,
            subject: `🇺🇸 Formulário DS-160 - ${nomeCliente}`,
            html: `<p>Olá, <strong>${nomeCliente}</strong>!</p>
                   <p>Recebemos seu pré-cadastro do formulário DS-160. Segue em anexo o resumo das informações enviadas.</p>
                   <p>A equipe GetVisa entrará em contato em breve para dar continuidade ao processo.</p>
                   <br/><p>Atenciosamente,<br/>Equipe GetVisa</p>`,
            attachments: [
                {
                    filename: `DS160_${nomeCliente.replace(/\s/g, '_')}.pdf`,
                    content: pdfBuffer,
                },
            ],
        });

        console.log(`✅ E-mail enviado com sucesso. ID: ${emailResult.id}`);
        res.status(200).json({ success: true, message: 'Formulário recebido e e-mail enviado.' });

    } catch (error) {
        console.error('❌ Erro no processamento:', error);
        // Mesmo com erro, retornamos 200 para o WordPress (para não mostrar erro ao usuário)
        // mas registramos internamente. Se quiser que o WordPress saiba, pode retornar 500.
        res.status(500).json({ success: false, error: error.message });
    }
});

// Função para gerar PDF a partir dos dados
function gerarPDF(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // Cabeçalho
            doc.fillColor('#0056b3').fontSize(22).text('RESUMO COMPLETO DS-160', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).fillColor('#333333');

            // Lista todos os campos recebidos (exceto alguns técnicos)
            let contador = 0;
            for (const [key, value] of Object.entries(data)) {
                if (['_wpnonce', 'ds160_submit', 'action'].includes(key)) continue;
                if (!value || (typeof value === 'string' && value.trim() === '')) continue;
                
                // Formata o nome do campo para exibição
                const nomeCampo = key.replace(/_/g, ' ').replace(/-/g, ' ').toUpperCase();
                doc.font('Helvetica-Bold').text(`${nomeCampo}: `, { continued: true })
                   .font('Helvetica').text(`${value}`);
                doc.moveDown(0.2);
                contador++;
            }

            if (contador === 0) {
                doc.text('Nenhum dado enviado.');
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📧 Resend API Key configurada: ${RESEND_API_KEY ? 'Sim' : 'Não'}`);
});