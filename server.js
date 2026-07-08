// ============================================================
//  ENDPOINTS ADMIN (AGENDAMENTOS)
// ============================================================
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
    return res.status(400).json({ error: 'Campos obrigatorios: solicitacao_id, tipo, data_hora' });
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

// ============================================================
//  ENDPOINTS COMPROMISSOS
// ============================================================
app.get('/api/compromissos', validateApiKey, async (req, res) => {
  const { data, error } = await supabase.from('compromissos').select('*').order('data', { ascending: true }).order('hora', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/compromissos', validateApiKey, async (req, res) => {
  const { cliente, cliente_id, atividade, data, hora, local, concluido } = req.body;
  if (!cliente || !atividade || !data || !hora) {
    return res.status(400).json({ error: 'Cliente, atividade, data e hora sao obrigatorios' });
  }
  const { data: inserted, error } = await supabase
    .from('compromissos')
    .insert({ cliente, cliente_id, atividade, data, hora, local, concluido: concluido || 0 })
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

// ============================================================
//  WEBHOOK Z-API - VERSÃO CORRIGIDA E LIMPA
// ============================================================
app.post('/api/webhook/zapi', async (req, res) => {
  console.log('📥 Webhook Z-API recebido');
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;
    
    // IGNORAR MENSAGENS DE GRUPO
    if (body.isGroup === true || body.isGroupMsg === true || body.chatId?.includes('@g.us')) {
      console.log('👥 Mensagem de grupo ignorada');
      return;
    }
    
    if (body.fromMe === true) {
      console.log('🤖 Mensagem do próprio bot ignorada');
      return;
    }
    
    if (body.isStatusReply === true || body.waitingMessage === true) {
      console.log('⏳ Mensagem de status/waiting ignorada');
      return;
    }

    const senderPhone = body.phone || body.from;
    if (!senderPhone) return;

    let messageText = body.text?.message || body.message?.text || body.message || '';
    if (typeof messageText !== 'string') messageText = String(messageText);
    messageText = messageText.trim();

    if (!messageText) return;

    console.log(`📩 Mensagem de ${senderPhone}: ${messageText}`);

    let cleanPhone = senderPhone.toString().replace(/\D/g, '');
    if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);
    
    if (cleanPhone.length < 10) {
      console.log(`⚠️ Telefone inválido: ${cleanPhone}`);
      return;
    }

    // ============================================================
//  FUNÇÃO PARA CADASTRAR CLIENTE AUTOMATICAMENTE
//  (Coloque esta função ANTES do app.post('/api/webhook/zapi'))
// ============================================================
async function cadastrarClienteAutomatico(telefone) {
  try {
    // Verifica se o cliente já existe
    const { data: clienteExistente, error: buscaError } = await supabase
      .from('clientes')
      .select('id, status')
      .eq('telefone', telefone)
      .limit(1);
    
    if (buscaError) {
      console.error('❌ Erro ao buscar cliente:', buscaError);
      return null;
    }
    
    // Se já existe, retorna o cliente
    if (clienteExistente && clienteExistente.length > 0) {
      console.log(`📋 Cliente ${telefone} já existe (status: ${clienteExistente[0].status})`);
      return clienteExistente[0];
    }
    
    // Se NÃO existe, CADASTRA o cliente
    console.log(`📝 Cadastrando novo cliente: ${telefone}`);
    const { data: novoCliente, error: insertError } = await supabase
      .from('clientes')
      .insert({
        telefone: telefone,
        status: 'novo',  // Começa como 'novo'
        created_at: new Date(),
        updated_at: new Date()
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Erro ao cadastrar cliente:', insertError);
      return null;
    }
    
    console.log(`✅ Cliente ${telefone} CADASTRADO com sucesso! (status: novo)`);
    return novoCliente;
  } catch (error) {
    console.error('❌ Erro ao cadastrar cliente automaticamente:', error);
    return null;
  }
}

    const sendReply = async (phone, mensagem) => {
      const instance = process.env.ZAPI_INSTANCE;
      const token = process.env.ZAPI_TOKEN;
      const securityToken = process.env.ZAPI_SECURITY_TOKEN;
      if (!instance || !token) return false;
      const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': securityToken || '' },
        body: JSON.stringify({ phone: '55' + phone, message: mensagem })
      });
      console.log('✅ Resposta Z-API:', await response.json());
      return response.status === 200;
    };

    // ============================================================
    //  ESTADO DO USUÁRIO
    // ============================================================
    let state = userState.get(cleanPhone) || { 
      nivel: 'principal',
      service: null,
      mensagensTrocadas: 0,
      lastActivity: Date.now(),
      conversaAtiva: false,
      emProcesso: false
    };
    state.lastActivity = Date.now();
    state.mensagensTrocadas = (state.mensagensTrocadas || 0) + 1;
    if (state.mensagensTrocadas > 1) {
      state.conversaAtiva = true;
    }
    userState.set(cleanPhone, state);

    const lowerMessage = messageText.toLowerCase();
    const cleanMessage = lowerMessage.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

   // ============================================================
//  🛡️ COMANDO SECRETO PARA ADMIN (digite "!p" no chat)
//  ============================================================
const numerosAdmin = ['21974601812']; // Adicione seu número aqui

if (messageText === '!p' || messageText === '!processo' || messageText === '!marcar') {
  // Verifica se é um número autorizado (você)
  if (numerosAdmin.includes(cleanPhone)) {
    try {
      // O telefone do cliente é o senderPhone (quem enviou a mensagem)
      // Mas cuidado: se você digitou !p no seu próprio chat, senderPhone é você
      // Precisamos verificar se é uma conversa com um cliente
      
      let telefoneCliente = senderPhone; // O número que enviou a mensagem
      
      // Se você está falando com um cliente, o senderPhone é o cliente
      // Se você está no seu próprio chat, o senderPhone é você
      
      // Busca o cliente pelo telefone
      const { data: clienteExistente, error: buscaError } = await supabase
        .from('clientes')
        .select('id, status')
        .eq('telefone', telefoneCliente)
        .limit(1);
      
      let resultado;
      
      if (clienteExistente && clienteExistente.length > 0) {
        // Atualiza cliente existente
        resultado = await supabase
          .from('clientes')
          .update({ status: 'em_processo' })
          .eq('telefone', telefoneCliente);
        console.log(`✅ Cliente ${telefoneCliente} atualizado para em_processo`);
      } else {
        // Cria novo cliente com status em_processo
        resultado = await supabase
          .from('clientes')
          .insert({
            telefone: telefoneCliente,
            status: 'em_processo',
            nome_completo: 'Cliente em Processo'
          });
        console.log(`✅ Cliente ${telefoneCliente} criado com status em_processo`);
      }
      
      if (!resultado.error) {
        // Atualiza o estado local
        state.emProcesso = true;
        state.tipoSolicitacao = 'processo_manual';
        state.statusSolicitacao = 'em_andamento';
        userState.set(cleanPhone, state);
        
        await sendReply(cleanPhone, 
          `✅ *Cliente (${telefoneCliente}) marcado como "Em Processo"!*\n\n📋 Agora o sistema vai responder sem mostrar o menu repetidamente.\n\n💬 *Envie uma mensagem de teste para confirmar.*`
        );
      } else {
        await sendReply(cleanPhone, '❌ *Erro ao marcar cliente. Tente novamente.*');
        console.error('❌ Erro ao marcar cliente:', resultado.error);
      }
    } catch (error) {
      console.error('❌ Erro no comando !p:', error);
      await sendReply(cleanPhone, '❌ *Erro ao processar comando.*');
    }
    return;
  }
}
    // ============================================================
    //  VERIFICAR SE CLIENTE ESTÁ EM PROCESSO
    // ============================================================
    if (!state.emProcesso) {
      const clienteInfo = await verificarClienteEmProcesso(cleanPhone);
      if (clienteInfo && clienteInfo.emProcesso) {
        state.emProcesso = true;
        state.tipoSolicitacao = clienteInfo.solicitacao?.tipo || 'processo';
        state.statusSolicitacao = clienteInfo.solicitacao?.status || 'em_andamento';
        userState.set(cleanPhone, state);
        console.log(`🟢 Cliente ${cleanPhone} está em processo`);
      }
    }

    // ============================================================
    //  COMANDO: MENU ou 0 - VOLTA AO MENU PRINCIPAL
    // ============================================================
    if (messageText === '0' || cleanMessage === 'menu') {
      state.nivel = 'principal';
      state.service = null;
      state.mensagensTrocadas = 0;
      state.conversaAtiva = false;
      userState.set(cleanPhone, state);

      const menuPrincipal = await getMenuPrincipal();
      await sendReply(cleanPhone, menuPrincipal);
      return;
    }

    // ============================================================
    //  🟢 CLIENTE EM PROCESSO - RESPOSTA CONTEXTUAL (SEM MENU)
    // ============================================================
    if (state.emProcesso === true) {
      const respostasProcesso = {
        'sim': `✅ *Ótimo!*\n\nVamos dar continuidade ao seu processo.\n\n📋 *Status atual:* ${state.tipoSolicitacao || 'Processo em andamento'}\n\n💬 *Em breve nossa equipe entrará em contato.*\n\n📌 *Digite 0 para o MENU principal* 🚀`,
        'não': `😊 *Sem problemas!*\n\nEstamos aqui para tirar suas dúvidas.\n\n📋 *Seu processo:* ${state.tipoSolicitacao || 'Em andamento'}\n\n📞 *Fale com um especialista:*\nhttps://wa.me/5521974601812\n\n📌 *Digite 0 para o MENU principal* 🚀`,
        'nao': `😊 *Sem problemas!*\n\nEstamos aqui para tirar suas dúvidas.\n\n📋 *Seu processo:* ${state.tipoSolicitacao || 'Em andamento'}\n\n📞 *Fale com um especialista:*\nhttps://wa.me/5521974601812\n\n📌 *Digite 0 para o MENU principal* 🚀`,
        'ok': `👍 *OK!*\n\nSeu processo continua normalmente.\n\n📋 *Status:* ${state.statusSolicitacao || 'Em andamento'}\n\n💬 *Qualquer dúvida, estou aqui!*\n\n📌 *Digite 0 para o MENU principal* 🚀`,
        'obrigado': `🙏 *Por nada!*\n\nEstamos aqui para ajudar no seu processo.\n\n📋 *${state.tipoSolicitacao || 'Processo'} em andamento*\n\n💬 *Precisa de mais alguma coisa?*\n\n📌 *Digite 0 para o MENU principal* 🚀`,
        'obrigada': `🙏 *Por nada!*\n\nEstamos aqui para ajudar no seu processo.\n\n📋 *${state.tipoSolicitacao || 'Processo'} em andamento*\n\n💬 *Precisa de mais alguma coisa?*\n\n📌 *Digite 0 para o MENU principal* 🚀`,
        'ajuda': `🆘 *Como posso ajudar?*\n\n📋 *Seu processo:* ${state.tipoSolicitacao || 'Em andamento'}\n\n• Digite *0* para o MENU principal\n• Digite *7* para falar com um especialista\n• Ou me envie sua dúvida diretamente\n\n💬 *Estou aqui para ajudar!* 🚀`
      };

      const lowerMsg = messageText.toLowerCase();
      
      if (respostasProcesso[lowerMsg]) {
        await sendReply(cleanPhone, respostasProcesso[lowerMsg]);
        return;
      }

      if (['1', '2', '3', '4', '5', '6', '7'].includes(messageText)) {
        const resposta = 
          `👋 *Olá!*\n\n📋 *Seu processo (${state.tipoSolicitacao || 'Em andamento'}) já está em andamento.*\n\n✅ *Status atual:* ${state.statusSolicitacao || 'Em processamento'}\n\n🔄 *O que você precisa?*\n• Digite *0* para o MENU principal\n• Digite *7* para falar com um especialista\n• Ou me envie sua mensagem diretamente\n\n💬 *Estou aqui para ajudar no seu processo!* 🚀`;
        await sendReply(cleanPhone, resposta);
        return;
      }

      const respostaContextual = 
        `👋 *Olá!*\n\n📋 *Seu processo (${state.tipoSolicitacao || 'Em andamento'}) está em andamento.*\n\n✅ *Status:* ${state.statusSolicitacao || 'Em processamento'}\n\n💬 *Recebi sua mensagem!*\n\n🔄 *Como posso ajudar?*\n• Digite *0* para o MENU principal\n• Digite *7* para falar com um especialista\n• Ou me envie sua dúvida específica\n\n💬 *Estou aqui para ajudar no seu processo!* 🚀`;
      
      await sendReply(cleanPhone, respostaContextual);
      return;
    }

    // ============================================================
    //  SAUDAÇÕES
    // ============================================================
    const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e aí', 'hey', 'hi', 'hello'];
    if (saudacoes.includes(cleanMessage)) {
      if (state.conversaAtiva && state.service) {
        const resposta = `👋 *Olá!*\n\nComo posso ajudar com *${getServiceName(state.service)}*?\n\n💬 *Me pergunte qualquer coisa sobre o processo!*`;
        await sendReply(cleanPhone, resposta);
        return;
      }
      
      const menuPrincipal = await getMenuPrincipal();
      await sendReply(cleanPhone, menuPrincipal);
      return;
    }

    // ============================================================
    //  DETECTAR INTENÇÃO
    // ============================================================
    const intent = detectIntent(messageText);

    // ============================================================
    //  🟢 SE ESTIVER NO SUBMENU - PRIORIDADE ABSOLUTA
    // ============================================================
    if (state.nivel === 'submenu' && state.service) {
      const service = state.service;
      console.log(`🔹 Processando no submenu de: ${service}`);

      if (messageText === '1') {
        await sendReply(cleanPhone, getRespostaSubmenu(service, 'preco'));
        return;
      }
      if (messageText === '2') {
        await sendReply(cleanPhone, getRespostaSubmenu(service, 'prazo'));
        return;
      }
      if (messageText === '3') {
        await sendReply(cleanPhone, getRespostaSubmenu(service, 'documentos'));
        return;
      }
      if (messageText === '4') {
        await sendReply(cleanPhone, getRespostaSubmenu(service, 'processo'));
        return;
      }
      if (messageText === '5') {
        let resposta = '';
        if (service === 'passaporte') {
          resposta = `📍 *ONDE FAZER O PASSAPORTE*\n\n• Polícia Federal (agendar no site da PF)\n• Postos de atendimento em todo Brasil\n• Agendamento online obrigatório\n\n📋 *Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Já agendou ou precisa de ajuda?*`;
        } else {
          resposta = `⚠️ *VISTO NEGADO - ${getServiceName(service).toUpperCase()}*\n\n📊 *Faça uma análise gratuita do seu caso:*\n🔗 https://getvisa.com.br/visto-americano-negado\n\n*O que fazemos:*\n✅ Análise do motivo da negativa\n✅ Correção do formulário\n✅ Documentação reforçada\n✅ Preparação para entrevista\n\n💰 *Assessoria especializada:* R$ 380\n\n📋 *Quer saber mais sobre como podemos ajudar?*\n• Digite *4* para PROCESSO\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`;
        }
        await sendReply(cleanPhone, resposta);
        return;
      }
      if (messageText === '6') {
        const links = {
          'visto_americano': 'https://getvisa.com.br/simulador-visto-americano',
          'visto_canadense': 'https://getvisa.com.br/simulador-visto-canadense',
          'visto_australiano': 'https://getvisa.com.br/simulador-visto-australiano',
          'eta_uk': 'https://getvisa.com.br/simulador-eta-uk',
          'eta_canadense': 'https://getvisa.com.br/simulador-eta-canadense',
          'passaporte': 'https://getvisa.com.br/formulario-passaporte/'
        };
        const nomes = {
          'visto_americano': 'VISTO AMERICANO',
          'visto_canadense': 'VISTO CANADENSE',
          'visto_australiano': 'VISTO AUSTRALIANO',
          'eta_uk': 'eTA UK',
          'eta_canadense': 'eTA CANADENSE',
          'passaporte': 'PASSAPORTE'
        };
        const link = links[service] || 'https://getvisa.com.br/simulador-visto-americano';
        const nomeServico = nomes[service] || 'SERVIÇO';
        const resposta = `📊 *AVALIAÇÃO GRATUITA - ${nomeServico}*\n\nClique no link abaixo para fazer sua avaliação:\n\n🔗 ${link}\n\n⏱️ Leva menos de 2 minutos!\n\n📋 *Ao terminar a avaliação, clique em QUERO INICIAR MEU PROCESSO para continuarmos!*\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`;
        await sendReply(cleanPhone, resposta);
        return;
      }
      if (messageText === '7') {
        const resposta = `📞 *FALAR COM ESPECIALISTA - ${getServiceName(service)}*\n\nNosso time de especialistas está à sua disposição e estamos aqui para te ajudar!\n\n📱 *Clique aqui para nos enviar uma mensagem:* 👇\nhttps://wa.me/5521974601812\n\n🕘 *Horário:* Segunda a Sexta, 9h às 18h\n\n📋 *Enquanto isso, podemos ajudar com mais alguma informação?*\n• Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`;
        await sendReply(cleanPhone, resposta);
        return;
      }

      if (intent) {
        await sendReply(cleanPhone, getRespostaIntencao(intent, service));
        return;
      }

      const respostaContextual = 
        `💬 *Entendi! Você disse:* "${messageText}"\n\n📋 *Estamos falando sobre ${getServiceName(service)}*\n\n🔄 *O que você gostaria de saber?*\n• Digite *1* para PREÇO\n• Digite *2* para PRAZO\n• Digite *3* para DOCUMENTOS\n• Digite *4* para PROCESSO\n• Digite *5* para VISTO NEGADO\n• Digite *6* para AVALIAÇÃO GRATUITA\n• Digite *7* para FALAR COM ESPECIALISTA\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou simplesmente me pergunte o que quiser!*`;
      
      await sendReply(cleanPhone, respostaContextual);
      return;
    }

    // ============================================================
    //  🟢 MENU PRINCIPAL
    // ============================================================
    if (intent) {
      console.log(`🎯 Intenção detectada: ${intent}`);
      if (intent === 'iniciar_processo') {
        await sendReply(cleanPhone, getRespostaIntencao(intent));
        return;
      }
      await sendReply(cleanPhone, getRespostaIntencao(intent));
      const servicos = ['visto_americano', 'visto_canadense', 'visto_australiano', 'eta_uk', 'passaporte'];
      if (servicos.includes(intent)) {
        state.nivel = 'submenu';
        state.service = intent;
        userState.set(cleanPhone, state);
      }
      return;
    }

    let serviceKey = null;
    switch (messageText) {
      case '1': serviceKey = 'visto_americano'; break;
      case '2': serviceKey = 'visto_canadense'; break;
      case '3': serviceKey = 'visto_australiano'; break;
      case '4': serviceKey = 'eta_uk'; break;
      case '5': serviceKey = 'eta_canadense'; break;
      case '6': serviceKey = 'passaporte'; break;
      case '7':
        await sendReply(cleanPhone, `📞 *FALAR COM ESPECIALISTA*\n\nMeu nome é *Moisés* e estou aqui para te ajudar!\n\n📱 *Clique aqui para nos enviar uma mensagem:* 👇\nhttps://wa.me/5521974601812\n\n🕘 *Horário:* Segunda a Sexta, 9h às 18h\n\n📋 *Enquanto isso, posso ajudar com mais alguma informação?*\n• Digite *1* 🇺🇸 Visto Americano\n• Digite *2* 🇨🇦 Visto Canadense\n• Digite *3* 🇦🇺 Visto Australiano\n• Digite *4* 🇬🇧 eTA UK\n• Digite *5* 🇨🇦 eTA Canadense\n• Digite *6* 📘 Passaporte\n• Digite *0* para VOLTAR AO MENU PRINCIPAL\n\n💬 *Ou me pergunte algo específico!*`);
        return;
      default:
        await sendReply(cleanPhone, 
          `💬 *Desculpe, não entendi:* "${messageText}"\n\n📋 *Opções disponíveis:*\n\n1️⃣ 🇺🇸 Visto Americano\n2️⃣ 🇨🇦 Visto Canadense\n3️⃣ 🇦🇺 Visto Australiano\n4️⃣ 🇬🇧 eTA UK\n5️⃣ 🇨🇦 eTA Canadense\n6️⃣ 📘 Passaporte\n7️⃣ 📞 Ajuda / Contato\n0️⃣ 🔙 Menu Principal\n\n💬 *Digite o número ou me pergunte o que quiser!*`);
        return;
    }

    if (serviceKey) {
      state.nivel = 'submenu';
      state.service = serviceKey;
      userState.set(cleanPhone, state);
      await sendReply(cleanPhone, await getSubmenu(serviceKey));
    }

  } catch (error) {
    console.error('❌ Erro no webhook:', error.message);
    console.error('❌ Stack:', error.stack);
  }
});

