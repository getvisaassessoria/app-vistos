const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 10000;

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
    console.error('❌ EMAIL_USER ou EMAIL_PASS não configurados');
} else {
    console.log(`✅ Email configurado: ${EMAIL_USER}`);
}

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send('Servidor DS-160 OK'));
app.get('/health', (req, res) => res.send('OK'));

app.post('/api/submit-ds160', async (req, res) => {
    console.log('📥 POST recebido');
    const data = req.body;
    res.json({ success: true });

    (async () => {
        try {
            const nome = data['name-1'] || 'Cliente';
            const emailCliente = data['email-1'] || null;
            const pdfBuffer = await gerarPDF(data);

            const destinatarios = ['getvisa.assessoria@gmail.com'];
            if (emailCliente) destinatarios.push(emailCliente);

            await transporter.sendMail({
                from: `"GetVisa" <${EMAIL_USER}>`,
                to: destinatarios.join(', '),
                subject: `DS-160: ${nome}`,
                html: `<p>Formulário de ${nome} anexo.</p>`,
                attachments: [{ filename: `DS160_${nome.replace(/\s/g, '_')}.pdf`, content: pdfBuffer }]
            });
            console.log('✅ E-mail enviado com sucesso');
        } catch (err) {
            console.error('❌ Erro ao enviar e-mail:', err);
        }
    })();
});

function gerarPDF(data) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 40 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.fontSize(18).text('Resumo DS-160', { align: 'center' });
        doc.moveDown();
        for (const [k, v] of Object.entries(data)) {
            if (v && !['_wpnonce','ds160_submit'].includes(k)) {
                doc.fontSize(10).text(`${k}: ${v}`);
                doc.moveDown(0.2);
            }
        }
        doc.end();
    });
}

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));