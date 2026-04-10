const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');

const app = express();

// Sua chave do Resend
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); 
const PORT = process.env.PORT || 10000;

// Configuração de CORS para a GetVisa
app.use(cors({
    origin: ['https://getvisa.com.br', 'https://www.getvisa.com.br', 'http://localhost:3000'],
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Rota de teste
app.get('/health', (req, res) => res.status(200).send('OK'));

// --- ROTA: eTA CANADÁ ---
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
        console.log('✅ eTA enviado com sucesso.');
    } catch (error) {
        console.error('❌ Erro eTA:', error);
    }
});

// --- ROTA: DS-160 ---
app.post('/api/submit-ds160', async (req, res) => {
    try {
        const formData = req.body;
        const protocolo = `DS${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

        res.status(200).json({ 
            success: true, 
            protocolo: protocolo, 
            message: 'Rascunho recebido! Você receberá um e-mail em breve.' 
        });

        const gerarPDFDS160 = (data, prot) => {
            return new Promise((resolve) => {
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                let chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));

                doc.fontSize(18).font('Helvetica-Bold').text('GETVISA - RASCUNHO DS-160', { align: 'center' });
                doc.fontSize(10).font('Helvetica').text(`Protocolo: ${prot}`, { align: 'center' }).moveDown();
                
                doc.fontSize(14).fillColor('#2a5298').text('INFORMAÇÕES PESSOAIS', { underline: true }).moveDown(0.5);
                doc.fontSize(10).fillColor('black').text(`Nome Completo: ${data.nome_completo || 'N/A'}`);
                doc.text(`E-mail: ${data.email || 'N/A'}`);
                doc.text(`Passaporte: ${data.passaporte_numero || 'N/A'}`);
                doc.text(`Data de Nascimento: ${data.data_nascimento || 'N/A'}`);
                
                doc.moveDown().fontSize(14).fillColor('#2a5298').text('DADOS DE VIAGEM', { underline: true }).moveDown(0.5);
                doc.fontSize(10).fillColor('black').text(`Propósito: ${data.proposito_viagem || 'N/A'}`);
                doc.text(`Renda Mensal: ${data.renda || 'N/A'}`);
                
                doc.end();
            });
        };

        const pdfBuffer = await gerarPDFDS160(formData, protocolo);

        await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>',
            to: ['getvisa.assessoria@gmail.com'],
            subject: `📋 NOVO DS-160: ${formData.nome_completo} (${protocolo})`,
            html: `<p>Novo rascunho de DS-160 recebido do cliente <b>${formData.nome_completo}</b>.</p>`,
            attachments: [{ filename: `DS160_${protocolo}.pdf`, content: pdfBuffer }]
        });

        console.log(`✅ DS-160 Processado: ${protocolo}`);
    } catch (error) {
        console.error('❌ Erro no DS-160:', error);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor GETVISA rodando na porta ${PORT}`));