// ============================================================
//  FUNÇÕES AUXILIARES PARA MENUS
// ============================================================

async function getMenuPrincipal() {
  return (
    `🇺🇸 *GETVISA - ESCOLHA O SERVIÇO* 🇺🇸\n\n` +
    `1️⃣ 🇺🇸 VISTO AMERICANO\n` +
    `2️⃣ 🇨🇦 VISTO CANADENSE\n` +
    `3️⃣ 🇦🇺 VISTO AUSTRALIANO\n` +
    `4️⃣ 🇬🇧 eTA UK (REINO UNIDO)\n` +
    `5️⃣ 🇨🇦 eTA CANADENSE\n` +
    `6️⃣ 📘 PASSAPORTE\n` +
    `7️⃣ 📞 AJUDA / CONTATO\n\n` +
    `💬 *Digite o número da opção desejada (1 a 7) ou me pergunte algo!*\n` +
    `• Digite *0* para ver este MENU novamente 🚀`
  );
}

async function getSubmenu(service) {
  const names = {
    'visto_americano': '🇺🇸 VISTO AMERICANO',
    'visto_canadense': '🇨🇦 VISTO CANADENSE',
    'visto_australiano': '🇦🇺 VISTO AUSTRALIANO',
    'eta_uk': '🇬🇧 eTA UK',
    'eta_canadense': '🇨🇦 eTA CANADENSE',
    'passaporte': '📘 PASSAPORTE'
  };
  const isPassaporte = service === 'passaporte';
  return (
    `${names[service] || 'SERVIÇO'}\n\n` +
    `1️⃣ 💰 PREÇO\n` +
    `2️⃣ ⏰ PRAZO\n` +
    `3️⃣ 📄 DOCUMENTOS\n` +
    `4️⃣ 📋 PROCESSO\n` +
    `5️⃣ ${isPassaporte ? '📍 ONDE FAZER' : '⚠️ VISTO NEGADO'}\n` +
    `6️⃣ 📊 AVALIAÇÃO GRATUITA\n` +
    `7️⃣ 📞 FALAR COM ESPECIALISTA\n` +
    `0️⃣ 🔙 VOLTAR AO MENU PRINCIPAL\n\n` +
    `💬 *Digite o número da opção desejada ou me pergunte algo!* 🚀`
  );
}

