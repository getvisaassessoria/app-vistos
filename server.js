const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const resend = new Resend('re_EDi3taB6_9UAiyMMCoHs7bdtWoxibFKWL');
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public')); 

// ==================== SUPABASE CLIENT ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== PROTEÇÃO CONTRA ATAQUE ====================
const requestCounts = new Map();
const emailRateLimits = new Map();
const BLOCKED_IPS = new Set();

function getRealIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',');
        return ips[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

// ==================== BLOQUEIO DE BOTS ====================
app.use((req, res, next) => {
    const ip = getRealIp(req);
    const userAgent = req.headers['user-agent'] || '';
    
    const userAgentsBloqueados = [
        'python-requests', 'curl', 'wget', 'Go-http-client', 
        'Java', 'okhttp', 'Apache-HttpClient', 'Scrapy'
    ];
    
    for (const bot of userAgentsBloqueados) {
        if (userAgent.toLowerCase().includes(bot.toLowerCase())) {
            console.log(`🚨 BOT BLOQUEADO: IP ${ip} - User-Agent: ${userAgent}`);
            return res.status(403).json({ error: 'Acesso negado' });
        }
    }
    
    next();
});


app.use((req, res, next) => {
    const ip = getRealIp(req);
    
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return next();
    }
    
    if (BLOCKED_IPS.has(ip)) {
        console.log(`🚨 BLOQUEADO PERMANENTE: IP ${ip} tentou acessar`);
        return res.status(403).json({ error: 'Acesso bloqueado. Contate o suporte.' });
    }
    
    const now = Date.now();
    const minuteKey = Math.floor(now / 60000);
    const key = `${ip}:${minuteKey}`;
    
    const currentCount = (requestCounts.get(key) || 0) + 1;
    requestCounts.set(key, currentCount);
    
    setTimeout(() => {
        for (const k of requestCounts.keys()) {
            const kMinute = parseInt(k.split(':')[1]);
            if (kMinute < minuteKey - 1) {
                requestCounts.delete(k);
            }
        }
    }, 60000);
    
    if (currentCount > 20) {
        console.log(`🚨 BLOQUEADO TEMPORÁRIO: IP ${ip} fez ${currentCount} req/min`);
        
        const blockKey = `block:${ip}`;
        const blockCount = (requestCounts.get(blockKey) || 0) + 1;
        requestCounts.set(blockKey, blockCount);
        
        if (blockCount >= 3) {
            BLOCKED_IPS.add(ip);
            console.log(`🔥 IP ${ip} foi BANIDO PERMANENTEMENTE por reincidência`);
        }
        
        return res.status(429).json({ 
            error: 'Muitas requisições. Tente novamente em alguns minutos.' 
        });
    }
    
    next();
});

function checkEmailRateLimit(ip, routeName) {
    const now = Date.now();
    const minuteKey = Math.floor(now / 60000);
    const key = `${routeName}:${ip}:${minuteKey}`;
    
    const currentCount = (emailRateLimits.get(key) || 0) + 1;
    emailRateLimits.set(key, currentCount);
    
    setTimeout(() => {
        for (const k of emailRateLimits.keys()) {
            const kMinute = parseInt(k.split(':')[2]);
            if (kMinute < minuteKey - 1) {
                emailRateLimits.delete(k);
            }
        }
    }, 60000);
    
    return currentCount <= 2;
}

const protectedRoutes = [
    '/api/submit-ds160', 
    '/api/submit-passaporte', 
    '/api/submit-avaliacao', 
    '/api/submit-simulador', 
    '/api/submit-visto-negado',
    '/api/submit-australia' 
    
];

app.use((req, res, next) => {
    if (protectedRoutes.includes(req.path)) {
        const ip = getRealIp(req);
        
        if (!checkEmailRateLimit(ip, req.path)) {
            console.log(`🚨 BLOQUEADO ROTA EMAIL: IP ${ip} excedeu limite na ${req.path}`);
            
            const suspectKey = `suspect:${ip}`;
            const suspectCount = (requestCounts.get(suspectKey) || 0) + 1;
            requestCounts.set(suspectKey, suspectCount);
            
            if (suspectCount >= 5) {
                BLOCKED_IPS.add(ip);
                console.log(`🔥 IP ${ip} BANIDO por abuso nas rotas de e-mail`);
            }
            
            return res.status(429).json({ 
                error: 'Limite de envios excedido. Tente novamente em alguns minutos.' 
            });
        }
    }
    next();
});

// ==================== VALIDAÇÃO DE E-MAIL MAIS RESTRITIVA ====================
const DOMINIOS_PERMITIDOS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'hotmail.com.br',
    'uol.com.br', 'bol.com.br', 'ig.com.br', 'terra.com.br', 'getvisa.com.br',
    'yahoo.com.br', 'icloud.com', 'me.com', 'live.com', 'msn.com'
];

const DOMINIOS_BLOQUEADOS = [
    'mailxw.com', 'hmga.com', 'hmgma.com', 'rogers.com', 'hotmail.co.uk',
    'aol.com', 'mail.com', 'yandex.com', 'protonmail.com', 'gmx.com',
    'web.de', 'btinternet.com', 'icloud.com.br'
];

const EMAILS_BLOQUEADOS = [
    'phillipratylor29@gmail.com',
    'davidjonietz@gmail.com',
    'faisal.johnson@hmga.com',
    'faisal.johnson@hmgma.com',
    'c_kropp@rogers.com',
    'dillionhanks18@gmail.com',
    'achanna20@hotmail.com',
    'bobdabdoubs@gmail.com',
    'onemoniquekee@yahoo.com'
];

const NOMES_SUSPEITOS = [
    'ynkytywzkgtg', 'vajtprvputmy', 'gmdkjrwqgnkx', 'oenehsthzwwz', 
    'mdtxwelltidxh', 'test', 'fake', 'spam', 'hacker', 'admin'
];

function isEmailClienteValido(email, nomeCliente) {
    if (!email || typeof email !== 'string') {
        console.log(`🚨 E-mail inválido: ${email}`);
        return false;
    }
    
    const emailLower = email.toLowerCase().trim();
    const nomeLower = (nomeCliente || '').toLowerCase().trim();
    
    if (EMAILS_BLOQUEADOS.includes(emailLower)) {
        console.log(`🚨 E-mail na LISTA NEGRA bloqueado: ${email}`);
        return false;
    }
    
    const dominio = emailLower.split('@')[1];
    if (!dominio) {
        console.log(`🚨 E-mail sem domínio: ${email}`);
        return false;
    }
    
    if (DOMINIOS_BLOQUEADOS.includes(dominio)) {
        console.log(`🚨 Domínio bloqueado: ${email}`);
        return false;
    }
    
    const isDominioPermitido = DOMINIOS_PERMITIDOS.some(d => dominio === d);
    if (!isDominioPermitido) {
        console.log(`🚨 Domínio não permitido: ${email} - apenas e-mails nacionais são aceitos`);
        return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        console.log(`🚨 Formato de e-mail inválido: ${email}`);
        return false;
    }
    
    for (const suspeito of NOMES_SUSPEITOS) {
        if (nomeLower.includes(suspeito) || emailLower.includes(suspeito)) {
            console.log(`🚨 Padrão suspeito detectado - Nome: ${nomeCliente}, Email: ${email}`);
            return false;
        }
    }
    
    if (nomeLower.length < 3) {
        console.log(`🚨 Nome muito curto: ${nomeCliente}`);
        return false;
    }
    
    const nomeSemEspacos = nomeLower.replace(/\s/g, '');
    const temVogal = /[aeiou]/.test(nomeSemEspacos);
    if (!temVogal && nomeSemEspacos.length > 5) {
        console.log(`🚨 Nome sem vogais (padrão aleatório): ${nomeCliente}`);
        return false;
    }
    
    console.log(`✅ E-mail válido: ${email}`);
    return true;
}

