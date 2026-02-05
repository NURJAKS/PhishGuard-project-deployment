import streamlit as st
import requests
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import os
from pathlib import Path
from sqlalchemy import create_engine, text
import json

# Конфигурация страницы
st.set_page_config(
    page_title="PhishGuard Dashboard",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# CSS для стилизации
st.markdown("""
<style>
    .main-header {
        font-size: 3rem;
        font-weight: bold;
        text-align: center;
        margin-bottom: 2rem;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }
    
    .metric-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 1rem;
        border-radius: 10px;
        color: white;
        text-align: center;
        margin: 0.5rem 0;
    }
    
    .status-blocked {
        color: #ff4444;
        font-weight: bold;
    }
    
    .status-warned {
        color: #ffaa00;
        font-weight: bold;
    }
    
    .status-allowed {
        color: #44ff44;
        font-weight: bold;
    }
    
    .sidebar .sidebar-content {
        background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
    }
</style>
""", unsafe_allow_html=True)

# Конфигурация API
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8002")
BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = BASE_DIR / "backend" / "database" / "phishguard.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")


def _parse_timestamp(value: str):
    """Safely parse ISO timestamps; return None on failure."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except Exception:
        return None

# Функции для работы с API
@st.cache_data(ttl=30)  # Кэширование на 30 секунд
def get_incidents(limit=1000, offset=0, action=None):
    """Получает список инцидентов из API"""
    try:
        params = {"limit": limit, "offset": offset}
        if action:
            params["action"] = action
        
        response = requests.get(f"{API_BASE_URL}/incidents", params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout as e:
        st.warning(f"Таймаут запроса к API (30 сек). Попробуйте обновить страницу.")
        return []
    except requests.exceptions.RequestException as e:
        st.warning(f"Ошибка подключения к API: {e}")
        return []

@st.cache_data(ttl=30)
def get_incident_stats():
    """Получает статистику инцидентов"""
    try:
        response = requests.get(f"{API_BASE_URL}/incidents/stats", timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout as e:
        st.warning(f"Таймаут запроса статистики (30 сек). Попробуйте обновить страницу.")
        return {}
    except requests.exceptions.RequestException as e:
        st.warning(f"Ошибка получения статистики: {e}")
        return {}

# Функция для работы с базой данных напрямую
def get_incidents_from_db(limit=1000):
    """Получает инциденты напрямую из базы данных"""
    try:
        # Подключаемся к SQLite
        db_path = DATABASE_URL.replace("sqlite:///", "")
        if not os.path.exists(db_path):
            return []
            
        engine = create_engine(DATABASE_URL)
        
        query = text("""
            SELECT id, url, action, score, reason, timestamp 
            FROM incidents 
            ORDER BY timestamp DESC 
            LIMIT :limit
        """)
        
        with engine.connect() as conn:
            result = conn.execute(query, {"limit": limit})
            incidents = []
            for row in result:
                incidents.append({
                    "id": row[0],
                    "url": row[1],
                    "action": row[2],
                    "score": row[3],
                    "reason": row[4],
                    "timestamp": row[5]
                })
        
        return incidents
    except Exception as e:
        st.error(f"Ошибка подключения к базе данных: {e}")
        return []

def get_stats_from_db():
    """Получает статистику из базы данных"""
    try:
        db_path = DATABASE_URL.replace("sqlite:///", "")
        if not os.path.exists(db_path):
            return {}
            
        engine = create_engine(DATABASE_URL)
        
        query = text("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN action = 'block' THEN 1 ELSE 0 END) as blocked,
                SUM(CASE WHEN action = 'warn' THEN 1 ELSE 0 END) as warned,
                SUM(CASE WHEN action = 'allow' THEN 1 ELSE 0 END) as allowed
            FROM incidents
        """)
        
        with engine.connect() as conn:
            result = conn.execute(query)
            row = result.fetchone()
            
            if row:
                total = row[0] or 0
                return {
                    "total_incidents": total,
                    "blocked": row[1] or 0,
                    "warned": row[2] or 0,
                    "allowed": row[3] or 0,
                    "block_rate": round((row[1] or 0) / total * 100, 2) if total > 0 else 0,
                    "warn_rate": round((row[2] or 0) / total * 100, 2) if total > 0 else 0
                }
        
        return {}
    except Exception as e:
        st.error(f"Ошибка получения статистики из БД: {e}")
        return {}

