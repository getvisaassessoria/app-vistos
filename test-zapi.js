// test-zapi.js – Teste de envio de mensagem pela Z-API
// Substitua os valores abaixo antes de rodar.

const INSTANCE = '3F1D4E0F2AD0539F0C52B20DE66F3711';          // ex: instance-abc123
const TOKEN = 'AD6B16B63509AD32DE5C0848';                // token da instância
const SECURITY_TOKEN = 'Fb73c15ac7d6f424080ce38033ada336fS';                     // deixe vazio se não usa Client-Token
const NUMERO_TESTE = '5521974601812';          // número com 55 + DDD + telefone

async function testar() {
  console.log('🔧 Testando envio...');
  console.log(`📞 Destino: ${NUMERO_TESTE}`);

  const url = `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}/send-text`;
  const headers = { 'Content-Type': 'application/json' };
  if (SECURITY_TOKEN) headers['Client-Token'] = SECURITY_TOKEN;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: NUMERO_TESTE, message: 'Teste do servidor GetVisa ✅' })
    });
    const data = await res.json();
    console.log('Resposta status:', res.status);
    console.log(JSON.stringify(data, null, 2));
    if (res.ok) console.log('🎉 Mensagem enviada com sucesso!');
    else console.log('❌ API retornou erro. Verifique os dados.');
  } catch (err) {
    console.error('❌ Falha na requisição:', err.message);
  }
}

testar();
