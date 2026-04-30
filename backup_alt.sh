#!/bin/bash

DATA=$(date +%Y%m%d_%H%M%S)
PASTA_BACKUP="/Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_temp_$DATA"
ARQUIVO_FINAL="/Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_getvisa_$DATA.zip"

echo "🚀 Iniciando backup - $DATA"

# Criar pasta temporária
mkdir -p "$PASTA_BACKUP/codigo"

# 1. Copiar código (usando cp em vez de rsync)
echo "📁 Copiando código..."
cp -r /Users/moisesbarreto/getvisa-system/backend-node/GETVISA-SYSTEM/* "$PASTA_BACKUP/codigo/" 2>/dev/null
cp -r /Users/moisesbarreto/getvisa-system/backend-node/GETVISA-SYSTEM/.env "$PASTA_BACKUP/codigo/" 2>/dev/null

# 2. Copiar .env também para raiz
echo "🔐 Copiando credenciais..."
cp /Users/moisesbarreto/getvisa-system/backend-node/GETVISA-SYSTEM/.env "$PASTA_BACKUP/"

# 3. Backup do cron
echo "⏰ Salvando configuração do cron..."
crontab -l > "$PASTA_BACKUP/crontab_backup.txt" 2>/dev/null

# 4. Backup do banco de dados
echo "🗄️ Exportando banco de dados..."

python3 << EOF
import psycopg2, csv, os

url = 'postgresql://postgres.hlxobwdezofdpitsugxp:Getvisa061066@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'
tabelas = ['leads_simulador', 'compromissos', 'clientes']
pasta = "$PASTA_BACKUP"

for tabela in tabelas:
    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()
        cur.execute(f'SELECT * FROM {tabela}')
        rows = cur.fetchall()
        
        with open(os.path.join(pasta, f'{tabela}.csv'), 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
        
        print(f'✅ {tabela}: {len(rows)} registros')
        conn.close()
    except Exception as e:
        print(f'❌ Erro em {tabela}: {e}')
EOF

# 5. Mostrar tamanho antes de compactar
echo "📊 Tamanho da pasta a ser compactada:"
du -sh "$PASTA_BACKUP"

# 6. Compactar
echo "📦 Compactando..."
cd /Users/moisesbarreto/Documents/GetVisa_System/Backups
zip -r "$ARQUIVO_FINAL" "backup_temp_$DATA" > /dev/null 2>&1

# 7. Limpar pasta temporária
rm -rf "$PASTA_BACKUP"

# 8. Mostrar resultado
TAMANHO=$(ls -lh "$ARQUIVO_FINAL" | awk '{print $5}')
echo "✅ Backup concluído: $ARQUIVO_FINAL ($TAMANHO)"
