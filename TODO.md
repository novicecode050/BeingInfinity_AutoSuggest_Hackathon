# TODO - Deploy GeoSustain to Render

## Step 1: Identify Render failure cause
- Use provided Render logs: build failed with `sh: 1: vite: not found`.

## Step 2: Fix Render Node/tooling mismatch
- In Render Web Service settings:
  - Set Node version to Node 18.x (e.g., 18.20.4)

## Step 3: Ensure dependencies install
- Confirm Render uses `npm install` before build.
- If Render has an optional Install command, set it to:
  - `npm install`

## Step 4: Deploy again
- Redeploy after changes.

## Step 5: If it still fails
- Paste Render build/start logs here.