// ==================== FUNÇÃO AUXILIAR PARA ENVIAR WHATSAPP ====================
async function enviarWhatsApp(telefone, mensagem) {
  try {
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    const securityToken = process.env.ZAPI_SECURITY_TOKEN;
    
    if (!instance || !token) {
      console.log('⚠️ Z-API não configurada');
      return false;
    }
    
    const cleanPhone = telefone.toString().replace(/\D/g, '');
    const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': securityToken || ''
      },
      body: JSON.stringify({ phone: cleanPhone, message: mensagem })
    });
    
    console.log(`📱 WhatsApp enviado para ${cleanPhone}: ${response.status}`);
    return response.status === 200;
  } catch (error) {
    console.error('❌ Erro ao enviar WhatsApp:', error.message);
    return false;
  }
}

// ==================== FUNÇÃO DE RESPOSTA HUMANIZADA ====================
// ==================== FUNÇÃO DE RESPOSTA HUMANIZADA ====================
function gerarRespostaHumanizada(primeiroNome, classificacao, situacao, renda, historico, motivo, score) {
  
  if (classificacao === 'Requer Atenção') {
    if (situacao.includes('Desempregado') && renda === 'Até R$ 3.000' && historico.includes('Nunca viajei')) {
      if (motivo && motivo.includes('Estudos')) {
        return `🗣️ Olá, ${primeiroNome}! Tudo bem? Vi que seu sonho é fazer intercâmbio, mas seu perfil atual (desempregado, sem renda fixa e sem experiência internacional) é o que o Consulado mais questiona. A boa notícia é que podemos construir uma estratégia sólida com documentação alternativa. Vamos juntos transformar essa dificuldade em um caso bem apresentado.

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
      }
      if (motivo && motivo.includes('Turismo')) {
        return `🤔 Olá, ${primeiroNome}! Viajar a lazer é um sonho, mas seu momento profissional atual e a falta de histórico internacional exigem uma preparação muito cuidadosa. Minha sugestão é primeiro fortalecer sua situação profissional antes de aplicar. Posso te orientar sobre o que fazer para construir um perfil mais sólido nos próximos meses.

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
      }
    }
    
    if (situacao.includes('CLT') && situacao.includes('menos de 1 ano')) {
      return `📌 Olá, ${primeiroNome}! Você tem um emprego recente, o que é positivo, mas o tempo curto na empresa pode levantar dúvidas. Vamos focar em: carta da empresa evidenciando estabilidade + comprovantes de vínculos familiares. Com planejamento, seu perfil pode evoluir muito.

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
    }
    
    if (situacao.includes('Autônomo')) {
      return `📊 Olá, ${primeiroNome}! Como autônomo, o Consulado precisa ver organização financeira. Vamos preparar: extratos detalhados, declaração de IR e contratos. Mesmo com desafios, é possível construir um bom caso.

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
    }
    
    return `⚠️ Olá, ${primeiroNome}! Seu perfil foi classificado como "Requer Atenção". Vamos trabalhar juntos para fortalecer seus vínculos com o Brasil e organizar sua documentação da melhor forma possível.

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
  }
  
  if (classificacao === 'Perfil Regular') {
    if (situacao.includes('Autônomo') && historico.includes('Tenho visto para outros países')) {
      return `💼 Olá, ${primeiroNome}! Excelente! Seu perfil combina pontos fortes: experiência internacional e atuação como autônomo. Vamos organizar sua documentação financeira e comercial para que o Consulado veja solidez. Com esse perfil, sua aprovação tem tudo para acontecer.

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
    }
    
    if (situacao.includes('Estudante') && historico.includes('Nunca viajei')) {
      return `📚 Olá, ${primeiroNome}! Fazer intercâmbio é incrível, mas seu perfil precisa de uma estrutura forte. Sua aprovação virá da documentação dos seus patrocinadores + comprovante de matrícula + planejamento de retorno ao Brasil. Posso te ajudar a organizar esse caso?

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
    }
    
    if (situacao.includes('CLT') && situacao.includes('menos de 1 ano')) {
      return `🌟 Olá, ${primeiroNome}! Você tem um bom ponto de partida: emprego recente e renda estável. O que precisa de atenção é o tempo curto na empresa. Vamos focar em: carta da empresa evidenciando potencial de crescimento + comprovantes de vínculos familiares. Com isso, seu perfil fica muito mais seguro.

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
    }
    
    return `🌟 Olá, ${primeiroNome}! Seu perfil foi classificado como "Perfil Regular". Temos aspectos positivos, mas também alguns pontos que merecem atenção. Com o preparo certo, você chega ao consulado em uma posição mais sólida.

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
  }
  
  if (classificacao === 'Potencial Moderado') {
    if (situacao.includes('CLT') && renda === 'Acima de R$ 15.000') {
      return `✨ Olá, ${primeiroNome}! Seu perfil está muito bom! Emprego estável e boa renda. Meu papel será garantir que sua documentação esteja perfeita e que você esteja 100% preparado para a entrevista. Vamos nessa?

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
    }
    
    if (situacao.includes('Empresário') && historico.includes('Já possuo visto americano')) {
      return `🏆 Olá, ${primeiroNome}! Uau, seu perfil é dos mais fortes! Empresário consolidado, e já com visto americano. A chave será atualizar corretamente seu DS-160 e alinhar sua entrevista com seus planos de negócios. Praticamente uma formalidade. Quer que eu cuide de tudo para você?

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

Estamos juntos! 🚀`;
    }
    
    return `📈 Olá, ${primeiroNome}! Seu perfil foi classificado como "Potencial Moderado". Você tem uma base sólida, e com os ajustes certos na documentação, suas chances aumentam significativamente. Vamos trabalhar juntos!

📊 *Sobre seus dados:*
• Situação: ${situacao}
• Renda: ${renda}
• Histórico: ${historico}
• Motivo: ${motivo || 'não informado'}

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

✅ *Próximos passos:*
• Digite *SIM* para receber o link do DS-160
• Digite *MENU* para outras opções
• Digite *VOLTAR* a qualquer momento

🚀 *Vamos juntos rumo à aprovação!*`;
  }
  
  if (classificacao === 'Forte Potencial') {
    if ((situacao.includes('CLT') || situacao.includes('Empresário')) && renda === 'Acima de R$ 15.000') {
      return `🎉 *PARABÉNS, ${primeiroNome}!* 🎉

Sua análise está completa e temos uma ÓTIMA notícia!

✅ Seu perfil foi classificado como *FORTE POTENCIAL* para o visto americano!

📊 *Pontuação: ${score}/100*

🔍 *O que isso significa?*
• Sua combinação de emprego estável + renda compatível é exatamente o que o Consulado busca
• Você está no caminho certo para a aprovação

📋 *Seus dados analisados:*
• Situação: ${situacao}
• Renda: ${renda}
• Histórico: ${historico}

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

📌 *Próximos passos:*
• Digite *SIM* para receber o link do DS-160
• Digite *MENU* para ver outras opções

🚀 *Vamos conquistar esse visto juntos!*`;
    }
    
    if (situacao.includes('Empresário') && historico.includes('Tenho visto para outros países')) {
      return `🏆 *EXCELENTE, ${primeiroNome}!* 🏆

Sua análise de perfil foi concluída com o MELHOR RESULTADO possível!

✅ Classificação: *FORTE POTENCIAL* (${score}/100)

🔍 *Seu perfil é destaque porque:*
• Perfil empreendedor consolidado
• Experiência internacional comprovada
• Renda compatível com a viagem

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

📌 *Para iniciar, digite:*
• *SIM* para receber o link do DS-160
• *MENU* para ver outras opções

🎯 *Seu visto americano está muito próximo!*`;
    }
    
    return `🏆 *PARABÉNS, ${primeiroNome}!* 🏆

✅ Sua análise foi concluída e você tem um *PERFIL FORTE* para o visto americano!

📊 *Pontuação: ${score}/100*
• Classificação: ${classificacao}
• Situação profissional: ${situacao}
• Renda declarada: ${renda}

💰 *Investimento total:*
• Taxa Consular: ~R$ 950
• Assessoria GetVisa: R$ 350 (2x R$ 175)

📌 *Próximos passos:*
• Digite *SIM* para o link do DS-160
• Digite *MENU* para outras opções

🚀 *Vamos começar?*`;
  }
  
  // Fallback genérico
  return `🌟 Olá, ${primeiroNome}!

Sua análise de perfil foi concluída.

📊 *Resultado:* ${classificacao} (${score}/100)
• Situação: ${situacao}
• Renda: ${renda}

💰 *Investimento:* Taxa Consular ~R$ 950 + Assessoria R$ 350

✅ Para iniciar, digite *SIM*.
Para o menu principal, digite *MENU*.`;
}

