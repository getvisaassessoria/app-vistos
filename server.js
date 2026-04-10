const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); 
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Aumentei o limite para aguentar suas 1000 linhas

app.get('/health', (req, res) => res.status(200).send('OK'));

app.post('/api/submit-ds160', async (req, res) => {
    const data = req.body;
    res.status(200).json({ success: true });

    try {
        const nomeCliente = data['name-1'] || data['nome_completo'] || 'Cliente GetVisa';
        const emailCliente = data['email-1'] || data['email_principal'] || null;

        const pdfBuffer = await new Promise((resolve) => {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            doc.fillColor('#0056b3').fontSize(22).text('RESUMO COMPLETO DS-160', { align: 'center' });
            doc.moveDown();
            
            // Aqui está a mágica: ele percorre TODAS as suas 1000 linhas
            doc.fontSize(10).fillColor('#333');
            for (const [key, value] of Object.entries(data)) {
                if (!['_wpnonce', 'ds160_submit', 'action'].includes(key) && value) {
                    doc.font('Helvetica-Bold').text(`${key}: `, { continued: true })
                       .font('Helvetica').text(`${value}`);
                    doc.moveDown(0.2);
                }
            }
            doc.end();
        });

        const destinatarios = ['getvisa.assessoria@gmail.com'];
        if (emailCliente) destinatarios.push(emailCliente);

        await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>',
            to: destinatarios,
            subject: `🇺🇸 Formulário Completo: ${nomeCliente}`,
            html: `<p>Segue em anexo o resumo das informações de <b>${nomeCliente}</b>.</p>`,
            attachments: [{ filename: `DS160_${nomeCliente}.pdf`, content: pdfBuffer }],
        });
    } catch (error) {
        console.error('Erro:', error);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor Pronto`));