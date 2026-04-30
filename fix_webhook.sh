#!/bin/bash
# Localizar a linha que tem message.toLowerCase e substituir

sed -i '' '/const msg = message.toLowerCase();/c\
    // Extrair texto da mensagem corretamente\
    let messageText = '\'''\'';\
    if (typeof message === '\''string'\'') {\
      messageText = message;\
    } else if (message && message.text) {\
      messageText = message.text;\
    } else if (message && message.body) {\
      messageText = message.body;\
    } else {\
      messageText = String(message);\
    }\
    const msg = messageText.toLowerCase();' server.js
