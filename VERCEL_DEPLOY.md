# Deploying to Vercel

This guide will help you deploy the Chronoception Trainer to Vercel.

## Prerequisites

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Make sure you have a Vercel account (sign up at https://vercel.com)

## Deployment Steps

1. **Navigate to your project directory:**
```bash
cd /path/to/chronoception_trainer
```

2. **Deploy to Vercel:**
```bash
vercel
```

3. **Follow the prompts:**
   - Link to existing project or create new
   - Set project name (or use default)
   - Confirm settings

4. **For production deployment:**
```bash
vercel --prod
```

## Project Structure for Vercel

- `api/index.py` - Serverless function handler
- `app.py` - Main Flask application
- `templates/` - HTML templates
- `static/` - Static files (CSS, JS)
- `vercel.json` - Vercel configuration
- `requirements.txt` - Python dependencies

## Important Notes

- **Game State**: The current implementation stores game state in memory. This means:
  - Statistics will reset on serverless function cold starts
  - Each user session is independent
  - For persistent state across deployments, consider using a database

- **Sound Feature**: The sound notification uses Web Audio API, which works in modern browsers. No external audio files are required.

## Troubleshooting

If you encounter issues:

1. **Check Vercel logs:**
```bash
vercel logs
```

2. **Verify Python version:**
   - Vercel uses Python 3.9 by default
   - Check `requirements.txt` for compatibility

3. **Test locally with Vercel:**
```bash
vercel dev
```

This will run the app locally using Vercel's runtime environment.

## Custom Domain

After deployment, you can add a custom domain in the Vercel dashboard:
1. Go to your project settings
2. Navigate to "Domains"
3. Add your custom domain