// ==================== MAPEAMENTOS E FUNÇÕES AUXILIARES ====================
const radioMapping = {
  'one': 'Sim',
  'two': 'Não',
  'radio-28': { 'one': 'Turismo/negócio (B1/B2)', 'two': 'Estudos', 'Outros': 'Outros' },
  'radio-3': { 'one': 'Masculino', 'two': 'Feminino' },
  'select-4': { 'one': 'Casado(a)', 'two': 'Solteiro(a)', 'União-estável': 'União estável', 'Viúvo(a)': 'Viúvo(a)', 'Divorciado(a)': 'Divorciado(a)' },
  'radio-6': { 'one': 'Eu mesmo', 'two': 'Outra pessoa' },
  'radio-7': { 'one': 'Sim', 'two': 'Não' },
  'radio-8': { 'one': 'Sim', 'two': 'Não' },
  'radio-23': { 'one': 'Sim', 'two': 'Não' },
  'radio-29': { 'one': 'Sim', 'two': 'Não' },
  'radio-30': { 'one': 'Sim', 'two': 'Não' },
  'radio-33': { 'one': 'Sim', 'two': 'Não' },
  'radio-27': { 'Profissional': 'Profissional', 'Estudante': 'Estudante', 'Aposentado': 'Aposentado', 'Outra': 'Outra' },
  'radio-17': { 'one': 'Sim', 'two': 'Não' },
  'radio-18': { 'one': 'Sim', 'two': 'Não' },
  'radio-19': { 'one': 'Sim', 'two': 'Não' },
  'radio-20': { 'one': 'Sim', 'two': 'Não' },
  'radio-14': { 'one': 'Sim', 'two': 'Não' },
  'radio-15': { 'one': 'Sim', 'two': 'Não' },
  'radio-16': { 'one': 'Sim', 'two': 'Não' },
  'radio-26': { 'one': 'Sim', 'two': 'Não' },
  'radio-planos': { 'one': 'Sim', 'two': 'Não' },
  'radio-9': { 'one': 'Sim', 'two': 'Não, é diferente' },
  'radio-10': { 'one': 'Sim', 'two': 'Não' },
  'radio-11': { 'one': 'Sim', 'two': 'Não' },
  'radio-12': { 'one': 'Sim', 'two': 'Não' },
  'radio-outra-nac': { 'one': 'Sim', 'two': 'Não' },
  'radio-residente': { 'one': 'Sim', 'two': 'Não' },
  'spouse-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
  'ex-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
  'falecido-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' }
};

function formatDateToBrazilian(dateString) {
  if (!dateString || dateString === '') return null;
  
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
  
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  
  return dateString;
}

function formatValue(fieldName, value) {
  if (value === undefined || value === null || value === '') return null;
  
  const dateFields = ['text-5', 'text-21', 'text-35', 'text-66', 'text-67', 'text-69', 'text-61', 'text-62', 'spouse-dob', 'data_casamento_div', 'data_divorcio', 'data_falecimento', 'text-50', 'text-44', 'text-45', 'military_date_from', 'military_date_to', 'antecedentes_data'];
  if (dateFields.includes(fieldName)) {
    const formattedDate = formatDateToBrazilian(value);
    if (formattedDate) return formattedDate;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const mapped = value.map(v => {
      if (radioMapping[fieldName] && radioMapping[fieldName][v]) return radioMapping[fieldName][v];
      if (radioMapping[v]) return radioMapping[v];
      return v;
    });
    return mapped.join(', ');
  }
  if (radioMapping[fieldName] && radioMapping[fieldName][value]) return radioMapping[fieldName][value];
  if (radioMapping[value]) return radioMapping[value];
  return value;
}

function groupParallelArrays(data, nameField, relField) {
  const names = data[nameField] || [];
  const rels = data[relField] || [];
  const maxLen = Math.max(names.length, rels.length);
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    let nome = names[i] || '';
    let rel = rels[i] || '';
    if (nome || rel) result.push(`${nome}${nome && rel ? ' - ' : ''}${rel}`);
  }
  return result;
}

function groupTravels(data) {
  const datas = data['viagem_data[]'] || [];
  const duracao = data['viagem_duracao[]'] || [];
  const maxLen = Math.max(datas.length, duracao.length);
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    let d = datas[i] || '';
    let dur = duracao[i] || '';
    if (d) d = formatDateToBrazilian(d);
    if (d || dur) result.push(`${d}${d && dur ? ' - ' : ''}${dur} dias`);
  }
  return result;
}

