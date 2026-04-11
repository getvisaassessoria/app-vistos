const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 10000;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) console.error('❌ RESEND_API_KEY não configurada');
const resend = new Resend(RESEND_API_KEY);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('Servidor DS-160 OK'));
app.get('/health', (req, res) => res.send('OK'));

app.post('/api/submit-ds160', async (req, res) => {
    console.log('📥 POST /api/submit-ds160 recebido');
    const data = req.body;
    console.log('Dados:', JSON.stringify(data).substring(0, 300));

    res.status(200).json({ success: true, message: 'Recebido' });

    (async () => {
        try {
            const nomeCliente = data['name-1'] || 'Cliente';
            const emailCliente = data['email-1'] || null;

            const pdfBuffer = await gerarPDF(data);
            console.log(`PDF gerado (${pdfBuffer.length} bytes)`);

            const destinatarios = ['getvisa.assessoria@gmail.com'];
            if (emailCliente && emailCliente.includes('@')) destinatarios.push(emailCliente);

            const emailResult = await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: destinatarios,
                subject: `🇺🇸 Formulário DS-160 - ${nomeCliente}`,
                html: `<p>Segue em anexo o resumo do formulário de <b>${nomeCliente}</b>.</p>`,
                attachments: [{ filename: `DS160_${nomeCliente.replace(/\s/g, '_')}.pdf`, content: pdfBuffer }],
            });
            console.log('✅ E-mail enviado, ID:', emailResult.id);
        } catch (err) {
            console.error('❌ Erro no processamento:', err);
        }
    })();
});

function gerarPDF(data) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 40 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.fontSize(20).text('Resumo do Formulário DS-160', { align: 'center' });
        doc.moveDown();
        for (const [key, value] of Object.entries(data)) {
            if (value && !['_wpnonce', 'ds160_submit'].includes(key)) {
                doc.fontSize(10).text(`${key}: ${value}`);
                doc.moveDown(0.2);
            }
        }
        doc.end();
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Rota POST: /api/submit-ds160`);
});