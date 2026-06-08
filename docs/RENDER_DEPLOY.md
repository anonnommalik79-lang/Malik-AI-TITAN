# Render Deploy

Render uses the root `render.yaml`.

Build command:

```bash
cd app/templates/sovereign-hub-ui && npm install && npm run build && cd ../../.. && pip install -r requirements.txt
```

Start command:

```bash
gunicorn run:app --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 180
```

The Flask app serves the Next static export from:

`app/templates/sovereign-hub-ui/out`