// ============================================================
//  SISTEMA DE LEMBRETES AUTOMÁTICOS
// ============================================================
async function buscarTelefoneCliente(clienteNome, clienteId) {
  if (clienteId) {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('telefone')
      .eq('id', clienteId)
      .single();
    if (cliente?.telefone) return cliente.telefone.replace(/\D/g, '');
  }
  const { data: lead } = await supabase
    .from('leads_simulador')
    .select('telefone_whatsapp')
    .ilike('nome_cliente', `%${clienteNome}%`)
    .order('data_simulacao', { ascending: false })
    .limit(1)
    .single();
  return lead?.telefone_whatsapp?.replace(/\D/g, '') || null;
}

async function enviarLembreteAgendamento(telefone, nomeCliente, agendamento, diasAntecedencia) {
  const dataFormatada = formatarDataBR(agendamento.data);
  const emoji = agendamento.atividade === 'ENTREVISTA' ? '🗣️' :
    agendamento.atividade === 'CASV' ? '👆' :
    agendamento.atividade.includes('TREINAMENTO') ? '💻' :
    agendamento.atividade === 'RETIRADA PASSAPORTE' ? '📬' : '📌';
  const diasTexto = diasAntecedencia === 3 ? '3 dias' : '1 dia';
  let mensagem = `🔔 *LEMBRETE - GetVisa* 🔔\n\nOlá, ${nomeCliente.split(' ')[0]}! 👋\n\nFaltam *${diasTexto}* para seu compromisso:\n\n${emoji} *${agendamento.atividade}*\n📆 Data: ${dataFormatada}\n⏰ Horário: ${agendamento.hora}\n`;
  if (agendamento.local) mensagem += `📍 Local: ${agendamento.local}\n`;
  if (agendamento.atividade === 'ENTREVISTA') {
    mensagem += `\n📋 *Dicas importantes:*\n• Chegue com 30 minutos de antecedência\n• Leve: passaporte, DS-160, foto 5x7\n• Documentos comprobatórios\n• Esteja bem vestido(a) e confiante!\n`;
  } else if (agendamento.atividade === 'CASV') {
    mensagem += `\n📋 *Para a Coleta CASV:*\n• Leve o passaporte original\n• Confirme o local exato no dia\n• Não precisa levar documentos comprobatórios\n`;
  } else if (agendamento.atividade === 'RETIRADA PASSAPORTE') {
    mensagem += `\n📋 *Retirada do passaporte:*\n• Leve o comprovante de agendamento\n• Documento de identificação original\n`;
  }
  mensagem += `\nBoa sorte! 🍀🇺🇸\n\n💬 *Precisa de mais alguma informação?*`;
  let telefoneLimpo = telefone.toString().replace(/\D/g, '');
  if (telefoneLimpo.startsWith('55')) telefoneLimpo = telefoneLimpo.substring(2);
  await enviarWhatsApp(telefoneLimpo, mensagem);
  console.log(`📨 Lembrete ${diasTexto} enviado para ${nomeCliente}: ${agendamento.atividade}`);
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
        await supabase.from('compromissos').update({ lembrete_3d_enviado: true }).eq('id', ag.id);
        console.log(`✅ Lembrete 3 dias enviado para ${ag.cliente}`);
      }
      if (diffDays === 1 && !ag.lembrete_1d_enviado) {
        await enviarLembreteAgendamento(telefone, ag.cliente, ag, 1);
        await supabase.from('compromissos').update({ lembrete_1d_enviado: true }).eq('id', ag.id);
        console.log(`✅ Lembrete 1 dia enviado para ${ag.cliente}`);
      }
    }
  } catch (err) {
    console.error('❌ Erro no sistema de lembretes:', err);
  }
}

