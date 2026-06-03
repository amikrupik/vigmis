# Railway Auto-Deploy Setup

To enable automatic deployment when pushing to GitHub:

1. Go to Railway dashboard: https://railway.com/project/b0cdb576
2. Click on the @vigmis/api service
3. Settings → Source → Connect to GitHub repo
4. Select branch: main
5. Enable "Auto-deploy on push"

Until then, run: `railway up --detach` from the repo root after each API change.
