const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();

// --- CONFIGURAÇÃO ---
const resend = new Resend('re_VoWevW7g_CiA9zS4qTrRxznKoKstm6oTw'); 
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Rota de saúde (Vital para o Render saber que o app está vivo)
app.get('/health', (req, res) => res.status(200).send('OK'));

app.post('/api/submit-eta', async (req, res) => {
    const data = req.body;
    console.log('📥 Novo formulário recebido de:', data.email);
    
    // Responde ao site na hora para o cliente não ficar esperando
    res.status(200).json({ success: true, message: 'Processando...' });

    try {
        // Gerador de PDF
        const generatePDF = () => {
            return new Promise((resolve) => {
                const doc = new PDFDocument();
                let buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => resolve(Buffer.concat(buffers)));

                doc.fontSize(22).text('SOLICITAÇÃO eTA CANADÁ', { align: 'center' });
                doc.moveDown();
                doc.fontSize(12).text(`Data: ${new Date().toLocaleString('pt-BR')}`);
                doc.text('-----------------------------------');
                doc.text(`Nome Completo: ${data.firstName} ${data.lastName}`);
                doc.text(`E-mail: ${data.email}`);
                doc.text(`WhatsApp: ${data.phone}`);
                doc.text(`Passaporte: ${data.passportNumber}`);
                doc.text(`País do Passaporte: ${data.passportIssueCountry}`);
                doc.moveDown();
                doc.text('Gerado automaticamente pelo sistema GetVisa.');
                doc.end();
            });
        };

        const pdfBuffer = await generatePDF();
        console.log('📄 PDF construído.');

        // Envio via API do Resend (Sem erros de timeout!)
        await resend.emails.send({
            from: 'GetVisa <onboarding@resend.dev>',
            to: ['getvisa.assessoria@gmail.com', data.email], // Envia para você e para o cliente
            subject: `🍁 Novo Lead eTA: ${data.firstName}`,
            html: `<h3>Nova solicitação recebida!</h3>
                   <p><b>Cliente:</b> ${data.firstName} ${data.lastName}</p>
                   <p><b>WhatsApp:</b> ${data.phone}</p>
                   <p>O rascunho completo está em anexo no PDF.</p>`,
            attachments: [
                {
                    filename: `Solicitacao_${data.firstName}.pdf`,
                    content: pdfBuffer,
                },
            ],
        });

        console.log('✅ Emails enviados com sucesso!');

    } catch (error) {
        console.error('❌ Erro no processamento:', error.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor GetVisa rodando na porta ${PORT}`);
});
