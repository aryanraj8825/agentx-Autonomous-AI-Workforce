FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN useradd -m -u 10001 agentx
WORKDIR /srv
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app ./app
RUN mkdir -p /data/files && chown -R agentx /data
USER agentx
ENV FILES_DIR=/data/files
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/healthz')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
