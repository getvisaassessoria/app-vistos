import streamlit as st
import psycopg2
import pandas as pd
from datetime import datetime, timedelta

# Configuração para ficar bonito no celular
st.set_page_config(page_title="Agenda Vistos", page_icon="📱", layout="centered")

# A MESMA CHAVE DO MAC
DATABASE_URL = "postgresql://postgres.hlxobwdezofdpitsugxp:Getvisa061066@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"

def conectar():
    return psycopg2.connect(DATABASE_URL)

st.title("📱 Agenda na Mão")

try:
    conn = conectar()
    cursor = conn.cursor()
    # Busca apenas os pendentes, ordenados por data
    cursor.execute("SELECT id, data, hora, cliente, atividade, local FROM compromissos WHERE concluido = 0 ORDER BY data, hora")
    registros = cursor.fetchall()
    conn.close()

    if not registros:
        st.success("🎉 Tudo limpo! Nenhum compromisso pendente.")
    else:
        # --- LÓGICA DE ALARMES / DATAS ---
        hoje = datetime.now().date()
        amanha = hoje + timedelta(days=1)

        qtd_atrasados = 0
        qtd_hoje = 0

        # 1. AGRUPAR OS COMPROMISSOS E CONTAR ALARMES
        clientes_agrupados = {}
        for r in registros:
            id_comp, data, hora, cliente, atividade, local = r

            # CORREÇÃO AQUI: dayfirst=True avisa que o padrão é BR (Dia/Mês)
            data_comp = pd.to_datetime(data, dayfirst=True).date()

            if data_comp < hoje:
                qtd_atrasados += 1
            elif data_comp == hoje:
                qtd_hoje += 1

            if cliente not in clientes_agrupados:
                clientes_agrupados[cliente] = []

            clientes_agrupados[cliente].append({
                'id': id_comp,
                'data': data,
                'hora': hora,
                'atividade': atividade,
                'local': local,
                'data_obj': data_comp 
            })

        # --- MOSTRAR AVISOS NO TOPO ---
        if qtd_atrasados > 0:
            st.error(f"⚠️ ATENÇÃO: Você tem {qtd_atrasados} compromisso(s) ATRASADO(S)!")
        if qtd_hoje > 0:
            st.warning(f"🔔 LEMBRETE: Você tem {qtd_hoje} compromisso(s) para HOJE!")

        st.write("---")
        st.write("Seus compromissos pendentes:")

        # 2. MOSTRAR NA TELA EM FORMATO DE "CARTÕES"
        for cliente, lista_compromissos in clientes_agrupados.items():

            with st.container(border=True):
                st.markdown(f"### 👤 {cliente}")

                for comp in lista_compromissos:
                    # CORREÇÃO AQUI TAMBÉM: dayfirst=True
                    data_br = pd.to_datetime(comp['data'], dayfirst=True).strftime('%d/%m/%Y')

                    # Define a etiqueta de alarme
                    alerta = ""
                    if comp['data_obj'] < hoje:
                        alerta = "🔴 **ATRASADO**"
                    elif comp['data_obj'] == hoje:
                        alerta = "🟡 **HOJE**"
                    elif comp['data_obj'] == amanha:
                        alerta = "🔵 **AMANHÃ**"

                    st.markdown(f"**{comp['atividade']}** em {comp['local']}")

                    # Mostra a data com ou sem o alerta
                    if alerta:
                        st.markdown(f"📅 {data_br} às ⏰ {comp['hora']} {alerta}")
                    else:
                        st.markdown(f"📅 {data_br} às ⏰ {comp['hora']}")

                    if st.button(f"✅ Dar Baixa", key=f"btn_{comp['id']}"):
                        conn = conectar()
                        cursor = conn.cursor()
                        cursor.execute("UPDATE compromissos SET concluido = 1 WHERE id = %s", (comp['id'],))
                        conn.commit()
                        conn.close()
                        st.rerun() 

                    st.write("") 

except Exception as e:
    st.error(f"Erro ao conectar no banco de dados: {e}")
