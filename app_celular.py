import streamlit as st
import psycopg2
from datetime import datetime, timedelta

st.set_page_config(page_title="Agenda Vistos", page_icon="📱", layout="centered")

DATABASE_URL = "postgresql://postgres.hlxobwdezofdpitsugxp:Getvisa061066@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"

def conectar():
    return psycopg2.connect(DATABASE_URL)

# TÍTULO V3 PARA CONFIRMARMOS A ATUALIZAÇÃO
st.title("📱 Agenda na Mão") 

# FUNÇÃO BLINDADA PARA LER A DATA (SEM PANDAS)
def converter_para_data_obj(data_str):
    if not isinstance(data_str, str):
        data_str = str(data_str)
    try:
        if "-" in data_str:
            return datetime.strptime(data_str, "%Y-%m-%d").date()
        elif "/" in data_str:
            return datetime.strptime(data_str, "%d/%m/%Y").date()
    except:
        pass
    return datetime.now().date()

# FUNÇÃO BLINDADA PARA MOSTRAR NA TELA
def formatar_para_tela(data_str):
    if not isinstance(data_str, str):
        data_str = str(data_str)
    if "-" in data_str:
        try:
            return datetime.strptime(data_str, "%Y-%m-%d").strftime("%d/%m/%Y")
        except:
            return data_str
    return data_str

try:
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute("SELECT id, data, hora, cliente, atividade, local FROM compromissos WHERE concluido = 0 ORDER BY data, hora")
    registros = cursor.fetchall()
    conn.close()

    if not registros:
        st.success("🎉 Tudo limpo! Nenhum compromisso pendente.")
    else:
        hoje = datetime.now().date()
        amanha = hoje + timedelta(days=1)

        qtd_atrasados = 0
        qtd_hoje = 0

        clientes_agrupados = {}
        for r in registros:
            id_comp, data, hora, cliente, atividade, local = r

            data_comp = converter_para_data_obj(data)

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

        if qtd_atrasados > 0:
            st.error(f"⚠️ ATENÇÃO: Você tem {qtd_atrasados} compromisso(s) ATRASADO(S)!")
        if qtd_hoje > 0:
            st.warning(f"🔔 LEMBRETE: Você tem {qtd_hoje} compromisso(s) para HOJE!")

        st.write("---")
        st.write("Seus compromissos pendentes:")

        for cliente, lista_compromissos in clientes_agrupados.items():
            with st.container(border=True):
                st.markdown(f"### 👤 {cliente}")

                for comp in lista_compromissos:
                    data_br = formatar_para_tela(comp['data'])

                    alerta = ""
                    if comp['data_obj'] < hoje:
                        alerta = "🔴 **ATRASADO**"
                    elif comp['data_obj'] == hoje:
                        alerta = "🟡 **HOJE**"
                    elif comp['data_obj'] == amanha:
                        alerta = "🔵 **AMANHÃ**"

                    st.markdown(f"**{comp['atividade']}** em {comp['local']}")

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
