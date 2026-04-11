const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
// SUBSTITUA PELA SUA CHAVE SE ESSA NÃO FOR A MAIS ATUAL
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL'); 
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Para aguentar as mil linhas

app.post('/api/submit-ds160', async (req, res) => {
    const data = req.body;
    console.log("📥 Dados recebidos do formulário!");
    
    res.status(200).json({ success: true });

    try {
        const nome = data['name-1'] || 'Cliente_Sem_Nome';
        
        // 1. Criar o PDF
        const pdfBuffer = await new Promise((resolve) => {
            const doc = new PDFDocument();
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            
            doc.fontSize(20).text('DS-160 - GETVISA', { align: 'center' });
            doc.moveDown();
            
            // Loop automático por todos os campos do formulário
            Object.entries(data).forEach(([key, value]) => {
                if (value && !key.includes('nonce')) {
                    doc.fontSize(10).text(`${key}: ${value}`);
                }
            });
            doc.end();
        });

        // 2. Enviar via Resend
        const { error } = await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>',
            to: ['getvisa.assessoria@gmail.com'], // Coloque seu e-mail aqui
            subject: `🇺🇸 NOVO DS-160: ${nome}`,
            html: `<strong>Formulário recebido com sucesso.</strong> <p>O PDF está em anexo.</p>`,
            attachments: [
                {
                    filename: `DS160_${nome}.pdf`,
                    content: pdfBuffer,
                },
            ],
        });

        if (error) {
            console.error("❌ Erro no Resend:", error);
        } else {
            console.log("✅ E-mail enviado com sucesso!");
        }

    } catch (err) {
        console.error("❌ Erro Geral:", err);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
// teste de sincronizacao