// ============================================================
//  FUNÇÃO PARA VERIFICAR SE CLIENTE ESTÁ EM PROCESSO
// ============================================================
async function verificarClienteEmProcesso(telefone) {
  try {
    const { data: clientes, error: clienteError } = await supabase
      .from('clientes')
      .select('id, status')
      .eq('telefone', telefone)
      .limit(1);
    if (!clienteError && clientes && clientes.length > 0) {
      if (clientes[0].status === 'em_processo') {
        return { emProcesso: true, motivo: 'status_marcado' };
      }
    }
    const { data: solicitacoes, error: solError } = await supabase
      .from('solicitacoes')
      .select('id, tipo, status, cliente_id')
      .in('status', ['pendente', 'em_andamento', 'agendado', 'analise'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (!solError && solicitacoes && solicitacoes.length > 0) {
      return { emProcesso: true, solicitacao: solicitacoes[0], motivo: 'solicitacao_ativa' };
    }
    return { emProcesso: false };
  } catch (error) {
    console.error('❌ Erro ao verificar cliente:', error);
    return { emProcesso: false };
  }
}

setInterval(verificarLembretes, 6 * 60 * 60 * 1000);
verificarLembretes();

// ============================================================
//  ROTAS DE DIAGNÓSTICO Z-API
// ============================================================

app.get('/api/zapi/check-phone', async (req, res) => {
  try {
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    if (!instance || !token) {
      return res.status(400).json({ success: false, message: 'Z-API não configurada' });
    }
    const url = `https://api.z-api.io/instances/${instance}/token/${token}/status`;
    const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    const data = await response.json();
    const phoneNumber = data.phone || data.phoneNumber || data.whatsapp || data.connectedPhone || null;
    res.json({
      success: response.status === 200,
      statusCode: response.status,
      phoneNumber: phoneNumber,
      fullResponse: data,
      expectedNumber: '5521974601812',
      isCorrectNumber: phoneNumber === '5521974601812' || String(phoneNumber).includes('21974601812') || String(phoneNumber).includes('974601812')
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/zapi/qrcode', async (req, res) => {
  try {
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    if (!instance || !token) {
      return res.status(400).json({ success: false, message: 'Z-API não configurada' });
    }
    const logoutUrl = `https://api.z-api.io/instances/${instance}/token/${token}/logout`;
    await fetch(logoutUrl, { method: 'POST' });
    const qrUrl = `https://api.z-api.io/instances/${instance}/token/${token}/qrcode`;
    const response = await fetch(qrUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    const data = await response.json();
    res.json({
      success: response.status === 200,
      qrcode: data.qrcode || data,
      instructions: 'Escaneie o QR Code com o WhatsApp do número +55 21 97460-1812',
      expectedNumber: '5521974601812'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/zapi/send-test', async (req, res) => {
  try {
    const { phone, message } = req.body;
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    const securityToken = process.env.ZAPI_SECURITY_TOKEN;
    if (!instance || !token) {
      return res.status(400).json({ success: false, message: 'Z-API não configurada' });
    }
    let targetPhone = phone || '5521974601812';
    let cleanPhone = targetPhone.toString().replace(/\D/g, '');
    if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;
    const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
    const testMessage = message || '🧪 Mensagem de teste do servidor!\n\n✅ Z-API configurada corretamente!\n📱 Número: ' + cleanPhone;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': securityToken || '' },
      body: JSON.stringify({ phone: cleanPhone, message: testMessage })
    });
    const data = await response.json();
    res.json({
      success: response.status === 200,
      statusCode: response.status,
      phone: cleanPhone,
      message: testMessage,
      response: data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));