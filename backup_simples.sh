#!/bin/bash

# Backup Simplificado - Sistema GetVisa

DATA=$(date +%Y%m%d_%H%M%S)
PASTA_BACKUP="/Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_temp_$DATA"
ARQUIVO_FINAL="/Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_getvisa_$DATA.zip"

echo "🚀 Iniciando backup - $DATA"

# Criar pasta temporária
mkdir -p "$PASTA_BACKUP"
mkdir -p "$PASTA_BACKUP/codigo"

# 1. Copiar código (excluindo node_modules e .git)
echo "📁 Copiando código..."
rsync -av --exclude='node_modules' --exclude='.git' /Users/moisesbarreto/getvisa-system/backend-node/GETVISA-SYSTEM/ "$PASTA_BACKUP/codigo/" > /dev/null 2>&1

# 2. Copiar .env
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

# 5. Compactar (incluindo TODO o conteúdo da pasta temporária)
echo "📦 Compactando..."
cd /Users/moisesbarreto/Documents/GetVisa_System/Backups
zip -r "$ARQUIVO_FINAL" "backup_temp_$DATA" > /dev/null 2>&1

# 6. Limpar pasta temporária
rm -rf "$PASTA_BACKUP"

# 7. Limpar backups antigos (manter últimos 5)
echo "🗑️ Removendo backups antigos..."
ls -t /Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_getvisa_*.zip 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null

# 8. Mostrar resultado
TAMANHO=$(ls -lh "$ARQUIVO_FINAL" | awk '{print $5}')
echo "✅ Backup concluído: $ARQUIVO_FINAL ($TAMANHO)"#!/bin/bash

# Backup Simplificado - Sistema GetVisa

DATA=$(date +%Y%m%d_%H%M%S)
PASTA_BACKUP="/Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_temp_$DATA"
ARQUIVO_FINAL="/Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_getvisa_$DATA.zip"

echo "🚀 Iniciando backup - $DATA"

# Criar pasta temporária
mkdir -p "$PASTA_BACKUP"

# 1. Copiar código (excluindo node_modules e .git)
echo "📁 Copiando código..."
rsync -av --exclude='node_modules' --exclude='.git' /Users/moisesbarreto/getvisa-system/backend-node/GETVISA-SYSTEM/ "$PASTA_BACKUP/codigo/" > /dev/null 2>&1

# 2. Copiar .env
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

# 5. Compactar
echo "📦 Compactando..."
cd /Users/moisesbarreto/Documents/GetVisa_System/Backups
zip -r "$ARQUIVO_FINAL" "backup_temp_$DATA" > /dev/null 2>&1

# 6. Limpar pasta temporária
rm -rf "$PASTA_BACKUP"

# 7. Limpar backups antigos (manter últimos 5)
echo "🗑️ Removendo backups antigos..."
ls -t /Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_getvisa_*.zip 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null

echo "✅ Backup concluído: $ARQUIVO_FINAL"
ls -lh "$ARQUIVO_FINAL"
