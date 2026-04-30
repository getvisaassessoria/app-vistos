#!/bin/bash

# ==========================================
# SISTEMA GETVISA - BACKUP COMPLETO
# ==========================================

DATA=$(date +%Y%m%d_%H%M%S)
PASTA_BACKUP="/Users/moisesbarreto/Documents/GetVisa_System/Backups/backup_getvisa_$DATA"
LOG="$PASTA_BACKUP/backup_log.txt"

# Criar pasta de backup
mkdir -p "$PASTA_BACKUP"

echo "🚀 Iniciando backup em $DATA" > "$LOG"

# 1. Backup do código
echo "📁 Backup do código..." >> "$LOG"
cp -r /Users/moisesbarreto/getvisa-system/backend-node/GETVISA-SYSTEM "$PASTA_BACKUP/codigo/"
echo "✅ Código copiado" >> "$LOG"

# 2. Backup do .env (cópia segura)
echo "🔐 Backup das credenciais..." >> "$LOG"
cp /Users/moisesbarreto/getvisa-system/backend-node/GETVISA-SYSTEM/.env "$PASTA_BACKUP/.env.backup"
echo "✅ Credenciais salvas" >> "$LOG"

# 3. Backup do cron
echo "⏰ Backup do cron..." >> "$LOG"
crontab -l > "$PASTA_BACKUP/crontab_backup.txt"
echo "✅ Cron salvo" >> "$LOG"

# 4. Backup do banco (CSV)
echo "🗄️ Backup do banco de dados..." >> "$LOG"
python3 -c "
import psycopg2, csv
from datetime import datetime

url = 'postgresql://postgres.hlxobwdezofdpitsugxp:Getvisa061066@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'
tabelas = ['leads_simulador', 'compromissos', 'clientes']

for tabela in tabelas:
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute(f'SELECT * FROM {tabela}')
    rows = cur.fetchall()
    
    with open(f'$PASTA_BACKUP/{tabela}.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    
    print(f'✅ {tabela}: {len(rows)} registros')
    conn.close()
" >> "$LOG" 2>&1

echo "✅ Backup concluído em $PASTA_BACKUP" >> "$LOG"

# 5. Compactar
cd ~/Desktop
zip -r "backup_getvisa_$DATA.zip" "backup_getvisa_$DATA"
rm -rf "$PASTA_BACKUP"

echo "📦 Backup compactado: backup_getvisa_$DATA.zip"

# 6. Limpar backups antigos (manter últimos 5)
cd ~/Desktop
ls -t backup_getvisa_*.zip 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null

echo "✅ Backup completo finalizado em $(date)" >> "$LOG"
