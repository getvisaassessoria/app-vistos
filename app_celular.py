import streamlit as st
import psycopg2
import pandas as pd

# Configuração para ficar bonito no celular
st.set_page_config(page_title="Agenda Vistos", page_icon="📱", layout="centered")

# A MESMA CHAVE DO MAC
DATABASE_URL = "postgresql://postgres.hlxobwdezofdpitsugxp:Getvisa061066@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"

def conectar():
    return psycopg2.connect(DATABASE_URL)

st.title("📱 Agenda na Mão")
st.write("Seus compromissos pendentes:")

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
        for r in registros:
            id_comp, data, hora, cliente, atividade, local = r
            data_br = pd.to_datetime(data).strftime('%d/%m/%Y')

            # Cria um "Cartão" visual para cada cliente
            with st.container():
                st.markdown(f"### 👤 {cliente}")
                st.write(f"**{atividade}** em {local}")
                st.write(f"📅 {data_br} às ⏰ {hora}")

                # Botão de dar baixa direto pelo celular
                if st.button(f"✅ Dar Baixa", key=f"btn_{id_comp}"):
                    conn = conectar()
                    cursor = conn.cursor()
                    cursor.execute("UPDATE compromissos SET concluido = 1 WHERE id = %s", (id_comp,))
                    conn.commit()
                    conn.close()
                    st.success("Baixa realizada com sucesso!")
                    st.rerun() # Atualiza a tela na hora

                st.divider() # Linha separadora

except Exception as e:
    st.error(f"Erro ao conectar no banco de dados: {e}")
