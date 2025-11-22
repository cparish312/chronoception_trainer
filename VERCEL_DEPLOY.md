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

2. **Install dependencies:**
```bash
npm install
```

3. **Deploy to Vercel:**
```bash
vercel
```

4. **Follow the prompts:**
   - Link to existing project or create new
   - Set project name (or use default)
   - Confirm settings

5. **For production deployment:**
```bash
vercel --prod
```

## Project Structure for Vercel

- `api/index.js` - Express serverless function handler
- `templates/` - HTML templates
- `static/` - Static files (CSS, JS, favicons)
- `vercel.json` - Vercel configuration
- `package.json` - Node.js dependencies

## Important Notes

- **Game State**: The current implementation stores game state in memory. This means:
  - Statistics will reset on serverless function cold starts
  - Each user session is independent
  - For persistent state across deployments, consider using a database

- **Sound Feature**: The sound notification uses Web Audio API, which works in modern browsers. No external audio files are required.

- **Node.js Version**: Vercel uses Node.js 18.x by default. The project is configured to use Node.js 18+.

## Troubleshooting

If you encounter issues:

1. **Check Vercel logs:**
```bash
vercel logs
```

2. **Verify Node.js version:**
   - Vercel uses Node.js 18.x by default
   - Check `package.json` for engine requirements

3. **Test locally with Vercel:**
```bash
vercel dev
```

This will run the app locally using Vercel's runtime environment.

4. **Test locally without Vercel:**
```bash
npm start
```

Then visit `http://localhost:3000`

## Custom Domain

After deployment, you can add a custom domain in the Vercel dashboard:
1. Go to your project settings
2. Navigate to "Domains"
3. Add your custom domain

## Common Issues

### Function Timeout
- Vercel has a 10-second timeout for free tier
- If your function times out, check for infinite loops or long-running operations

### Module Not Found
- Ensure all dependencies are in `package.json`
- Run `npm install` before deploying

### Static Files Not Loading
- Check that paths in HTML use `/static/` (absolute paths)
- Verify `vercel.json` routes are configured correctly
