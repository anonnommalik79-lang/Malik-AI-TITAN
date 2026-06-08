from flask import Flask

app = Flask(__name__)
app.secret_key = "malik_supreme_nexus_elite_key_2026"

# Загружаем наши маршруты
from app import routes