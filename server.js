const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();

const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); 
const PORT = process.env.PORT || 10000;

// LIBERAÇÃO PARA O SITE
app.use(cors({
    origin: ['https://getvisa.com.br', 'https://www.getvisa.com.br'],
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

app.get('/health', (req, res) => res.status(200).send('OK'));

app.post('/api/submit-eta', async (req, res) => {
    const data = req.body;
    res.status(200).json({ success: true, message: 'Processando...' });

    try {
        const generatePDF = () => {
            return new Promise((resolve) => {
                const doc = new PDFDocument();
                let buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => resolve(Buffer.concat(buffers)));

                doc.fontSize(22).text('SOLICITAÇÃO eTA CANADÁ', { align: 'center' });
                doc.moveDown();
                doc.fontSize(12).text(`Data: ${new Date().toLocaleString('pt-BR')}`);
                doc.text(`Nome: ${data.firstName} ${data.lastName}`);
                doc.text(`Email: ${data.email}`);
                doc.text(`WhatsApp: ${data.phone}`);
                doc.end();
            });
        };

        const pdfBuffer = await generatePDF();

        await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>', 
            to: ['getvisa.assessoria@gmail.com'], 
            subject: `🍁 Novo Lead eTA: ${data.firstName} ${data.lastName}`,
            html: `<p>Novo lead de <b>${data.firstName}</b> recebido. Detalhes no PDF.</p>`,
            attachments: [{ filename: `Solicitacao_${data.firstName}.pdf`, content: pdfBuffer }],
        });

        console.log('✅ Enviado com sucesso.');
    } catch (error) {
        console.error('❌ Erro:', error);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Porta ${PORT}`));