# Основной интерфейс
def main():
    # Заголовок
    st.markdown('<h1 class="main-header">🛡️ PhishGuard Dashboard</h1>', unsafe_allow_html=True)
    st.markdown("---")
    
    # Сайдбар для фильтров
    st.sidebar.title("🔍 Фильтры")
    
    # Выбор источника данных
    data_source = st.sidebar.selectbox(
        "Источник данных",
        ["API", "База данных"],
        help="Выберите источник для получения данных об инцидентах"
    )
    
    # Получаем данные
    if data_source == "API":
        incidents = get_incidents()
        stats = get_incident_stats()
        if not incidents and not stats:
            # Авто-фоллбэк на БД, если API недоступен
            db_incidents = get_incidents_from_db()
            db_stats = get_stats_from_db()
            if db_incidents or db_stats:
                st.warning("⚠️ API недоступен. Показаны данные из базы данных.")
                incidents = db_incidents
                stats = db_stats
                data_source = "База данных"
    else:
        incidents = get_incidents_from_db()
        stats = get_stats_from_db()
    
    if not incidents and not stats:
        st.warning("⚠️ Не удалось получить данные. Убедитесь, что backend запущен и доступен.")
        st.stop()
    
    # Фильтры
    st.sidebar.markdown("### 📊 Фильтры")
    
    # Фильтр по действию
    all_actions = list(set([incident.get('action', '') for incident in incidents]))
    selected_action = st.sidebar.selectbox(
        "Действие",
        ["Все"] + all_actions,
        help="Фильтр по типу действия"
    )
    
    # Фильтр по дате
    if incidents:
        dates = [_parse_timestamp(incident.get('timestamp')) for incident in incidents]
        dates = [d for d in dates if d]
        if dates:
            min_date = min(dates).date()
            max_date = max(dates).date()
            
            # Убеждаемся, что значение по умолчанию в пределах min/max
            default_start = max_date - timedelta(days=7)
            if default_start < min_date:
                default_start = min_date
            
            date_range = st.sidebar.date_input(
                "Диапазон дат",
                value=(default_start, max_date),
                min_value=min_date,
                max_value=max_date,
                help="Выберите диапазон дат для отображения"
            )
    
    # Применяем фильтры
    filtered_incidents = incidents
    if selected_action != "Все":
        filtered_incidents = [inc for inc in filtered_incidents if inc.get('action') == selected_action]
    
    # Статистика в метриках
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric(
            label="📊 Всего инцидентов",
            value=stats.get('total_incidents', len(incidents)),
            help="Общее количество проверенных URL"
        )
    
    with col2:
        st.metric(
            label="🚫 Заблокировано",
            value=stats.get('blocked', 0),
            delta=f"{stats.get('block_rate', 0)}%",
            help="Количество заблокированных сайтов"
        )
    
    with col3:
        st.metric(
            label="⚠️ Предупреждений",
            value=stats.get('warned', 0),
            delta=f"{stats.get('warn_rate', 0)}%",
            help="Количество предупреждений"
        )
    
    with col4:
        allowed_count = stats.get('allowed', 0)
        total_count = stats.get('total_incidents', len(incidents))
        allowed_rate = round(allowed_count / total_count * 100, 2) if total_count > 0 else 0
        st.metric(
            label="✅ Разрешено",
            value=allowed_count,
            delta=f"{allowed_rate}%",
            help="Количество разрешенных сайтов"
        )
    
    st.markdown("---")
    
    # Графики
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("📈 Распределение по действиям")
        
        if filtered_incidents:
            # Подсчет по действиям
            action_counts = {}
            for incident in filtered_incidents:
                action = incident.get('action', 'unknown')
                action_counts[action] = action_counts.get(action, 0) + 1
            
            # Создаем круговую диаграмму
            if action_counts:
                fig_pie = px.pie(
                    values=list(action_counts.values()),
                    names=list(action_counts.keys()),
                    title="Распределение инцидентов",
                    color_discrete_map={
                        'block': '#ff4444',
                        'warn': '#ffaa00',
                        'allow': '#44ff44'
                    }
                )
                fig_pie.update_traces(textposition='inside', textinfo='percent+label')
                st.plotly_chart(fig_pie, use_container_width=True)
            else:
                st.info("Нет данных для отображения")
        else:
            st.info("Нет данных для отображения")
    
    with col2:
        st.subheader("📊 Тренд по времени")
        
        if filtered_incidents:
            # Группируем по часам/дням
            df = pd.DataFrame(filtered_incidents)
            if not df.empty and 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
            df = df.dropna(subset=['timestamp'])
            df['hour'] = df['timestamp'].dt.floor('h')
                
                hourly_counts = df.groupby(['hour', 'action']).size().reset_index(name='count')
                
                if not hourly_counts.empty:
                    fig_line = px.line(
                        hourly_counts,
                        x='hour',
                        y='count',
                        color='action',
                        title="Активность по времени",
                        color_discrete_map={
                            'block': '#ff4444',
                            'warn': '#ffaa00',
                            'allow': '#44ff44'
                        }
                    )
                    fig_line.update_layout(xaxis_title="Время", yaxis_title="Количество")
                    st.plotly_chart(fig_line, use_container_width=True)
                else:
                    st.info("Недостаточно данных для построения тренда")
            else:
                st.info("Нет данных о времени")
        else:
            st.info("Нет данных для отображения")
    
    # Таблица инцидентов
    st.markdown("---")
    st.subheader("📋 Таблица инцидентов")
    
    if filtered_incidents:
        # Создаем DataFrame
        df = pd.DataFrame(filtered_incidents)
        
        # Форматируем данные для отображения
        if not df.empty:
            # Сокращаем длинные URL
            df['url_short'] = df['url'].apply(lambda x: x[:50] + '...' if len(x) > 50 else x)
            
            # Форматируем score
            df['score_pct'] = df['score'].apply(lambda x: f"{float(x)*100:.1f}%" if x is not None else "-")
            
            # Форматируем timestamp
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
                df['time_formatted'] = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
            
            # Выбираем колонки для отображения
            display_columns = ['url_short', 'action', 'score_pct', 'reason']
            if 'timestamp' in df.columns:
                display_columns = ['time_formatted'] + display_columns
            
            # Переименовываем колонки
            column_names = {
                'time_formatted': 'Время',
                'url_short': 'URL',
                'action': 'Действие',
                'score_pct': 'Уверенность',
                'reason': 'Причина'
            }
            
            display_df = df[display_columns].rename(columns=column_names)
            
            # Цветовое кодирование действий
            def color_action(val):
                if val == 'block':
                    return 'background-color: #ff4444; color: white'
                elif val == 'warn':
                    return 'background-color: #ffaa00; color: white'
                elif val == 'allow':
                    return 'background-color: #44ff44; color: black'
                return ''
            
            styled_df = display_df.style.applymap(color_action, subset=['Действие'])
            
            st.dataframe(
                styled_df,
                use_container_width=True,
                height=400
            )
            
            # Кнопка экспорта
            csv = df.to_csv(index=False)
            st.download_button(
                label="📥 Скачать CSV",
                data=csv,
                file_name=f"phishguard_incidents_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                mime="text/csv"
            )
        else:
            st.info("Нет данных для отображения в таблице")
    else:
        st.info("Нет инцидентов, соответствующих выбранным фильтрам")
    
    # Информация о системе
    st.markdown("---")
    st.subheader("ℹ️ Информация о системе")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.info(f"**Источник данных:** {data_source}")
        st.info(f"**API URL:** {API_BASE_URL}")
        st.info(f"**Время обновления:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    with col2:
        if stats:
            st.success(f"**Статус API:** ✅ Подключен")
            st.success(f"**Всего записей:** {stats.get('total_incidents', 0)}")
        else:
            st.error("**Статус API:** ❌ Не подключен")

if __name__ == "__main__":
    main()