function drawSectionTitle(doc, title) {
    doc.moveDown(1);
    doc.fillColor('#003366').fontSize(14).font('Helvetica-Bold').text(title.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    doc.moveDown(0.3);
    doc.strokeColor('#003366').lineWidth(1.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.lineWidth(0.5);
    doc.moveDown(0.5);
    doc.fillColor('#000000').fontSize(10).font('Helvetica');
}

// ==================== ROTA DS-160 ====================
app.post('/api/submit-ds160', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados recebidos (DS-160):', JSON.stringify({
    nome: data['full_name'],
    email: data['email-1'],
    telefone: data['text-77']
  }));
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      let solicitacaoId = null;
      
      try {
        const emailCliente = data['email-1'] || null;
        const nomeCliente = data['full_name'] || null;
        const telefoneCliente = data['text-77'] || null;
        
        console.log('💾 Tentando salvar no Supabase:', { emailCliente, nomeCliente, telefoneCliente });
        
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: emailCliente,
            nome_completo: nomeCliente,
            telefone: telefoneCliente
          }, { 
            onConflict: 'email',
            ignoreDuplicates: false
          })
          .select()
          .single();
        
        if (clienteError) {
          console.error('❌ Erro ao salvar cliente:', clienteError.message);
        } else if (cliente) {
          console.log(`✅ Cliente salvo/encontrado. ID: ${cliente.id}`);
          
          const { data: solicitacao, error: solError } = await supabase
            .from('solicitacoes')
            .insert({
              cliente_id: cliente.id,
              tipo: 'ds160',
              dados: data,
              status: 'pendente',
              created_at: new Date()
            })
            .select()
            .single();
          
          if (solError) {
            console.error('❌ Erro ao salvar solicitação:', solError.message);
          } else {
            solicitacaoId = solicitacao.id;
            console.log(`✅ DS-160 salvo com sucesso! ID: ${solicitacaoId}`);
          }
        }
      } catch (supabaseErr) {
        console.error('⚠️ Erro geral no Supabase:', supabaseErr.message);
      }

      const nome = data['full_name'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email-1'] || null;

      const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
        doc.end();
      });

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `🇺🇸 DS-160: ${nome}`,
        html: `<strong>Formulário DS-160 recebido.</strong><br><p><strong>Cliente:</strong> ${nome}</p>`,
        attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe');

      if (emailCliente && emailCliente.trim() !== '') {
          if (isEmailClienteValido(emailCliente, nome)) {
              try {
                  await resend.emails.send({
                      from: 'GetVisa <contato@getvisa.com.br>',
                      to: [emailCliente],
                      subject: `Seu formulário DS-160 foi recebido - ${nome}`,
                      html: `<strong>Olá ${nome},</strong><br><p>Recebemos seu formulário. Segue em anexo uma cópia.</p><p>Em breve nossa equipe entrará em contato.</p>`,
                      attachments: [{ filename: `DS160_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                  });
                  console.log(`✅ E-mail enviado para cliente VÁLIDO: ${emailCliente}`);
              } catch (emailErr) {
                  console.error(`❌ Erro ao enviar e-mail para ${emailCliente}:`, emailErr.message);
              }
          } else {
              console.log(`🚨 BLOQUEADO: Tentativa de enviar e-mail para domínio não autorizado ou suspeito: ${emailCliente}`);
          }
      } else {
          console.log(`⚠️ Cliente sem e-mail: ${nome}`);
      }
    } catch (err) {
      console.error('❌ Erro no processamento DS-160 (background):', err);
    }
  })();
});

// ==================== ROTA AVALIAÇÃO NORMAL (SIMULADOR) ====================
app.post('/api/submit-avaliacao', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados da Avaliação Normal recebidos:', JSON.stringify(data, null, 2));
  res.status(200).json({ success: true });

  (async () => {
    try {
      const nome = data['nome'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email'] || null;
      
      let telefoneCliente = data['telefone'] || data['whatsapp'] || null;
      if (telefoneCliente) {
        telefoneCliente = telefoneCliente.toString().replace(/\D/g, '');
        if (telefoneCliente.startsWith('55')) {
          telefoneCliente = telefoneCliente.substring(2);
        }
        if (telefoneCliente.length === 12) {
          telefoneCliente = telefoneCliente.substring(1);
        }
        console.log(`📞 Telefone original: ${data['telefone']} → normalizado: ${telefoneCliente}`);
      }
      
      const score = data['score'] || data['pontuacao'] || 0;
      const classificacao = data['classificacao'] || data['classificacao_perfil'] || 
                           (score < 50 ? 'Requer Atenção' : (score < 70 ? 'Potencial Moderado' : 'Forte Potencial'));
      
      if (telefoneCliente) {
        const { data: inserted, error: insertError } = await supabase
          .from('leads_simulador')
          .insert({
            nome_cliente: nome,
            telefone_whatsapp: telefoneCliente,
            email: emailCliente,
            pontuacao_total: score,
            classificacao_perfil: classificacao,
            respostas_simulador: data,
            data_simulacao: new Date(),
            status_lead: 'novo'
          })
          .select();
        
        if (insertError) {
          console.error('❌ Erro ao salvar lead:', insertError);
        } else {
          console.log(`✅ Lead salvo com sucesso! ID: ${inserted?.[0]?.id}, Telefone: ${telefoneCliente}`);
          
          const primeiroNome = nome.split(' ')[0];
          const situacaoProfissional = data['situacao_profissional'] || data['ocupacao'] || 'não informada';
          const renda = data['renda_mensal'] || data['renda'] || 'não informada';
          const historicoViagens = data['historico_viagens'] || '';
          const propositoViagem = data['proposito_viagem'] || data['motivo_viagem'] || '';
          
          // 🔥 USA A FUNÇÃO HUMANIZADA 🔥
          const mensagemWhats = gerarRespostaHumanizada(
            primeiroNome, classificacao, situacaoProfissional, 
            renda, historicoViagens, propositoViagem, score
          );
          
          await enviarWhatsApp(telefoneCliente, mensagemWhats);
        }
      }
    } catch (err) {
      console.error('❌ Erro:', err);
    }
  })();
});

// ==================== ROTA PASSAPORTE ====================
app.post('/api/submit-passaporte', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados de passaporte recebidos:', JSON.stringify({
    nome: data['passaporte_nome'],
    email: data['passaporte_email'],
    telefone: data['passaporte_telefone']
  }));
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      let solicitacaoId = null;
      
      try {
        const emailCliente = data['passaporte_email'] || null;
        const nomeCliente = data['passaporte_nome'] || null;
        const telefoneCliente = data['passaporte_telefone'] || null;
        
        console.log('💾 Salvando passaporte no Supabase:', { emailCliente, nomeCliente, telefoneCliente });
        
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: emailCliente,
            nome_completo: nomeCliente,
            telefone: telefoneCliente
          }, { onConflict: 'email' })
          .select()
          .single();
        
        if (clienteError) {
          console.error('❌ Erro ao salvar cliente:', clienteError.message);
        } else if (cliente) {
          console.log(`✅ Cliente salvo/encontrado. ID: ${cliente.id}`);
          
          const { data: solicitacao, error: solError } = await supabase
            .from('solicitacoes')
            .insert({
              cliente_id: cliente.id,
              tipo: 'passaporte',
              dados: data,
              status: 'pendente',
              created_at: new Date()
            })
            .select()
            .single();
          
          if (solError) {
            console.error('❌ Erro ao salvar solicitação:', solError.message);
          } else {
            solicitacaoId = solicitacao.id;
            console.log(`✅ Passaporte salvo! ID: ${solicitacaoId}`);
          }
        }
      } catch (supabaseErr) {
        console.error('⚠️ Erro no Supabase:', supabaseErr.message);
      }

      const nome = data['passaporte_nome'] || 'Cliente_Sem_Nome';
      const emailCliente = data['passaporte_email'] || null;

      const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
        doc.end();
      });

      console.log(`📄 PDF gerado para passaporte de ${nome}, tamanho: ${pdfBuffer.length} bytes`);

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `📘 Passaporte: ${nome}`,
        html: `<strong>Solicitação de passaporte recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p><p>E-mail: ${emailCliente || 'não informado'}</p><p>Telefone: ${data['passaporte_telefone'] || 'não informado'}</p>`,
        attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe (passaporte)');

      if (emailCliente && emailCliente.trim() !== '') {
          const emailValido = isEmailClienteValido(emailCliente, nome);
          if (emailValido) {
              try {
                  await resend.emails.send({
                      from: 'GetVisa <contato@getvisa.com.br>',
                      to: [emailCliente],
                      subject: `Sua solicitação de passaporte foi recebida - ${nome}`,
                      html: `<strong>Olá ${nome},</strong><br><p>Recebemos sua solicitação de passaporte. Em breve nossa equipe entrará em contato.</p><br><p>Atenciosamente,<br>Equipe GetVisa</p>`,
                      attachments: [{ filename: `Passaporte_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                  });
                  console.log(`✅ E-mail enviado para o cliente: ${emailCliente}`);
              } catch (emailErr) {
                  console.error(`❌ Erro ao enviar e-mail para ${emailCliente}:`, emailErr.message);
              }
          } else {
              console.log(`🚨 BLOQUEADO: E-mail não passou na validação: ${emailCliente}`);
          }
      }
      
    } catch (err) {
      console.error('❌ Erro no processamento do passaporte (background):', err);
    }
  })();
});

