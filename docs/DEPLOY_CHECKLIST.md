# Deploy Checklist

## Git

```bash
git status
git add .
git commit -m "feat: malik ai sovereign world product"
git push origin main
```

## Render

1. Render -> Service -> Events
2. Render -> Settings -> Auto-Deploy -> On Commit
3. Manual Deploy -> Deploy latest commit
4. Clear build cache & deploy

## Local Checks

```bash
cd app/templates/sovereign-hub-ui
npm install
npm run build
cd ../../..
python -m py_compile run.py app/routes.py ai_model.py app/ai_engine.py app/brain.py
```

