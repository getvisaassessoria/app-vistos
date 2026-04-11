const nodemailer = require('nodemailer');

const EMAIL_USER = 'getvisa.assessoria@gmail.com';
const EMAIL_PASS = 'SUA_SENHA_DE_APLICATIVO_AQUI';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

transporter.sendMail({
    from: `"Teste" <${EMAIL_USER}>`,
    to: 'getvisa.assessoria@gmail.com',
    subject: 'Teste de envio',
    html: '<p>Funcionou?</p>'
}).then(() => console.log('Enviado')).catch(err => console.error('Erro:', err));