// ==================== ROTA VISTO NEGADO ====================
app.post('/api/submit-visto-negado', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados de Visto Negado recebidos:', JSON.stringify({
    nome: data['nome'],
    email: data['email'],
    telefone: data['telefone']
  }));
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      const nome = data['nome'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email'] || null;
      const telefoneCliente = data['telefone'] || null;
      const score = data['score'] || null;
      const classificacaoTipo = data['classificacao_tipo'] || '';
      const classificacaoTitulo = data['classificacao_titulo'] || '';
      const classificacaoMensagem = data['classificacao_mensagem'] || '';

      let solicitacaoId = null;
      try {
        console.log('💾 Salvando visto negado no Supabase:', { emailCliente, nome, telefoneCliente });
        
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: emailCliente,
            nome_completo: nome,
            telefone: telefoneCliente
          }, { onConflict: 'email' })
          .select()
          .single();
        
        if (clienteError) {
          console.error('❌ Erro ao salvar cliente (visto negado):', clienteError.message);
        } else if (cliente) {
          console.log(`✅ Cliente salvo/encontrado. ID: ${cliente.id}`);
          
          const { data: solicitacao, error: solError } = await supabase
            .from('solicitacoes')
            .insert({
              cliente_id: cliente.id,
              tipo: 'visto_negado',
              dados: data,
              status: 'pendente',
              created_at: new Date()
            })
            .select()
            .single();
          
          if (solError) {
            console.error('❌ Erro ao salvar solicitação de visto negado:', solError.message);
          } else {
            solicitacaoId = solicitacao.id;
            console.log(`✅ Visto Negado salvo com sucesso! ID: ${solicitacaoId}`);
          }
        }
      } catch (supabaseErr) {
        console.error('⚠️ Erro geral no Supabase (visto negado):', supabaseErr.message);
      }

      if (telefoneCliente && score !== null) {
        const primeiroNome = nome.split(' ')[0];
        const classificacaoTexto = classificacaoTipo === 'urgent' ? 'que Requer Atenção Urgente' 
                                 : classificacaoTipo === 'moderate' ? 'com Potencial Moderado' 
                                 : 'com Forte Potencial';
        
        let mensagemWhats = `Olá, ${primeiroNome}! Tudo bem? Meu nome é Moisés, faço parte da equipe GETVISA e vou te acompanhar por todo o processo.\n\n`;
        mensagemWhats += `Recebemos sua análise específica para *VISTO AMERICANO NEGADO*. Seu perfil foi classificado como ${classificacaoTexto} (${score}/100).\n\n`;
        mensagemWhats += `*O que identificamos:*\n`;
        mensagemWhats += `• Última negativa: ${data['quando_negado'] || 'recentemente'}\n`;
        mensagemWhats += `• Motivo: ${data['motivo_negativa'] || 'não informado'}\n\n`;
        mensagemWhats += `*Nossa estratégia para REVERTER seu caso:*\n`;
        mensagemWhats += `✅ Revisão completa do histórico de negativas\n`;
        mensagemWhats += `✅ Correção do DS-160\n`;
        mensagemWhats += `✅ Documentação de suporte reforçada\n`;
        mensagemWhats += `✅ Preparação para entrevista\n\n`;
        mensagemWhats += `💰 *Investimento:* Taxa Consular (~R$ 950) + Assessoria Especializada (R$ 380)\n\n`;
        mensagemWhats += `Podemos iniciar o processo de reversão hoje? 🚀\n\n`;
        mensagemWhats += `*Falar com especialista:* https://wa.me/5521974601812`;
        
        await enviarWhatsApp(telefoneCliente, mensagemWhats);
      }

      const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
        doc.end();
      });

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `⚠️ Visto Negado: ${nome}`,
        html: `<strong>Avaliação de visto negado recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p>`,
        attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe (visto negado)');

      if (emailCliente && emailCliente.trim() !== '') {
          const emailValido = isEmailClienteValido(emailCliente, nome);
          if (emailValido) {
              try {
                  await resend.emails.send({
                      from: 'GetVisa <contato@getvisa.com.br>',
                      to: [emailCliente],
                      subject: `Resultado da sua avaliação de visto negado - ${nome}`,
                      html: `<strong>Olá ${nome},</strong><br><p>Recebemos sua solicitação. Em breve um especialista entrará em contato.</p>`,
                      attachments: [{ filename: `Visto_Negado_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                  });
                  console.log(`✅ E-mail enviado para cliente (visto negado): ${emailCliente}`);
              } catch (emailErr) {
                  console.error(`❌ Erro ao enviar e-mail para ${emailCliente}:`, emailErr.message);
              }
          } else {
              console.log(`🚨 BLOQUEADO: E-mail não passou na validação: ${emailCliente}`);
          }
      }
      
    } catch (err) {
      console.error('❌ Erro no processamento do visto negado (background):', err);
    }
  })();
});

// ==================== ROTA VISTO AUSTRALIANO ====================
app.post('/api/submit-australia', async (req, res) => {
  const data = req.body;
  console.log('📥 Dados de Visto Australiano recebidos:', JSON.stringify({
    nome: data['full_name'],
    email: data['email'],
    telefone: data['telefone']
  }));
  res.status(200).json({ success: true, message: 'Requisição recebida, processando...' });

  (async () => {
    try {
      const nome = data['full_name'] || 'Cliente_Sem_Nome';
      const emailCliente = data['email'] || null;
      const telefoneCliente = data['telefone'] || null;

      try {
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .upsert({
            email: emailCliente,
            nome_completo: nome,
            telefone: telefoneCliente
          }, { onConflict: 'email' })
          .select()
          .single();
        
        if (clienteError) {
          console.error('❌ Erro ao salvar cliente (Austrália):', clienteError.message);
        } else if (cliente) {
          console.log(`✅ Cliente salvo. ID: ${cliente.id}`);
          
          const { data: solicitacao, error: solError } = await supabase
            .from('solicitacoes')
            .insert({
              cliente_id: cliente.id,
              tipo: 'australia',
              dados: data,
              status: 'pendente',
              created_at: new Date()
            })
            .select()
            .single();
          
          if (solError) {
            console.error('❌ Erro ao salvar solicitação (Austrália):', solError.message);
          } else {
            console.log(`✅ Visto Australiano salvo! ID: ${solicitacao.id}`);
          }
        }
      } catch (supabaseErr) {
        console.error('⚠️ Erro no Supabase (Austrália):', supabaseErr.message);
      }

      const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
        doc.end();
      });

      await resend.emails.send({
        from: 'GetVisa <contato@getvisa.com.br>',
        to: ['getvisa.assessoria@gmail.com'],
        subject: `🇦🇺 Visto Australiano: ${nome}`,
        html: `<strong>Solicitação de Visto Australiano recebida.</strong><br><p><strong>Cliente:</strong> ${nome}</p>`,
        attachments: [{ filename: `Visto_Australiano_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
      });
      console.log('✅ E-mail enviado para a equipe (Austrália)');

      if (emailCliente && emailCliente.trim() !== '') {
          if (isEmailClienteValido(emailCliente, nome)) {
              try {
                  await resend.emails.send({
                      from: 'GetVisa <contato@getvisa.com.br>',
                      to: [emailCliente],
                      subject: `Sua solicitação de Visto Australiano foi recebida - ${nome}`,
                      html: `<strong>Olá ${nome},</strong><br><p>Recebemos sua solicitação. Em breve nossa equipe entrará em contato.</p>`,
                      attachments: [{ filename: `Visto_Australiano_${nome.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBuffer.toString('base64') }]
                  });
                  console.log(`✅ E-mail enviado para cliente (Austrália): ${emailCliente}`);
              } catch (emailErr) {
                  console.error(`❌ Erro ao enviar e-mail para ${emailCliente}:`, emailErr.message);
              }
          } else {
              console.log(`🚨 E-mail bloqueado: ${emailCliente}`);
          }
      }
      
    } catch (err) {
      console.error('❌ Erro no processamento do Visto Australiano:', err);
    }
  })();
});

// ==================== AUTENTICAÇÃO PARA ENDPOINTS ADMIN ====================
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'minha-chave-secreta-123';
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) return res.status(403).json({ error: 'Acesso negado' });
  next();
}

app.get('/api/agendamentos', validateApiKey, async (req, res) => {
  const { solicitacao_id } = req.query;
  let query = supabase.from('agendamentos').select('*');
  if (solicitacao_id) query = query.eq('solicitacao_id', solicitacao_id);
  const { data, error } = await query.order('data_hora', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/agendamentos', validateApiKey, async (req, res) => {
  const { solicitacao_id, tipo, data_hora, local, observacoes } = req.body;
  if (!solicitacao_id || !tipo || !data_hora) {
    return res.status(400).json({ error: 'Campos obrigatórios: solicitacao_id, tipo, data_hora' });
  }
  const { data, error } = await supabase
    .from('agendamentos')
    .insert({ solicitacao_id, tipo, data_hora, local, observacoes, status: 'agendado' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/agendamentos/:id', validateApiKey, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  delete updates.id;
  delete updates.created_at;
  const { data, error } = await supabase
    .from('agendamentos')
    .update({ ...updates, updated_at: new Date() })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/agendamentos/:id', validateApiKey, async (req, res) => {
  const { error } = await supabase
    .from('agendamentos')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

app.get('/api/solicitacoes', validateApiKey, async (req, res) => {
  const { data, error } = await supabase
    .from('solicitacoes')
    .select('id, tipo, clientes(nome_completo, email)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/compromissos', validateApiKey, async (req, res) => {
  const { data, error } = await supabase.from('compromissos').select('*').order('data', { ascending: true }).order('hora', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/compromissos', validateApiKey, async (req, res) => {
  const { cliente, atividade, data, hora, local, concluido } = req.body;
  if (!cliente || !atividade || !data || !hora) {
    return res.status(400).json({ error: 'Cliente, atividade, data e hora são obrigatórios' });
  }
  const { data: inserted, error } = await supabase
    .from('compromissos')
    .insert({ cliente, atividade, data, hora, local, concluido: concluido || 0 })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(inserted);
});

app.put('/api/compromissos/:id', validateApiKey, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const { data, error } = await supabase
    .from('compromissos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/compromissos/:id', validateApiKey, async (req, res) => {
  const { error } = await supabase.from('compromissos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ==================== ROTA DE PING ====================
app.get('/ping', (req, res) => {
  res.status(200).send('ok');
});

// ==================== WEBHOOK Z-API ====================
app.post('/api/webhook/zapi', async (req, res) => {
  res.status(200).json({ status: 'ok' });

  const body = req.body;
  
  if (body.fromMe === true) return;
  const connectedPhone = body.connectedPhone;
  const senderPhone = body.phone || body.from;
  if (senderPhone === connectedPhone) return;
  if (body.isStatusReply === true || body.waitingMessage === true) return;

  try {
    const messageText = (body.text?.message || body.message?.text || body.message || '').toLowerCase().trim();
    if (!messageText) return;

    // ==================== IGNORAR MENSAGEM COPIADA DO SITE ====================
    if (messageText.includes('fiz a avaliação de perfil no site') && 
        (messageText.includes('meus dados') || messageText.includes('perfil'))) {
      console.log(`📋 Cliente copiou resultado da avaliação do site - ignorando para não duplicar`);
      return;
    }
    
    if (messageText.includes('perfil:') && messageText.includes('renda:')) {
      console.log(`📋 Possível resultado de avaliação copiado - ignorando`);
      return;
    }

    let cleanPhone = senderPhone.toString().replace(/\D/g, '');
    if (cleanPhone.startsWith('55')) {
      cleanPhone = cleanPhone.substring(2);
    }
    console.log(`📞 Telefone: ${cleanPhone} | Mensagem: "${messageText.substring(0, 100)}..."`);

    let lead = null;
    const { data: leads } = await supabase
      .from('leads_simulador')
      .select('*')
      .eq('telefone_whatsapp', cleanPhone)
      .limit(1);
    
    if (leads && leads.length > 0) {
      lead = leads[0];
      console.log(`✅ Lead encontrado: ${lead.nome_cliente}`);
    }
    
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    const securityToken = process.env.ZAPI_SECURITY_TOKEN;
    
    const sendReply = async (phone, message) => {
      if (!instance || !token) return;
      const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': securityToken || '' },
        body: JSON.stringify({ phone, message })
      });
      console.log(`📱 Resposta enviada para ${phone}: ${response.status}`);
    };

    if (messageText === 'voltar' || messageText === 'menu' || messageText === 'inicio' || messageText === '🔙') {
      const resposta = `📋 *MENU PRINCIPAL*

1️⃣ 💰 PREÇO - Valores do processo
2️⃣ ⏰ PRAZO - Tempos estimados
3️⃣ 📄 DOCUMENTOS - O que é necessário
4️⃣ 📋 PROCESSO - Passo a passo
5️⃣ ⚠️ VISTO NEGADO - Casos de negativa
6️⃣ 📞 AJUDA - Falar com especialista
7️⃣ 📊 AVALIAÇÃO - Análise gratuita do seu perfil

*Digite o número da opção desejada (1 a 7):* 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (messageText === '1' || messageText === '1️⃣' || messageText === 'preço' || messageText === 'preco' || messageText === '💰') {
      const resposta = `💰 *INVESTIMENTO*

🇺🇸 *Taxa Consular:* ~R$ 950
📋 *Assessoria:* R$ 350

*O que a assessoria inclui:*
✅ Análise completa do perfil
✅ Preenchimento do DS-160
✅ Agendamento da entrevista
✅ Preparação para entrevista
✅ Acompanhamento total

---
*Digite VOLTAR para o menu principal ou SIM para começar!* 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (messageText === '2' || messageText === '2️⃣' || messageText === 'prazo' || messageText === '⏰') {
      const resposta = `⏰ *PRAZOS ESTIMADOS*

📅 Agendamento: até 8 semanas
🔍 Análise consular: 7 a 10 dias úteis
📬 Retorno do passaporte: 5 a 7 dias úteis

🕒 *Total estimado:* 30 a 40 dias

---
*Digite VOLTAR para o menu principal ou SIM para começar!* 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (messageText === '3' || messageText === '3️⃣' || messageText === 'documentos' || messageText === '📄') {
      const resposta = `📄 *DOCUMENTOS NECESSÁRIOS*

📌 *OBRIGATÓRIOS:*
• Passaporte válido
• Foto 5x7 recente
• Comprovante da taxa MRV
• DS-160 preenchido

📌 *RECOMENDADOS (vínculos):*
• Comprovante de renda
• Extratos bancários
• Comprovante de imóvel
• Certidão de nascimento filhos

---
*Digite VOLTAR para o menu principal!* 📋`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (messageText === '4' || messageText === '4️⃣' || messageText === 'processo' || messageText === 'passo a passo') {
      const resposta = `📋 *PASSO A PASSO DO PROCESSO*

1️⃣ Análise de perfil
2️⃣ Preenchimento do DS-160
3️⃣ Pagamento da taxa consular (~R$ 950)
4️⃣ Agendamento da entrevista
5️⃣ Preparação para entrevista
6️⃣ Acompanhamento até o final

⏰ *Prazo médio:* 30 a 40 dias

---
*Digite VOLTAR para o menu principal ou SIM para começar!* 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (messageText === '5' || messageText === '5️⃣' || messageText === 'visto negado' || messageText === 'negado' || messageText === '⚠️') {
      const resposta = `⚠️ *VISTO NEGADO? Não desanime!*

*O que fazer após uma negativa:*

1️⃣ Entender o motivo (artigo 214b)
2️⃣ Reforçar vínculos com o Brasil
3️⃣ Corrigir o DS-160
4️⃣ Preparação intensiva para entrevista

*Nossa assessoria especializada em REVERSÃO:*
✅ Revisão completa do caso
✅ Estratégia personalizada
✅ Acompanhamento total

💰 *Investimento especial:* R$ 380 + Taxa Consular

---
*Digite VOLTAR para o menu principal ou SIM para agendar análise!* 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (messageText === '6' || messageText === '6️⃣' || messageText === 'ajuda' || messageText === 'especialista' || messageText === 'contato' || messageText === '📞') {
      const mensagemPadrao = encodeURIComponent(`Olá! Gostaria de falar com um especialista sobre meu visto americano.`);
      const resposta = `💬 *Atendimento GetVisa*

Não encontrou sua resposta? Nossa equipe está aqui para ajudar você!

📱 *Falar com especialista agora:*
https://wa.me/5521974601812?text=${mensagemPadrao}

📝 *Ou descreva sua dúvida aqui mesmo* (responderemos em até 24h)

⏰ *Horário de atendimento humano:*
Segunda a Sexta, 9h às 18h

---
*Digite VOLTAR para o menu principal* 🔙

Estamos juntos nessa! 💙🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (messageText === '7' || messageText === '7️⃣' || messageText === 'avaliação' || messageText === 'avaliacao' || messageText === 'simulador' || messageText === '📊') {
      const resposta = `📊 *ANÁLISE GRATUITA DE PERFIL*

Descubra suas chances de aprovação para o visto americano!

📋 *Preencha nosso simulador:*
https://getvisa.com.br/simulador-visto-americano-4917

⏱️ Leva menos de 2 minutos!
📊 Você recebe uma análise personalizada
🎯 Descobre seus pontos fortes e de atenção

---
*Digite VOLTAR para o menu principal!* 🚀`;
      await sendReply(cleanPhone, resposta);
      return;
    }

    if (messageText === 'sim' || messageText === 'sim!' || messageText === 'quero' || messageText === 'quero sim') {
      if (!lead) {
        const resposta = `📊 *Antes de iniciarmos, que tal descobrir suas chances de aprovação?*

Faça nossa avaliação gratuita de perfil:
https://getvisa.com.br/simulador-visto-americano-4917

Em 2 minutos você recebe uma análise personalizada!

---
*Digite AVALIAÇÃO para começar ou VOLTAR para o menu!* 🚀`;
        await sendReply(cleanPhone, resposta);
        return;
      }
      
      const primeiroNome = (lead.nome_cliente || 'Cliente').split(' ')[0];
      const resposta = `🎉 *Perfeito, ${primeiroNome}!* 🎉

📋 *Acesse o rascunho do formulário DS-160:*
🌐 https://getvisa.com.br/formulario-ds160

⚠️ Preencha com atenção. Após o envio, nossa equipe fará a análise.

---
*Digite VOLTAR para o menu principal!* 🇺🇸✨`;
      await sendReply(cleanPhone, resposta);
      return;
    }
    
    if (messageText === 'oi' || messageText === 'olá' || messageText === 'ola' || 
        messageText === 'bom dia' || messageText === 'boa tarde' || messageText === 'boa noite' ||
        messageText === 'hey' || messageText === 'e ai' || messageText === 'e aí') {
      
      const resposta = `🇺🇸 *GETVISA - Assessoria Consular* 🇺🇸

Olá! 👋 Seja bem-vindo(a)!

📋 *Como podemos ajudar você hoje?*

1️⃣ 💰 *PREÇO* - Valores do processo
2️⃣ ⏰ *PRAZO* - Tempos estimados
3️⃣ 📄 *DOCUMENTOS* - O que é necessário
4️⃣ 📋 *PROCESSO* - Passo a passo
5️⃣ ⚠️ *VISTO NEGADO* - Casos de negativa
6️⃣ 📞 *AJUDA* - Falar com especialista
7️⃣ 📊 *AVALIAÇÃO* - Análise gratuita do seu perfil

*Digite o número da opção desejada (1 a 7):* 🚀

📌 *Para uma análise personalizada, preencha nosso simulador:*
https://getvisa.com.br/simulador-visto-americano-4917`;
      
      await sendReply(cleanPhone, resposta);
      return;
    }
    
    const resposta = `🤔 *Não entendi sua mensagem.*

Digite *MENU* para ver as opções disponíveis ou *VOLTAR* para recomeçar.

Estou aqui para te ajudar! 💙`;
    await sendReply(cleanPhone, resposta);
    
  } catch (error) {
    console.error('❌ Erro no webhook:', error.message);
  }
});

// ==================== ROTA ESPECÍFICA PARA O SIMULADOR DE 5 ETAPAS ====================
app.post('/api/submit-simulador', async (req, res) => {
  const data = req.body;
  console.log('📥 Simulador 5 etapas recebido:', data);
  res.status(200).json({ success: true });

  (async () => {
    try {
      const nome = data['nome'] || 'Cliente_Sem_Nome';
      const telefoneCliente = data['telefone'] || null;
      const emailCliente = data['email'] || null;
      const situacaoProfissional = data['situacao_profissional'] || '';
      const renda = data['renda'] || '';
      const historicoViagens = data['historico_viagens'] || '';
      const propositoViagem = data['proposito_viagem'] || '';
      
      let score = 65;
      let classificacao = 'Potencial Moderado';
      
      if (situacaoProfissional === 'Desempregado(a) no momento') {
        score = 45;
        classificacao = 'Requer Atenção';
      } else if (renda === 'Acima de R$ 15.000') {
        score = 85;
        classificacao = 'Forte Potencial';
      }
      
      if (telefoneCliente) {
        const { error } = await supabase
          .from('leads_simulador')
          .insert({
            nome_cliente: nome,
            telefone_whatsapp: telefoneCliente,
            email: emailCliente,
            pontuacao_total: score,
            classificacao_perfil: classificacao,
            respostas_simulador: data,
            data_simulacao: new Date(),
            status_lead: 'novo'
          });
        
        if (error) {
          console.error('❌ Erro ao salvar:', error);
        } else {
          console.log(`✅ Lead salvo: ${nome} - ${telefoneCliente}`);
          
          const primeiroNome = nome.split(' ')[0];
          
          // 🔥 USA A FUNÇÃO HUMANIZADA 🔥
          const mensagemWhats = gerarRespostaHumanizada(
            primeiroNome, classificacao, situacaoProfissional, 
            renda, historicoViagens, propositoViagem, score
          );
          
          await enviarWhatsApp(telefoneCliente, mensagemWhats);
          console.log(`✅ Mensagem humanizada enviada para ${primeiroNome} (${classificacao})`);
        }
      }
      
    } catch (err) {
      console.error('❌ Erro:', err);
    }
  })();
});

// ==================== SISTEMA DE LEMBRETES AUTOMÁTICOS ====================

function formatarDataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

async function buscarTelefoneCliente(clienteNome, clienteId) {
  if (clienteId) {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('telefone')
      .eq('id', clienteId)
      .single();
    
    if (cliente?.telefone) {
      return cliente.telefone.replace(/\D/g, '');
    }
  }
  
  const { data: lead } = await supabase
    .from('leads_simulador')
    .select('telefone_whatsapp')
    .ilike('nome_cliente', `%${clienteNome}%`)
    .order('data_simulacao', { ascending: false })
    .limit(1)
    .single();
  
  if (lead?.telefone_whatsapp) {
    return lead.telefone_whatsapp.replace(/\D/g, '');
  }
  
  return null;
}

async function enviarLembreteAgendamento(telefone, nomeCliente, agendamento, diasAntecedencia) {
  const dataFormatada = formatarDataBR(agendamento.data);
  const emoji = agendamento.atividade === 'ENTREVISTA' ? '🗣️' : 
                agendamento.atividade === 'CASV' ? '👆' : 
                agendamento.atividade.includes('TREINAMENTO') ? '💻' : 
                agendamento.atividade === 'RETIRADA PASSAPORTE' ? '📬' : '📌';
  
  const diasTexto = diasAntecedencia === 3 ? '3 dias' : '1 dia';
  
  let mensagem = `🔔 *LEMBRETE - GetVisa* 🔔\n\n`;
  mensagem += `Olá, ${nomeCliente.split(' ')[0]}! 👋\n\n`;
  mensagem += `Faltam *${diasTexto}* para seu compromisso:\n\n`;
  mensagem += `${emoji} *${agendamento.atividade}*\n`;
  mensagem += `📆 Data: ${dataFormatada}\n`;
  mensagem += `⏰ Horário: ${agendamento.hora}\n`;
  
  if (agendamento.local) {
    mensagem += `📍 Local: ${agendamento.local}\n`;
  }
  
  if (agendamento.atividade === 'ENTREVISTA') {
    mensagem += `\n📋 *Dicas importantes:*\n`;
    mensagem += `• Chegue com 30 minutos de antecedência\n`;
    mensagem += `• Leve: passaporte, DS-160, foto 5x7\n`;
    mensagem += `• Documentos comprobatórios (renda, vínculos)\n`;
    mensagem += `• Esteja bem vestido(a) e confiante!\n`;
  } else if (agendamento.atividade === 'CASV') {
    mensagem += `\n📋 *Para a Coleta CASV:*\n`;
    mensagem += `• Leve o passaporte original\n`;
    mensagem += `• Confirme o local exato no dia\n`;
    mensagem += `• Não precisa levar documentos comprobatórios\n`;
  } else if (agendamento.atividade === 'RETIRADA PASSAPORTE') {
    mensagem += `\n📋 *Retirada do passaporte:*\n`;
    mensagem += `• Leve o comprovante de agendamento\n`;
    mensagem += `• Documento de identificação original\n`;
  }
  
  mensagem += `\nBoa sorte! 🍀🇺🇸\n\n`;
  mensagem += `Digite *MEUS AGENDAMENTOS* para ver todos os seus compromissos.`;
  
  let telefoneLimpo = telefone.toString().replace(/\D/g, '');
  if (telefoneLimpo.startsWith('55')) {
    telefoneLimpo = telefoneLimpo.substring(2);
  }
  
  await enviarWhatsApp(telefoneLimpo, mensagem);
  console.log(`📨 Lembrete ${diasTexto} enviado para ${nomeCliente}: ${agendamento.atividade} em ${agendamento.data}`);
}

async function verificarLembretes() {
  console.log(`🔍 Verificando lembretes - ${new Date().toLocaleString('pt-BR')}`);
  
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    const { data: agendamentos, error } = await supabase
      .from('compromissos')
      .select('*')
      .eq('concluido', 0)
      .gte('data', hoje);
    
    if (error) {
      console.error('❌ Erro ao buscar agendamentos:', error);
      return;
    }
    
    const dataAtual = new Date();
    dataAtual.setHours(0, 0, 0, 0);
    
    for (const ag of agendamentos) {
      const dataAgenda = new Date(ag.data);
      dataAgenda.setHours(0, 0, 0, 0);
      
      const diffDays = Math.ceil((dataAgenda - dataAtual) / (1000 * 60 * 60 * 24));
      
      const telefone = await buscarTelefoneCliente(ag.cliente, ag.cliente_id);
      
      if (!telefone) {
        console.log(`⚠️ Telefone não encontrado para ${ag.cliente}`);
        continue;
      }
      
      if (diffDays === 3 && !ag.lembrete_3d_enviado) {
        await enviarLembreteAgendamento(telefone, ag.cliente, ag, 3);
        
        await supabase
          .from('compromissos')
          .update({ lembrete_3d_enviado: true })
          .eq('id', ag.id);
          
        console.log(`✅ Lembrete 3 dias enviado para ${ag.cliente}`);
      }
      
      if (diffDays === 1 && !ag.lembrete_1d_enviado) {
        await enviarLembreteAgendamento(telefone, ag.cliente, ag, 1);
        
        await supabase
          .from('compromissos')
          .update({ lembrete_1d_enviado: true })
          .eq('id', ag.id);
          
        console.log(`✅ Lembrete 1 dia enviado para ${ag.cliente}`);
      }
    }
    
  } catch (err) {
    console.error('❌ Erro no sistema de lembretes:', err);
  }
}

setInterval(verificarLembretes, 6 * 60 * 60 * 1000);
verificarLembretes();

// ==================== INICIALIZAÇÃO ====================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));