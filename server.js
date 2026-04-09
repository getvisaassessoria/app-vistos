const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();

// --- CONFIGURAÇÃO ---
// Sua chave API atualizada
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); 
const PORT = process.env.PORT || 10000;

app.use(cors({
    origin: ['https://getvisa.com.br', 'https://www.getvisa.com.br'],
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Rota de saúde (Vital para o Render saber que o app está vivo)
app.get('/health', (req, res) => res.status(200).send('OK'));

app.post('/api/submit-eta', async (req, res) => {
    const data = req.body;
    console.log('📥 Novo formulário recebido de:', data.email);
    
    // Responde ao site imediatamente para não travar o formulário
    res.status(200).json({ success: true, message: 'Processando...' });

    try {
        // --- GERADOR DE PDF ---
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
                doc.text(`E-mail do Cliente: ${data.email}`);
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

        // --- ENVIO VIA RESEND (REVISADO) ---
        const response = await resend.emails.send({
            // Agora usamos seu domínio oficial verificado
            from: 'GetVisa <contato@getvisa.com.br>', 
            // Destinatário principal para você receber o lead
            to: ['getvisa.assessoria@gmail.com'], 
            subject: `🍁 Novo Lead eTA: ${data.firstName} ${data.lastName}`,
            html: `<h3>Nova solicitação recebida!</h3>
                   <p><b>Cliente:</b> ${data.firstName} ${data.lastName}</p>
                   <p><b>WhatsApp:</b> ${data.phone}</p>
                   <p><b>E-mail do Cliente:</b> ${data.email}</p>
                   <p>O rascunho completo com todos os dados está em anexo no PDF.</p>`,
            attachments: [
                {
                    filename: `Solicitacao_${data.firstName}.pdf`,
                    content: pdfBuffer,
                },
            ],
        });

        if (response.error) {
            console.error('❌ Resend retornou erro:', response.error);
        } else {
            console.log('✅ Email enviado com sucesso! ID:', response.data.id);
        }

    } catch (error) {
        console.error('❌ Erro crítico no servidor:', error);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor GetVisa rodando na porta ${PORT}`);
});
