FROM python:3.10-slim
WORKDIR /app
# OpenCV依存とビルドツール
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
    gcc \
    g++ \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ビルドツールを削除してイメージサイズを削減（オプション）
# RUN apt-get purge -y gcc g++ python3-dev && apt-get autoremove -y

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:socket_app", "--host", "0.0.0.0", "--port", "8000"]
